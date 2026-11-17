import { createPublicKey, verify as verifySignature, type KeyObject } from 'node:crypto'
import { OAuth2Client } from 'google-auth-library'

export const V2_GATEWAY_AUDIENCE = 'ycoders-editor-v2-gateway'
export const V2_GATEWAY_CALLER = 'ycoders-learner-gateway'
const MAX_ASSERTION_LIFETIME_SECONDS = 60
const MAX_CLOCK_SKEW_SECONDS = 5

export type GatewayServicePrincipal = { serviceId: string; environment: string; correlationId: string }
export type GatewayServiceAuthContext = { authorization?: string; method: string; path: string; correlationId?: string }
export interface GatewayServiceVerifier { verify(context: GatewayServiceAuthContext): Promise<GatewayServicePrincipal> }
export class GatewayServiceAuthError extends Error { constructor(readonly code: string, message: string, readonly status: 401 | 403 = 401) { super(message); this.name = 'GatewayServiceAuthError' } }

type TestAssertion = { iss: 'ycoders-test-service-auth'; sub: string; aud: string; env: string; method: string; path: string; iat: number; exp: number; jti: string }
const decode = (value: string) => JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown

function assertLocalOnly(environment: NodeJS.ProcessEnv) {
  const deployment = String(environment.VERCEL_ENV ?? environment.YCODERS_ENVIRONMENT ?? '').toLowerCase()
  const projectId = String(environment.FIREBASE_ADMIN_PROJECT_ID ?? '')
  if (deployment === 'production' || !projectId.startsWith('demo-')) throw new GatewayServiceAuthError('GATEWAY_TEST_AUTH_FORBIDDEN', 'Test service authentication is forbidden for this environment', 403)
}

