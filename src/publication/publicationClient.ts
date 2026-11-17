import type { ContentType } from '../content/core/envelope'
import type { CompatibilityFinding } from './publicationContracts'

type TokenProvider = (forceRefresh?: boolean) => Promise<string>
type Envelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string; details?: unknown } }
export type PublicationPointer = { contentId: string; contentType: ContentType; state: string; visibility: string; activeVersionNumber: number | null; latestVersionNumber: number; revision: number; updatedAt: string; updatedBy: string }
export type PublicationVersionSummary = { identity: { namespace: 'v2'; contentType: ContentType; contentId: string; publicationVersion: number }; publicationVersion: number; publishedAt: string; publishedBy: string; sourceDraftRevision: number; sourceDocumentVersion: number; documentHash: string; assetManifestHash: string; assetCount: number; active: boolean; artifactStatus: string; compatibilitySummary: { schemaValid: boolean; storageReady: boolean; learnerRuntimeCompatible: boolean; learnerIntegrationReady: boolean; findingCount: number } }
export type PublicationVersionDetail = PublicationVersionSummary & { schemaVersion: string; artifactHash: string; compatibilitySnapshot: unknown }
export type LifecycleOperation = 'rollback' | 'unpublish' | 'republish' | 'disable' | 'enable' | 'archive'
export type LifecycleResult = { contentId: string; operation: LifecycleOperation; priorState: string; state: string; visibility: string; activeVersionNumber: number | null; latestVersionNumber: number; pointerRevision: number; targetVersion: number | null; occurredAt: string; replayed: boolean }
export type PublicationPreparation = {
  title: string; contentId: string; contentType: ContentType; actorUid: string; draftRevision: number; documentVersion: number
  draftFingerprint: string; validationFingerprint: string; pointerRevision: number; currentState: string; currentVisibility: string
  currentActiveVersion: number | null; proposedVersionNumber: number; operation: 'publish' | 'publish-new-version'; resultingVisibility: 'private'
  schemaValid: boolean; storageReady: boolean; learnerRuntimeCompatible: boolean; learnerIntegrationReady: boolean
  findings: CompatibilityFinding[]; assetIds: string[]; assetManifestHash: string; issuedAt: string; expiresAt: string; canPublish: boolean
}
export type PublicationResult = { identity: { namespace: 'v2'; contentType: ContentType; contentId: string; publicationVersion: number }; pointerRevision: number; artifactPath: string; artifactHash: string; replayed: boolean }

export class PublicationApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: unknown) { super(message); this.name = 'PublicationApiError' }
  get requiresRestart() { return ['CONFIRMATION_STALE', 'DRAFT_CONFLICT', 'POINTER_CONFLICT', 'ASSET_HASH_CHANGED', 'ASSET_NOT_FOUND', 'ASSET_METADATA_MISMATCH'].includes(this.code) }
}

