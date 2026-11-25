import { describe, expect, it, vi } from 'vitest'

import { createFirebaseBackendWifCredential, resolveFirebaseBackendWifConfig, verifiedEditorOidcToken } from './firebaseBackendCredential'

const base = {
  VERCEL_ENV: 'preview', VERCEL_PROJECT_ID: 'prj_1rpww81OiuVkWJwyXlbggmKCFoWl', FIREBASE_BACKEND_AUTH_MODE: 'staging-wif',
  FIREBASE_ADMIN_PROJECT_ID: 'ycoders-v2-staging', FIREBASE_STORAGE_BUCKET: 'ycoders-v2-staging.firebasestorage.app',
  EDITOR_FIREBASE_WIF_AUDIENCE: '//iam.googleapis.com/projects/417214322239/locations/global/workloadIdentityPools/ycoders-vercel-staging/providers/editor-preview',
  EDITOR_FIREBASE_SERVICE_ACCOUNT_EMAIL: 'ycoders-editor-staging@ycoders-v2-staging.iam.gserviceaccount.com',
} as NodeJS.ProcessEnv
const production = {
  VERCEL_ENV: 'production', VERCEL_PROJECT_ID: 'prj_YgiW6kAS3VfnN9oHq6t5ayeiYvXm', FIREBASE_BACKEND_AUTH_MODE: 'production-wif',
  FIREBASE_ADMIN_PROJECT_ID: 'mi-tutora-pro', FIREBASE_STORAGE_BUCKET: 'mi-tutora-pro-admin-content',
  EDITOR_FIREBASE_WIF_AUDIENCE: '//iam.googleapis.com/projects/196429461457/locations/global/workloadIdentityPools/ai-tutor-vercel/providers/vercel-editor-production',
  EDITOR_FIREBASE_SERVICE_ACCOUNT_EMAIL: 'ycoders-admin-runtime@mi-tutora-pro.iam.gserviceaccount.com',
} as NodeJS.ProcessEnv
function oidcToken(project: string, projectId: string, environment: string, overrides: Record<string, unknown> = {}) {
  const claims = { iss: 'https://oidc.vercel.com/avinashabbigeris-projects', aud: 'https://vercel.com/avinashabbigeris-projects', sub: `owner:avinashabbigeris-projects:project:${project}:environment:${environment}`, owner: 'avinashabbigeris-projects', owner_id: 'team_JWeTI30xjnERJbMpLUkgTpzV', project, project_id: projectId, environment, ...overrides }
  return `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`
}

