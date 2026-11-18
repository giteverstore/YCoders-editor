import type { VercelRequest, VercelResponse } from '@vercel/node'

import { runVercelAssetHandler } from './vercelAssetHandler.js'
import { runCourseDeliveryHandler } from './vercelCourseDeliveryHandler.js'
import { runVercelDraftHandler } from './vercelDraftHandler.js'
import { runVercelPublicationHandler } from './vercelPublicationHandler.js'

type AdminRouterHandlers = {
  asset: typeof runVercelAssetHandler
  delivery: typeof runCourseDeliveryHandler
  draft: typeof runVercelDraftHandler
  publication: typeof runVercelPublicationHandler
}

const defaultHandlers: AdminRouterHandlers = {
  asset: runVercelAssetHandler,
  delivery: runCourseDeliveryHandler,
  draft: runVercelDraftHandler,
  publication: runVercelPublicationHandler,
}

const publicationActions = new Set(['prepare', 'publish', 'rollback', 'unpublish', 'republish', 'disable', 'enable', 'archive'] as const)
type PublicationAction = 'prepare' | 'publish' | 'rollback' | 'unpublish' | 'republish' | 'disable' | 'enable' | 'archive'

export async function runV2AdminRouter(
  request: VercelRequest,
  response: VercelResponse,
  handlers: AdminRouterHandlers = defaultHandlers,
): Promise<void> {
  const segments = canonicalAdminSegments(request)
  if (!segments || segments[0] !== 'api' || segments[1] !== 'v2') return notFound(response)
  const path = segments.slice(2)

  if (path[0] === 'gateway') return notFound(response)
  if (path.length === 1 && path[0] === 'drafts') return handlers.draft(request, response)
  if (path.length === 2 && path[0] === 'drafts') return handlers.draft(request, response, path[1])
  if (path.length === 1 && path[0] === 'assets') return handlers.asset(request, response)
  if (path.length === 2 && path[0] === 'assets') return handlers.asset(request, response, path[1])
  if (path.length === 3 && path[0] === 'assets' && path[1] === 'preview') return handlers.asset(request, response, path[2], 'preview')

  if (path[0] === 'publications' && path[1]) {
    const contentId = path[1]
    if (path.length === 2) return handlers.publication(request, response, contentId)
    if (path.length === 3 && publicationActions.has(path[2] as PublicationAction)) {
      return handlers.publication(request, response, contentId, path[2] as PublicationAction)
    }
    if (path[2] === 'versions') {
      if (path.length === 3) return handlers.publication(request, response, contentId, 'versions')
      if (path.length === 4) return handlers.publication(request, response, contentId, 'versions', path[3])
      if (path.length === 5 && path[4] === 'integrity') return handlers.publication(request, response, contentId, 'integrity', path[3])
    }
  }

  if (path[0] === 'delivery' && path[1] === 'courses' && path[2]) {
    if (path.length === 3) return runDelivery(request, response, handlers, 'active', path[2])
    if (path.length === 5 && path[3] === 'versions') return runDelivery(request, response, handlers, 'version', path[2], path[4])
    if (path.length === 7 && path[3] === 'versions' && path[5] === 'assets') return runDelivery(request, response, handlers, 'asset', path[2], path[4], path[6])
  }

  return notFound(response)
}

function canonicalAdminSegments(request: VercelRequest): string[] | undefined {
  const segments = pathSegments(request)
  if (segments?.[0] !== 'api' || segments[1] !== 'internal-v2-admin') return segments
  const adminPath = queryValue(request, 'adminPath')
  if (!adminPath) return undefined
  try {
    const publicSegments = adminPath.split('/').filter(Boolean).map(decodeURIComponent)
    const query = { ...request.query }
    delete query.adminPath
    request.query = query
    const search = new URLSearchParams()
    for (const [name, value] of Object.entries(query)) for (const item of Array.isArray(value) ? value : [value]) if (item != null) search.append(name, String(item))
    request.url = `/api/v2/${publicSegments.map(encodeURIComponent).join('/')}${search.size ? `?${search}` : ''}`
    return ['api', 'v2', ...publicSegments]
  } catch {
    return undefined
  }
}

function queryValue(request: VercelRequest, name: string): string | undefined {
  const value = request.query[name]
  return Array.isArray(value) ? value[0] : value
}

function runDelivery(request: VercelRequest, response: VercelResponse, handlers: AdminRouterHandlers, kind: 'active' | 'version' | 'asset', contentId: string, version?: string, assetId?: string) {
  request.query = { ...request.query, contentId, ...(version ? { version } : {}), ...(assetId ? { assetId } : {}) }
  return handlers.delivery(request, response, kind)
}

function pathSegments(request: VercelRequest): string[] | undefined {
  try {
    return new URL(request.url ?? '/', 'https://v2-router.invalid').pathname.split('/').filter(Boolean).map(decodeURIComponent)
  } catch {
    return undefined
  }
}

function notFound(response: VercelResponse): void {
  response.status(404).json({ ok: false, error: { code: 'ROUTE_NOT_FOUND', message: 'V2 API route not found' } })
}
