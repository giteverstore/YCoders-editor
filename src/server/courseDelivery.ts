import { createHash } from 'node:crypto'
import type { Firestore } from 'firebase-admin/firestore'
import type { getStorage } from 'firebase-admin/storage'
import { z } from 'zod'
import { contentEnvelopeSchema, type CourseDocument } from '../content/core/envelope.js'
import { assetManifestEntrySchema, canonicalJson, contentHashSchema, publicationIdentitySchema, V2_PUBLICATION_COLLECTION } from '../publication/publicationContracts.js'
import { adaptCourse } from '../integration/learnerAdapters.js'
import type { AdapterFinding, AssetDeliveryDescriptor, PublishedAssetManifestEntry } from '../integration/learnerAdapter.types.js'

type Bucket = ReturnType<ReturnType<typeof getStorage>['bucket']>
type VersionRecord = { identity: z.infer<typeof publicationIdentitySchema>; schemaVersion: string; artifactPath: string; artifactHash: string; documentHash: string; assetManifest: z.infer<typeof assetManifestEntrySchema>[]; assetManifestHash: string; status: string }
export type DeliveryCourseEnvelope = { namespace: 'v2'; contentType: 'course'; contentId: string; publicationVersion: number; course: unknown; integrity: { artifactHash: string; documentHash: string; assetManifestHash: string; verified: true }; warnings: AdapterFinding[] }
export type DeliveredAsset = { bytes: Uint8Array; contentType: 'image/png' | 'image/jpeg' | 'image/webp'; contentHash: string }
export class DeliveryError extends Error { constructor(readonly code: string, message: string, readonly status: number, readonly details?: unknown) { super(message); this.name = 'DeliveryError' } }