describe('Editor Firebase backend WIF credential', () => {
  it('selects the exact keyless staging identity and obtains an ephemeral access token', async () => {
    const source = vi.fn(); class Source { constructor(value: unknown) { source(value) } }
    const impersonated = vi.fn(); class Target { constructor(value: unknown) { impersonated(value) } async getAccessToken() { return { token: 'ephemeral' } } }
    const credential = createFirebaseBackendWifCredential(base, async () => 'vercel-oidc', Source as never, Target as never)
    await expect(credential.getAccessToken()).resolves.toEqual({ access_token: 'ephemeral', expires_in: 540 })
    expect(source).toHaveBeenCalledWith(expect.objectContaining({ audience: base.EDITOR_FIREBASE_WIF_AUDIENCE, subject_token_supplier: expect.any(Object) }))
    expect(impersonated).toHaveBeenCalledWith(expect.objectContaining({ targetPrincipal: base.EDITOR_FIREBASE_SERVICE_ACCOUNT_EMAIL, lifetime: 600 }))
  })

  it('accepts the exact keyless Production identity and validates its Production Vercel subject', async () => {
    expect(resolveFirebaseBackendWifConfig(production)).toMatchObject({ projectId: 'mi-tutora-pro', storageBucket: 'mi-tutora-pro-admin-content', providerAudience: production.EDITOR_FIREBASE_WIF_AUDIENCE, serviceAccountEmail: production.EDITOR_FIREBASE_SERVICE_ACCOUNT_EMAIL })
    await expect(verifiedEditorOidcToken(async () => oidcToken('ycoders-editor', 'prj_YgiW6kAS3VfnN9oHq6t5ayeiYvXm', 'production'), production)).resolves.toContain('.')
    const source = vi.fn(); class Source { constructor(value: unknown) { source(value) } }
    const impersonated = vi.fn(); class Target { constructor(value: unknown) { impersonated(value) } async getAccessToken() { return { token: 'ephemeral-production' } } }
    const credential = createFirebaseBackendWifCredential(production, async () => oidcToken('ycoders-editor', 'prj_YgiW6kAS3VfnN9oHq6t5ayeiYvXm', 'production'), Source as never, Target as never)
    await expect(credential.getAccessToken()).resolves.toEqual({ access_token: 'ephemeral-production', expires_in: 540 })
    expect(source).toHaveBeenCalledWith(expect.objectContaining({ audience: production.EDITOR_FIREBASE_WIF_AUDIENCE }))
    expect(impersonated).toHaveBeenCalledWith(expect.objectContaining({ targetPrincipal: production.EDITOR_FIREBASE_SERVICE_ACCOUNT_EMAIL, lifetime: 600 }))
  })

  it('preserves Preview staging configuration and rejects Production claims on that profile', async () => {
    expect(resolveFirebaseBackendWifConfig(base)).toMatchObject({ projectId: 'ycoders-v2-staging', storageBucket: 'ycoders-v2-staging.firebasestorage.app' })
    await expect(verifiedEditorOidcToken(async () => oidcToken('ycoders-editor', 'prj_YgiW6kAS3VfnN9oHq6t5ayeiYvXm', 'production'), base)).rejects.toThrow(/not approved/)
  })

  it.each([
    ['missing config', { FIREBASE_BACKEND_AUTH_MODE: undefined }], ['production', { VERCEL_ENV: 'production' }], ['wrong project', { FIREBASE_ADMIN_PROJECT_ID: 'mi-tutora-pro' }],
    ['wrong Vercel project', { VERCEL_PROJECT_ID: 'prj_other' }], ['wrong provider', { EDITOR_FIREBASE_WIF_AUDIENCE: '//iam.googleapis.com/projects/417214322239/locations/global/workloadIdentityPools/ycoders-vercel-staging/providers/learner-preview' }],
    ['learner service account', { EDITOR_FIREBASE_SERVICE_ACCOUNT_EMAIL: 'ycoders-learner-gw-staging@ycoders-v2-staging.iam.gserviceaccount.com' }],
    ['JSON fallback', { FIREBASE_SERVICE_ACCOUNT_JSON: '{}' }], ['credential file', { GOOGLE_APPLICATION_CREDENTIALS: 'key.json' }],
  ])('fails closed for %s', (_label, override) => expect(() => resolveFirebaseBackendWifConfig({ ...base, ...override })).toThrow())

  it.each([
    ['missing mode', { FIREBASE_BACKEND_AUTH_MODE: undefined }],
    ['Preview deployment', { VERCEL_ENV: 'preview' }],
    ['wrong project', { VERCEL_PROJECT_ID: 'prj_other' }],
    ['wrong Firebase project', { FIREBASE_ADMIN_PROJECT_ID: 'ycoders-v2-staging' }],
    ['wrong storage bucket', { FIREBASE_STORAGE_BUCKET: 'mi-tutora-pro.firebasestorage.app' }],
    ['wrong provider', { EDITOR_FIREBASE_WIF_AUDIENCE: '//iam.googleapis.com/projects/196429461457/locations/global/workloadIdentityPools/ai-tutor-vercel/providers/vercel-production' }],
    ['wrong service account', { EDITOR_FIREBASE_SERVICE_ACCOUNT_EMAIL: 'ai-tutor-runtime@mi-tutora-pro.iam.gserviceaccount.com' }],
    ['service-account JSON', { FIREBASE_SERVICE_ACCOUNT_JSON: '{}' }],
    ['credential file', { GOOGLE_APPLICATION_CREDENTIALS: 'key.json' }],
  ])('fails closed for Production %s', (_label, override) => expect(() => resolveFirebaseBackendWifConfig({ ...production, ...override })).toThrow())

  it('rejects legacy, wrong project ID, wrong environment, and wrong team Production claims', async () => {
    for (const token of [
      oidcToken('ycoders-admin', 'prj_VdnJ6Q6FzEL5u5nSvUL88uoMB4xq', 'production'),
      oidcToken('ycoders-editor', 'prj_wrong', 'production'),
      oidcToken('ycoders-editor', 'prj_YgiW6kAS3VfnN9oHq6t5ayeiYvXm', 'preview'),
      oidcToken('ycoders-editor', 'prj_YgiW6kAS3VfnN9oHq6t5ayeiYvXm', 'production', { owner_id: 'team_wrong' }),
    ]) await expect(verifiedEditorOidcToken(async () => token, production)).rejects.toThrow(/not approved/)
  })
})
