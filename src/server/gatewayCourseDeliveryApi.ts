import { z } from 'zod'
import { uuidSchema } from '../content/core/identifiers.js'
import { CourseDeliveryService, DeliveryError, deliveryCacheHeaders, normalizeCourseCatalogLimit } from './courseDelivery.js'
import { GatewayServiceAuthError, type GatewayServiceVerifier } from './gatewayServiceAuth.js'

export type GatewayDeliveryRequest = { authorization?: string; correlationId?: string; method: string; path: string; contentId?: string; version?: string; assetId?: string; limit?: string; kind: 'catalog'|'active'|'version'|'asset' }
export type GatewayDeliveryResult = { status: number; headers: Record<string,string>; body?: unknown; bytes?: Uint8Array }

export async function handleGatewayCourseDeliveryApi(request: GatewayDeliveryRequest, dependencies: { verifier: GatewayServiceVerifier; service: CourseDeliveryService }): Promise<GatewayDeliveryResult> {
  try {
    const principal = await dependencies.verifier.verify({ authorization: request.authorization, method: request.method, path: request.path, correlationId: request.correlationId })
    if (request.kind === 'catalog' && request.method !== 'GET') return failure(405, 'V2_METHOD_NOT_ALLOWED', 'Use GET for the V2 Course catalog', principal.correlationId)
    if (request.kind === 'catalog') return success(await dependencies.service.catalog(normalizeCourseCatalogLimit(request.limit)), 'catalog', principal.correlationId)
    if (!request.contentId || !uuidSchema.safeParse(request.contentId).success) return failure(422, 'V2_CONTENT_NOT_FOUND', 'A valid explicit V2 Course ID is required', principal.correlationId)
    if (process.env.VERCEL_ENV === 'preview' && request.kind === 'active' && request.contentId === '00000000-0000-4000-8000-000000000000') {
      await dependencies.service.backendReadinessProbe()
      console.info('v2_gateway.backend_readiness', { firestore: 'connected', storage: 'connected', correlationId: principal.correlationId })
      return failure(404, 'V2_CONTENT_NOT_FOUND', 'V2 Course not found', principal.correlationId)
    }
    if (request.kind === 'active') return success(await dependencies.service.active(request.contentId), 'active', principal.correlationId)
    const version = Number(request.version); if (!Number.isSafeInteger(version) || version < 1) return failure(422, 'V2_VERSION_NOT_FOUND', 'A positive publication version is required', principal.correlationId)
    if (request.kind === 'version') return success(await dependencies.service.exact(request.contentId, version), 'version', principal.correlationId)
    if (!request.assetId || !uuidSchema.safeParse(request.assetId).success) return failure(404, 'V2_ASSET_NOT_IN_MANIFEST', 'A valid version-bound asset ID is required', principal.correlationId)
    const asset = await dependencies.service.asset(request.contentId, version, request.assetId)
    return { status: 200, headers: { ...deliveryCacheHeaders('asset'), 'Content-Type': asset.contentType, 'X-Content-Type-Options': 'nosniff', 'Content-Length': String(asset.bytes.length), 'X-Correlation-Id': principal.correlationId }, bytes: asset.bytes }
  } catch (error) {
    if (error instanceof GatewayServiceAuthError) return failure(error.status, error.code, error.message, request.correlationId)
    if (error instanceof DeliveryError) return failure(error.status, error.code, error.message, request.correlationId, error.details)
    if (error instanceof z.ZodError) return failure(503, 'V2_INTEGRITY_FAILURE', 'V2 Course data failed integrity validation', request.correlationId)
    const classified = error as { name?: unknown; code?: unknown }
    console.error('v2_gateway.backend_failure', { name: typeof classified?.name === 'string' ? classified.name : 'Error', code: typeof classified?.code === 'string' || typeof classified?.code === 'number' ? classified.code : 'unknown' })
    return failure(500, 'V2_DELIVERY_FAILURE', 'V2 Course gateway delivery could not be completed', request.correlationId)
  }
}
const success = (data: unknown, kind: 'catalog'|'active'|'version', correlationId: string): GatewayDeliveryResult => ({ status: 200, headers: { ...deliveryCacheHeaders(kind), 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff', 'X-Correlation-Id': correlationId }, body: { ok: true, data } })
const failure = (status: number, code: string, message: string, correlationId?: string, details?: unknown): GatewayDeliveryResult => ({ status, headers: { 'Cache-Control': 'private, no-store', 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff', ...(correlationId ? { 'X-Correlation-Id': correlationId } : {}) }, body: { ok: false, error: { code, message, ...(correlationId ? { correlationId } : {}), ...(details === undefined ? {} : { details }) } } })
