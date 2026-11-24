import { createHash, randomUUID } from 'node:crypto'
import type { Firestore } from 'firebase-admin/firestore'
import type { getStorage } from 'firebase-admin/storage'
import { z } from 'zod'

import { ASSET_COLLECTION, assetMetadataSchema, type AssetMetadata } from '../assets/asset.schema.js'
import { contentEnvelopeSchema, type ContentDocument, type ContentType } from '../content/core/envelope.js'
import { uuidSchema } from '../content/core/identifiers.js'
import {
  PUBLICATION_CONTRACT_VERSION, V2_PUBLICATION_AUDIT_COLLECTION, V2_PUBLICATION_COLLECTION,
  assetManifestEntrySchema, canonicalJson, canTransition, collectAssetIds, compareStableIds, lifecycleConfirmationSchema, nextState,
  publicationPointerSchema, publishConfirmationSchema, sha256Canonical, validatePublicationCompatibility,
  type PublicationIdentity,
} from '../publication/publicationContracts.js'
import { V2_DRAFT_COLLECTION } from './firestoreDraftRepository.js'

type Bucket = ReturnType<ReturnType<typeof getStorage>['bucket']>
export const V2_PUBLICATION_REQUEST_COLLECTION = 'editorV2PublicationRequests'
export class PublicationError extends Error { constructor(readonly code: string, message: string, readonly status = 409, readonly details?: unknown) { super(message); this.name = 'PublicationError' } }
export type PublishInput = { contentId: string; expectedDraftRevision: number; expectedPointerRevision: number; requestId: string; confirmation: unknown }
export type PublishResult = { identity: PublicationIdentity; pointerRevision: number; artifactPath: string; artifactHash: string; replayed: boolean }
export type LifecycleResult = { contentId: string; operation: string; priorState: string; state: string; visibility: string; activeVersionNumber: number | null; latestVersionNumber: number; pointerRevision: number; targetVersion: number | null; occurredAt: string; replayed: boolean }
export type PublicationPreparation = {
  title: string; contentId: string; contentType: ContentDocument['contentType']; actorUid: string
  draftRevision: number; documentVersion: number; draftFingerprint: string; validationFingerprint: string
  pointerRevision: number; currentState: string; currentVisibility: string; currentActiveVersion: number | null
  proposedVersionNumber: number; operation: 'publish' | 'publish-new-version'; resultingVisibility: 'private'
  schemaValid: boolean; storageReady: boolean; learnerRuntimeCompatible: boolean; learnerIntegrationReady: boolean
  findings: ReturnType<typeof validatePublicationCompatibility>['findings']; assetIds: string[]; assetManifestHash: string
  issuedAt: string; expiresAt: string; canPublish: boolean
}

type Pointer = z.infer<typeof publicationPointerSchema> & { createdAt: string; createdBy: string }
type Manifest = z.infer<typeof assetManifestEntrySchema>[]
type RequestRecord = { requestId: string; actorUid: string; contentId: string; operation: 'publish' | 'publish-new-version'; payloadHash: string; correlationId: string; state: 'IN_PROGRESS' | 'COMMITTED' | 'FAILED'; reservedVersion: number; expectedPointerRevision: number; createdAt: string; updatedAt: string; expiresAt: string; result: PublishResult | null; failureCode?: string }
type LifecycleRequestRecord = { requestId: string; actorUid: string; contentId: string; operation: string; payloadHash: string; correlationId: string; state: 'COMMITTED'; expectedPointerRevision: number; createdAt: string; updatedAt: string; expiresAt: string; result: LifecycleResult }

export class PublicationBackend {
  constructor(private readonly firestore: Firestore, private readonly bucket: Bucket, private readonly now = () => new Date()) {}

