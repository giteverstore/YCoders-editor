import { createHash } from 'node:crypto'
import { FieldPath, type Firestore } from 'firebase-admin/firestore'
import type { getStorage } from 'firebase-admin/storage'
import { z } from 'zod'
import { contentEnvelopeSchema, type PracticeDocument } from '../content/core/envelope.js'
import { uuidSchema } from '../content/core/identifiers.js'
import { assetManifestEntrySchema, canonicalJson, contentHashSchema, publicationIdentitySchema, V2_PUBLICATION_COLLECTION } from '../publication/publicationContracts.js'
import { adaptPractice } from '../integration/learnerAdapters.js'
import type { AdapterFinding, LearnerPractice, PublishedAssetManifestEntry } from '../integration/learnerAdapter.types.js'
import { DeliveryError, deliveryCacheHeaders, type DeliveredAsset } from './courseDelivery.js'

type Bucket = ReturnType<ReturnType<typeof getStorage>['bucket']>
type VersionRecord = { identity: z.infer<typeof publicationIdentitySchema>; schemaVersion: string; artifactPath: string; artifactHash: string; documentHash: string; assetManifest: z.infer<typeof assetManifestEntrySchema>[]; assetManifestHash: string; status: string }
export type DeliveryPracticeEnvelope = { namespace: 'v2'; contentType: 'practice'; contentId: string; publicationVersion: number; practice: unknown; integrity: { artifactHash: string; documentHash: string; assetManifestHash: string; verified: true }; warnings: AdapterFinding[] }
export type PracticeCandidate = { namespace: 'v2'; contentType: 'practice'; contentId: string; activePublicationVersion: number; title: string; difficulty: LearnerPractice['difficulty']; topics: string[]; tags: string[]; state: 'published'; discoverable: true; supportedLanguages: string[]; executionCompatible: true; publicTestsValid: true; learnerDtoReady: true }

export class PracticeDeliveryService {
  constructor(private readonly firestore: Firestore, private readonly bucket: Bucket) {}

  async active(contentId: string): Promise<DeliveryPracticeEnvelope> {
    const pointer = await this.firestore.collection(V2_PUBLICATION_COLLECTION).doc(contentId).get()
    if (!pointer.exists) throw new DeliveryError('V2_CONTENT_NOT_FOUND', 'V2 Practice not found', 404)
    const value = pointer.data() as { namespace?: string; contentType?: string; state?: string; visibility?: string; activeVersionNumber?: number | null }
    if (value.namespace !== 'v2' || value.contentType !== 'practice') throw new DeliveryError('V2_CONTENT_NOT_FOUND', 'V2 Practice not found', 404)
    if (value.state !== 'published' || value.visibility !== 'public' || !value.activeVersionNumber) throw new DeliveryError('V2_NOT_DISCOVERABLE', 'V2 Practice is not available through active discovery', 404)
    return this.exact(contentId, value.activeVersionNumber)
  }

  async candidates(correlationId?: string): Promise<PracticeCandidate[]> {
    const snapshot = await this.firestore.collection(V2_PUBLICATION_COLLECTION)
      .where('contentType', '==', 'practice').where('state', '==', 'published').where('visibility', '==', 'public')
      .orderBy('updatedAt', 'desc').orderBy(FieldPath.documentId(), 'asc').get()
    const candidates = await Promise.all(snapshot.docs.map(async (pointer) => {
      const value = pointer.data() as { contentId?: unknown; activeVersionNumber?: unknown }
      const contentId = typeof value.contentId === 'string' ? value.contentId : pointer.id
      if (!uuidSchema.safeParse(contentId).success || !Number.isSafeInteger(value.activeVersionNumber) || Number(value.activeVersionNumber) < 1) throw new DeliveryError('V2_INTEGRITY_FAILURE', 'Published Practice pointer identity is invalid', 503)
      const activePublicationVersion = Number(value.activeVersionNumber)
      try {
        const delivered = await this.exact(contentId, activePublicationVersion), practice = delivered.practice as LearnerPractice
        if (!practice.publicTests.length || !practice.languages.supported.length) return null
        return { namespace:'v2', contentType:'practice', contentId, activePublicationVersion, title:practice.title, difficulty:practice.difficulty, topics:[...practice.topics], tags:[...practice.tags], state:'published', discoverable:true, supportedLanguages:practice.languages.supported.map(({ id }) => id), executionCompatible:true, publicTestsValid:true, learnerDtoReady:true } satisfies PracticeCandidate
      } catch (error) {
        if (!(error instanceof DeliveryError) || error.code !== 'V2_ADAPTER_INCOMPATIBLE') throw error
        console.warn('v2_gateway.practice_candidate_incompatible', { contentId, activePublicationVersion, correlationId:correlationId ?? null })
        return null
      }
    }))
    return candidates.filter((candidate): candidate is PracticeCandidate => candidate !== null)
  }

