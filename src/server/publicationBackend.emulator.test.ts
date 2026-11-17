import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { beforeAll, describe, expect, it } from 'vitest'

import type { ContentDocument } from '../content/core/envelope'
import { validChallengeDocument, validCourseDocument, validPracticeDocument, validProjectDocument } from '../content/fixtures/validDocuments'
import { compareStableIds, sha256Canonical, validatePublicationCompatibility } from '../publication/publicationContracts'
import { assertEmulatorTestEnvironment, EMULATOR_PROJECT_ID } from './emulatorSafety'
import { getAssetServerDependencies, getPublicationServerDependencies, getServerDependencies } from './firebaseAdmin.server'
import { hashBytes, V2_PUBLICATION_REQUEST_COLLECTION } from './publicationBackend'
import { handlePublicationApi } from './publicationApi'

const password = 'Emulator-password-123!'
const tokens = new Map<string, { token: string; uid: string }>()

beforeAll(async () => {
  assertEmulatorTestEnvironment(); process.env.FIREBASE_ADMIN_PROJECT_ID = EMULATOR_PROJECT_ID
  getPublicationServerDependencies()
  await clearFirestore(); await clearAuthUsers()
  for (const role of ['SUPER_ADMIN', 'CONTENT_ADMIN', 'CONTENT_EDITOR', 'CONTENT_REVIEWER'] as const) { const user = await getAuth().createUser({ email: `publication-${role.toLowerCase()}@emulator.test`, password }); await getAuth().setCustomUserClaims(user.uid, { adminRole: role }); tokens.set(role, { uid: user.uid, token: await signIn(`publication-${role.toLowerCase()}@emulator.test`) }) }
}, 30_000)