  async pointer(contentId: string): Promise<Pointer | null> { const snap = await this.pointerRef(contentId).get(); return snap.exists ? snap.data() as Pointer : null }
  async contentType(contentId: string): Promise<ContentType | null> {
    const pointer = await this.pointer(contentId)
    if (pointer) return pointer.contentType
    const draft = await this.firestore.collection(V2_DRAFT_COLLECTION).doc(contentId).get()
    if (!draft.exists) return null
    const data = draft.data() as { contentType?: unknown; document?: unknown }
    const parsed = contentEnvelopeSchema.safeParse(data.document)
    return parsed.success ? parsed.data.contentType : null
  }
  async versions(contentId: string): Promise<unknown[]> { const pointer = await this.pointer(contentId), snap = await this.pointerRef(contentId).collection('versions').orderBy('identity.publicationVersion', 'desc').get(); return snap.docs.map((doc) => this.summarizeVersion(doc.data() as Record<string, unknown>, pointer?.activeVersionNumber ?? null)) }
  async version(contentId: string, version: number): Promise<Record<string, unknown> | null> { const snap = await this.pointerRef(contentId).collection('versions').doc(String(version)).get(); return snap.exists ? snap.data() as Record<string, unknown> : null }
  async artifact(contentId: string, version: number): Promise<Uint8Array> { const record = await this.version(contentId, version); if (!record) throw new PublicationError('VERSION_NOT_FOUND', 'Publication version not found', 404); const [bytes] = await this.bucket.file(String(record.artifactPath)).download(); const digest = hashBytes(bytes); if (digest !== record.artifactHash) throw new PublicationError('ARTIFACT_CORRUPT', 'Publication artifact failed integrity verification', 503); return new Uint8Array(bytes) }
  async versionDetail(contentId: string, version: number) { const record = await this.version(contentId, version); if (!record) return null; const pointer = await this.pointer(contentId); return { ...this.summarizeVersion(record, pointer?.activeVersionNumber ?? null), identity: record.identity, schemaVersion: record.schemaVersion, artifactHash: record.artifactHash, compatibilitySnapshot: record.compatibilitySnapshot } }
  async verifyIntegrity(contentId: string, version: number) { const record = await this.version(contentId, version); if (!record) throw new PublicationError('VERSION_NOT_FOUND', 'Publication version not found', 404); if ((record.identity as PublicationIdentity).contentId !== contentId || record.status !== 'READY') throw new PublicationError('VERSION_NOT_READY', 'Publication version is not eligible for activation', 409); const manifest = z.array(assetManifestEntrySchema).safeParse(record.assetManifest); if (!manifest.success) throw new PublicationError('MANIFEST_CORRUPT', 'Asset manifest structure is invalid', 503); await this.artifact(contentId, version); return { ok: true, version, artifactStatus: 'VERIFIED', assetCount: manifest.data.length, checkedAt: this.now().toISOString() } }

