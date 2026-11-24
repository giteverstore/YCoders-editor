import type { Credential, GoogleOAuthAccessToken } from 'firebase-admin/app'
import { IdentityPoolClient, Impersonated } from 'google-auth-library'
import { getVercelOidcToken } from '@vercel/oidc'

const WIF_AUDIENCE = /^\/\/iam\.googleapis\.com\/projects\/(\d+)\/locations\/global\/workloadIdentityPools\/([a-z0-9-]+)\/providers\/([a-z0-9-]+)$/
const SERVICE_ACCOUNT = /^([a-z0-9-]+)@([a-z0-9-]+)\.iam\.gserviceaccount\.com$/
const STAGING_PROJECT = 'ycoders-v2-staging'
const STAGING_PROJECT_NUMBER = '417214322239'
const STAGING_EDITOR_PROJECT_ID = 'prj_1rpww81OiuVkWJwyXlbggmKCFoWl'
const PRODUCTION_PROJECT = 'mi-tutora-pro'
const PRODUCTION_PROJECT_NUMBER = '196429461457'
const PRODUCTION_EDITOR_PROJECT_ID = 'prj_VdnJ6Q6FzEL5u5nSvUL88uoMB4xq'
const STAGING_EDITOR_PROVIDER = 'editor-preview'
const PRODUCTION_EDITOR_PROVIDER = 'vercel-admin-production'
const WIF_POOL = 'ai-tutor-vercel'
const VERCEL_OWNER = 'avinashabbigeris-projects'
const VERCEL_TEAM_ID = 'team_JWeTI30xjnERJbMpLUkgTpzV'
const LEARNER_SERVICE_ACCOUNT = 'ycoders-learner-gw-staging@ycoders-v2-staging.iam.gserviceaccount.com'
const PRODUCTION_EDITOR_SERVICE_ACCOUNT = 'ycoders-admin-runtime@mi-tutora-pro.iam.gserviceaccount.com'

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
  if (environment.GOOGLE_APPLICATION_CREDENTIALS || environment.FIREBASE_SERVICE_ACCOUNT_JSON) throw new FirebaseBackendCredentialError('Firebase backend must use keyless workload identity')

  if (mode === 'staging-wif') {
    if (deployment !== 'preview') throw new FirebaseBackendCredentialError('Editor staging WIF is only allowed in Preview')
    if (environment.VERCEL_PROJECT_ID !== STAGING_EDITOR_PROJECT_ID || projectId !== STAGING_PROJECT || storageBucket !== `${STAGING_PROJECT}.firebasestorage.app`) throw new FirebaseBackendCredentialError('Editor staging Firebase resource identity is not approved')
    if (!provider || provider[1] !== STAGING_PROJECT_NUMBER || provider[2] !== 'ycoders-vercel-staging' || provider[3] !== STAGING_EDITOR_PROVIDER) throw new FirebaseBackendCredentialError('Editor staging WIF provider is not approved')
    if (!serviceAccount || serviceAccount[2] !== STAGING_PROJECT || serviceAccountEmail === LEARNER_SERVICE_ACCOUNT) throw new FirebaseBackendCredentialError('Editor staging backend service account is not approved')
    return { projectId, storageBucket, providerAudience, serviceAccountEmail }
  }

  if (mode === 'production-wif') {
    if (deployment !== 'production') throw new FirebaseBackendCredentialError('Editor Production WIF is only allowed in Production')
    if (environment.VERCEL_PROJECT_ID !== PRODUCTION_EDITOR_PROJECT_ID || projectId !== PRODUCTION_PROJECT || storageBucket !== `${PRODUCTION_PROJECT}-admin-content`) throw new FirebaseBackendCredentialError('Editor Production Firebase resource identity is not approved')
    if (!provider || provider[1] !== PRODUCTION_PROJECT_NUMBER || provider[2] !== WIF_POOL || provider[3] !== PRODUCTION_EDITOR_PROVIDER) throw new FirebaseBackendCredentialError('Editor Production WIF provider is not approved')
    if (serviceAccountEmail !== PRODUCTION_EDITOR_SERVICE_ACCOUNT || !serviceAccount || serviceAccount[2] !== PRODUCTION_PROJECT) throw new FirebaseBackendCredentialError('Editor Production backend service account is not approved')
    return { projectId, storageBucket, providerAudience, serviceAccountEmail }
  }

  throw new FirebaseBackendCredentialError('Editor Firebase workload identity mode is not configured')
}

