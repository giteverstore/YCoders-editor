import { z } from 'zod'

import type { CourseDocument } from '../content/core/envelope'
import { CURRENT_SCHEMA_VERSION } from '../content/core/versions'
import { courseDraftDocumentSchema, storedCourseDraftSchema } from './courseDraft.schema'
import { DraftRepositoryError, type DraftRecord, type DraftRepository } from './draft.types'

export const DRAFT_EXPORT_FORMAT_VERSION = 1 as const
export const MAX_DRAFT_IMPORT_BYTES = 5 * 1024 * 1024

export const courseDraftExportSchema = z.object({
  format: z.literal('ycoders-course-draft'),
  formatVersion: z.literal(DRAFT_EXPORT_FORMAT_VERSION),
  exportedAt: z.iso.datetime({ offset: true }),
  draft: storedCourseDraftSchema,
}).strict()

export type CourseDraftExport = z.infer<typeof courseDraftExportSchema>
export type ImportIdentityMode = 'new' | 'original'

export class DraftImportError extends Error {
  constructor(message: string, readonly code: 'invalid-json' | 'oversized' | 'invalid-export' | 'unsupported-export' | 'unsupported-schema' | 'collision') { super(message); this.name = 'DraftImportError' }
}

export function createCourseDraftExport(record: DraftRecord<CourseDocument>, now = new Date().toISOString()): CourseDraftExport {
  return courseDraftExportSchema.parse({ format: 'ycoders-course-draft', formatVersion: DRAFT_EXPORT_FORMAT_VERSION, exportedAt: now, draft: record })
}

export function serializeCourseDraftExport(record: DraftRecord<CourseDocument>, now?: string): string {
  return JSON.stringify(createCourseDraftExport(record, now), null, 2)
}

export function safeDraftFilename(record: DraftRecord<CourseDocument>): string {
  const slug = record.document.slug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'untitled-course'
  return `ycoders-course-${slug}-r${record.revision}.json`
}

export function parseCourseDraftImport(text: string, byteLength = new TextEncoder().encode(text).byteLength): CourseDraftExport {
  if (byteLength > MAX_DRAFT_IMPORT_BYTES) throw new DraftImportError(`Import exceeds the ${MAX_DRAFT_IMPORT_BYTES / 1024 / 1024} MB limit`, 'oversized')
  let value: unknown
  try { value = JSON.parse(text) } catch { throw new DraftImportError('The selected file is not valid JSON', 'invalid-json') }
  if (typeof value === 'object' && value !== null && 'formatVersion' in value && value.formatVersion !== DRAFT_EXPORT_FORMAT_VERSION) throw new DraftImportError(`Export format version ${String(value.formatVersion)} is not supported`, 'unsupported-export')
  if (typeof value === 'object' && value !== null && 'draft' in value && typeof value.draft === 'object' && value.draft !== null && 'schemaVersion' in value.draft && value.draft.schemaVersion !== CURRENT_SCHEMA_VERSION) throw new DraftImportError(`Content schema ${String(value.draft.schemaVersion)} is not supported`, 'unsupported-schema')
  if (typeof value === 'object' && value !== null && 'draft' in value && typeof value.draft === 'object' && value.draft !== null && 'document' in value.draft && typeof value.draft.document === 'object' && value.draft.document !== null && 'schemaVersion' in value.draft.document && value.draft.document.schemaVersion !== CURRENT_SCHEMA_VERSION) throw new DraftImportError(`Embedded content schema ${String(value.draft.document.schemaVersion)} is not supported`, 'unsupported-schema')
  const parsed = courseDraftExportSchema.safeParse(value)
  if (!parsed.success) throw new DraftImportError(parsed.error.issues.map((issue) => `${issue.path.join('.') || 'export'}: ${issue.message}`).join('; '), 'invalid-export')
  return parsed.data
}

export async function restoreCourseDraft(repository: DraftRepository<CourseDocument>, backup: CourseDraftExport, mode: ImportIdentityMode, createId: () => string = () => crypto.randomUUID(), now = new Date().toISOString()): Promise<DraftRecord<CourseDocument>> {
  const document = structuredClone(backup.draft.document)
  if (mode === 'new') {
    document.id = createId()
    document.createdAt = now; document.updatedAt = now; document.createdBy = 'local-import'; document.updatedBy = 'local-import'
  }
  const parsed = courseDraftDocumentSchema.safeParse(document)
  if (!parsed.success) throw new DraftImportError(parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '), 'invalid-export')
  try { return await repository.create(parsed.data) }
  catch (error) { if (error instanceof DraftRepositoryError && error.code === 'duplicate') throw new DraftImportError('A local draft with this original document ID already exists', 'collision'); throw error }
}

export async function duplicateCourseDraft(repository: DraftRepository<CourseDocument>, source: DraftRecord<CourseDocument>, createId: () => string = () => crypto.randomUUID(), now = new Date().toISOString()): Promise<DraftRecord<CourseDocument>> {
  const document = structuredClone(source.document)
  const newId = createId()
  document.id = newId
  document.title = `${document.title || 'Untitled course'} — Copy`
  document.slug = `${document.slug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'course'}-copy-${newId.slice(0, 8)}`.slice(0, 120)
  document.documentVersion = 1
  document.status = { authoringState: 'draft', visibility: 'private', hasUnpublishedChanges: true, publishedDocumentVersion: null, publishedAt: null }
  document.createdAt = now; document.updatedAt = now; document.createdBy = 'local-duplicate'; document.updatedBy = 'local-duplicate'
  return repository.create(courseDraftDocumentSchema.parse(document))
}
