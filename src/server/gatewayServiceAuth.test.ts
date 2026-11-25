import { generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { handleGatewayCourseDeliveryApi } from './gatewayCourseDeliveryApi'
import { createGatewayServiceVerifier, LocalTestGatewayServiceVerifier, ProductionGoogleGatewayVerifier, StagingGoogleGatewayVerifier, UnconfiguredProductionGatewayVerifier, V2_GATEWAY_AUDIENCE, V2_GATEWAY_CALLER, V2_PRODUCTION_GATEWAY_SERVICE_ACCOUNT, V2_PRODUCTION_GOOGLE_TOKEN_AUDIENCE } from './gatewayServiceAuth'

const environment = { VERCEL_ENV: 'development', FIREBASE_ADMIN_PROJECT_ID: 'demo-ycoders-editor-v2', V2_GATEWAY_TRUST_ENVIRONMENT: 'emulator' } as NodeJS.ProcessEnv
const keys = generateKeyPairSync('ed25519')
const path = '/api/v2/gateway/courses/10000000-0000-4000-8000-000000000001'
function assertion(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now()/1000), claims = { iss: 'ycoders-test-service-auth', sub: V2_GATEWAY_CALLER, aud: V2_GATEWAY_AUDIENCE, env: 'emulator', method: 'GET', path, iat: now, exp: now+30, jti: 'correlation-1', ...overrides }
  const encoded = Buffer.from(JSON.stringify(claims)).toString('base64url'), input = `v1.${encoded}`
  return `ServiceAssertion ${input}.${sign(null, Buffer.from(input), keys.privateKey).toString('base64url')}`
}
const verifier = () => new LocalTestGatewayServiceVerifier(keys.publicKey, environment)

describe('learner-gateway service authentication', () => {
  it('accepts only the approved gateway identity with request-bound short-lived claims', async () => {
    await expect(verifier().verify({ authorization: assertion(), method:'GET', path, correlationId:'correlation-1' })).resolves.toEqual({ serviceId: V2_GATEWAY_CALLER, environment:'emulator', correlationId:'correlation-1' })
  })
  it.each([
    ['wrong service', { sub:'other-service' }, 'GATEWAY_SERVICE_UNAUTHORIZED'],
    ['wrong audience', { aud:'other-audience' }, 'GATEWAY_SERVICE_WRONG_AUDIENCE'],
    ['wrong environment', { env:'preview' }, 'GATEWAY_SERVICE_WRONG_ENVIRONMENT'],
    ['expired assertion', { iat:1, exp:2 }, 'GATEWAY_SERVICE_ASSERTION_EXPIRED'],
    ['wrong method', { method:'POST' }, 'GATEWAY_SERVICE_REQUEST_MISMATCH'],
    ['wrong path', { path:'/api/v2/gateway/courses/other' }, 'GATEWAY_SERVICE_REQUEST_MISMATCH'],
    ['wrong correlation', { jti:'other' }, 'GATEWAY_SERVICE_REQUEST_MISMATCH'],
  ])('rejects %s', async (_label, override, code) => { await expect(verifier().verify({ authorization: assertion(override), method:'GET', path, correlationId:'correlation-1' })).rejects.toMatchObject({ code }) })
  it('rejects missing assertions, learner Firebase tokens, and Admin Firebase tokens as service identity', async () => {
    for (const authorization of [undefined, 'Bearer learner-firebase-token', 'Bearer admin-firebase-token']) await expect(verifier().verify({ authorization, method:'GET', path, correlationId:'correlation-1' })).rejects.toMatchObject({ code:'GATEWAY_SERVICE_UNAUTHENTICATED' })
  })
  it('hard-disables test auth for production and non-demo projects', () => {
    expect(() => new LocalTestGatewayServiceVerifier(keys.publicKey, { ...environment, VERCEL_ENV:'production' })).toThrow(/forbidden/i)
    expect(() => new LocalTestGatewayServiceVerifier(keys.publicKey, { ...environment, FIREBASE_ADMIN_PROJECT_ID:'real-project' })).toThrow(/forbidden/i)
  })
  it('uses service auth without invoking Admin authorization and preserves typed delivery errors', async () => {
    const service = { active: async () => ({ namespace:'v2', contentType:'course', contentId:'10000000-0000-4000-8000-000000000001', publicationVersion:1, course:{}, integrity:{}, warnings:[] }) }
    const result = await handleGatewayCourseDeliveryApi({ authorization:assertion(), correlationId:'correlation-1', method:'GET', path, kind:'active', contentId:'10000000-0000-4000-8000-000000000001' }, { verifier:verifier(), service:service as never })
    expect(result).toMatchObject({ status:200, headers:{ 'X-Correlation-Id':'correlation-1' }, body:{ data:{ publicationVersion:1 } } })
  })
})