export function createFirebaseBackendWifCredential(
  environment: NodeJS.ProcessEnv = process.env,
  tokenSource: () => Promise<string> = () => verifiedEditorOidcToken(getVercelOidcToken, environment),
  IdentityPoolClientClass = IdentityPoolClient,
  ImpersonatedClass = Impersonated,
): Credential {
  const impersonated = createFirebaseBackendWifAuthClient(environment, tokenSource, IdentityPoolClientClass, ImpersonatedClass)
  return {
    async getAccessToken(): Promise<GoogleOAuthAccessToken> {
      const result = await impersonated.getAccessToken()
      if (!result.token) throw new FirebaseBackendCredentialError('Editor staging backend access token is unavailable')
      return { access_token: result.token, expires_in: 540 }
    },
  }
}

export function createFirebaseBackendWifAuthClient(
  environment: NodeJS.ProcessEnv = process.env,
  tokenSource: () => Promise<string> = () => verifiedEditorOidcToken(getVercelOidcToken, environment),
  IdentityPoolClientClass = IdentityPoolClient,
  ImpersonatedClass = Impersonated,
): Impersonated {
  const configuration = resolveFirebaseBackendWifConfig(environment)
  const source = new IdentityPoolClientClass({
    type: 'external_account',
    audience: configuration.providerAudience,
    subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    token_url: 'https://sts.googleapis.com/v1/token',
    subject_token_supplier: { getSubjectToken: tokenSource },
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  })
  return new ImpersonatedClass({ sourceClient: source, targetPrincipal: configuration.serviceAccountEmail, targetScopes: ['https://www.googleapis.com/auth/cloud-platform'], lifetime: 600 })
}

export async function verifiedEditorOidcToken(source: () => Promise<string>, environment: NodeJS.ProcessEnv): Promise<string> {
  const token = await source()
  let claims: Record<string, unknown>
  try { claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as Record<string, unknown> } catch { throw new FirebaseBackendCredentialError('Editor Vercel OIDC token is malformed') }
  const mode = String(environment.FIREBASE_BACKEND_AUTH_MODE ?? '')
  const production = mode === 'production-wif'
  const projectId = production ? PRODUCTION_EDITOR_PROJECT_ID : STAGING_EDITOR_PROJECT_ID
  const projectName = production ? 'ycoders-admin' : 'ycoders-editor-staging'
  const deployment = production ? 'production' : 'preview'
  const expectedIssuer = `https://oidc.vercel.com/${VERCEL_OWNER}`
  const expectedAudience = `https://vercel.com/${VERCEL_OWNER}`
  const expectedSubject = `owner:${VERCEL_OWNER}:project:${projectName}:environment:${deployment}`
  if (claims.iss !== expectedIssuer || claims.aud !== expectedAudience || claims.sub !== expectedSubject || claims.owner !== VERCEL_OWNER || claims.owner_id !== VERCEL_TEAM_ID || claims.project !== projectName || claims.project_id !== projectId || claims.environment !== deployment) throw new FirebaseBackendCredentialError('Editor Vercel OIDC workload identity is not approved')
  if (environment.VERCEL_PROJECT_ID !== projectId || String(environment.VERCEL_ENV ?? '').toLowerCase() !== deployment) throw new FirebaseBackendCredentialError('Editor Vercel runtime project or environment is not approved')
  console.info('editor_firebase_wif.oidc', { issuer:claims.iss, audience:claims.aud, subject:claims.sub, owner:claims.owner, ownerId:claims.owner_id, project:claims.project, projectId:claims.project_id, environment:claims.environment })
  return token
}

