import { z } from 'zod'
import { uuidSchema } from '../content/core/identifiers'
import { authenticateAdmin, AuthenticationError, AuthorizationError, type TokenVerifier } from './auth.server'
import { CourseDeliveryService, DeliveryError, deliveryCacheHeaders } from './courseDelivery'

export type DeliveryApiRequest = { authorization?: string; contentId?: string; version?: string; assetId?: string; kind: 'active' | 'version' | 'asset' }
export type DeliveryApiResult = { status: number; headers: Record<string, string>; body?: unknown; bytes?: Uint8Array }
export async function handleCourseDeliveryApi(request: DeliveryApiRequest, dependencies: { verifier: TokenVerifier; service: CourseDeliveryService }): Promise<DeliveryApiResult> {
  try {
    await authenticateAdmin(request.authorization, 'delivery:read', dependencies.verifier)
    if (!request.contentId || !uuidSchema.safeParse(request.contentId).success) return failure(422, 'V2_CONTENT_NOT_FOUND', 'A valid explicit V2 Course ID is required')
    if (request.kind === 'active') return success(await dependencies.service.active(request.contentId), 'active')
    const version = Number(request.version); if (!Number.isSafeInteger(version) || version < 1) return failure(422, 'V2_VERSION_NOT_FOUND', 'A positive publication version is required')
    if (request.kind === 'version') return success(await dependencies.service.exact(request.contentId, version), 'version')
    if (!request.assetId || !uuidSchema.safeParse(request.assetId).success) return failure(404, 'V2_ASSET_NOT_IN_MANIFEST', 'A valid version-bound asset ID is required')
    const asset = await dependencies.service.asset(request.contentId, version, request.assetId)
    return { status: 200, headers: { ...deliveryCacheHeaders('asset'), 'Content-Type': asset.contentType, 'X-Content-Type-Options': 'nosniff', 'Content-Length': String(asset.bytes.length) }, bytes: asset.bytes }
  } catch (error) {
    if (error instanceof AuthenticationError || error instanceof AuthorizationError) return failure(error instanceof AuthenticationError ? 401 : 403, 'V2_UNAUTHORIZED', 'Private V2 Course delivery authorization failed')
    if (error instanceof DeliveryError) return failure(error.status, error.code, error.message, error.details)
    if (error instanceof z.ZodError) return failure(503, 'V2_INTEGRITY_FAILURE', 'V2 Course data failed integrity validation')
    return failure(500, 'V2_DELIVERY_FAILURE', 'V2 Course delivery could not be completed')
  }
}
const success = (data: unknown, kind: 'active' | 'version'): DeliveryApiResult => ({ status: 200, headers: { ...deliveryCacheHeaders(kind), 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' }, body: { ok: true, data } })
const failure = (status: number, code: string, message: string, details?: unknown): DeliveryApiResult => ({ status, headers: { 'Cache-Control': 'private, no-store', 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' }, body: { ok: false, error: { code, message, ...(details === undefined ? {} : { details }) } } })
