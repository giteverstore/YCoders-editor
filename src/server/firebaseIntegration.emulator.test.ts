import { deleteApp as deleteClientApp, initializeApp as initializeClientApp } from 'firebase/app'
import { connectFirestoreEmulator, doc as clientDoc, getFirestore as getClientFirestore, setDoc } from 'firebase/firestore'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { beforeAll, describe, expect, it } from 'vitest'

import v2AdminHandler from '../../api/v2/[...path]'
import { createCourseDocument, updateCourse } from '../editor/core/courseEditor.commands'
import { createPracticeDocument, updatePractice } from '../editor/core/practiceEditor.commands'
import { createChallengeDocument, changeChallenge } from '../editor/core/challengeEditor'
import { createProjectDocument, changeProject } from '../editor/core/projectEditor'
import { EMULATOR_PROJECT_ID, assertEmulatorTestEnvironment } from './emulatorSafety'
import { getServerDependencies } from './firebaseAdmin.server'
import { getAssetServerDependencies } from './firebaseAdmin.server'
import { handleAssetApi } from './assetApi'
import { V2_DRAFT_COLLECTION } from './firestoreDraftRepository'

type ApiBody = { ok: boolean; data?: unknown; error?: { code: string; message: string; details?: unknown } }
type ApiResponse = { status: number; body: ApiBody }
const ids = () => { let index = 0; return () => `e0000000-0000-4000-8000-${String(++index).padStart(12, '0')}` as `${string}-${string}-${string}-${string}-${string}` }
const idFactory = ids()
const tokens = new Map<string, string>()

beforeAll(async () => {
  assertEmulatorTestEnvironment()
  process.env.FIREBASE_ADMIN_PROJECT_ID = EMULATOR_PROJECT_ID
  getServerDependencies()
  await clearFirestore()
  await clearAuthUsers()
  for (const [name, role] of [['no-role', undefined], ['unsupported', 'ADMIN'], ['reviewer', 'CONTENT_REVIEWER'], ['editor', 'CONTENT_EDITOR'], ['admin', 'CONTENT_ADMIN'], ['super', 'SUPER_ADMIN']] as const) {
    const email = `${name}@emulator.test`
    const user = await getAuth().createUser({ email, password: 'Emulator-password-123!' })
    if (role) await getAuth().setCustomUserClaims(user.uid, { adminRole: role })
    tokens.set(name, await signIn(email, 'Emulator-password-123!'))
  }
}, 30_000)

describe('real Auth emulator authorization', () => {
  it('rejects missing, invalid, missing-role, and unsupported-role tokens', async () => {
    expect((await callCollection('GET')).status).toBe(401)
    expect((await callCollection('GET', undefined, 'not-a-real-token')).status).toBe(401)
    expect((await callCollection('GET', undefined, tokens.get('no-role'))).status).toBe(403)
    expect((await callCollection('GET', undefined, tokens.get('unsupported'))).status).toBe(403)
  })

  it('enforces reviewer read-only access with a real emulator token', async () => {
    expect((await callCollection('GET', undefined, tokens.get('reviewer'))).status).toBe(200)
    const document = createCourseDocument(idFactory)
    expect((await callCollection('POST', { document }, tokens.get('reviewer'))).status).toBe(403)
  })

  it.each(['editor', 'admin', 'super'])('allows %s to create Course drafts', async (roleName) => {
    const document = createCourseDocument(idFactory)
    const response = await callCollection('POST', { document }, tokens.get(roleName))
    expect(response.status).toBe(201)
    expect(response.body.data).toMatchObject({ id: document.id, revision: 1 })
  })

  it('documents that the Auth emulator does not enforce issued-token revocation', async () => {
    const email = 'revoked@emulator.test'; const password = 'Emulator-password-123!'
    const user = await getAuth().createUser({ email, password }); await getAuth().setCustomUserClaims(user.uid, { adminRole: 'CONTENT_EDITOR' }); const token = await signIn(email, password)
    await getAuth().revokeRefreshTokens(user.uid)
    // Firebase Auth Emulator 15.36.0 continues accepting the issued token.
    // Production verification still passes checkRevoked=true; production behavior remains unverified here.
    expect((await callCollection('GET', undefined, token)).status).toBe(200)
  })
})