  async lifecycle(input: z.infer<typeof lifecycleInputSchema> & { contentId: string }, actorUid: string): Promise<LifecycleResult> {
    const confirmation = lifecycleConfirmationSchema.parse(input.confirmation)
    const payloadHash = await sha256Canonical(input), requestRef = this.firestore.collection(V2_PUBLICATION_REQUEST_COLLECTION).doc(input.requestId)
    const existing = await requestRef.get()
    if (existing.exists) { const request = existing.data() as LifecycleRequestRecord; if (request.actorUid !== actorUid || request.contentId !== input.contentId || request.payloadHash !== payloadHash) throw new PublicationError('IDEMPOTENCY_MISMATCH', 'Request ID was used with a different lifecycle payload', 409); if (request.state === 'COMMITTED') return { ...request.result, replayed: true } }
    const before = await this.pointer(input.contentId); if (!before) throw new PublicationError('PUBLICATION_NOT_FOUND', 'Publication pointer not found', 404)
    if (!canTransition(before.state, input.operation) || (input.operation === 'release' && before.visibility !== 'private')) throw new PublicationError('INVALID_TRANSITION', `${input.operation} is not allowed from ${before.state}/${before.visibility}`, 409)
    if (input.operation === 'rollback') await this.verifyIntegrity(input.contentId, input.targetVersion!)
    else if (['release', 'republish', 'enable'].includes(input.operation)) { if (!before.activeVersionNumber) throw new PublicationError('VERSION_NOT_READY', 'No active version is available', 409); await this.verifyIntegrity(input.contentId, before.activeVersionNumber) }
    const now = this.now()
    if (confirmation.actorUid !== actorUid || confirmation.contentId !== input.contentId || confirmation.contentType !== before.contentType || confirmation.operation !== input.operation || confirmation.expectedPointerRevision !== input.expectedPointerRevision || confirmation.currentState !== before.state || confirmation.currentVisibility !== before.visibility || confirmation.currentActiveVersion !== before.activeVersionNumber || confirmation.targetVersion !== (input.targetVersion ?? null) || new Date(confirmation.issuedAt) > now || new Date(confirmation.expiresAt) <= now) throw new PublicationError('CONFIRMATION_STALE', 'Lifecycle confirmation no longer matches authoritative state', 409)
    return this.firestore.runTransaction(async tx => {
      const [requestSnap, pointerSnap] = await Promise.all([tx.get(requestRef), tx.get(this.pointerRef(input.contentId))])
      if (requestSnap.exists) { const request = requestSnap.data() as LifecycleRequestRecord; if (request.actorUid !== actorUid || request.payloadHash !== payloadHash) throw new PublicationError('IDEMPOTENCY_MISMATCH', 'Request ID was reused with different lifecycle input', 409); return { ...request.result, replayed: true } }
      const pointer = pointerSnap.data() as Pointer
      if (pointer.revision !== input.expectedPointerRevision || pointer.state !== confirmation.currentState || pointer.visibility !== confirmation.currentVisibility || pointer.activeVersionNumber !== confirmation.currentActiveVersion) throw new PublicationError('POINTER_CONFLICT', 'Publication pointer changed', 409, { currentRevision: pointer.revision })
      if (!canTransition(pointer.state, input.operation) || (input.operation === 'release' && pointer.visibility !== 'private')) throw new PublicationError('INVALID_TRANSITION', `${input.operation} is not allowed from ${pointer.state}/${pointer.visibility}`, 409)
      const state = nextState(pointer.state, input.operation), activeVersionNumber = input.operation === 'archive' ? null : input.operation === 'rollback' ? input.targetVersion! : pointer.activeVersionNumber
      const visibility = input.operation === 'release' || ['republish', 'enable'].includes(input.operation) ? 'public' : state === 'published' ? 'private' : 'hidden', occurredAt = now.toISOString(), correlationId = randomUUID(), nextRevision = pointer.revision + 1
      const result: LifecycleResult = { contentId: input.contentId, operation: input.operation, priorState: pointer.state, state, visibility, activeVersionNumber, latestVersionNumber: pointer.latestVersionNumber, pointerRevision: nextRevision, targetVersion: input.targetVersion ?? null, occurredAt, replayed: false }
      tx.update(this.pointerRef(input.contentId), { state, visibility, activeVersionNumber, revision: nextRevision, updatedAt: occurredAt, updatedBy: actorUid })
      const auditRef = this.firestore.collection(V2_PUBLICATION_AUDIT_COLLECTION).doc()
      tx.create(auditRef, { eventId: auditRef.id, actorUid, contentId: input.contentId, contentType: pointer.contentType, operation: input.operation, priorState: pointer.state, newState: state, priorVisibility: pointer.visibility, newVisibility: visibility, priorActiveVersion: pointer.activeVersionNumber, newActiveVersion: activeVersionNumber, latestVersion: pointer.latestVersionNumber, priorPointerRevision: pointer.revision, newPointerRevision: nextRevision, targetVersion: input.targetVersion ?? null, requestId: input.requestId, correlationId, occurredAt })
      const request: LifecycleRequestRecord = { requestId: input.requestId, actorUid, contentId: input.contentId, operation: input.operation, payloadHash, correlationId, state: 'COMMITTED', expectedPointerRevision: input.expectedPointerRevision, createdAt: occurredAt, updatedAt: occurredAt, expiresAt: new Date(now.getTime() + 30 * 86400_000).toISOString(), result }
      tx.create(requestRef, request); return result
    })
  }

