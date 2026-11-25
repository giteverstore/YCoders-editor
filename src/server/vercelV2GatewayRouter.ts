import type { VercelRequest, VercelResponse } from '@vercel/node'

import { runGatewayCourseDeliveryHandler } from './vercelGatewayCourseDeliveryHandler.js'
import { runGatewayPracticeDeliveryHandler } from './vercelGatewayPracticeDeliveryHandler.js'

type GatewayHandler = typeof runGatewayCourseDeliveryHandler
type GatewayHandlers = { courses: GatewayHandler; practice: GatewayHandler }

export async function runV2GatewayRouter(request: VercelRequest, response: VercelResponse, handlers: GatewayHandler | GatewayHandlers = { courses: runGatewayCourseDeliveryHandler, practice: runGatewayPracticeDeliveryHandler }): Promise<void> {
  let path = pathSegments(request)
  const publicRoute = path?.[0] === 'api' && path[1] === 'v2' && path[2] === 'gateway'
  const internalRoute = path?.[0] === 'api' && path[1] === 'internal-v2-gateway'
  const gatewayPath = queryValue(request, 'gatewayPath')
  if (internalRoute && gatewayPath) {
    const gatewaySegments = gatewayPath.split('/').filter(Boolean).map(decodeURIComponent)
    path = ['api', 'internal-v2-gateway', ...gatewaySegments]
    request.url = `/api/v2/gateway/${gatewayPath}`
  }
  const offset = publicRoute ? 3 : internalRoute ? 2 : -1
  if (!path || offset < 0 || !['courses', 'practice'].includes(path[offset] ?? '')) return notFound(response)
  const handler = typeof handlers === 'function' ? handlers : handlers[path[offset] as keyof GatewayHandlers]
  if (internalRoute && !gatewayPath) request.url = request.url?.replace(/^\/api\/internal-v2-gateway/, '/api/v2/gateway')
  if (path[offset] === 'courses' && path.length === offset + 1) return runDelivery(request, response, handler, 'catalog')
  if (!path[offset + 1]) return notFound(response)
  if (path.length === offset + 2) return runDelivery(request, response, handler, 'active', path[offset + 1])
  if (path.length === offset + 4 && path[offset + 2] === 'versions') return runDelivery(request, response, handler, 'version', path[offset + 1], path[offset + 3])
  if (path.length === offset + 6 && path[offset + 2] === 'versions' && path[offset + 4] === 'assets') return runDelivery(request, response, handler, 'asset', path[offset + 1], path[offset + 3], path[offset + 5])
  return notFound(response)
}

function runDelivery(request: VercelRequest, response: VercelResponse, handler: GatewayHandler, kind: 'catalog' | 'active' | 'version' | 'asset', contentId?: string, version?: string, assetId?: string) {
  request.query = { ...request.query, ...(contentId ? { contentId } : {}), ...(version ? { version } : {}), ...(assetId ? { assetId } : {}) }
  return handler(request, response, kind)
}

function pathSegments(request: VercelRequest): string[] | undefined {
  try {
    return new URL(request.url ?? '/', 'https://v2-router.invalid').pathname.split('/').filter(Boolean).map(decodeURIComponent)
  } catch {
    return undefined
  }
}

function queryValue(request: VercelRequest, name: string): string | undefined {
  const value = request.query[name]
  return Array.isArray(value) ? value[0] : value
}

function notFound(response: VercelResponse): void {
  response.status(404).json({ ok: false, error: { code: 'ROUTE_NOT_FOUND', message: 'V2 gateway route not found' } })
}