export class LocalTestGatewayServiceVerifier implements GatewayServiceVerifier {
  private readonly publicKey: KeyObject
  constructor(publicKey: string | Buffer | KeyObject, private readonly environment: NodeJS.ProcessEnv = process.env, private readonly now = () => Date.now()) {
    assertLocalOnly(environment)
    this.publicKey = typeof publicKey === 'object' && 'type' in publicKey && publicKey.type === 'public' ? publicKey : createPublicKey(publicKey)
  }
  async verify(context: GatewayServiceAuthContext): Promise<GatewayServicePrincipal> {
    assertLocalOnly(this.environment)
    const match = context.authorization?.match(/^ServiceAssertion\s+(v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/)
    if (!match) throw new GatewayServiceAuthError('GATEWAY_SERVICE_UNAUTHENTICATED', 'Gateway service identity is required')
    const [version, encoded, signature] = match[1].split('.')
    if (version !== 'v1' || !verifySignature(null, Buffer.from(`${version}.${encoded}`), this.publicKey, Buffer.from(signature, 'base64url'))) throw new GatewayServiceAuthError('GATEWAY_SERVICE_UNAUTHENTICATED', 'Gateway service assertion signature is invalid')
    let claims: TestAssertion
    try { claims = decode(encoded) as TestAssertion } catch { throw new GatewayServiceAuthError('GATEWAY_SERVICE_UNAUTHENTICATED', 'Gateway service assertion is malformed') }
    const now = Math.floor(this.now() / 1000), expectedEnvironment = String(this.environment.V2_GATEWAY_TRUST_ENVIRONMENT ?? 'emulator')
    if (claims.iss !== 'ycoders-test-service-auth' || claims.aud !== V2_GATEWAY_AUDIENCE) throw new GatewayServiceAuthError('GATEWAY_SERVICE_WRONG_AUDIENCE', 'Gateway service assertion audience is not trusted', 403)
    if (claims.sub !== V2_GATEWAY_CALLER) throw new GatewayServiceAuthError('GATEWAY_SERVICE_UNAUTHORIZED', 'Gateway service identity is not approved', 403)
    if (claims.env !== expectedEnvironment) throw new GatewayServiceAuthError('GATEWAY_SERVICE_WRONG_ENVIRONMENT', 'Gateway service environment is not approved', 403)
    if (claims.method !== context.method.toUpperCase() || claims.path !== context.path) throw new GatewayServiceAuthError('GATEWAY_SERVICE_REQUEST_MISMATCH', 'Gateway service assertion is not bound to this request', 403)
    if (!claims.jti || claims.jti !== context.correlationId) throw new GatewayServiceAuthError('GATEWAY_SERVICE_REQUEST_MISMATCH', 'Gateway correlation binding is invalid', 403)
    if (!Number.isInteger(claims.iat) || !Number.isInteger(claims.exp) || claims.exp - claims.iat > MAX_ASSERTION_LIFETIME_SECONDS || claims.iat > now + MAX_CLOCK_SKEW_SECONDS) throw new GatewayServiceAuthError('GATEWAY_SERVICE_UNAUTHENTICATED', 'Gateway service assertion timing is invalid')
    if (claims.exp <= now - MAX_CLOCK_SKEW_SECONDS) throw new GatewayServiceAuthError('GATEWAY_SERVICE_ASSERTION_EXPIRED', 'Gateway service assertion has expired')
    return { serviceId: claims.sub, environment: claims.env, correlationId: claims.jti }
  }
}

export class UnconfiguredProductionGatewayVerifier implements GatewayServiceVerifier {
  async verify(): Promise<GatewayServicePrincipal> { throw new GatewayServiceAuthError('GATEWAY_SERVICE_AUTH_UNCONFIGURED', 'Production workload identity verification is not configured', 403) }
}

export class StagingGoogleGatewayVerifier implements GatewayServiceVerifier {
  private readonly audience: string; private readonly serviceAccount: string
  constructor(private readonly environment: NodeJS.ProcessEnv=process.env, private readonly client: Pick<OAuth2Client,'verifyIdToken'>=new OAuth2Client(), private readonly now=()=>Date.now()) {
    const deployment=String(environment.VERCEL_ENV??environment.YCODERS_ENVIRONMENT??'').toLowerCase()
    this.audience=String(environment.V2_GATEWAY_GOOGLE_TOKEN_AUDIENCE??''); this.serviceAccount=String(environment.V2_GATEWAY_SERVICE_ACCOUNT_EMAIL??'')
    if (!['preview','staging'].includes(deployment) || !/^https:\/\/[^/]+$/.test(this.audience) || !/^[a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/.test(this.serviceAccount)) throw new GatewayServiceAuthError('GATEWAY_SERVICE_AUTH_UNCONFIGURED','Staging Google identity verification is not configured',403)
  }
  async verify(context: GatewayServiceAuthContext): Promise<GatewayServicePrincipal> {
    const match=context.authorization?.match(/^Bearer\s+([^\s]+)$/i); if(!match) throw new GatewayServiceAuthError('GATEWAY_SERVICE_UNAUTHENTICATED','Google service identity is required')
    let payload: { iss?:string; email?:string; email_verified?:boolean; sub?:string; iat?:number; exp?:number }|undefined
    try { payload=(await this.client.verifyIdToken({ idToken:match[1], audience:this.audience })).getPayload() } catch { throw new GatewayServiceAuthError('GATEWAY_SERVICE_UNAUTHENTICATED','Google service identity is invalid') }
    const now=Math.floor(this.now()/1000), issuer=String(payload?.iss??''), email=String(payload?.email??''), sub=String(payload?.sub??'')
    if(!['https://accounts.google.com','accounts.google.com'].includes(issuer)) throw new GatewayServiceAuthError('GATEWAY_SERVICE_UNAUTHORIZED','Google issuer is not trusted',403)
    if(email!==this.serviceAccount || payload?.email_verified!==true || !sub) throw new GatewayServiceAuthError('GATEWAY_SERVICE_UNAUTHORIZED','Google service account is not approved',403)
    if(!Number.isFinite(payload?.iat)||!Number.isFinite(payload?.exp)||(payload!.iat as number)>now+30||(payload!.exp as number)<=now) throw new GatewayServiceAuthError('GATEWAY_SERVICE_ASSERTION_EXPIRED','Google service identity timing is invalid')
    if(!context.correlationId) throw new GatewayServiceAuthError('GATEWAY_SERVICE_REQUEST_MISMATCH','Correlation ID is required',403)
    return { serviceId:email, environment:String(this.environment.V2_GATEWAY_TRUST_ENVIRONMENT??'staging'), correlationId:context.correlationId }
  }
}

export function createGatewayServiceVerifier(environment: NodeJS.ProcessEnv = process.env): GatewayServiceVerifier {
  const mode=String(environment.V2_GATEWAY_SERVICE_AUTH_MODE??'')
  if(mode==='staging-google') return new StagingGoogleGatewayVerifier(environment)
  if (mode !== 'test-ed25519') return new UnconfiguredProductionGatewayVerifier()
  assertLocalOnly(environment)
  const publicKey = environment.V2_GATEWAY_TEST_PUBLIC_KEY
  if (!publicKey) throw new GatewayServiceAuthError('GATEWAY_SERVICE_AUTH_UNCONFIGURED', 'Test gateway public key is not configured', 403)
  return new LocalTestGatewayServiceVerifier(publicKey.replaceAll('\\n', '\n'), environment)
}
