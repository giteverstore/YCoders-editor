import { describe, expect, it, vi } from 'vitest'
import type { CourseDocument } from '../content/core/envelope'
import { validCourseDocument } from '../content/fixtures/validDocuments'
import { backupCloudDraft, uploadLocalDraft } from './cloudTransfer'
import type { DraftRecord, DraftRepository } from './draft.types'

const source: DraftRecord<CourseDocument> = { id: validCourseDocument.id, contentType: 'course', schemaVersion: '2.0.0', revision: 7, document: structuredClone(validCourseDocument), createdAt: validCourseDocument.createdAt, lastSavedAt: validCourseDocument.updatedAt }
const repository = (existing: DraftRecord<CourseDocument> | null = null) => ({ get: vi.fn().mockResolvedValue(existing), create: vi.fn(async (document: CourseDocument) => ({ ...source, id: document.id, document, revision: 1 })), list: vi.fn(), save: vi.fn(), delete: vi.fn() }) as unknown as DraftRepository<CourseDocument>

describe('explicit draft transfers', () => {
  it('uploads with the stable ID and does not mutate the local source', async () => { const cloud = repository(); const before = structuredClone(source); const result = await uploadLocalDraft(source, cloud); expect(result.id).toBe(source.id); expect(source).toEqual(before) })
  it('rejects an existing cloud destination without overwriting', async () => { const cloud = repository(source); await expect(uploadLocalDraft(source, cloud)).rejects.toEqual(expect.objectContaining({ code: 'duplicate' })); expect(cloud.create).not.toHaveBeenCalled() })
  it('can create an independent cloud copy after collision', async () => { const cloud = repository(source); const result = await uploadLocalDraft(source, cloud, true, () => '90000000-0000-4000-8000-000000000001'); expect(result.id).not.toBe(source.id) })
  it('backs up cloud content at local revision one and avoids local collision', async () => { const local = repository(source); const result = await backupCloudDraft(source, local, () => '90000000-0000-4000-8000-000000000002'); expect(result).toMatchObject({ id: '90000000-0000-4000-8000-000000000002', revision: 1 }); expect(source.revision).toBe(7) })
})