  async prepare(contentId: string, expectedDraftRevision: number, actorUid: string): Promise<PublicationPreparation> {
    if (!uuidSchema.safeParse(contentId).success || !Number.isSafeInteger(expectedDraftRevision) || expectedDraftRevision < 1) throw new PublicationError('INVALID_REQUEST', 'A valid content ID and draft revision are required', 422)
    const draftSnapshot = await this.firestore.collection(V2_DRAFT_COLLECTION).doc(contentId).get()
    if (!draftSnapshot.exists) throw new PublicationError('DRAFT_NOT_FOUND', 'Draft not found', 404)
    const draft = draftSnapshot.data() as { revision: number; document: unknown }
    if (draft.revision !== expectedDraftRevision) throw new PublicationError('DRAFT_CONFLICT', 'Draft revision changed', 409, { currentRevision: draft.revision })
    const document = contentEnvelopeSchema.parse(draft.document)
    const assets = await this.resolveAssets(document), manifest = await this.planAssets(assets)
    const compatibility = validatePublicationCompatibility(document, { resolvedAssetIds: new Set(manifest.map(({ assetId }) => assetId)) })
    const pointer = await this.pointer(contentId)
    if (pointer && !canTransition(pointer.state, 'publish-new-version')) throw new PublicationError('INVALID_TRANSITION', `Publishing a new version is not allowed from ${pointer.state}`, 409)
    const previous = pointer?.activeVersionNumber ? await this.version(contentId, pointer.activeVersionNumber) : null
    const findings = [...compatibility.findings, ...(previous?.document ? compareStableIds(contentEnvelopeSchema.parse(previous.document), document) : [])]
    const documentHash = await sha256Canonical(document), manifestHash = await sha256Canonical(manifest)
    const validationHash = await sha256Canonical({ ...compatibility, findings }), issued = this.now()
    return { title: document.title, contentId, contentType: document.contentType, actorUid, draftRevision: draft.revision,
      documentVersion: document.documentVersion, draftFingerprint: documentHash, validationFingerprint: validationHash,
      pointerRevision: pointer?.revision ?? 0, currentState: pointer?.state ?? 'draft', currentVisibility: pointer?.visibility ?? 'hidden',
      currentActiveVersion: pointer?.activeVersionNumber ?? null, proposedVersionNumber: (pointer?.latestVersionNumber ?? 0) + 1,
      operation: pointer ? 'publish-new-version' : 'publish', resultingVisibility: 'private', ...compatibility, findings,
      assetIds: manifest.map(({ assetId }) => assetId), assetManifestHash: manifestHash, issuedAt: issued.toISOString(),
      expiresAt: new Date(issued.getTime() + 10 * 60_000).toISOString(),
      canPublish: compatibility.schemaValid && compatibility.storageReady && !findings.some(({ severity }) => severity === 'error') }
  }

