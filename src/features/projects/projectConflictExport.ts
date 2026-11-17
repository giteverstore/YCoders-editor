import type { ProjectDocument } from '../../content/core/envelope'
import { CURRENT_SCHEMA_VERSION } from '../../content/core/versions'
import { projectDraftDocumentSchema } from '../../drafts/projectDraft.schema'
import { serializeProjectDraftExport } from '../../drafts/projectDraftTransfer'

export function createWorkingProjectExport(document: ProjectDocument, revision: number, now = new Date().toISOString()): string {
  const parsed = projectDraftDocumentSchema.parse(structuredClone(document))
  return serializeProjectDraftExport({ id: parsed.id, contentType: 'project', schemaVersion: CURRENT_SCHEMA_VERSION, revision: Math.max(1, revision), document: parsed, createdAt: parsed.createdAt, lastSavedAt: now }, now)
}
