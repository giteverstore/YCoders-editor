import type { Credential, GoogleOAuthAccessToken } from 'firebase-admin/app'
import { IdentityPoolClient, Impersonated } from 'google-auth-library'
import { getVercelOidcToken } from '@vercel/oidc'

const WIF_AUDIENCE = /^\/\/iam\.googleapis\.com\/projects\/(\d+)\/locations\/global\/workloadIdentityPools\/([a-z0-9-]+)\/providers\/([a-z0-9-]+)$/
const SERVICE_ACCOUNT = /^([a-z0-9-]+)@([a-z0-9-]+)\.iam\.gserviceaccount\.com$/
const STAGING_PROJECT = 'ycoders-v2-staging'
const STAGING_PROJECT_NUMBER = '417214322239'
const EDITOR_PROJECT_ID = 'prj_1rpww81OiuVkWJwyXlbggmKCFoWl'
const EDITOR_PROVIDER = 'editor-preview'
const LEARNER_SERVICE_ACCOUNT = 'ycoders-learner-gw-staging@ycoders-v2-staging.iam.gserviceaccount.com'

export class FirebaseBackendCredentialError extends Error {
  constructor(message: string) { super(message); this.name = 'FirebaseBackendCredentialError' }
}

export type FirebaseBackendWifConfig = {
  projectId: string
  storageBucket: string
  providerAudience: string
  serviceAccountEmail: string
}

export function resolveFirebaseBackendWifConfig(environment: NodeJS.ProcessEnv = process.env): FirebaseBackendWifConfig {
  const deployment = String(environment.VERCEL_ENV ?? '').toLowerCase()
  const mode = String(environment.FIREBASE_BACKEND_AUTH_MODE ?? '')
  const projectId = String(environment.FIREBASE_ADMIN_PROJECT_ID ?? '')
  const storageBucket = String(environment.FIREBASE_STORAGE_BUCKET ?? '')
  const providerAudience = String(environment.EDITOR_FIREBASE_WIF_AUDIENCE ?? '')
  const serviceAccountEmail = String(environment.EDITOR_FIREBASE_SERVICE_ACCOUNT_EMAIL ?? '')
  const provider = providerAudience.match(WIF_AUDIENCE)
  const serviceAccount = serviceAccountEmail.match(SERVICE_ACCOUNT)
  if (deployment !== 'preview' || mode !== 'staging-wif' || environment.GOOGLE_APPLICATION_CREDENTIALS || environment.FIREBASE_SERVICE_ACCOUNT_JSON) throw new FirebaseBackendCredentialError('Editor staging keyless Firebase authentication is not safely configured')
  if (environment.VERCEL_PROJECT_ID !== EDITOR_PROJECT_ID || projectId !== STAGING_PROJECT || storageBucket !== `${STAGING_PROJECT}.firebasestorage.app`) throw new FirebaseBackendCredentialError('Editor staging Firebase resource identity is not approved')
  if (!provider || provider[1] !== STAGING_PROJECT_NUMBER || provider[2] !== 'ycoders-vercel-staging' || provider[3] !== EDITOR_PROVIDER) throw new FirebaseBackendCredentialError('Editor staging WIF provider is not approved')
  if (!serviceAccount || serviceAccount[2] !== STAGING_PROJECT || serviceAccountEmail === LEARNER_SERVICE_ACCOUNT) throw new FirebaseBackendCredentialError('Editor staging backend service account is not approved')
  return { projectId, storageBucket, providerAudience, serviceAccountEmail }
}

export function createFirebaseBackendWifCredential(
  environment: NodeJS.ProcessEnv = process.env,
  tokenSource: () => Promise<string> = () => verifiedEditorOidcToken(getVercelOidcToken, environment),
  IdentityPoolClientClass = IdentityPoolClient,
  ImpersonatedClass = Impersonated,
): Credential {
  const configuration = resolveFirebaseBackendWifConfig(environment)
  const source = new IdentityPoolClientClass({
    type: 'external_account',
    audience: configuration.providerAudience,
    subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    token_url: 'https://sts.googleapis.com/v1/token',
    subject_token_supplier: { getSubjectToken: tokenSource },
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  })
  const impersonated = new ImpersonatedClass({ sourceClient: source, targetPrincipal: configuration.serviceAccountEmail, targetScopes: ['https://www.googleapis.com/auth/cloud-platform'], lifetime: 600 })
  return {
    async getAccessToken(): Promise<GoogleOAuthAccessToken> {
      const result = await impersonated.getAccessToken()
      if (!result.token) throw new FirebaseBackendCredentialError('Editor staging backend access token is unavailable')
      return { access_token: result.token, expires_in: 540 }
    },
  }
}

async function verifiedEditorOidcToken(source: () => Promise<string>, environment: NodeJS.ProcessEnv): Promise<string> {
  const token = await source()
  let claims: Record<string, unknown>
  try { claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as Record<string, unknown> } catch { throw new FirebaseBackendCredentialError('Editor Vercel OIDC token is malformed') }
  const expectedIssuer = 'https://oidc.vercel.com/avinashabbigeris-projects'
  const expectedAudience = 'https://vercel.com/avinashabbigeris-projects'
  const expectedSubject = 'owner:avinashabbigeris-projects:project:ycoders-editor-staging:environment:preview'
  if (claims.iss !== expectedIssuer || claims.aud !== expectedAudience || claims.sub !== expectedSubject || claims.owner !== 'avinashabbigeris-projects' || claims.owner_id !== 'team_JWeTI30xjnERJbMpLUkgTpzV' || claims.project !== 'ycoders-editor-staging' || claims.project_id !== EDITOR_PROJECT_ID || claims.environment !== 'preview') throw new FirebaseBackendCredentialError('Editor Vercel OIDC workload identity is not approved')
  if (environment.VERCEL_PROJECT_ID !== EDITOR_PROJECT_ID) throw new FirebaseBackendCredentialError('Editor Vercel runtime project is not approved')
  console.info('editor_firebase_wif.oidc', { issuer:claims.iss, audience:claims.aud, subject:claims.sub, owner:claims.owner, ownerId:claims.owner_id, project:claims.project, projectId:claims.project_id, environment:claims.environment })
  return token
}