  async publish(input: PublishInput, actorUid: string): Promise<PublishResult> {
    if (!uuidSchema.safeParse(input.contentId).success || !uuidSchema.safeParse(input.requestId).success) throw new PublicationError('INVALID_REQUEST', 'Content and request IDs must be UUIDs', 422)
    const payloadHash = await sha256Canonical({ contentId: input.contentId, expectedDraftRevision: input.expectedDraftRevision, expectedPointerRevision: input.expectedPointerRevision, confirmation: input.confirmation })
    const existingRequest = await this.firestore.collection(V2_PUBLICATION_REQUEST_COLLECTION).doc(input.requestId).get()
    if (existingRequest.exists) {
      const existing = existingRequest.data() as RequestRecord
      if (existing.actorUid !== actorUid || existing.contentId !== input.contentId || existing.payloadHash !== payloadHash) throw new PublicationError('IDEMPOTENCY_MISMATCH', 'Request ID was used with a different payload', 409)
      if (existing.state === 'COMMITTED' && existing.result) return { ...existing.result, replayed: true }
      if (existing.state === 'FAILED') throw new PublicationError('REQUEST_FAILED', 'The prior publication attempt failed and requires a new request ID', 409)
    }
    const draftSnapshot = await this.firestore.collection(V2_DRAFT_COLLECTION).doc(input.contentId).get()
    if (!draftSnapshot.exists) throw new PublicationError('DRAFT_NOT_FOUND', 'Draft not found', 404)
    const draft = draftSnapshot.data() as { revision: number; contentType: string; document: unknown }
    if (draft.revision !== input.expectedDraftRevision) throw new PublicationError('DRAFT_CONFLICT', 'Draft revision changed', 409, { currentRevision: draft.revision })
    const document = contentEnvelopeSchema.parse(draft.document)
    const assets = await this.resolveAssets(document)
    const manifest = await this.planAssets(assets)
    const compatibility = validatePublicationCompatibility(document, { resolvedAssetIds: new Set(manifest.map(({ assetId }) => assetId)) })
    const previousPointer = await this.pointer(input.contentId)
    if (previousPointer && !canTransition(previousPointer.state, 'publish-new-version')) throw new PublicationError('INVALID_TRANSITION', `Publishing a new version is not allowed from ${previousPointer.state}`, 409)
    const previous = previousPointer?.activeVersionNumber ? await this.version(input.contentId, previousPointer.activeVersionNumber) : null
    const stableFindings = previous?.document ? compareStableIds(contentEnvelopeSchema.parse(previous.document), document) : []
    const findings = [...compatibility.findings, ...stableFindings]
    if (!compatibility.schemaValid || !compatibility.storageReady || findings.some(({ severity }) => severity === 'error')) throw new PublicationError('PUBLICATION_INVALID', 'Publication validation failed', 422, findings)
    const documentHash = await sha256Canonical(document), manifestHash = await sha256Canonical(manifest), validationHash = await sha256Canonical({ ...compatibility, findings })
    const pointerRevision = previousPointer?.revision ?? 0
    const proposedVersion = (previousPointer?.latestVersionNumber ?? 0) + 1
    this.verifyConfirmation(input.confirmation, { actorUid, document, draftRevision: draft.revision, documentHash, validationHash, manifestHash, assetIds: manifest.map(({ assetId }) => assetId), pointerRevision, proposedVersion, operation: previousPointer ? 'publish-new-version' : 'publish' })
    const reservation = await this.reserve(input, actorUid, document, payloadHash)
    if (reservation.result) return { ...reservation.result, replayed: true }
    const identity: PublicationIdentity = { namespace: 'v2', contentType: document.contentType, contentId: document.id, publicationVersion: reservation.reservedVersion }
    const artifactPath = `editor-v2-publications/${document.id}/v${identity.publicationVersion}.json`
    const artifactBytes = Buffer.from(canonicalJson(document), 'utf8'), artifactHash = hashBytes(artifactBytes)
    await this.materializeAssets(assets, manifest)
    await this.createImmutable(artifactPath, artifactBytes, 'application/json', artifactHash)
    const result: PublishResult = { identity, pointerRevision: pointerRevision + 1, artifactPath, artifactHash, replayed: false }
    await this.commit({ input, actorUid, document, documentHash, manifest, manifestHash, compatibility: { ...compatibility, findings }, reservation, result })
    return result
  }