describe('staging Google gateway identity',()=>{
  const env={VERCEL_ENV:'preview',V2_GATEWAY_GOOGLE_TOKEN_AUDIENCE:'https://editor-staging.example.com',V2_GATEWAY_SERVICE_ACCOUNT_EMAIL:'learner-gateway@ycoders-staging.iam.gserviceaccount.com',V2_GATEWAY_TRUST_ENVIRONMENT:'staging'} as NodeJS.ProcessEnv
  const payload={iss:'https://accounts.google.com',sub:'123',email:'learner-gateway@ycoders-staging.iam.gserviceaccount.com',email_verified:true,iat:1000,exp:1600}
  const client=(value:Record<string,unknown>=payload)=>({verifyIdToken:async()=>({getPayload:()=>value})})
  it('accepts only the configured Google service account and exact audience',async()=>{const verifier=new StagingGoogleGatewayVerifier(env,client() as never,()=>1_200_000);await expect(verifier.verify({authorization:'Bearer google-token',method:'GET',path:'/x',correlationId:'c'})).resolves.toEqual({serviceId:payload.email,environment:'staging',correlationId:'c'})})
  it.each([[{...payload,email:'other@ycoders-staging.iam.gserviceaccount.com'},'GATEWAY_SERVICE_UNAUTHORIZED'],[{...payload,exp:1100},'GATEWAY_SERVICE_ASSERTION_EXPIRED'],[{...payload,iss:'issuer.example'},'GATEWAY_SERVICE_UNAUTHORIZED']])('rejects untrusted or expired claims',async(value,code)=>{await expect(new StagingGoogleGatewayVerifier(env,client(value as Record<string,unknown>) as never,()=>1_200_000).verify({authorization:'Bearer token',method:'GET',path:'/x',correlationId:'c'})).rejects.toMatchObject({code})})
  it('rejects Firebase-style missing email service identity and local assertions',async()=>{const verifier=new StagingGoogleGatewayVerifier(env,client() as never,()=>1_200_000);await expect(verifier.verify({authorization:'ServiceAssertion local',method:'GET',path:'/x',correlationId:'c'})).rejects.toMatchObject({code:'GATEWAY_SERVICE_UNAUTHENTICATED'})})
  it('cannot activate in production',()=>expect(()=>new StagingGoogleGatewayVerifier({...env,VERCEL_ENV:'production'},client() as never)).toThrow(/not configured/i))
})