describe('real Firestore emulator repository and transactions', () => {
  it('stores and previews a private V2 image through the Admin-only asset service', async () => {
    const bytes = new Uint8Array(24); bytes.set([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]); bytes[19]=2; bytes[23]=3
    const dependencies = getAssetServerDependencies()
    const uploaded = await handleAssetApi({ method:'POST',authorization:`Bearer ${tokens.get('admin')}`,body:{filename:'emulator.png',mimeType:'image/png',base64:Buffer.from(bytes).toString('base64')} },dependencies)
    expect(uploaded.status).toBe(201)
    const asset=(uploaded.body as {data:{id:string;objectPath:string}}).data
    expect(asset.objectPath).toMatch(/^editor-v2-assets\//)
    const listed=await handleAssetApi({method:'GET',authorization:`Bearer ${tokens.get('reviewer')}`},dependencies)
    expect((listed.body as {data:{items:Array<{id:string}>}}).data.items).toEqual(expect.arrayContaining([expect.objectContaining({id:asset.id})]))
    const preview=await handleAssetApi({method:'GET',id:asset.id,action:'preview',authorization:`Bearer ${tokens.get('reviewer')}`},dependencies)
    expect(preview.body).toBeInstanceOf(Uint8Array)
    expect((await handleAssetApi({method:'POST',authorization:`Bearer ${tokens.get('editor')}`,body:{}},dependencies)).status).toBe(403)
  })
  it.each([
    ['jpeg','image/jpeg',Uint8Array.from([0xff,0xd8,0xff,0xc0,0,17,8,0,2,0,3,1,1,0,2,0,3,0,0xff,0xd9]),3,2],
    ['webp','image/webp',(()=>{const b=new Uint8Array(30);b.set(Buffer.from('RIFF'),0);b.set(Buffer.from('WEBP'),8);b.set(Buffer.from('VP8X'),12);b[24]=2;b[27]=1;return b})(),3,2],
  ] as const)('uploads and retrieves %s bytes through Storage emulator',async(ext,mime,bytes,width,height)=>{const dependencies=getAssetServerDependencies(),uploaded=await handleAssetApi({method:'POST',authorization:`Bearer ${tokens.get('super')}`,body:{filename:`fixture.${ext==='jpeg'?'jpg':ext}`,mimeType:mime,base64:Buffer.from(bytes).toString('base64')}},dependencies);expect(uploaded.status).toBe(201);const asset=(uploaded.body as {data:{id:string;width:number;height:number;mimeType:string;objectPath:string}}).data;expect(asset).toMatchObject({width,height,mimeType:mime});expect(asset.objectPath).toMatch(/^editor-v2-assets\//);const preview=await handleAssetApi({method:'GET',id:asset.id,action:'preview',authorization:`Bearer ${tokens.get('reviewer')}`},dependencies);expect(Buffer.from(preview.body as Uint8Array)).toEqual(Buffer.from(bytes))})
  it('performs isolated Project CRUD with revisions and reviewer read-only access', async () => {
    const project = createProjectDocument('2026-11-17T00:00:00.000Z', idFactory)
    expect((await callCollection('POST', { document: project }, tokens.get('editor'))).status).toBe(201)
    const list = await callCollection('GET', undefined, tokens.get('reviewer'), 'application/json', undefined, 'project')
    expect(list.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: project.id, contentType: 'project' })]))
    const saved = await callDraft(project.id, 'PUT', { document: changeProject(project, (draft) => { draft.title = 'Updated Project' }), expectedRevision: 1 }, tokens.get('admin'))
    expect(saved.body.data).toMatchObject({ revision: 2, contentType: 'project' })
    expect((await callDraft(project.id, 'PUT', { document: project, expectedRevision: 2 }, tokens.get('reviewer'))).status).toBe(403)
    expect((await callDraft(project.id, 'DELETE', { expectedRevision: 2 }, tokens.get('super'))).status).toBe(200)
  })
  it('performs isolated Challenge CRUD with revisions', async () => { const challenge=createChallengeDocument('2026-11-17T00:00:00.000Z',idFactory); expect((await callCollection('POST',{document:challenge},tokens.get('editor'))).status).toBe(201); const list=await callCollection('GET',undefined,tokens.get('reviewer'),'application/json',undefined,'challenge'); expect(list.body.data).toEqual(expect.arrayContaining([expect.objectContaining({id:challenge.id,contentType:'challenge'})])); const saved=await callDraft(challenge.id,'PUT',{document:changeChallenge(challenge,d=>{d.title='Updated Challenge'}),expectedRevision:1},tokens.get('admin')); expect(saved.body.data).toMatchObject({revision:2}); expect((await callDraft(challenge.id,'DELETE',{expectedRevision:2},tokens.get('super'))).status).toBe(200) })
  it('creates, filters, updates, and deletes Practice drafts without changing Course records', async () => {
    const practice = createPracticeDocument('2026-11-16T10:00:00.000Z', idFactory)
    const created = await callCollection('POST', { document: practice }, tokens.get('editor'))
    expect(created.status).toBe(201); expect(created.body.data).toMatchObject({ contentType: 'practice', revision: 1 })
    const list = await callCollection('GET', undefined, tokens.get('reviewer'), 'application/json', undefined, 'practice')
    expect(list.status).toBe(200); expect(list.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: practice.id, contentType: 'practice' })]))
    const saved = await callDraft(practice.id, 'PUT', { document: updatePractice(practice, (draft) => { draft.title = 'Emulator Practice' }), expectedRevision: 1 }, tokens.get('editor'))
    expect(saved.body.data).toMatchObject({ revision: 2, contentType: 'practice' })
    expect((await callDraft(practice.id, 'DELETE', { expectedRevision: 2 }, tokens.get('admin'))).status).toBe(200)
  })
  it('creates, reads, lists, updates, and deletes with server actor metadata', async () => {
    const document = createCourseDocument(idFactory)
    const created = await callCollection('POST', { document }, tokens.get('editor'))
    expect(created.status).toBe(201)
    const createdRecord = created.body.data as { createdBy: string; revision: number }
    expect(createdRecord.createdBy).toBe((await getAuth().verifyIdToken(tokens.get('editor')!)).uid)
    expect((await callDraft(document.id, 'GET', undefined, tokens.get('reviewer'))).status).toBe(200)
    const list = await callCollection('GET', undefined, tokens.get('reviewer')); expect((list.body.data as unknown[]).some((item) => (item as { id: string }).id === document.id)).toBe(true)
    const updated = updateCourse(document, { title: 'Emulator transaction update' })
    const saved = await callDraft(document.id, 'PUT', { document: updated, expectedRevision: 1 }, tokens.get('admin'))
    expect(saved.body.data).toMatchObject({ revision: 2, updatedBy: (await getAuth().verifyIdToken(tokens.get('admin')!)).uid })
    expect((await callDraft(document.id, 'DELETE', { expectedRevision: 2 }, tokens.get('super'))).status).toBe(200)
    expect((await callDraft(document.id, 'GET', undefined, tokens.get('reviewer'))).status).toBe(404)
  })

  it('rejects duplicate creates, invalid schemas, unsupported versions, and missing drafts', async () => {
    const document = createCourseDocument(idFactory)
    expect((await callCollection('POST', { document }, tokens.get('editor'))).status).toBe(201)
    expect((await callCollection('POST', { document }, tokens.get('editor'))).status).toBe(409)
    expect((await callCollection('POST', { document: { ...document, arbitrary: true } }, tokens.get('editor'))).status).toBe(422)
    expect((await callCollection('POST', { document: { ...document, id: idFactory(), schemaVersion: '3.0.0' } }, tokens.get('editor'))).status).toBe(422)
    expect((await callDraft('e0000000-0000-4000-8000-999999999999', 'GET', undefined, tokens.get('editor'))).status).toBe(404)
  })

  it('increments revisions atomically and rejects stale update/delete', async () => {
    const document = createCourseDocument(idFactory); await callCollection('POST', { document }, tokens.get('editor'))
    const first = await callDraft(document.id, 'PUT', { document: updateCourse(document, { title: 'Revision two' }), expectedRevision: 1 }, tokens.get('editor'))
    expect(first.body.data).toMatchObject({ revision: 2 })
    const stale = await callDraft(document.id, 'PUT', { document, expectedRevision: 1 }, tokens.get('editor'))
    expect(stale.status).toBe(409); expect(stale.body.error?.details).toEqual({ expectedRevision: 1, currentRevision: 2 })
    expect((await callDraft(document.id, 'DELETE', { expectedRevision: 1 }, tokens.get('admin'))).status).toBe(409)
  })

  it('permits only one of two concurrent writes at the same revision', async () => {
    const document = createCourseDocument(idFactory); await callCollection('POST', { document }, tokens.get('editor'))
    const [left, right] = await Promise.all([
      callDraft(document.id, 'PUT', { document: updateCourse(document, { title: 'Concurrent left' }), expectedRevision: 1 }, tokens.get('editor')),
      callDraft(document.id, 'PUT', { document: updateCourse(document, { title: 'Concurrent right' }), expectedRevision: 1 }, tokens.get('admin')),
    ])
    expect([left.status, right.status].sort()).toEqual([200, 409])
    expect((await callDraft(document.id, 'GET', undefined, tokens.get('reviewer'))).body.data).toMatchObject({ revision: 2 })
  })
})