  private async reserve(input: PublishInput, actorUid: string, document: ContentDocument, payloadHash: string): Promise<RequestRecord> {
    const requestRef = this.firestore.collection(V2_PUBLICATION_REQUEST_COLLECTION).doc(input.requestId), pointerRef = this.pointerRef(input.contentId)
    return this.firestore.runTransaction(async (tx) => {
      const [requestSnap, pointerSnap] = await Promise.all([tx.get(requestRef), tx.get(pointerRef)])
      if (requestSnap.exists) { const existing = requestSnap.data() as RequestRecord; if (existing.actorUid !== actorUid || existing.contentId !== input.contentId || existing.payloadHash !== payloadHash) throw new PublicationError('IDEMPOTENCY_MISMATCH', 'Request ID was used with a different payload', 409); if (existing.state === 'COMMITTED' && existing.result) return existing; if (existing.state === 'IN_PROGRESS') return existing; throw new PublicationError('REQUEST_FAILED', 'The prior publication attempt failed and requires a new request ID', 409) }
      const current = pointerSnap.exists ? pointerSnap.data() as Pointer : null, currentRevision = current?.revision ?? 0
      if (input.expectedPointerRevision !== currentRevision) throw new PublicationError('POINTER_CONFLICT', 'Publication pointer changed', 409, { currentRevision })
      if (current && !canTransition(current.state, 'publish-new-version')) throw new PublicationError('INVALID_TRANSITION', `Publishing a new version is not allowed from ${current.state}`, 409)
      const reservedVersion = (current?.latestVersionNumber ?? 0) + 1, now = this.now(), operation = current ? 'publish-new-version' : 'publish'
      const confirmation = publishConfirmationSchema.parse(input.confirmation)
      if (confirmation.proposedVersionNumber !== reservedVersion || confirmation.operation !== operation) throw new PublicationError('POINTER_CONFLICT', 'Publication version allocation changed', 409, { currentRevision, proposedVersion: reservedVersion })
      const request: RequestRecord = { requestId: input.requestId, actorUid, contentId: input.contentId, operation, payloadHash, correlationId: randomUUID(), state: 'IN_PROGRESS', reservedVersion, expectedPointerRevision: currentRevision, createdAt: now.toISOString(), updatedAt: now.toISOString(), expiresAt: new Date(now.getTime() + 30 * 86400_000).toISOString(), result: null }
      tx.create(requestRef, request)
      if (current) tx.update(pointerRef, { latestVersionNumber: reservedVersion, updatedAt: now.toISOString(), updatedBy: actorUid })
      else tx.create(pointerRef, { contractVersion: PUBLICATION_CONTRACT_VERSION, namespace: 'v2', contentId: document.id, contentType: document.contentType, state: 'draft', visibility: 'hidden', activeVersionNumber: null, latestVersionNumber: reservedVersion, revision: 0, createdAt: now.toISOString(), createdBy: actorUid, updatedAt: now.toISOString(), updatedBy: actorUid })
      return request
    })
  }

  private async commit(context: { input: PublishInput; actorUid: string; document: ContentDocument; documentHash: string; manifest: Manifest; manifestHash: string; compatibility: unknown; reservation: RequestRecord; result: PublishResult }) {
    const { input, actorUid, document, documentHash, manifest, manifestHash, reservation, result } = context
    const pointerRef = this.pointerRef(input.contentId), versionRef = pointerRef.collection('versions').doc(String(reservation.reservedVersion)), requestRef = this.firestore.collection(V2_PUBLICATION_REQUEST_COLLECTION).doc(input.requestId), auditRef = this.firestore.collection(V2_PUBLICATION_AUDIT_COLLECTION).doc()
    await this.firestore.runTransaction(async (tx) => {
      const [pointerSnap, requestSnap, versionSnap] = await Promise.all([tx.get(pointerRef), tx.get(requestRef), tx.get(versionRef)])
      const pointer = pointerSnap.data() as Pointer, request = requestSnap.data() as RequestRecord
      if (request.state === 'COMMITTED') return
      if (request.state !== 'IN_PROGRESS' || pointer.revision !== input.expectedPointerRevision || versionSnap.exists) throw new PublicationError('POINTER_CONFLICT', 'Publication state changed before activation', 409)
      const now = this.now().toISOString(), source = { draftId: document.id, draftRevision: input.expectedDraftRevision, documentVersion: document.documentVersion, draftFingerprint: documentHash }
      const record = { contractVersion: PUBLICATION_CONTRACT_VERSION, identity: result.identity, schemaVersion: '2.0.0', contentVersion: document.documentVersion, artifactPath: result.artifactPath, artifactHash: result.artifactHash, documentHash, document, assetManifest: manifest, assetManifestHash: manifestHash, compatibilitySnapshot: context.compatibility, source, publishedAt: now, publishedBy: actorUid, correlationId: reservation.correlationId, requestId: input.requestId, status: 'READY' }
      tx.create(versionRef, record)
      tx.update(pointerRef, { state: 'published', visibility: 'private', activeVersionNumber: reservation.reservedVersion, revision: pointer.revision + 1, updatedAt: now, updatedBy: actorUid })
      tx.create(auditRef, { eventId: auditRef.id, actorUid, identity: result.identity, publicationVersion: reservation.reservedVersion, priorState: pointer.state, newState: 'published', priorActiveVersion: pointer.activeVersionNumber, newActiveVersion: reservation.reservedVersion, operation: reservation.operation, correlationId: reservation.correlationId, requestId: input.requestId, documentHash, artifactHash: result.artifactHash, assetManifestHash: manifestHash, occurredAt: now })
      tx.update(requestRef, { state: 'COMMITTED', result, updatedAt: now })
    })
  }

