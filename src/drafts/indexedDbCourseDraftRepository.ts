import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

import type { CourseDocument } from '../content/core/envelope'
import { CURRENT_SCHEMA_VERSION } from '../content/core/versions'
import { courseDraftDocumentSchema, storedCourseDraftSchema } from './courseDraft.schema'
import { DraftConflictError, DraftRepositoryError, UnsupportedDraftSchemaError, type DraftRecord, type DraftRepository, type DraftSummary } from './draft.types'
import { draftChangeChannel, type DraftChangePublisher } from './draftChangeChannel'

export const DRAFT_DATABASE_NAME = 'ycoders-editor-studio-v2-drafts'
export const DRAFT_DATABASE_VERSION = 5
export const COURSE_DRAFT_STORE = 'course-drafts-v1'
export const PRACTICE_DRAFT_STORE = 'practice-drafts-v1'
export const CHALLENGE_DRAFT_STORE = 'challenge-drafts-v1'
export const PROJECT_DRAFT_STORE = 'project-drafts-v1'
export const DRAFT_METADATA_STORE = 'draft-metadata-v2'

interface DraftDatabase extends DBSchema {
  'course-drafts-v1': { key: string; value: DraftRecord<CourseDocument>; indexes: { 'by-last-saved': string } }
  'practice-drafts-v1': { key: string; value: DraftRecord<import('../content/core/envelope').PracticeDocument>; indexes: { 'by-last-saved': string } }
  'challenge-drafts-v1': { key: string; value: DraftRecord<import('../content/core/envelope').ChallengeDocument>; indexes: { 'by-last-saved': string } }
  'project-drafts-v1': { key: string; value: DraftRecord<import('../content/core/envelope').ProjectDocument>; indexes: { 'by-last-saved': string } }
  'draft-metadata-v2': { key: string; value: { key: string; value: string } }
}

export type CourseDraftRepositoryOptions = { databaseName?: string; now?: () => string; changes?: DraftChangePublisher }

export function upgradeDraftDatabase(database: IDBPDatabase<DraftDatabase>, oldVersion: number): void {
  if (oldVersion < 1 && !database.objectStoreNames.contains(COURSE_DRAFT_STORE)) database.createObjectStore(COURSE_DRAFT_STORE, { keyPath: 'id' }).createIndex('by-last-saved', 'lastSavedAt')
  if (oldVersion < 2 && !database.objectStoreNames.contains(DRAFT_METADATA_STORE)) database.createObjectStore(DRAFT_METADATA_STORE, { keyPath: 'key' })
  if (oldVersion < 3 && !database.objectStoreNames.contains(PRACTICE_DRAFT_STORE)) database.createObjectStore(PRACTICE_DRAFT_STORE, { keyPath: 'id' }).createIndex('by-last-saved', 'lastSavedAt')
  if (oldVersion < 4 && !database.objectStoreNames.contains(CHALLENGE_DRAFT_STORE)) database.createObjectStore(CHALLENGE_DRAFT_STORE, { keyPath: 'id' }).createIndex('by-last-saved', 'lastSavedAt')
  if (oldVersion < 5 && !database.objectStoreNames.contains(PROJECT_DRAFT_STORE)) database.createObjectStore(PROJECT_DRAFT_STORE, { keyPath: 'id' }).createIndex('by-last-saved', 'lastSavedAt')
}

export class IndexedDbCourseDraftRepository implements DraftRepository<CourseDocument> {
  private database: Promise<IDBPDatabase<DraftDatabase>>
  private now: () => string
  private changes?: DraftChangePublisher