describe('collection isolation and emulator-only browser rules', () => {
  it('cannot select paths or spoof server metadata, and leaves sentinels unchanged', async () => {
    const firestore = getFirestore()
    await firestore.doc('learnerProgress/sentinel').set({ value: 'unchanged' })
    await firestore.doc('adminContentDrafts/sentinel').set({ value: 'unchanged' })
    const document = createCourseDocument(idFactory)
    const malicious = await callCollection('POST', { document, collection: 'learnerProgress', revision: 999, createdBy: 'spoofed' }, tokens.get('editor'))
    expect(malicious.status).toBe(422)
    expect((await callDraft('../learnerProgress/sentinel', 'GET', undefined, tokens.get('super'))).status).toBe(422)
    expect((await firestore.doc('learnerProgress/sentinel').get()).data()).toEqual({ value: 'unchanged' })
    expect((await firestore.doc('adminContentDrafts/sentinel').get()).data()).toEqual({ value: 'unchanged' })
    expect((await firestore.collection(V2_DRAFT_COLLECTION).get()).docs.every((item) => item.ref.parent.id === V2_DRAFT_COLLECTION)).toBe(true)
  })

  it('denies direct browser Firestore writes under emulator-only deny-all rules', async () => {
    const app = initializeClientApp({ projectId: EMULATOR_PROJECT_ID, apiKey: 'fake-api-key', appId: 'fake-app-id' }, `rules-test-${crypto.randomUUID()}`)
    const firestore = getClientFirestore(app)
    const [host, port] = process.env.FIRESTORE_EMULATOR_HOST!.split(':')
    connectFirestoreEmulator(firestore, host, Number(port))
    await expect(setDoc(clientDoc(firestore, V2_DRAFT_COLLECTION, crypto.randomUUID()), { unsafe: true })).rejects.toThrow()
    await deleteClientApp(app)
  })
})