export class CourseDeliveryService {
  constructor(private readonly firestore: Firestore, private readonly bucket: Bucket) {}
  async active(contentId: string): Promise<DeliveryCourseEnvelope> {
    const pointer = await this.firestore.collection(V2_PUBLICATION_COLLECTION).doc(contentId).get()
    if (!pointer.exists) throw new DeliveryError('V2_CONTENT_NOT_FOUND', 'V2 Course not found', 404)
    const value = pointer.data() as { namespace?: string; contentType?: string; state?: string; visibility?: string; activeVersionNumber?: number | null }
    if (value.namespace !== 'v2' || value.contentType !== 'course') throw new DeliveryError('V2_CONTENT_NOT_FOUND', 'V2 Course not found', 404)
    if (!isActivelyDiscoverable(value.state, value.visibility) || !value.activeVersionNumber) throw new DeliveryError('V2_NOT_DISCOVERABLE', 'V2 Course is not available through active discovery', 404)
    return this.exact(contentId, value.activeVersionNumber)
  }
  async exact(contentId: string, version: number): Promise<DeliveryCourseEnvelope> {
    const { record, document } = await this.verifiedVersion(contentId, version)
    const result = adaptCourse({ identity: record.identity, document, assetManifest: record.assetManifest as PublishedAssetManifestEntry[] })
    if (!result.ok) throw new DeliveryError('V2_ADAPTER_INCOMPATIBLE', 'V2 Course cannot be represented by the current learner contract', 422, { classification: result.classification, errors: result.errors, warnings: result.warnings })
    return { namespace: 'v2', contentType: 'course', contentId, publicationVersion: version, course: result.value, integrity: { artifactHash: record.artifactHash, documentHash: record.documentHash, assetManifestHash: record.assetManifestHash, verified: true }, warnings: result.warnings }
  }
  async asset(contentId: string, version: number, assetId: string): Promise<DeliveredAsset> {
    const { record } = await this.verifiedVersion(contentId, version)
    const entry = record.assetManifest.find(item => item.assetId === assetId)
    if (!entry) throw new DeliveryError('V2_ASSET_NOT_IN_MANIFEST', 'Asset is not authorized by this exact Course version', 404)
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(entry.mimeType)) throw new DeliveryError('V2_INTEGRITY_FAILURE', 'Asset manifest contains an unsupported media type', 503)
    let bytes: Buffer
    try { [bytes] = await this.bucket.file(entry.publishedObjectPath).download() } catch { throw new DeliveryError('V2_ASSET_MISSING', 'Version-authorized asset is unavailable', 503) }
    if (hash(bytes) !== entry.contentHash || bytes.length !== entry.byteLength) throw new DeliveryError('V2_INTEGRITY_FAILURE', 'Version-authorized asset failed integrity verification', 503)
    return { bytes: new Uint8Array(bytes), contentType: entry.mimeType, contentHash: entry.contentHash }
  }
  private async verifiedVersion(contentId: string, version: number): Promise<{ record: VersionRecord; document: CourseDocument }> {
    const snapshot = await this.firestore.collection(V2_PUBLICATION_COLLECTION).doc(contentId).collection('versions').doc(String(version)).get()
    if (!snapshot.exists) throw new DeliveryError('V2_VERSION_NOT_FOUND', 'Exact V2 Course version not found', 404)
    const raw = snapshot.data() as Record<string, unknown>, identity = publicationIdentitySchema.safeParse(raw.identity)
    if (!identity.success || identity.data.namespace !== 'v2' || identity.data.contentType !== 'course' || identity.data.contentId !== contentId || identity.data.publicationVersion !== version || raw.status !== 'READY' || raw.schemaVersion !== '2.0.0') throw new DeliveryError('V2_INTEGRITY_FAILURE', 'Publication metadata identity or status is invalid', 503)
    const manifest = z.array(assetManifestEntrySchema).safeParse(raw.assetManifest)
    if (!manifest.success || !contentHashSchema.safeParse(raw.artifactHash).success || !contentHashSchema.safeParse(raw.documentHash).success || !contentHashSchema.safeParse(raw.assetManifestHash).success) throw new DeliveryError('V2_INTEGRITY_FAILURE', 'Publication hashes or asset manifest are invalid', 503)
    let bytes: Buffer
    try { [bytes] = await this.bucket.file(String(raw.artifactPath)).download() } catch { throw new DeliveryError('V2_INTEGRITY_FAILURE', 'Immutable Course artifact is unavailable', 503) }
    if (hash(bytes) !== raw.artifactHash) throw new DeliveryError('V2_INTEGRITY_FAILURE', 'Immutable Course artifact hash mismatch', 503)
    let json: unknown
    try { json = JSON.parse(bytes.toString('utf8')) } catch { throw new DeliveryError('V2_INTEGRITY_FAILURE', 'Immutable Course artifact is not valid JSON', 503) }
    const document = contentEnvelopeSchema.safeParse(json)
    if (!document.success || document.data.contentType !== 'course' || document.data.id !== contentId || hash(Buffer.from(canonicalJson(document.data))) !== raw.documentHash) throw new DeliveryError('V2_INTEGRITY_FAILURE', 'Immutable Course document identity or hash is invalid', 503)
    return { record: { ...(raw as VersionRecord), identity: identity.data, assetManifest: manifest.data }, document: document.data }
  }
}

export function isActivelyDiscoverable(state: unknown, visibility: unknown) { return state === 'published' && visibility === 'public' }
export function resolveAssetDeliveryEndpoint(descriptor: AssetDeliveryDescriptor) { if (descriptor.namespace !== 'v2' || descriptor.kind !== 'versioned-v2-asset') throw new DeliveryError('V2_INTEGRITY_FAILURE', 'Invalid V2 asset descriptor', 422); return `/api/v2/delivery/courses/${encodeURIComponent(descriptor.contentId)}/versions/${descriptor.publicationVersion}/assets/${encodeURIComponent(descriptor.assetId)}` }
export const deliveryCacheHeaders = (kind: 'active' | 'version' | 'asset'): Record<string, string> => kind === 'active' ? { 'Cache-Control': 'private, no-store' } : { 'Cache-Control': 'private, no-cache', Vary: 'Authorization' }
const hash = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`
