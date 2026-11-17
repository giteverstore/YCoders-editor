import { describe, expect, it, vi } from 'vitest'

import { createFirebaseBackendWifCredential, resolveFirebaseBackendWifConfig } from './firebaseBackendCredential'

const base = {
  VERCEL_ENV: 'preview', VERCEL_PROJECT_ID: 'prj_1rpww81OiuVkWJwyXlbggmKCFoWl', FIREBASE_BACKEND_AUTH_MODE: 'staging-wif',
  FIREBASE_ADMIN_PROJECT_ID: 'ycoders-v2-staging', FIREBASE_STORAGE_BUCKET: 'ycoders-v2-staging.firebasestorage.app',
  EDITOR_FIREBASE_WIF_AUDIENCE: '//iam.googleapis.com/projects/417214322239/locations/global/workloadIdentityPools/ycoders-vercel-staging/providers/editor-preview',
  EDITOR_FIREBASE_SERVICE_ACCOUNT_EMAIL: 'ycoders-editor-staging@ycoders-v2-staging.iam.gserviceaccount.com',
} as NodeJS.ProcessEnv

describe('Editor Firebase backend WIF credential', () => {
  it('selects the exact keyless staging identity and obtains an ephemeral access token', async () => {
    const source = vi.fn(); class Source { constructor(value: unknown) { source(value) } }
    const impersonated = vi.fn(); class Target { constructor(value: unknown) { impersonated(value) } async getAccessToken() { return { token: 'ephemeral' } } }
    const credential = createFirebaseBackendWifCredential(base, async () => 'vercel-oidc', Source as never, Target as never)
    await expect(credential.getAccessToken()).resolves.toEqual({ access_token: 'ephemeral', expires_in: 540 })
    expect(source).toHaveBeenCalledWith(expect.objectContaining({ audience: base.EDITOR_FIREBASE_WIF_AUDIENCE, subject_token_supplier: expect.any(Object) }))
    expect(impersonated).toHaveBeenCalledWith(expect.objectContaining({ targetPrincipal: base.EDITOR_FIREBASE_SERVICE_ACCOUNT_EMAIL, lifetime: 600 }))
  })

  it.each([
    ['missing config', { FIREBASE_BACKEND_AUTH_MODE: undefined }], ['production', { VERCEL_ENV: 'production' }], ['wrong project', { FIREBASE_ADMIN_PROJECT_ID: 'mi-tutora-pro' }],
    ['wrong Vercel project', { VERCEL_PROJECT_ID: 'prj_other' }], ['wrong provider', { EDITOR_FIREBASE_WIF_AUDIENCE: '//iam.googleapis.com/projects/417214322239/locations/global/workloadIdentityPools/ycoders-vercel-staging/providers/learner-preview' }],
    ['learner service account', { EDITOR_FIREBASE_SERVICE_ACCOUNT_EMAIL: 'ycoders-learner-gw-staging@ycoders-v2-staging.iam.gserviceaccount.com' }],
    ['JSON fallback', { FIREBASE_SERVICE_ACCOUNT_JSON: '{}' }], ['credential file', { GOOGLE_APPLICATION_CREDENTIALS: 'key.json' }],
  ])('fails closed for %s', (_label, override) => expect(() => resolveFirebaseBackendWifConfig({ ...base, ...override })).toThrow())
})
