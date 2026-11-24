import { describe, expect, it, vi } from 'vitest'

import { V2DraftApiClient, DraftApiError } from '../cloud/draftApiClient'
import { createCourseDocument, updateCourse } from '../editor/core/courseEditor.commands'
import { hasPermission, isAdminRole } from '../auth/permissions'
import { handleDraftApi, MAX_API_BODY_BYTES } from './draftApi'
import { assertSafeAdminEnvironment } from './firebaseAdmin.server'
import { V2_DRAFT_COLLECTION } from './firestoreDraftRepository'
import { CloudRepositoryError, type CloudDraftRecord, type CloudDraftRepository, type CloudDraftSummary } from './cloudDraft.types'
import type { TokenVerifier } from './auth.server'
import type { ContentDocument } from '../content/core/envelope'
import { validChallengeDocument, validProjectDocument } from '../content/fixtures/validDocuments'
import { assertEmulatorTestEnvironment, EMULATOR_PROJECT_ID } from './emulatorSafety'

const ids = () => { let index = 0; return () => `d0000000-0000-4000-8000-${String(++index).padStart(12, '0')}` }

class MemoryCloudRepository implements CloudDraftRepository {
  records = new Map<string, CloudDraftRecord>()
  now = '2026-11-16T14:00:00.000Z'
  async create(document: ContentDocument, actorUid: string) { if (this.records.has(document.id)) throw new CloudRepositoryError('duplicate', 'duplicate'); const record: CloudDraftRecord = { id: document.id, contentType: document.contentType, schemaVersion: '2.0.0', revision: 1, document: structuredClone(document), createdAt: this.now, updatedAt: this.now, createdBy: actorUid, updatedBy: actorUid }; this.records.set(record.id, record); return structuredClone(record) }
  async get(id: string) { return structuredClone(this.records.get(id) ?? null) }
  async list(): Promise<CloudDraftSummary[]> { return [...this.records.values()].map(({ document, ...record }) => ({ ...record, title: document.title, slug: document.slug })) }
  async save(id: string, document: ContentDocument, expectedRevision: number, actorUid: string) { const current = this.records.get(id); if (!current) throw new CloudRepositoryError('missing', 'not-found'); if (current.revision !== expectedRevision) throw new CloudRepositoryError('conflict', 'conflict', { expectedRevision, currentRevision: current.revision }); const record = { ...current, revision: current.revision + 1, document: structuredClone(document), updatedAt: this.now, updatedBy: actorUid }; this.records.set(id, record); return structuredClone(record) }
  async delete(id: string, expectedRevision: number) { const current = this.records.get(id); if (!current) throw new CloudRepositoryError('missing', 'not-found'); if (current.revision !== expectedRevision) throw new CloudRepositoryError('conflict', 'conflict', { expectedRevision, currentRevision: current.revision }); this.records.delete(id) }
}

const verifier: TokenVerifier = { async verify(token) {
  if (token === 'invalid') throw new Error('Firebase signature internals')
  if (token === 'expired') throw new Error('token-expired')
  if (token === 'missing-role') return { uid: 'user-no-role' }
  if (token === 'unsupported-role') return { uid: 'legacy-admin', adminRole: 'ADMIN' }
  if (token === 'reviewer') return { uid: 'reviewer-uid', adminRole: 'CONTENT_REVIEWER' }
  return { uid: 'editor-uid', adminRole: 'CONTENT_EDITOR' }
} }
const auth = (token = 'editor') => `Bearer ${token}`
const request = (method: string, extra: Record<string, unknown> = {}) => ({ method, authorization: auth(), ...(method === 'GET' ? {} : { contentType: 'application/json' }), ...extra })

describe('draft API authentication and authorization', () => {
  it.each([undefined, 'Basic abc'])('rejects missing or malformed authorization %s', async (authorization) => {
    expect((await handleDraftApi({ method: 'GET', authorization }, { verifier, repository: new MemoryCloudRepository() })).status).toBe(401)
  })
  it.each(['invalid', 'expired'])('rejects invalid or expired token %s without leaking details', async (token) => {
    const result = await handleDraftApi({ method: 'GET', authorization: auth(token) }, { verifier, repository: new MemoryCloudRepository() })
    expect(result.status).toBe(401); expect(JSON.stringify(result.body)).not.toContain('signature'); expect(JSON.stringify(result.body)).not.toContain('token-expired')
  })
  it.each(['missing-role', 'unsupported-role'])('rejects unrecognized admin claims: %s', async (token) => {
    expect((await handleDraftApi({ method: 'GET', authorization: auth(token) }, { verifier, repository: new MemoryCloudRepository() })).status).toBe(403)
  })
  it('allows reviewer reads but rejects reviewer writes and deletes', async () => {
    const repository = new MemoryCloudRepository(); const document = createCourseDocument(ids())
    await repository.create(document, 'seed')
    expect((await handleDraftApi({ method: 'GET', authorization: auth('reviewer') }, { verifier, repository })).status).toBe(200)
    expect((await handleDraftApi({ method: 'POST', authorization: auth('reviewer'), contentType: 'application/json', body: { document } }, { verifier, repository })).status).toBe(403)
    expect((await handleDraftApi({ method: 'DELETE', authorization: auth('reviewer'), contentType: 'application/json', body: { expectedRevision: 1 }, id: document.id }, { verifier, repository })).status).toBe(403)
  })
  it('uses only the proposed adminRole permission matrix', () => {
    expect(isAdminRole('CONTENT_EDITOR')).toBe(true); expect(isAdminRole('ADMIN')).toBe(false)
    expect(hasPermission('CONTENT_REVIEWER', 'draft:read')).toBe(true); expect(hasPermission('CONTENT_REVIEWER', 'draft:write')).toBe(false)
  })
})

