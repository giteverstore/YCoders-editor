import type { CourseDocument } from '../content/core/envelope'
import { DraftConflictError, DraftRepositoryError, type DraftRecord, type DraftRepository, type DraftSummary } from '../drafts/draft.types'
import type { CloudDraftRecord } from '../server/cloudDraft.types'
import { DraftApiError, V2DraftApiClient } from './draftApiClient'

function record(dto: CloudDraftRecord): DraftRecord<CourseDocument> {
  if (dto.contentType !== 'course' || dto.document.contentType !== 'course') throw new DraftRepositoryError('The API returned a non-Course draft', 'invalid-draft')
  return { id: dto.id, contentType: 'course', schemaVersion: dto.schemaVersion, revision: dto.revision, document: structuredClone(dto.document), createdAt: dto.createdAt, lastSavedAt: dto.updatedAt }
}

function mappedError(error: unknown): Error {
  if (!(error instanceof DraftApiError)) return error instanceof Error ? error : new DraftRepositoryError('Cloud draft request failed', 'unavailable')
  const details = typeof error.details === 'object' && error.details !== null ? error.details as Record<string, unknown> : {}
  if (error.status === 409 && (error.code.toLowerCase().includes('duplicate') || error.code.toLowerCase().includes('exists'))) return new DraftRepositoryError(error.message, 'duplicate')
  if (error.status === 409) return new DraftConflictError(Number(details.expectedRevision ?? 0), Number(details.currentRevision ?? 0))
  if (error.status === 401) return new DraftRepositoryError('Your session expired. Sign in again.', 'authentication')
  if (error.status === 403) return new DraftRepositoryError('You do not have permission to perform this cloud draft action.', 'permission')
  if (error.status === 404) return new DraftRepositoryError('The cloud draft was not found.', 'not-found')
  if (error.status === 422) return new DraftRepositoryError(error.message, 'invalid-draft')
  return new DraftRepositoryError(error.message, 'unavailable')
}

export class CloudCourseDraftRepository implements DraftRepository<CourseDocument> {
  constructor(private readonly api: V2DraftApiClient) {}
  async create(document: CourseDocument) { try { return record(await this.api.create(document)) } catch (error) { throw mappedError(error) } }
  async get(id: string) { try { return record(await this.api.get(id)) } catch (error) { if (error instanceof DraftApiError && error.status === 404) return null; throw mappedError(error) } }
  async list(): Promise<DraftSummary[]> {
    try { return (await this.api.list('course')).map((item) => ({ id: item.id, contentType: 'course', schemaVersion: item.schemaVersion, revision: item.revision, createdAt: item.createdAt, lastSavedAt: item.updatedAt, title: item.title, slug: item.slug, status: 'cloud-draft' })) }
    catch (error) { throw mappedError(error) }
  }
  async save(id: string, document: CourseDocument, expectedRevision: number) { try { return record(await this.api.save(id, document, expectedRevision)) } catch (error) { throw mappedError(error) } }
  async delete(id: string, expectedRevision: number) { try { await this.api.delete(id, expectedRevision) } catch (error) { throw mappedError(error) } }
}