  private verifyConfirmation(raw: unknown, expected: { actorUid: string; document: ContentDocument; draftRevision: number; documentHash: string; validationHash: string; manifestHash: string; assetIds: string[]; pointerRevision: number; proposedVersion: number; operation: 'publish' | 'publish-new-version' }) {
    const confirmation = publishConfirmationSchema.parse(raw), now = this.now()
    const ids = [...expected.assetIds].sort(), confirmed = [...confirmation.assetIds].sort()
    if (confirmation.actorUid !== expected.actorUid || confirmation.operation !== expected.operation || confirmation.contentId !== expected.document.id || confirmation.contentType !== expected.document.contentType || confirmation.draftRevision !== expected.draftRevision || confirmation.documentVersion !== expected.document.documentVersion || confirmation.draftFingerprint !== expected.documentHash || confirmation.validationFingerprint !== expected.validationHash || confirmation.pointerRevision !== expected.pointerRevision || confirmation.proposedVersionNumber !== expected.proposedVersion || confirmation.assetManifestHash !== expected.manifestHash || JSON.stringify(ids) !== JSON.stringify(confirmed) || new Date(confirmation.issuedAt) > now || new Date(confirmation.expiresAt) <= now) throw new PublicationError('CONFIRMATION_STALE', 'Publication confirmation no longer matches authoritative state', 409)
  }