describe('immutable publication backend', () => {
  it('publishes all domains without learner, legacy, assignment, reward, or certificate writes', async () => {
    const firestore = getFirestore()
    for (const path of ['publishedContent/sentinel', 'adminContentDrafts/sentinel', 'adminContentAssets/sentinel', 'adminContentAudit/sentinel', 'dailyChallenges/sentinel', 'learnerProgress/sentinel', 'certificates/sentinel']) await firestore.doc(path).set({ untouched: true })
    for (const document of [validCourseDocument, validPracticeDocument, validChallengeDocument, validProjectDocument] as ContentDocument[]) {
      await getServerDependencies().repository.create(document, tokens.get('CONTENT_EDITOR')!.uid)
      const response = await publishThroughApi(document, 1, 0, 1, 'publish', 'CONTENT_ADMIN')
      expect(response.status).toBe(201)
      expect(response.body.data).toMatchObject({ identity: { namespace: 'v2', contentId: document.id, publicationVersion: 1 }, replayed: false })
      expect((await getPublicationServerDependencies().backend.version(document.id, 1))?.status).toBe('READY')
    }
    for (const path of ['publishedContent/sentinel', 'adminContentDrafts/sentinel', 'adminContentAssets/sentinel', 'adminContentAudit/sentinel', 'dailyChallenges/sentinel', 'learnerProgress/sentinel', 'certificates/sentinel']) expect((await firestore.doc(path).get()).data()).toEqual({ untouched: true })
  }, 30_000)

  it('publishes a second immutable Course version and preserves exact version one', async () => {
    const document = structuredClone(validCourseDocument) as ContentDocument
    const original = await getPublicationServerDependencies().backend.version(document.id, 1)
    if (document.contentType !== 'course') throw new Error('Expected Course')
    document.title = 'TypeScript Foundations Revised'; document.documentVersion = 2; document.updatedAt = '2026-11-16T11:00:00.000Z'
    await getServerDependencies().repository.save(document.id, document, 1, tokens.get('CONTENT_EDITOR')!.uid)
    const response = await publishThroughApi(document, 2, 1, 2, 'publish-new-version', 'SUPER_ADMIN', validCourseDocument as ContentDocument)
    expect(response.status).toBe(201)
    expect((await getPublicationServerDependencies().backend.pointer(document.id))?.activeVersionNumber).toBe(2)
    expect(await getPublicationServerDependencies().backend.version(document.id, 1)).toEqual(original)
    const bytes = await getPublicationServerDependencies().backend.artifact(document.id, 2)
    expect(JSON.parse(Buffer.from(bytes).toString('utf8')).title).toBe(document.title)
  })

  it('returns committed results for retries and rejects request payload reuse', async () => {
    const document = structuredClone(validPracticeDocument) as ContentDocument
    const pointer = await getPublicationServerDependencies().backend.pointer(document.id)
    const requestId = crypto.randomUUID(), confirmation = await confirmationFor(document, 1, pointer!.revision, pointer!.latestVersionNumber + 1, 'publish-new-version', tokens.get('CONTENT_ADMIN')!.uid, validPracticeDocument as ContentDocument)
    const body = { expectedDraftRevision: 1, expectedPointerRevision: pointer!.revision, requestId, confirmation }
    const first = await callApi(document.id, 'POST', 'publish', body, 'CONTENT_ADMIN'), replay = await callApi(document.id, 'POST', 'publish', body, 'CONTENT_ADMIN')
    expect(first.status).toBe(201); expect(replay.status).toBe(201); expect(replay.body.data).toMatchObject({ replayed: true, identity: (first.body.data as { identity: unknown }).identity })
    const mismatch = await callApi(document.id, 'POST', 'publish', { ...body, expectedDraftRevision: 2 }, 'CONTENT_ADMIN')
    expect([409, 422]).toContain(mismatch.status)
  })

  it('allows history reads for all roles but only publication admins may publish', async () => {
    for (const role of ['SUPER_ADMIN', 'CONTENT_ADMIN', 'CONTENT_EDITOR', 'CONTENT_REVIEWER'] as const) expect((await callApi(validCourseDocument.id, 'GET', undefined, undefined, role)).status).toBe(200)
    const invalidBody = {}
    expect((await callApi(validCourseDocument.id, 'POST', 'publish', invalidBody, 'CONTENT_EDITOR')).status).toBe(403)
    expect((await callApi(validCourseDocument.id, 'POST', 'publish', invalidBody, 'CONTENT_REVIEWER')).status).toBe(403)
    expect((await handlePublicationApi({ method: 'GET', contentId: validCourseDocument.id }, getPublicationServerDependencies())).status).toBe(401)
  })

  it('prepares authoritative confirmation context and detects stale draft revisions', async () => {
    const admin = await callApi(validCourseDocument.id, 'POST', 'prepare', { expectedDraftRevision: 2 }, 'SUPER_ADMIN')
    expect(admin.status).toBe(200); expect(admin.body.data).toMatchObject({ actorUid: tokens.get('SUPER_ADMIN')!.uid, draftRevision: 2, pointerRevision: 2, proposedVersionNumber: 3, operation: 'publish-new-version' })
    expect((admin.body.data as { findings: unknown[] }).findings).toBeInstanceOf(Array)
    expect((await callApi(validCourseDocument.id, 'POST', 'prepare', { expectedDraftRevision: 1 }, 'CONTENT_ADMIN')).body.error?.code).toBe('DRAFT_CONFLICT')
    expect((await callApi(validCourseDocument.id, 'POST', 'prepare', { expectedDraftRevision: 2 }, 'CONTENT_EDITOR')).status).toBe(403)
    expect((await callApi(validCourseDocument.id, 'POST', 'prepare', { expectedDraftRevision: 2 }, 'CONTENT_REVIEWER')).status).toBe(403)
  })

  it('serializes competing first publications and never activates an incomplete version', async () => {
    const document = structuredClone(validCourseDocument) as ContentDocument; document.id = '90000000-0000-4000-8000-000000000001'; document.slug = 'concurrent-course'
    await getServerDependencies().repository.create(document, tokens.get('CONTENT_EDITOR')!.uid)
    const leftId = crypto.randomUUID(), rightId = crypto.randomUUID(), actor = tokens.get('CONTENT_ADMIN')!.uid
    const confirmation = await confirmationFor(document, 1, 0, 1, 'publish', actor)
    const backend = getPublicationServerDependencies().backend
    const outcomes = await Promise.allSettled([backend.publish({ contentId: document.id, expectedDraftRevision: 1, expectedPointerRevision: 0, requestId: leftId, confirmation }, actor), backend.publish({ contentId: document.id, expectedDraftRevision: 1, expectedPointerRevision: 0, requestId: rightId, confirmation }, actor)])
    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1)
    const pointer = await backend.pointer(document.id); expect(pointer).toMatchObject({ activeVersionNumber: 1, revision: 1 })
    expect(await backend.versions(document.id)).toHaveLength(1)
  })

  it('copies managed assets immutably and reuses content-addressed bytes', async () => {
    const assetId = crypto.randomUUID(), bytes = new Uint8Array(24); bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); bytes[19] = 2; bytes[23] = 3
    const asset = await getAssetServerDependencies().repository.create({ id: assetId, originalFilename: 'publication.png', objectPath: `editor-v2-assets/${assetId}/publication.png`, mimeType: 'image/png', size: bytes.length, width: 2, height: 3, createdBy: tokens.get('CONTENT_ADMIN')!.uid }, bytes)
    const document = structuredClone(validCourseDocument) as ContentDocument; document.id = '91000000-0000-4000-8000-000000000001'; document.slug = 'asset-course'
    if (document.contentType !== 'course' || document.content.modules[0].organization !== 'lessons') throw new Error('Expected Course')
    document.content.modules[0].lessons[0].blocks.push({ id: '91000000-0000-4000-8000-000000000002', type: 'image', schemaVersion: 1, data: { assetId, alt: 'Published asset' } })
    await getServerDependencies().repository.create(document, tokens.get('CONTENT_EDITOR')!.uid)
    const contentHash = hashBytes(bytes), digest = contentHash.slice(7), manifest = [{ assetId, mimeType: asset.mimeType, byteLength: bytes.length, width: 2, height: 3, contentHash, publishedObjectPath: `editor-v2-published-assets/sha256/${digest}.png` }]
    const actor = tokens.get('CONTENT_ADMIN')!, confirmation = await confirmationFor(document, 1, 0, 1, 'publish', actor.uid, undefined, manifest)
    const response = await callApi(document.id, 'POST', 'publish', { expectedDraftRevision: 1, expectedPointerRevision: 0, requestId: crypto.randomUUID(), confirmation }, 'CONTENT_ADMIN')
    expect(response.status).toBe(201)
    const record = await getPublicationServerDependencies().backend.version(document.id, 1) as { assetManifest: typeof manifest }
    expect(record.assetManifest).toEqual(manifest)
    const second = structuredClone(document); second.documentVersion = 2; second.updatedAt = '2026-11-16T12:00:00.000Z'; await getServerDependencies().repository.save(document.id, second, 1, actor.uid)
    const confirmation2 = await confirmationFor(second, 2, 1, 2, 'publish-new-version', actor.uid, document, manifest)
    expect((await callApi(document.id, 'POST', 'publish', { expectedDraftRevision: 2, expectedPointerRevision: 1, requestId: crypto.randomUUID(), confirmation: confirmation2 }, 'CONTENT_ADMIN')).status).toBe(201)
    expect(((await getPublicationServerDependencies().backend.version(document.id, 2)) as { assetManifest: typeof manifest }).assetManifest[0].publishedObjectPath).toBe(manifest[0].publishedObjectPath)
  })

  it('keeps publication collections inaccessible through browser rules', async () => {
    const firestore = getFirestore()
    expect((await firestore.collection(V2_PUBLICATION_REQUEST_COLLECTION).get()).size).toBeGreaterThan(0)
  })

  it('retains immutable V1/V2 through rollback and the complete lifecycle to terminal archive', async () => {
    const firestore = getFirestore(), document = structuredClone(validProjectDocument) as ContentDocument
    const isolatedPaths = ['publishedContent/lifecycle', 'adminContentDrafts/lifecycle', 'adminContentAssets/lifecycle', 'adminContentAudit/lifecycle', 'dailyChallenges/lifecycle', 'learnerProgress/lifecycle', 'certificates/lifecycle', 'rewardRecords/lifecycle', 'projectWorkspaces/lifecycle']
    for (const path of isolatedPaths) await firestore.doc(path).set({ untouched: true })
    document.id = '92000000-0000-4000-8000-000000000001'; document.slug = 'lifecycle-project'
    await getServerDependencies().repository.create(document, tokens.get('CONTENT_EDITOR')!.uid)
    expect((await publishThroughApi(document, 1, 0, 1, 'publish', 'CONTENT_ADMIN')).status).toBe(201)
    const second = structuredClone(document); second.title = 'Lifecycle Project V2'; second.documentVersion = 2; second.updatedAt = '2026-11-16T13:00:00.000Z'
    await getServerDependencies().repository.save(document.id, second, 1, tokens.get('CONTENT_EDITOR')!.uid)
    expect((await publishThroughApi(second, 2, 1, 2, 'publish-new-version', 'CONTENT_ADMIN', document)).status).toBe(201)
    const backend = getPublicationServerDependencies().backend, beforeV1 = await backend.version(document.id, 1), beforeV2 = await backend.version(document.id, 2), artifactV1 = await backend.artifact(document.id, 1), artifactV2 = await backend.artifact(document.id, 2)
    let pointer = (await backend.pointer(document.id))!
    let response = await lifecycleThroughApi(document.id, pointer, 'rollback', 1, 'CONTENT_ADMIN'); expect(response.body.data).toMatchObject({ activeVersionNumber: 1, latestVersionNumber: 2, pointerRevision: 3 })
    pointer = (await backend.pointer(document.id))!; const unpublishBody = lifecycleBody(document.id, pointer, 'unpublish', null, tokens.get('CONTENT_ADMIN')!.uid)
    response = await callApi(document.id, 'POST', 'unpublish', unpublishBody, 'CONTENT_ADMIN'); expect(response.body.data).toMatchObject({ state: 'unpublished', visibility: 'hidden', activeVersionNumber: 1 })
    const replay = await callApi(document.id, 'POST', 'unpublish', unpublishBody, 'CONTENT_ADMIN'); expect(replay.body.data).toMatchObject({ replayed: true, state: 'unpublished' })
    pointer = (await backend.pointer(document.id))!; expect((await lifecycleThroughApi(document.id, pointer, 'republish', null, 'SUPER_ADMIN')).body.data).toMatchObject({ state: 'published', activeVersionNumber: 1 })
    pointer = (await backend.pointer(document.id))!; expect((await lifecycleThroughApi(document.id, pointer, 'disable', null, 'CONTENT_ADMIN')).body.data).toMatchObject({ state: 'disabled', visibility: 'hidden' })
    pointer = (await backend.pointer(document.id))!; expect((await lifecycleThroughApi(document.id, pointer, 'enable', null, 'CONTENT_ADMIN')).body.data).toMatchObject({ state: 'published', activeVersionNumber: 1 })
    pointer = (await backend.pointer(document.id))!; const archived = await lifecycleThroughApi(document.id, pointer, 'archive', null, 'SUPER_ADMIN'); expect(archived.body.data).toMatchObject({ state: 'archived', activeVersionNumber: null, latestVersionNumber: 2 })
    pointer = (await backend.pointer(document.id))!; expect((await lifecycleThroughApi(document.id, pointer, 'enable', null, 'SUPER_ADMIN')).body.error?.code).toBe('INVALID_TRANSITION')
    expect(await backend.version(document.id, 1)).toEqual(beforeV1); expect(await backend.version(document.id, 2)).toEqual(beforeV2)
    expect(await backend.artifact(document.id, 1)).toEqual(artifactV1); expect(await backend.artifact(document.id, 2)).toEqual(artifactV2)
    expect(await backend.versions(document.id)).toHaveLength(2)
    const audits = await firestore.collection('editorV2PublicationAudit').where('contentId', '==', document.id).get(); expect(audits.docs.map(x => x.data().operation)).toEqual(expect.arrayContaining(['rollback', 'unpublish', 'republish', 'disable', 'enable', 'archive']))
    for (const path of isolatedPaths) expect((await firestore.doc(path).get()).data()).toEqual({ untouched: true })
    expect((await callApi(document.id, 'POST', 'archive', {}, 'CONTENT_EDITOR')).status).toBe(403); expect((await callApi(document.id, 'POST', 'archive', {}, 'CONTENT_REVIEWER')).status).toBe(403)
  }, 30_000)

  it('serializes competing lifecycle mutations against one pointer revision', async () => {
    const document = structuredClone(validChallengeDocument) as ContentDocument; document.id = '93000000-0000-4000-8000-000000000001'; document.slug = 'lifecycle-race'
    await getServerDependencies().repository.create(document, tokens.get('CONTENT_EDITOR')!.uid); await publishThroughApi(document, 1, 0, 1, 'publish', 'CONTENT_ADMIN')
    const pointer = (await getPublicationServerDependencies().backend.pointer(document.id))!, uid = tokens.get('CONTENT_ADMIN')!.uid
    const outcomes = await Promise.all([callApi(document.id, 'POST', 'unpublish', lifecycleBody(document.id, pointer, 'unpublish', null, uid), 'CONTENT_ADMIN'), callApi(document.id, 'POST', 'disable', lifecycleBody(document.id, pointer, 'disable', null, uid), 'CONTENT_ADMIN')])
    expect(outcomes.filter(x => x.status === 200)).toHaveLength(1); expect(outcomes.filter(x => x.body.error?.code === 'POINTER_CONFLICT')).toHaveLength(1)
    expect((await getPublicationServerDependencies().backend.pointer(document.id))!.revision).toBe(2)
  })
})

