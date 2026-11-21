import { z } from 'zod'
import { uuidSchema } from '../content/core/identifiers.js'
import { DeliveryError } from './courseDelivery.js'
import { PracticeDeliveryService, deliveryCacheHeaders } from './practiceDelivery.js'
import { GatewayServiceAuthError, type GatewayServiceVerifier } from './gatewayServiceAuth.js'
import type { GatewayDeliveryRequest, GatewayDeliveryResult } from './gatewayCourseDeliveryApi.js'

export async function handleGatewayPracticeDeliveryApi(request: GatewayDeliveryRequest, dependencies: { verifier: GatewayServiceVerifier; service: PracticeDeliveryService }): Promise<GatewayDeliveryResult> {
  try {
    const principal = await dependencies.verifier.verify({ authorization: request.authorization, method: request.method, path: request.path, correlationId: request.correlationId })
    if (!request.contentId || !uuidSchema.safeParse(request.contentId).success) return failure(422, 'V2_CONTENT_NOT_FOUND', 'A valid explicit V2 Practice ID is required', principal.correlationId)
    if (request.kind === 'active') return success(await dependencies.service.active(request.contentId), 'active', principal.correlationId)
    const version = Number(request.version); if (!Number.isSafeInteger(version) || version < 1) return failure(422, 'V2_VERSION_NOT_FOUND', 'A positive publication version is required', principal.correlationId)
    if (request.kind === 'version') return success(await dependencies.service.exact(request.contentId, version), 'version', principal.correlationId)
    if (!request.assetId || !uuidSchema.safeParse(request.assetId).success) return failure(404, 'V2_ASSET_NOT_IN_MANIFEST', 'A valid version-bound asset ID is required', principal.correlationId)
    const asset = await dependencies.service.asset(request.contentId, version, request.assetId)
    return { status: 200, headers: { ...deliveryCacheHeaders('asset'), 'Content-Type': asset.contentType, 'X-Content-Type-Options': 'nosniff', 'Content-Length': String(asset.bytes.length), 'X-Correlation-Id': principal.correlationId }, bytes: asset.bytes }
  } catch (error) {
    if (error instanceof GatewayServiceAuthError) return failure(error.status, error.code, error.message, request.correlationId)
    if (error instanceof DeliveryError) return failure(error.status, error.code, error.message, request.correlationId, error.details)
    if (error instanceof z.ZodError) return failure(503, 'V2_INTEGRITY_FAILURE', 'V2 Practice data failed integrity validation', request.correlationId)
    return failure(500, 'V2_DELIVERY_FAILURE', 'V2 Practice gateway delivery could not be completed', request.correlationId)
  }
}
const success = (data: unknown, kind: 'active'|'version', correlationId: string): GatewayDeliveryResult => ({ status: 200, headers: { ...deliveryCacheHeaders(kind), 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff', 'X-Correlation-Id': correlationId }, body: { ok: true, data } })
const failure = (status: number, code: string, message: string, correlationId?: string, details?: unknown): GatewayDeliveryResult => ({ status, headers: { 'Cache-Control': 'private, no-store', 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff', ...(correlationId ? { 'X-Correlation-Id': correlationId } : {}) }, body: { ok: false, error: { code, message, ...(correlationId ? { correlationId } : {}), ...(details === undefined ? {} : { details }) } } })