  async exact(contentId: string, version: number): Promise<DeliveryPracticeEnvelope> {
    const { record, document } = await this.verifiedVersion(contentId, version)
    const result = adaptPractice({ identity: record.identity, document, assetManifest: record.assetManifest as PublishedAssetManifestEntry[] })
    if (!result.ok) throw new DeliveryError('V2_ADAPTER_INCOMPATIBLE', 'V2 Practice cannot be represented by the frozen learner contract', 422, { classification: result.classification, errors: result.errors, warnings: result.warnings })
    const serialized = JSON.stringify(result.value)
    if (/referenceSolutions|trustedVerification|privateTests/.test(serialized) || serialized.includes('publishedObjectPath') || serialized.includes('draftRevision')) throw new DeliveryError('V2_DTO_SAFETY_FAILURE', 'V2 Practice learner DTO failed safety validation', 503)
    return { namespace: 'v2', contentType: 'practice', contentId, publicationVersion: version, practice: result.value, integrity: { artifactHash: record.artifactHash, documentHash: record.documentHash, assetManifestHash: record.assetManifestHash, verified: true }, warnings: result.warnings }
  }

  async asset(contentId: string, version: number, assetId: string): Promise<DeliveredAsset> {
    const { record } = await this.verifiedVersion(contentId, version)
    const entry = record.assetManifest.find((item) => item.assetId === assetId)
    if (!entry) throw new DeliveryError('V2_ASSET_NOT_IN_MANIFEST', 'Asset is not authorized by this exact Practice version', 404)
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(entry.mimeType)) throw new DeliveryError('V2_INTEGRITY_FAILURE', 'Asset manifest contains an unsupported media type', 503)
    let bytes: Buffer
    try { [bytes] = await this.bucket.file(entry.publishedObjectPath).download() } catch { throw new DeliveryError('V2_ASSET_MISSING', 'Version-authorized asset is unavailable', 503) }
    if (hash(bytes) !== entry.contentHash || bytes.length !== entry.byteLength) throw new DeliveryError('V2_INTEGRITY_FAILURE', 'Version-authorized asset failed integrity verification', 503)
    return { bytes: new Uint8Array(bytes), contentType: entry.mimeType, contentHash: entry.contentHash }
  }

  private async verifiedVersion(contentId: string, version: number): Promise<{ record: VersionRecord; document: PracticeDocument }> {
    const snapshot = await this.firestore.collection(V2_PUBLICATION_COLLECTION).doc(contentId).collection('versions').doc(String(version)).get()
    if (!snapshot.exists) throw new DeliveryError('V2_VERSION_NOT_FOUND', 'Exact V2 Practice version not found', 404)
    const raw = snapshot.data() as Record<string, unknown>, identity = publicationIdentitySchema.safeParse(raw.identity)
    if (!identity.success || identity.data.namespace !== 'v2' || identity.data.contentType !== 'practice' || identity.data.contentId !== contentId || identity.data.publicationVersion !== version || raw.status !== 'READY' || raw.schemaVersion !== '2.0.0') throw new DeliveryError('V2_INTEGRITY_FAILURE', 'Publication metadata identity or status is invalid', 503)
    const manifest = z.array(assetManifestEntrySchema).safeParse(raw.assetManifest)
    if (!manifest.success || !contentHashSchema.safeParse(raw.artifactHash).success || !contentHashSchema.safeParse(raw.documentHash).success || !contentHashSchema.safeParse(raw.assetManifestHash).success) throw new DeliveryError('V2_INTEGRITY_FAILURE', 'Publication hashes or asset manifest are invalid', 503)
    let bytes: Buffer
    try { [bytes] = await this.bucket.file(String(raw.artifactPath)).download() } catch { throw new DeliveryError('V2_INTEGRITY_FAILURE', 'Immutable Practice artifact is unavailable', 503) }
    if (hash(bytes) !== raw.artifactHash) throw new DeliveryError('V2_INTEGRITY_FAILURE', 'Immutable Practice artifact hash mismatch', 503)
    let json: unknown
    try { json = JSON.parse(bytes.toString('utf8')) } catch { throw new DeliveryError('V2_INTEGRITY_FAILURE', 'Immutable Practice artifact is not valid JSON', 503) }
    const document = contentEnvelopeSchema.safeParse(json)
    if (!document.success || document.data.contentType !== 'practice' || document.data.id !== contentId || hash(Buffer.from(canonicalJson(document.data))) !== raw.documentHash) throw new DeliveryError('V2_INTEGRITY_FAILURE', 'Immutable Practice document identity or hash is invalid', 503)
    return { record: { ...(raw as VersionRecord), identity: identity.data, assetManifest: manifest.data }, document: document.data }
  }
}

export { deliveryCacheHeaders }
const hash = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`
