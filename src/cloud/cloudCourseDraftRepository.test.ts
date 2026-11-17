import { describe, expect, it, vi } from 'vitest'

import { validCourseDocument } from '../content/fixtures/validDocuments'
import type { CloudDraftRecord } from '../server/cloudDraft.types'
import { CloudCourseDraftRepository } from './cloudCourseDraftRepository'
import { DraftApiError, V2DraftApiClient } from './draftApiClient'

const dto = (revision = 1): CloudDraftRecord => ({ id: validCourseDocument.id, contentType: 'course', schemaVersion: '2.0.0', revision, document: structuredClone(validCourseDocument), createdAt: '2026-11-16T10:00:00.000Z', updatedAt: '2026-11-16T11:00:00.000Z', createdBy: 'admin', updatedBy: 'admin' })
const api = (overrides: Partial<V2DraftApiClient> = {}) => Object.assign({ list: vi.fn(), get: vi.fn(), create: vi.fn(), save: vi.fn(), delete: vi.fn() }, overrides) as unknown as V2DraftApiClient

describe('CloudCourseDraftRepository', () => {
  it('maps cloud records and summaries to the shared repository contract', async () => {
    const client = api({ get: vi.fn().mockResolvedValue(dto()), list: vi.fn().mockResolvedValue([{ ...dto(), document: undefined, title: 'Cloud', slug: 'cloud' }]) })
    const repository = new CloudCourseDraftRepository(client)
    expect((await repository.get(validCourseDocument.id))?.lastSavedAt).toBe('2026-11-16T11:00:00.000Z')
    expect((await repository.list())[0]).toMatchObject({ status: 'cloud-draft', title: 'Cloud', revision: 1 })
  })

  it.each([[401, 'authentication'], [403, 'permission'], [404, 'not-found']])('maps HTTP %i to %s', async (status, code) => {
    const repository = new CloudCourseDraftRepository(api({ save: vi.fn().mockRejectedValue(new DraftApiError(status, 'ERROR', 'failed')) }))
    await expect(repository.save(validCourseDocument.id, validCourseDocument, 1)).rejects.toMatchObject({ code })
  })

  it('maps revision conflicts with expected and current revisions', async () => {
    const repository = new CloudCourseDraftRepository(api({ save: vi.fn().mockRejectedValue(new DraftApiError(409, 'REVISION_CONFLICT', 'stale', { expectedRevision: 2, currentRevision: 3 })) }))
    await expect(repository.save(validCourseDocument.id, validCourseDocument, 2)).rejects.toEqual(expect.objectContaining({ expectedRevision: 2, currentRevision: 3 }))
  })

  it('maps duplicate creates separately from stale writes', async () => {
    const repository = new CloudCourseDraftRepository(api({ create: vi.fn().mockRejectedValue(new DraftApiError(409, 'DRAFT_ALREADY_EXISTS', 'exists')) }))
    await expect(repository.create(validCourseDocument)).rejects.toEqual(expect.objectContaining({ code: 'duplicate' }))
  })
})
