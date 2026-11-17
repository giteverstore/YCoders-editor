import { z } from 'zod'
import { uuidSchema } from '../content/core/identifiers.js'
import { authenticateAdmin, AuthenticationError, AuthorizationError, type TokenVerifier } from './auth.server.js'
import { lifecycleInputSchema, PublicationBackend, PublicationError, publicationInputSchema, publicationPreparationInputSchema } from './publicationBackend.js'

type Request = { method: string; authorization?: string; contentId?: string; version?: string; action?: 'prepare' | 'publish' | 'versions' | 'integrity' | 'rollback' | 'unpublish' | 'republish' | 'disable' | 'enable' | 'archive'; body?: unknown }
type Dependencies = { verifier: TokenVerifier; backend: PublicationBackend }
type Result = { status: number; body: { ok: boolean; data?: unknown; error?: { code: string; message: string; details?: unknown } } }

export async function handlePublicationApi(request: Request, dependencies: Dependencies): Promise<Result> {
  try {
    const permission = request.method === 'GET' ? 'publication:read' : 'publication:publish'
    const actor = await authenticateAdmin(request.authorization, permission, dependencies.verifier)
    if (!request.contentId || !uuidSchema.safeParse(request.contentId).success) return fail(422, 'INVALID_ID', 'Publication content ID must be a UUID')
    if (request.method === 'POST' && request.action === 'prepare') { const input = publicationPreparationInputSchema.safeParse(request.body); if (!input.success) return invalid(input.error); return ok(await dependencies.backend.prepare(request.contentId, input.data.expectedDraftRevision, actor.uid)) }
    if (request.method === 'POST' && request.action === 'publish') { const input = publicationInputSchema.safeParse(request.body); if (!input.success) return invalid(input.error); return ok(await dependencies.backend.publish({ contentId: request.contentId, ...input.data }, actor.uid), 201) }
    if (request.method === 'POST' && ['rollback', 'unpublish', 'republish', 'disable', 'enable', 'archive'].includes(request.action ?? '')) { const input = lifecycleInputSchema.safeParse({ ...(request.body as object), operation: request.action }); if (!input.success) return invalid(input.error); return ok(await dependencies.backend.lifecycle({ contentId: request.contentId, ...input.data }, actor.uid)) }
    if (request.method === 'GET' && request.action === 'integrity' && request.version) { const version = Number(request.version); if (!Number.isSafeInteger(version) || version < 1) return fail(422, 'INVALID_VERSION', 'Publication version must be a positive integer'); return ok(await dependencies.backend.verifyIntegrity(request.contentId, version)) }
    if (request.method === 'GET' && request.action === 'versions' && request.version) { const version = Number(request.version); if (!Number.isSafeInteger(version) || version < 1) return fail(422, 'INVALID_VERSION', 'Publication version must be a positive integer'); const record = await dependencies.backend.versionDetail(request.contentId, version); return record ? ok(record) : fail(404, 'VERSION_NOT_FOUND', 'Publication version not found') }
    if (request.method === 'GET' && request.action === 'versions') return ok(await dependencies.backend.versions(request.contentId))
    if (request.method === 'GET' && !request.action) { const pointer = await dependencies.backend.pointer(request.contentId); return pointer ? ok(pointer) : fail(404, 'PUBLICATION_NOT_FOUND', 'Publication pointer not found') }
    return fail(405, 'METHOD_NOT_ALLOWED', 'Method not allowed')
  } catch (error) {
    if (error instanceof AuthenticationError) return fail(401, 'AUTHENTICATION_REQUIRED', error.message)
    if (error instanceof AuthorizationError) return fail(403, 'PERMISSION_DENIED', error.message)
    if (error instanceof PublicationError) return fail(error.status, error.code, error.message, error.details)
    if (error instanceof z.ZodError) return invalid(error)
    return fail(500, 'INTERNAL_ERROR', 'The publication request could not be processed')
  }
}
const ok = (data: unknown, status = 200): Result => ({ status, body: { ok: true, data } })
const fail = (status: number, code: string, message: string, details?: unknown): Result => ({ status, body: { ok: false, error: { code, message, ...(details === undefined ? {} : { details }) } } })
const invalid = (error: z.ZodError): Result => fail(422, 'INVALID_REQUEST', 'Request validation failed', error.issues.map(({ path, message }) => ({ path, message })))