describe('real Vercel adapters', () => {
  it('parses requests, serializes responses, maps methods, and sanitizes failures', async () => {
    const document = createCourseDocument(idFactory)
    const created = await callCollection('POST', { document }, tokens.get('editor'))
    expect(created.status).toBe(201); expect(created.body.ok).toBe(true)
    expect((await callCollection('PATCH', {}, tokens.get('editor'))).status).toBe(405)
    expect((await callCollection('POST', {}, tokens.get('editor'), 'text/plain')).status).toBe(415)
    expect((await callCollection('POST', {}, tokens.get('editor'), 'application/json', String(5 * 1024 * 1024 + 1))).status).toBe(413)
    const invalid = await callDraft('%', 'GET', undefined, tokens.get('editor'))
    expect(invalid.status).toBe(422); expect(JSON.stringify(invalid.body)).not.toMatch(/stack|credential|service.account/i)
  })
})

async function signIn(email: string, password: string): Promise<string> {
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST
  const response = await fetch(`http://${host}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) })
  if (!response.ok) throw new Error('Unable to obtain an emulator ID token')
  return String((await response.json() as { idToken: string }).idToken)
}

async function clearFirestore() {
  const response = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${EMULATOR_PROJECT_ID}/databases/(default)/documents`, { method: 'DELETE' })
  if (!response.ok) throw new Error('Unable to clear the Firestore emulator')
}

async function clearAuthUsers() {
  const auth = getAuth()
  let pageToken: string | undefined
  do { const page = await auth.listUsers(1000, pageToken); await Promise.all(page.users.map((user) => auth.deleteUser(user.uid))); pageToken = page.pageToken } while (pageToken)
}

async function callCollection(method: string, body?: unknown, token?: string, contentType = 'application/json', contentLength?: string, draftType?: string): Promise<ApiResponse> {
  return invoke(v2AdminHandler, { method, url: '/api/v2/drafts', body, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(method === 'GET' ? {} : { 'content-type': contentType }), ...(contentLength ? { 'content-length': contentLength } : {}) }, query: draftType ? { contentType: draftType } : {} })
}

async function callDraft(id: string, method: string, body?: unknown, token?: string): Promise<ApiResponse> {
  return invoke(v2AdminHandler, { method, url: `/api/v2/drafts/${encodeURIComponent(id)}`, body, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(method === 'GET' ? {} : { 'content-type': 'application/json' }) }, query: {} })
}

async function invoke(handler: (request: VercelRequest, response: VercelResponse) => Promise<void>, request: Partial<VercelRequest>): Promise<ApiResponse> {
  const result: ApiResponse = { status: 200, body: { ok: false } }
  const response = { status(code: number) { result.status = code; return this }, json(body: ApiBody) { result.body = body; return this } } as unknown as VercelResponse
  await handler(request as VercelRequest, response)
  return result
}
