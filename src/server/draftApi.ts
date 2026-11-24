import { z } from 'zod'

import { uuidSchema } from '../content/core/identifiers.js'
import { contentEnvelopeSchema, contentTypeSchema } from '../content/core/envelope.js'
import { courseDraftDocumentSchema } from '../drafts/courseDraft.schema.js'
import { authenticateAdmin, AuthenticationError, AuthorizationError, type TokenVerifier } from './auth.server.js'
import { CloudRepositoryError, type CloudDraftRepository } from './cloudDraft.types.js'

export const MAX_API_BODY_BYTES = 5 * 1024 * 1024
type ApiRequest = { method: string; authorization?: string; contentType?: string; draftType?: string; body?: unknown; contentLength?: number; id?: string }
type ApiResult = { status: number; body: { ok: boolean; data?: unknown; error?: { code: string; message: string; details?: unknown } }; headers?: Record<string, string> }
type Dependencies = { verifier: TokenVerifier; repository: CloudDraftRepository }

const draftDocumentSchema = z.union([courseDraftDocumentSchema, contentEnvelopeSchema.refine((value) => ['practice', 'challenge', 'project'].includes(value.contentType), { message: 'Unsupported draft content type' })])
const createSchema = z.object({ document: draftDocumentSchema }).strict()
const saveSchema = z.object({ document: draftDocumentSchema, expectedRevision: z.number().int().positive() }).strict()
const revisionSchema = z.object({ expectedRevision: z.number().int().positive() }).strict()

export async function handleDraftApi(request: ApiRequest, dependencies: Dependencies): Promise<ApiResult> {
  try {
    const permission = request.method === 'GET' ? 'draft:read' : request.method === 'DELETE' ? 'draft:delete' : 'draft:write'
    const admin = await authenticateAdmin(request.authorization, permission, dependencies.verifier)
    if (request.id && !uuidSchema.safeParse(request.id).success) return failure(422, 'INVALID_ID', 'Draft ID must be a UUID')
    if (['POST', 'PUT', 'DELETE'].includes(request.method)) {
      if (!request.contentType?.toLowerCase().startsWith('application/json')) return failure(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json')
      if ((request.contentLength ?? new TextEncoder().encode(JSON.stringify(request.body ?? null)).byteLength) > MAX_API_BODY_BYTES) return failure(413, 'REQUEST_TOO_LARGE', 'Request body exceeds 5 MB')
    }
    if (!request.id && request.method === 'GET') {
      const type = request.draftType ? contentTypeSchema.safeParse(request.draftType) : null
      if (type && !type.success) return failure(422, 'INVALID_CONTENT_TYPE', 'Unsupported draft content type')
      if (type?.success && !isReleaseDomain(type.data)) return domainUnavailable()
      const contentTypes = type?.success ? [type.data] : ['course', 'practice'] as const
      const lists = await Promise.all(contentTypes.map((contentType) => dependencies.repository.list(contentType)))
      return success(lists.flat().sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)))
    }
    if (!request.id && request.method === 'POST') {
      const contentType = (request.body as { document?: { contentType?: unknown } } | undefined)?.document?.contentType
      if (typeof contentType === 'string' && !isReleaseDomain(contentType)) return domainUnavailable()
      const input = createSchema.safeParse(request.body)
      if (!input.success) return invalid(input.error)
      if (!isReleaseDomain(input.data.document.contentType)) return domainUnavailable()
      return success(await dependencies.repository.create(input.data.document, admin.uid), 201)
    }
    if (request.id && request.method === 'GET') {
      const record = await dependencies.repository.get(request.id)
      if (!record) return failure(404, 'DRAFT_NOT_FOUND', 'Draft not found')
      if (!isReleaseDomain(record.contentType)) return domainUnavailable()
      return success(record)
    }
    if (request.id && request.method === 'PUT') {
      const contentType = (request.body as { document?: { contentType?: unknown } } | undefined)?.document?.contentType
      if (typeof contentType === 'string' && !isReleaseDomain(contentType)) return domainUnavailable()
      const input = saveSchema.safeParse(request.body)
      if (!input.success) return invalid(input.error)
      if (input.data.document.id !== request.id) return failure(422, 'IDENTITY_MISMATCH', 'Document ID must match the path ID')
      if (!isReleaseDomain(input.data.document.contentType)) return domainUnavailable()
      return success(await dependencies.repository.save(request.id, input.data.document, input.data.expectedRevision, admin.uid))
    }
    if (request.id && request.method === 'DELETE') {
      const input = revisionSchema.safeParse(request.body)
      if (!input.success) return invalid(input.error)
      const record = await dependencies.repository.get(request.id)
      if (!record) return failure(404, 'DRAFT_NOT_FOUND', 'Draft not found')
      if (!isReleaseDomain(record.contentType)) return domainUnavailable()
      await dependencies.repository.delete(request.id, input.data.expectedRevision)
      return { status: 200, body: { ok: true, data: { deleted: true } } }
    }
    return failure(405, 'METHOD_NOT_ALLOWED', 'Method not allowed')
  } catch (error) {
    if (error instanceof AuthenticationError) return failure(401, 'AUTHENTICATION_REQUIRED', error.message)
    if (error instanceof AuthorizationError) return failure(403, 'PERMISSION_DENIED', error.message)
    if (error instanceof CloudRepositoryError) {
      if (error.code === 'not-found') return failure(404, 'DRAFT_NOT_FOUND', 'Draft not found')
      if (error.code === 'duplicate') return failure(409, 'DRAFT_EXISTS', 'A draft with this ID already exists')
      if (error.code === 'conflict') return failure(409, 'REVISION_CONFLICT', 'The draft has a newer revision', error.details)
      return failure(503, 'STORAGE_UNAVAILABLE', 'Draft storage is temporarily unavailable')
    }
    return failure(500, 'INTERNAL_ERROR', 'The server could not process the request')
  }
}

const success = (data: unknown, status = 200): ApiResult => ({ status, body: { ok: true, data } })
const failure = (status: number, code: string, message: string, details?: unknown): ApiResult => ({ status, body: { ok: false, error: { code, message, ...(details === undefined ? {} : { details }) } } })
const invalid = (error: z.ZodError): ApiResult => failure(422, 'INVALID_DRAFT', 'Request validation failed', error.issues.map((issue) => ({ path: issue.path, message: issue.message })))
const isReleaseDomain = (contentType: string): contentType is 'course' | 'practice' => contentType === 'course' || contentType === 'practice'
const domainUnavailable = (): ApiResult => failure(403, 'DOMAIN_WORK_IN_PROGRESS', 'This content domain is not available in the current release')