export class PublicationApiClient {
  constructor(private readonly token: TokenProvider, private readonly base = '/api/v2/publications', private readonly request: typeof fetch = fetch) {}
  pointer(id: string) { return this.call<PublicationPointer>(`/${encodeURIComponent(id)}`, { method: 'GET' }) }
  versions(id: string) { return this.call<PublicationVersionSummary[]>(`/${encodeURIComponent(id)}/versions`, { method: 'GET' }) }
  version(id: string, version: number) { return this.call<PublicationVersionDetail>(`/${encodeURIComponent(id)}/versions/${version}`, { method: 'GET' }) }
  integrity(id: string, version: number) { return this.call<{ ok: true; version: number; artifactStatus: string; assetCount: number; checkedAt: string }>(`/${encodeURIComponent(id)}/versions/${version}/integrity`, { method: 'GET' }) }
  prepare(id: string, expectedDraftRevision: number) { return this.call<PublicationPreparation>(`/${encodeURIComponent(id)}/prepare`, { method: 'POST', body: JSON.stringify({ expectedDraftRevision }) }) }
  publish(id: string, preparation: PublicationPreparation, requestId: string) {
    const confirmation = { contentId: preparation.contentId, contentType: preparation.contentType, draftRevision: preparation.draftRevision,
      documentVersion: preparation.documentVersion, draftFingerprint: preparation.draftFingerprint, validationFingerprint: preparation.validationFingerprint,
      pointerRevision: preparation.pointerRevision, proposedVersionNumber: preparation.proposedVersionNumber,
      assetManifestHash: preparation.assetManifestHash, assetIds: preparation.assetIds, actorUid: preparation.actorUid,
      operation: preparation.operation, issuedAt: preparation.issuedAt, expiresAt: preparation.expiresAt, completedSteps: [true, true, true] as const }
    return this.call<PublicationResult>(`/${encodeURIComponent(id)}/publish`, { method: 'POST', body: JSON.stringify({ expectedDraftRevision: preparation.draftRevision, expectedPointerRevision: preparation.pointerRevision, requestId, confirmation }) })
  }
  lifecycle(id: string, pointer: PublicationPointer, actorUid: string, operation: LifecycleOperation, requestId: string, targetVersion: number | null, archiveConfirmed: boolean) {
    const now = new Date(), confirmation = { contentId: id, contentType: pointer.contentType, actorUid, operation, expectedPointerRevision: pointer.revision,
      currentState: pointer.state, currentActiveVersion: pointer.activeVersionNumber, targetVersion, issuedAt: now.toISOString(), expiresAt: new Date(now.getTime() + 5 * 60_000).toISOString(), confirmed: true, archiveConfirmed }
    return this.call<LifecycleResult>(`/${encodeURIComponent(id)}/${operation}`, { method: 'POST', body: JSON.stringify({ expectedPointerRevision: pointer.revision, targetVersion, requestId, confirmation }) })
  }
  private async call<T>(path: string, init: RequestInit, refreshed = false): Promise<T> {
    let response: Response
    try { response = await this.request(`${this.base}${path}`, { ...init, headers: { Authorization: `Bearer ${await this.token(refreshed)}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) } }) }
    catch { throw new PublicationApiError(0, 'NETWORK_UNCERTAIN', 'The server response was not received. The same publication request can be retried safely.') }
    if (response.status === 401 && !refreshed) return this.call<T>(path, init, true)
    let envelope: Envelope<T>
    try { envelope = await response.json() as Envelope<T> } catch { throw new PublicationApiError(response.status, 'INVALID_RESPONSE', 'The publication service returned an invalid response.') }
    if (!response.ok || !envelope.ok) { const error = envelope.ok ? { code: 'HTTP_ERROR', message: 'Publication request failed.', details: undefined } : envelope.error; throw new PublicationApiError(response.status, error.code, publicationErrorMessage(error.code, error.message), error.details) }
    return envelope.data
  }
}

export function publicationErrorMessage(code: string, fallback: string) {
  const messages: Record<string, string> = { AUTHENTICATION_REQUIRED: 'Your session expired. Sign in again.', PERMISSION_DENIED: 'Your role no longer permits publishing.',
    PUBLICATION_INVALID: 'Publication validation found blocking issues.', CONFIRMATION_STALE: 'Publication state changed. Review fresh validation before publishing.',
    POINTER_CONFLICT: 'Another publication changed the active pointer. Restart the workflow.', DRAFT_CONFLICT: 'The saved cloud draft changed. Restart from fresh validation.',
    IDEMPOTENCY_MISMATCH: 'This retry does not match the original publication request.', ASSET_HASH_CHANGED: 'A referenced asset changed. Fresh validation is required.',
    ASSET_NOT_FOUND: 'A referenced asset is no longer available.', IMMUTABLE_WRITE_FAILED: 'Published storage could not be written safely.', INVALID_TRANSITION: 'This lifecycle action is no longer valid for the current state.',
    VERSION_NOT_READY: 'The selected immutable version is not eligible for activation.', ARTIFACT_CORRUPT: 'The selected version failed its artifact integrity check.', MANIFEST_CORRUPT: 'The selected version has an invalid asset manifest.' }
  return messages[code] ?? (fallback || 'The publication request could not be completed.')
}