describe('draft API validation and repository behavior', () => {
  it('creates with server-managed actor data and lists summaries', async () => {
    const repository = new MemoryCloudRepository(); const document = createCourseDocument(ids())
    const created = await handleDraftApi(request('POST', { body: { document } }), { verifier, repository })
    expect(created.status).toBe(201); expect((created.body.data as CloudDraftRecord).createdBy).toBe('editor-uid'); expect((created.body.data as CloudDraftRecord).revision).toBe(1)
    const listed = await handleDraftApi(request('GET'), { verifier, repository }); expect((listed.body.data as CloudDraftSummary[])[0]).toMatchObject({ id: document.id, title: document.title })
  })
  it('rejects content type, oversized bodies, invalid IDs, bodies, and drafts', async () => {
    const repository = new MemoryCloudRepository()
    expect((await handleDraftApi({ method: 'POST', authorization: auth(), contentType: 'text/plain', body: {} }, { verifier, repository })).status).toBe(415)
    expect((await handleDraftApi(request('POST', { body: {}, contentLength: MAX_API_BODY_BYTES + 1 }), { verifier, repository })).status).toBe(413)
    expect((await handleDraftApi(request('GET', { id: '../learnerProgress' }), { verifier, repository })).status).toBe(422)
    expect((await handleDraftApi(request('POST', { body: { unexpected: true } }), { verifier, repository })).status).toBe(422)
    const invalid = createCourseDocument(ids()); (invalid as { schemaVersion: string }).schemaVersion = '3.0.0'
    const result = await handleDraftApi(request('POST', { body: { document: invalid } }), { verifier, repository }); expect(result.status).toBe(422)
  })
  it('returns duplicate, missing, and revision-conflict responses', async () => {
    const repository = new MemoryCloudRepository(); const document = createCourseDocument(ids())
    await handleDraftApi(request('POST', { body: { document } }), { verifier, repository })
    expect((await handleDraftApi(request('POST', { body: { document } }), { verifier, repository })).status).toBe(409)
    expect((await handleDraftApi(request('GET', { id: 'd0000000-0000-4000-8000-999999999999' }), { verifier, repository })).status).toBe(404)
    await handleDraftApi(request('PUT', { id: document.id, body: { document: updateCourse(document, { title: 'Revision 2' }), expectedRevision: 1 } }), { verifier, repository })
    const conflict = await handleDraftApi(request('PUT', { id: document.id, body: { document, expectedRevision: 1 } }), { verifier, repository })
    expect(conflict.status).toBe(409); expect(conflict.body.error?.details).toEqual({ expectedRevision: 1, currentRevision: 2 })
  })
  it('increments atomically, records the updater, and rejects stale deletion', async () => {
    const repository = new MemoryCloudRepository(); const document = createCourseDocument(ids()); await repository.create(document, 'creator')
    const saved = await handleDraftApi(request('PUT', { id: document.id, body: { document: updateCourse(document, { title: 'Updated' }), expectedRevision: 1 } }), { verifier, repository })
    expect(saved.body.data).toMatchObject({ revision: 2, createdBy: 'creator', updatedBy: 'editor-uid' })
    expect((await handleDraftApi(request('DELETE', { id: document.id, body: { expectedRevision: 1 } }), { verifier, repository })).status).toBe(409)
    expect((await handleDraftApi(request('DELETE', { id: document.id, body: { expectedRevision: 2 } }), { verifier, repository })).status).toBe(200)
  })
  it('keeps Challenge and Project drafts unavailable through direct authenticated API routes', async () => {
    const repository = new MemoryCloudRepository()
    for (const document of [validChallengeDocument, validProjectDocument]) {
      const created = await handleDraftApi(request('POST', { body: { document } }), { verifier, repository })
      expect(created).toMatchObject({ status: 403, body: { error: { code: 'DOMAIN_WORK_IN_PROGRESS' } } })
      const listed = await handleDraftApi(request('GET', { draftType: document.contentType }), { verifier, repository })
      expect(listed).toMatchObject({ status: 403, body: { error: { code: 'DOMAIN_WORK_IN_PROGRESS' } } })

      const existing = new MemoryCloudRepository()
      await existing.create(document, 'seed')
      const context = { verifier, repository: existing }
      expect((await handleDraftApi(request('GET', { id: document.id }), context)).status).toBe(403)
      expect((await handleDraftApi(request('PUT', { id: document.id, body: { document, expectedRevision: 1 } }), context)).status).toBe(403)
      expect((await handleDraftApi(request('DELETE', { id: document.id, body: { expectedRevision: 1 } }), context)).status).toBe(403)
    }
  })
  it('sanitizes unexpected errors', async () => {
    const repository = new MemoryCloudRepository(); repository.list = async () => { throw new Error('secret-project/service-account@example.com') }
    const result = await handleDraftApi(request('GET'), { verifier, repository }); expect(result.status).toBe(500); expect(JSON.stringify(result.body)).not.toContain('secret-project')
  })
  it('hard-scopes all Firestore operations to the V2 collection', () => { expect(V2_DRAFT_COLLECTION).toBe('editorV2Drafts'); expect(V2_DRAFT_COLLECTION).not.toMatch(/adminContent|publishedContent|learner/i) })
})

