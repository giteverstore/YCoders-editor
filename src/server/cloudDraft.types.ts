import type { ContentDocument, ContentType } from '../content/core/envelope'

export type CloudDraftRecord = {
  id: string
  contentType: ContentType
  schemaVersion: '2.0.0'
  revision: number
  document: ContentDocument
  createdAt: string
  updatedAt: string
  createdBy: string
  updatedBy: string
}

export type CloudDraftSummary = Omit<CloudDraftRecord, 'document'> & { title: string; slug: string }

export interface CloudDraftRepository {
  create(document: ContentDocument, actorUid: string): Promise<CloudDraftRecord>
  get(id: string): Promise<CloudDraftRecord | null>
  list(contentType?: ContentType): Promise<CloudDraftSummary[]>
  save(id: string, document: ContentDocument, expectedRevision: number, actorUid: string): Promise<CloudDraftRecord>
  delete(id: string, expectedRevision: number): Promise<void>
}

export class CloudRepositoryError extends Error {
  constructor(message: string, readonly code: 'duplicate' | 'not-found' | 'conflict' | 'unavailable', readonly details?: { expectedRevision?: number; currentRevision?: number }) { super(message); this.name = 'CloudRepositoryError' }
}
