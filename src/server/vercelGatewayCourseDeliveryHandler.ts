import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getCourseDeliveryServerDependencies } from './firebaseAdmin.server'
import { handleGatewayCourseDeliveryApi, type GatewayDeliveryRequest } from './gatewayCourseDeliveryApi'
import { createGatewayServiceVerifier } from './gatewayServiceAuth'

export async function runGatewayCourseDeliveryHandler(request: VercelRequest, response: VercelResponse, kind: GatewayDeliveryRequest['kind']) {
  const startedAt = Date.now()
  try {
    const authorization = Array.isArray(request.headers.authorization) ? request.headers.authorization[0] : request.headers.authorization
    const correlationId = Array.isArray(request.headers['x-correlation-id']) ? request.headers['x-correlation-id'][0] : request.headers['x-correlation-id']
    const value = (name: string) => Array.isArray(request.query[name]) ? request.query[name]![0] : request.query[name]
    const baseVerifier = createGatewayServiceVerifier(); let serviceId = 'unverified'
    const verifier = { verify: async (context: Parameters<typeof baseVerifier.verify>[0]) => { const principal = await baseVerifier.verify(context); serviceId = principal.serviceId; return principal } }
    const contentId = value('contentId'), version = value('version')
    const result = await handleGatewayCourseDeliveryApi({ authorization, correlationId, method: request.method ?? 'GET', path: request.url?.split('?')[0] ?? '/', contentId, version, assetId: value('assetId'), kind }, { ...getCourseDeliveryServerDependencies(), verifier })
    console.info('v2_gateway.delivery', { serviceId, namespace:'v2', contentType:'course', contentId, requestedPublicationVersion:version ?? null, mode:kind === 'active' ? 'active' : 'exact', resultCode:result.status, correlationId:correlationId ?? null, latencyMs:Date.now()-startedAt })
    Object.entries(result.headers).forEach(([name, header]) => response.setHeader(name, header))
    if (result.bytes) response.status(result.status).send(Buffer.from(result.bytes)); else response.status(result.status).json(result.body)
  } catch { response.status(503).setHeader('Cache-Control', 'private, no-store').json({ ok: false, error: { code: 'V2_DELIVERY_FAILURE', message: 'V2 gateway delivery is unavailable' } }) }
}
