import type { ContentType } from '../content/core/envelope'

export type DraftRecord<TDocument> = {
  id: string
  contentType: ContentType
  schemaVersion: string
  revision: number
  document: TDocument
  createdAt: string
  lastSavedAt: string
}

export type DraftSource = 'local' | 'cloud'

export type DraftSummary = Omit<DraftRecord<never>, 'document'> & {
  title: string
  slug: string
  status: 'local-draft' | 'cloud-draft'
}

export interface DraftRepository<TDocument> {
  create(document: TDocument): Promise<DraftRecord<TDocument>>
  get(id: string): Promise<DraftRecord<TDocument> | null>
  list(): Promise<DraftSummary[]>
  save(id: string, document: TDocument, expectedRevision: number): Promise<DraftRecord<TDocument>>
  delete(id: string, expectedRevision: number): Promise<void>
}

export type DraftRepositoryErrorCode = 'duplicate' | 'not-found' | 'conflict' | 'unsupported-schema' | 'invalid-draft' | 'storage' | 'authentication' | 'permission' | 'unavailable'

export class DraftRepositoryError extends Error {
  constructor(message: string, readonly code: DraftRepositoryErrorCode) { super(message); this.name = 'DraftRepositoryError' }
}

export class DraftConflictError extends DraftRepositoryError {
  constructor(readonly expectedRevision: number, readonly currentRevision: number) { super(`Draft revision conflict: expected ${expectedRevision}, current ${currentRevision}`, 'conflict'); this.name = 'DraftConflictError' }
}

export class UnsupportedDraftSchemaError extends DraftRepositoryError {
  constructor(readonly schemaVersion: string) { super(`Draft schema ${schemaVersion} is not supported by this studio`, 'unsupported-schema'); this.name = 'UnsupportedDraftSchemaError' }
}
