import type { VercelRequest, VercelResponse } from '@vercel/node'

import { runGatewayCourseDeliveryHandler } from './vercelGatewayCourseDeliveryHandler.js'

type GatewayHandler = typeof runGatewayCourseDeliveryHandler

export async function runV2GatewayRouter(request: VercelRequest, response: VercelResponse, handler: GatewayHandler = runGatewayCourseDeliveryHandler): Promise<void> {
  const path = pathSegments(request)
  if (!path || path[0] !== 'api' || path[1] !== 'v2' || path[2] !== 'gateway' || path[3] !== 'courses' || !path[4]) return notFound(response)
  if (path.length === 5) return runDelivery(request, response, handler, 'active', path[4])
  if (path.length === 7 && path[5] === 'versions') return runDelivery(request, response, handler, 'version', path[4], path[6])
  if (path.length === 9 && path[5] === 'versions' && path[7] === 'assets') return runDelivery(request, response, handler, 'asset', path[4], path[6], path[8])
  return notFound(response)
}

function runDelivery(request: VercelRequest, response: VercelResponse, handler: GatewayHandler, kind: 'active' | 'version' | 'asset', contentId: string, version?: string, assetId?: string) {
  request.query = { ...request.query, contentId, ...(version ? { version } : {}), ...(assetId ? { assetId } : {}) }
  return handler(request, response, kind)
}

function pathSegments(request: VercelRequest): string[] | undefined {
  try {
    return new URL(request.url ?? '/', 'https://v2-router.invalid').pathname.split('/').filter(Boolean).map(decodeURIComponent)
  } catch {
    return undefined
  }
}

function notFound(response: VercelResponse): void {
  response.status(404).json({ ok: false, error: { code: 'ROUTE_NOT_FOUND', message: 'V2 gateway route not found' } })
}