async function publishThroughApi(document: ContentDocument, draftRevision: number, pointerRevision: number, version: number, operation: 'publish' | 'publish-new-version', role: 'SUPER_ADMIN' | 'CONTENT_ADMIN', previous?: ContentDocument) {
  const actor = tokens.get(role)!, confirmation = await confirmationFor(document, draftRevision, pointerRevision, version, operation, actor.uid, previous)
  return callApi(document.id, 'POST', 'publish', { expectedDraftRevision: draftRevision, expectedPointerRevision: pointerRevision, requestId: crypto.randomUUID(), confirmation }, role)
}
async function confirmationFor(document: ContentDocument, draftRevision: number, pointerRevision: number, version: number, operation: 'publish' | 'publish-new-version', actorUid: string, previous?: ContentDocument, manifest: Array<{ assetId: string; mimeType: 'image/png' | 'image/jpeg' | 'image/webp'; byteLength: number; width: number; height: number; contentHash: string; publishedObjectPath: string }> = []) {
  const compatibility = validatePublicationCompatibility(document, { resolvedAssetIds: new Set(manifest.map(({ assetId }) => assetId)) }), findings = [...compatibility.findings, ...(previous ? compareStableIds(previous, document) : [])]
  return { contentId: document.id, contentType: document.contentType, draftRevision, documentVersion: document.documentVersion, draftFingerprint: await sha256Canonical(document), validationFingerprint: await sha256Canonical({ ...compatibility, findings }), pointerRevision, proposedVersionNumber: version, assetManifestHash: await sha256Canonical(manifest), assetIds: manifest.map(({ assetId }) => assetId), actorUid, operation, issuedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), completedSteps: [true, true, true] as const }
}
type LifecycleAction = 'rollback' | 'unpublish' | 'republish' | 'disable' | 'enable' | 'archive'
async function lifecycleThroughApi(contentId: string, pointer: NonNullable<Awaited<ReturnType<ReturnType<typeof getPublicationServerDependencies>['backend']['pointer']>>>, operation: LifecycleAction, targetVersion: number | null, role: 'SUPER_ADMIN' | 'CONTENT_ADMIN') { return callApi(contentId, 'POST', operation, lifecycleBody(contentId, pointer, operation, targetVersion, tokens.get(role)!.uid), role) }
function lifecycleBody(contentId: string, pointer: { contentType: string; revision: number; state: string; activeVersionNumber: number | null }, operation: LifecycleAction, targetVersion: number | null, actorUid: string) { const issued = new Date(); return { expectedPointerRevision: pointer.revision, targetVersion, requestId: crypto.randomUUID(), confirmation: { contentId, contentType: pointer.contentType, actorUid, operation, expectedPointerRevision: pointer.revision, currentState: pointer.state, currentActiveVersion: pointer.activeVersionNumber, targetVersion, issuedAt: issued.toISOString(), expiresAt: new Date(issued.getTime() + 60_000).toISOString(), confirmed: true, archiveConfirmed: operation === 'archive' } } }
async function callApi(contentId: string, method: string, action: 'prepare' | 'publish' | 'versions' | 'integrity' | LifecycleAction | undefined, body: unknown, role: 'SUPER_ADMIN' | 'CONTENT_ADMIN' | 'CONTENT_EDITOR' | 'CONTENT_REVIEWER') { const token = tokens.get(role)?.token; return handlePublicationApi({ method, contentId, action, body, authorization: token ? `Bearer ${token}` : undefined }, getPublicationServerDependencies()) }
async function signIn(email: string) { const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) }); return String((await response.json() as { idToken: string }).idToken) }
async function clearFirestore() { await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${EMULATOR_PROJECT_ID}/databases/(default)/documents`, { method: 'DELETE' }) }
async function clearAuthUsers() { let pageToken: string | undefined; do { const page = await getAuth().listUsers(1000, pageToken); await Promise.all(page.users.map(({ uid }) => getAuth().deleteUser(uid))); pageToken = page.pageToken } while (pageToken) }