describe('environment safety and API client', () => {
  it('fails closed outside production without both emulators', () => {
    expect(() => assertSafeAdminEnvironment({ FIREBASE_ADMIN_PROJECT_ID: 'test' })).toThrow(/emulators/)
    expect(() => assertSafeAdminEnvironment({ FIREBASE_ADMIN_PROJECT_ID: EMULATOR_PROJECT_ID, FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' })).not.toThrow()
    expect(() => assertSafeAdminEnvironment({ FIREBASE_ADMIN_PROJECT_ID: 'prod', VERCEL_ENV: 'production' })).toThrow(/Production WIF/)
    const production = { VERCEL_ENV: 'production', FIREBASE_BACKEND_AUTH_MODE: 'production-wif', FIREBASE_ADMIN_PROJECT_ID: 'mi-tutora-pro', FIREBASE_STORAGE_BUCKET: 'mi-tutora-pro-admin-content', VERCEL_PROJECT_ID: 'prj_VdnJ6Q6FzEL5u5nSvUL88uoMB4xq', EDITOR_FIREBASE_WIF_AUDIENCE: '//iam.googleapis.com/projects/196429461457/locations/global/workloadIdentityPools/ai-tutor-vercel/providers/vercel-admin-production', EDITOR_FIREBASE_SERVICE_ACCOUNT_EMAIL: 'ycoders-admin-runtime@mi-tutora-pro.iam.gserviceaccount.com' }
    expect(() => assertSafeAdminEnvironment(production)).not.toThrow()
    expect(() => assertSafeAdminEnvironment({ ...production, FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' })).toThrow(/emulator/)
    expect(() => assertSafeAdminEnvironment({ ...production, FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' })).toThrow(/emulator/)
    expect(() => assertSafeAdminEnvironment({ ...production, FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199' })).toThrow(/emulator/)
  })
  it('rejects production IDs, remote emulator hosts, credential files, and ambiguous Firebase config', () => {
    const safe = { FIREBASE_ADMIN_PROJECT_ID: EMULATOR_PROJECT_ID, FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099', FIRESTORE_EMULATOR_HOST: 'localhost:8080' }
    expect(() => assertEmulatorTestEnvironment(safe)).not.toThrow()
    expect(() => assertEmulatorTestEnvironment({ ...safe, FIREBASE_ADMIN_PROJECT_ID: 'ycoders-production' })).toThrow(/project ID/)
    expect(() => assertEmulatorTestEnvironment({ ...safe, FIRESTORE_EMULATOR_HOST: '10.0.0.8:8080' })).toThrow(/loopback/)
    expect(() => assertEmulatorTestEnvironment({ ...safe, GOOGLE_APPLICATION_CREDENTIALS: 'service-account.json' })).toThrow(/reject/)
    expect(() => assertEmulatorTestEnvironment({ ...safe, FIREBASE_CONFIG: JSON.stringify({ projectId: 'ycoders-production' }) })).toThrow(/does not match/)
  })
  it('sends bearer tokens, refreshes once after 401, and maps API errors', async () => {
    const getToken = vi.fn(async (refresh?: boolean) => refresh ? 'fresh-token' : 'old-token')
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error: { code: 'AUTHENTICATION_REQUIRED', message: 'expired' } }), { status: 401, headers: { 'Content-Type': 'application/json' } })).mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const client = new V2DraftApiClient(getToken, '/api/v2/drafts', fetcher)
    await expect(client.list()).resolves.toEqual([]); expect(getToken).toHaveBeenNthCalledWith(2, true); expect(fetcher.mock.calls[1][1].headers.Authorization).toBe('Bearer fresh-token')
    const denied = new V2DraftApiClient(getToken, '/api', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false, error: { code: 'PERMISSION_DENIED', message: 'No access' } }), { status: 403 })))
    await expect(denied.list()).rejects.toBeInstanceOf(DraftApiError)
  })
})
