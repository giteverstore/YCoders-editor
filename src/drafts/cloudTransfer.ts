import type { CourseDocument } from '../content/core/envelope'
import { courseDraftDocumentSchema } from './courseDraft.schema'
import { DraftRepositoryError, type DraftRecord, type DraftRepository } from './draft.types'

export async function uploadLocalDraft(local: DraftRecord<CourseDocument>, cloud: DraftRepository<CourseDocument>, copyOnCollision = false, createId = () => crypto.randomUUID()): Promise<DraftRecord<CourseDocument>> {
  const document = courseDraftDocumentSchema.parse(structuredClone(local.document))
  const existing = await cloud.get(document.id)
  if (existing && !copyOnCollision) throw new DraftRepositoryError('A cloud draft with this content ID already exists.', 'duplicate')
  if (existing) document.id = createId()
  return cloud.create(document)
}

export async function backupCloudDraft(cloud: DraftRecord<CourseDocument>, local: DraftRepository<CourseDocument>, createId = () => crypto.randomUUID(), now = new Date().toISOString()): Promise<DraftRecord<CourseDocument>> {
  const document = structuredClone(cloud.document)
  if (await local.get(document.id)) document.id = createId()
  document.createdAt = now; document.updatedAt = now; document.createdBy = 'cloud-backup'; document.updatedBy = 'cloud-backup'
  return local.create(courseDraftDocumentSchema.parse(document))
}