  constructor(options: CourseDraftRepositoryOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString())
    this.changes = options.changes
    this.database = openDB<DraftDatabase>(options.databaseName ?? DRAFT_DATABASE_NAME, DRAFT_DATABASE_VERSION, {
      upgrade(database, oldVersion) { upgradeDraftDatabase(database, oldVersion) },
    })
  }

  async create(document: CourseDocument): Promise<DraftRecord<CourseDocument>> {
    const parsed = courseDraftDocumentSchema.safeParse(document)
    if (!parsed.success) throw new DraftRepositoryError(parsed.error.message, 'invalid-draft')
    const timestamp = this.now()
    const record: DraftRecord<CourseDocument> = { id: parsed.data.id, contentType: 'course', schemaVersion: CURRENT_SCHEMA_VERSION, revision: 1, document: parsed.data, createdAt: timestamp, lastSavedAt: timestamp }
    try { const database = await this.database; await database.add(COURSE_DRAFT_STORE, record); this.changes?.publish('created', record.id, record.revision); return structuredClone(record) }
    catch (error) { if (error instanceof DOMException && error.name === 'ConstraintError') throw new DraftRepositoryError(`Draft ${document.id} already exists`, 'duplicate'); throw this.storageError(error) }
  }

  async get(id: string): Promise<DraftRecord<CourseDocument> | null> {
    try {
      const database = await this.database
      const raw: unknown = await database.get(COURSE_DRAFT_STORE, id)
      if (!raw) return null
      const version = typeof raw === 'object' && raw !== null && 'schemaVersion' in raw ? String(raw.schemaVersion) : 'unknown'
      if (version !== CURRENT_SCHEMA_VERSION) throw new UnsupportedDraftSchemaError(version)
      const parsed = storedCourseDraftSchema.safeParse(raw)
      if (!parsed.success) throw new DraftRepositoryError(parsed.error.message, 'invalid-draft')
      return structuredClone(parsed.data)
    } catch (error) { if (error instanceof DraftRepositoryError) throw error; throw this.storageError(error) }
  }

  async list(): Promise<DraftSummary[]> {
    try {
      const database = await this.database
      const records = await database.getAllFromIndex(COURSE_DRAFT_STORE, 'by-last-saved')
      return records.reverse().map((record) => ({ id: record.id, contentType: record.contentType, schemaVersion: record.schemaVersion, revision: record.revision, createdAt: record.createdAt, lastSavedAt: record.lastSavedAt, title: record.document.title, slug: record.document.slug, status: 'local-draft' }))
    } catch (error) { throw this.storageError(error) }
  }

  async save(id: string, document: CourseDocument, expectedRevision: number): Promise<DraftRecord<CourseDocument>> {
    const parsed = courseDraftDocumentSchema.safeParse(document)
    if (!parsed.success || parsed.data.id !== id) throw new DraftRepositoryError(parsed.success ? 'Document ID does not match the draft ID' : parsed.error.message, 'invalid-draft')
    try {
      const database = await this.database
      const transaction = database.transaction(COURSE_DRAFT_STORE, 'readwrite')
      const current = await transaction.store.get(id)
      if (!current) throw new DraftRepositoryError(`Draft ${id} was not found`, 'not-found')
      if (current.revision !== expectedRevision) throw new DraftConflictError(expectedRevision, current.revision)
      const record: DraftRecord<CourseDocument> = { ...current, schemaVersion: CURRENT_SCHEMA_VERSION, revision: current.revision + 1, document: parsed.data, lastSavedAt: this.now() }
      await transaction.store.put(record); await transaction.done
      this.changes?.publish('updated', id, record.revision)
      return structuredClone(record)
    } catch (error) { if (error instanceof DraftRepositoryError) throw error; throw this.storageError(error) }
  }

  async delete(id: string, expectedRevision: number): Promise<void> {
    try {
      const database = await this.database
      const transaction = database.transaction(COURSE_DRAFT_STORE, 'readwrite')
      const current = await transaction.store.get(id)
      if (!current) throw new DraftRepositoryError(`Draft ${id} was not found`, 'not-found')
      if (current.revision !== expectedRevision) throw new DraftConflictError(expectedRevision, current.revision)
      await transaction.store.delete(id); await transaction.done
      this.changes?.publish('deleted', id, current.revision)
    } catch (error) { if (error instanceof DraftRepositoryError) throw error; throw this.storageError(error) }
  }

  private storageError(error: unknown) { return new DraftRepositoryError(error instanceof Error ? error.message : 'IndexedDB operation failed', 'storage') }
}

export const courseDraftRepository = new IndexedDbCourseDraftRepository({ changes: draftChangeChannel })
