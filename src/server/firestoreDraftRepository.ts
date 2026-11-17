import { Timestamp, type Firestore } from 'firebase-admin/firestore'

import { courseDraftDocumentSchema } from '../drafts/courseDraft.schema'
import { practiceDraftDocumentSchema } from '../drafts/practiceDraft.schema'
import { challengeDraftDocumentSchema } from '../drafts/challengeDraft.schema'
import { projectDraftDocumentSchema } from '../drafts/projectDraft.schema'
import { CURRENT_SCHEMA_VERSION } from '../content/core/versions'
import type { ContentDocument, ContentType } from '../content/core/envelope'
import { CloudRepositoryError, type CloudDraftRecord, type CloudDraftRepository, type CloudDraftSummary } from './cloudDraft.types'

export const V2_DRAFT_COLLECTION = 'editorV2Drafts'

type StoredDraft = Omit<CloudDraftRecord, 'createdAt' | 'updatedAt'> & { createdAt: Timestamp; updatedAt: Timestamp }

export class FirestoreCourseDraftRepository implements CloudDraftRepository {
  constructor(private readonly firestore: Firestore) {}

  async create(document: ContentDocument, actorUid: string): Promise<CloudDraftRecord> {
    const parsed = parseDraft(document)
    const reference = this.firestore.collection(V2_DRAFT_COLLECTION).doc(parsed.id)
    try {
      return await this.firestore.runTransaction(async (transaction) => {
        if ((await transaction.get(reference)).exists) throw new CloudRepositoryError('Draft already exists', 'duplicate')
        const now = Timestamp.now()
        const stored: StoredDraft = { id: parsed.id, contentType: parsed.contentType, schemaVersion: CURRENT_SCHEMA_VERSION, revision: 1, document: parsed, createdAt: now, updatedAt: now, createdBy: actorUid, updatedBy: actorUid }
        transaction.create(reference, stored)
        return toRecord(stored)
      })
    } catch (error) { if (error instanceof CloudRepositoryError) throw error; throw new CloudRepositoryError('Cloud draft storage is unavailable', 'unavailable') }
  }

  async get(id: string): Promise<CloudDraftRecord | null> {
    try { const snapshot = await this.firestore.collection(V2_DRAFT_COLLECTION).doc(id).get(); return snapshot.exists ? toRecord(snapshot.data() as StoredDraft) : null }
    catch { throw new CloudRepositoryError('Cloud draft storage is unavailable', 'unavailable') }
  }

  async list(contentType: ContentType = 'course'): Promise<CloudDraftSummary[]> {
    try { const snapshot = await this.firestore.collection(V2_DRAFT_COLLECTION).where('contentType', '==', contentType).orderBy('updatedAt', 'desc').limit(100).get(); return snapshot.docs.map((item) => { const record = toRecord(item.data() as StoredDraft); const { document, ...summary } = record; return { ...summary, title: document.title, slug: document.slug } }) }
    catch { throw new CloudRepositoryError('Cloud draft storage is unavailable', 'unavailable') }
  }

  async save(id: string, document: ContentDocument, expectedRevision: number, actorUid: string): Promise<CloudDraftRecord> {
    const parsed = parseDraft(document)
    if (parsed.id !== id) throw new CloudRepositoryError('Document ID does not match path ID', 'unavailable')
    const reference = this.firestore.collection(V2_DRAFT_COLLECTION).doc(id)
    try {
      return await this.firestore.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(reference)
        if (!snapshot.exists) throw new CloudRepositoryError('Draft not found', 'not-found')
        const current = snapshot.data() as StoredDraft
        if (current.revision !== expectedRevision) throw new CloudRepositoryError('Draft revision conflict', 'conflict', { expectedRevision, currentRevision: current.revision })
        if (current.contentType !== parsed.contentType) throw new CloudRepositoryError('Content type cannot change', 'unavailable')
        const stored: StoredDraft = { ...current, document: parsed, revision: current.revision + 1, updatedAt: Timestamp.now(), updatedBy: actorUid }
        transaction.set(reference, stored)
        return toRecord(stored)
      })
    } catch (error) { if (error instanceof CloudRepositoryError) throw error; throw new CloudRepositoryError('Cloud draft storage is unavailable', 'unavailable') }
  }

  async delete(id: string, expectedRevision: number): Promise<void> {
    const reference = this.firestore.collection(V2_DRAFT_COLLECTION).doc(id)
    try { await this.firestore.runTransaction(async (transaction) => { const snapshot = await transaction.get(reference); if (!snapshot.exists) throw new CloudRepositoryError('Draft not found', 'not-found'); const current = snapshot.data() as StoredDraft; if (current.revision !== expectedRevision) throw new CloudRepositoryError('Draft revision conflict', 'conflict', { expectedRevision, currentRevision: current.revision }); transaction.delete(reference) }) }
    catch (error) { if (error instanceof CloudRepositoryError) throw error; throw new CloudRepositoryError('Cloud draft storage is unavailable', 'unavailable') }
  }
}

function toRecord(stored: StoredDraft): CloudDraftRecord { return { ...stored, createdAt: stored.createdAt.toDate().toISOString(), updatedAt: stored.updatedAt.toDate().toISOString() } }
function parseDraft(document: ContentDocument): ContentDocument { if (document.contentType === 'course') return courseDraftDocumentSchema.parse(document); if (document.contentType === 'practice') return practiceDraftDocumentSchema.parse(document); if(document.contentType==='challenge')return challengeDraftDocumentSchema.parse(document); return projectDraftDocumentSchema.parse(document) }