describe('production Google gateway identity',()=>{
  const env={VERCEL_ENV:'production',V2_GATEWAY_SERVICE_AUTH_MODE:'production-wif',V2_GATEWAY_GOOGLE_TOKEN_AUDIENCE:V2_PRODUCTION_GOOGLE_TOKEN_AUDIENCE,V2_GATEWAY_SERVICE_ACCOUNT_EMAIL:V2_PRODUCTION_GATEWAY_SERVICE_ACCOUNT} as NodeJS.ProcessEnv
  const payload={iss:'https://accounts.google.com',sub:'production-subject',email:V2_PRODUCTION_GATEWAY_SERVICE_ACCOUNT,email_verified:true,iat:1000,exp:1600}
  const client=(value:Record<string,unknown>=payload, failure=false)=>({verifyIdToken:async(options:{idToken:string;audience:string})=>{if(failure)throw new Error('invalid signature');expect(options).toEqual({idToken:'google-token',audience:V2_PRODUCTION_GOOGLE_TOKEN_AUDIENCE});return{getPayload:()=>value}}})
  const context={authorization:'Bearer google-token',method:'GET',path:'/api/v2/gateway/courses',correlationId:'production-correlation'}

  it('accepts the approved Production service account and returns a Production-bound principal',async()=>{
    const verifier=new ProductionGoogleGatewayVerifier(env,client() as never,()=>1_200_000)
    await expect(verifier.verify(context)).resolves.toEqual({serviceId:V2_PRODUCTION_GATEWAY_SERVICE_ACCOUNT,environment:'production',correlationId:'production-correlation'})
  })
  it.each(['preview','development'])('rejects production-wif configuration in %s',deployment=>expect(()=>new ProductionGoogleGatewayVerifier({...env,VERCEL_ENV:deployment},client() as never)).toThrow(/not configured/i))
  it.each([
    ['wrong email',{...payload,email:'other@mi-tutora-pro.iam.gserviceaccount.com'}],
    ['missing email',(({email:_email,...value})=>value)(payload)],
    ['unverified email',{...payload,email_verified:false}],
  ])('rejects %s',async(_label,value)=>await expect(new ProductionGoogleGatewayVerifier(env,client(value) as never,()=>1_200_000).verify(context)).rejects.toMatchObject({code:'GATEWAY_SERVICE_UNAUTHORIZED',status:403}))
  it.each(['https://admin.ycoders.com','https://ycoders.com','https://arbitrary.example','https://ycoders-editor.vercel.app/path'])('rejects invalid configured audience %s',audience=>expect(()=>new ProductionGoogleGatewayVerifier({...env,V2_GATEWAY_GOOGLE_TOKEN_AUDIENCE:audience},client() as never)).toThrow(/not configured/i))
  it('rejects expired tokens, invalid issuers, invalid signatures, and missing Bearer tokens',async()=>{
    await expect(new ProductionGoogleGatewayVerifier(env,client({...payload,exp:1100}) as never,()=>1_200_000).verify(context)).rejects.toMatchObject({code:'GATEWAY_SERVICE_ASSERTION_EXPIRED'})
    await expect(new ProductionGoogleGatewayVerifier(env,client({...payload,iss:'issuer.example'}) as never,()=>1_200_000).verify(context)).rejects.toMatchObject({code:'GATEWAY_SERVICE_UNAUTHORIZED'})
    await expect(new ProductionGoogleGatewayVerifier(env,client(payload,true) as never,()=>1_200_000).verify(context)).rejects.toMatchObject({code:'GATEWAY_SERVICE_UNAUTHENTICATED'})
    await expect(new ProductionGoogleGatewayVerifier(env,client() as never,()=>1_200_000).verify({...context,authorization:undefined})).rejects.toMatchObject({code:'GATEWAY_SERVICE_UNAUTHENTICATED'})
  })
  it('requires request correlation binding',async()=>await expect(new ProductionGoogleGatewayVerifier(env,client() as never,()=>1_200_000).verify({...context,correlationId:undefined})).rejects.toMatchObject({code:'GATEWAY_SERVICE_REQUEST_MISMATCH',status:403}))
})

describe('gateway verifier factory modes',()=>{
  it('selects explicit production, staging, and local verifiers and leaves unsupported modes fail-closed',()=>{
    const production={VERCEL_ENV:'production',V2_GATEWAY_SERVICE_AUTH_MODE:'production-wif',V2_GATEWAY_GOOGLE_TOKEN_AUDIENCE:V2_PRODUCTION_GOOGLE_TOKEN_AUDIENCE,V2_GATEWAY_SERVICE_ACCOUNT_EMAIL:V2_PRODUCTION_GATEWAY_SERVICE_ACCOUNT} as NodeJS.ProcessEnv
    expect(createGatewayServiceVerifier(production)).toBeInstanceOf(ProductionGoogleGatewayVerifier)
    expect(createGatewayServiceVerifier({VERCEL_ENV:'preview',V2_GATEWAY_SERVICE_AUTH_MODE:'staging-google',V2_GATEWAY_GOOGLE_TOKEN_AUDIENCE:'https://editor-staging.example.com',V2_GATEWAY_SERVICE_ACCOUNT_EMAIL:'learner-gateway@ycoders-staging.iam.gserviceaccount.com'})).toBeInstanceOf(StagingGoogleGatewayVerifier)
    expect(createGatewayServiceVerifier({...environment,V2_GATEWAY_SERVICE_AUTH_MODE:'test-ed25519',V2_GATEWAY_TEST_PUBLIC_KEY:keys.publicKey.export({type:'spki',format:'pem'}).toString()})).toBeInstanceOf(LocalTestGatewayServiceVerifier)
    expect(createGatewayServiceVerifier({VERCEL_ENV:'production',V2_GATEWAY_SERVICE_AUTH_MODE:'unsupported'})).toBeInstanceOf(UnconfiguredProductionGatewayVerifier)
  })
})