  private async resolveAssets(document: ContentDocument): Promise<AssetMetadata[]> { const assets: AssetMetadata[] = []; for (const id of collectAssetIds(document)) { const snap = await this.firestore.collection(ASSET_COLLECTION).doc(id).get(); if (!snap.exists) throw new PublicationError('ASSET_NOT_FOUND', `Managed asset ${id} was not found`, 422, [{ domain: document.contentType, severity: 'error', path: '$.content', code: 'assets.not-ready', explanation: `Referenced asset ${id} is missing.`, requiredAction: 'Restore or replace the managed asset before publishing.', evidence: 'approved-design-decision' }]); assets.push(assetMetadataSchema.parse(snap.data())) } return assets }
  private async planAssets(assets: AssetMetadata[]): Promise<Manifest> {
    const manifest: Manifest = []
    for (const asset of assets) { const [bytes, metadata] = await Promise.all([this.bucket.file(asset.objectPath).download().then(([data]) => data), this.bucket.file(asset.objectPath).getMetadata().then(([data]) => data)]); if (metadata.contentType !== asset.mimeType || Number(metadata.size) !== asset.size) throw new PublicationError('ASSET_METADATA_MISMATCH', 'Private asset metadata failed verification', 422); const contentHash = hashBytes(bytes), digest = contentHash.slice(7), extension = asset.mimeType === 'image/jpeg' ? 'jpg' : asset.mimeType.split('/')[1], publishedObjectPath = `editor-v2-published-assets/sha256/${digest}.${extension}`; manifest.push(assetManifestEntrySchema.parse({ assetId: asset.id, mimeType: asset.mimeType, byteLength: bytes.length, width: asset.width, height: asset.height, contentHash, publishedObjectPath })) }
    return manifest.sort((a, b) => a.assetId.localeCompare(b.assetId))
  }
  private async materializeAssets(assets: AssetMetadata[], manifest: Manifest) { for (const entry of manifest) { const source = assets.find(({ id }) => id === entry.assetId); if (!source) throw new PublicationError('ASSET_NOT_FOUND', 'Asset copy plan is incomplete', 503); const [bytes] = await this.bucket.file(source.objectPath).download(); if (hashBytes(bytes) !== entry.contentHash) throw new PublicationError('ASSET_HASH_CHANGED', 'Private asset bytes changed after confirmation', 409); await this.createImmutable(entry.publishedObjectPath, bytes, entry.mimeType, entry.contentHash) } }
  private async createImmutable(path: string, bytes: Uint8Array, contentType: string, expectedHash: string) { const file = this.bucket.file(path); try { await file.save(Buffer.from(bytes), { resumable: false, validation: 'crc32c', preconditionOpts: { ifGenerationMatch: 0 }, metadata: { contentType, metadata: { sha256: expectedHash } } }) } catch { const [existing] = await file.download().catch(() => { throw new PublicationError('IMMUTABLE_WRITE_FAILED', 'Immutable object could not be created', 503) }); if (hashBytes(existing) !== expectedHash) throw new PublicationError('IMMUTABLE_COLLISION', 'Immutable object path contains different bytes', 503) } }
  private summarizeVersion(record: Record<string, unknown>, activeVersion: number | null) { const identity = record.identity as PublicationIdentity, source = record.source as { draftRevision: number; documentVersion: number }, manifest = Array.isArray(record.assetManifest) ? record.assetManifest : []; const compatibility = record.compatibilitySnapshot as { schemaValid?: boolean; storageReady?: boolean; learnerRuntimeCompatible?: boolean; learnerIntegrationReady?: boolean; findings?: unknown[] } | undefined; return { identity, publicationVersion: identity.publicationVersion, publishedAt: record.publishedAt, publishedBy: record.publishedBy, sourceDraftRevision: source.draftRevision, sourceDocumentVersion: source.documentVersion, documentHash: record.documentHash, assetManifestHash: record.assetManifestHash, assetCount: manifest.length, compatibilitySummary: { schemaValid: compatibility?.schemaValid ?? false, storageReady: compatibility?.storageReady ?? false, learnerRuntimeCompatible: compatibility?.learnerRuntimeCompatible ?? false, learnerIntegrationReady: compatibility?.learnerIntegrationReady ?? false, findingCount: compatibility?.findings?.length ?? 0 }, active: identity.publicationVersion === activeVersion, artifactStatus: record.status } }
  private pointerRef(contentId: string) { return this.firestore.collection(V2_PUBLICATION_COLLECTION).doc(contentId) }
}

export const hashBytes = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`
export const publicationInputSchema = z.object({ expectedDraftRevision: z.number().int().positive(), expectedPointerRevision: z.number().int().nonnegative(), requestId: uuidSchema, confirmation: publishConfirmationSchema }).strict()
export const publicationPreparationInputSchema = z.object({ expectedDraftRevision: z.number().int().positive() }).strict()
export const lifecycleInputSchema = z.object({ operation: z.enum(['release', 'rollback', 'unpublish', 'republish', 'disable', 'enable', 'archive']), expectedPointerRevision: z.number().int().nonnegative(), targetVersion: z.number().int().positive().nullable().optional(), requestId: uuidSchema, confirmation: lifecycleConfirmationSchema }).strict().superRefine((value, context) => { if (value.operation === 'rollback' && !value.targetVersion) context.addIssue({ code: 'custom', path: ['targetVersion'], message: 'Rollback requires a target version' }); if (value.operation !== 'rollback' && value.targetVersion != null) context.addIssue({ code: 'custom', path: ['targetVersion'], message: 'Target version is rollback-only' }) })
