import type { VercelRequest, VercelResponse } from '@vercel/node'
import { describe, expect, it, vi } from 'vitest'

import { runV2AdminRouter } from './vercelV2AdminRouter'
import { runV2GatewayRouter } from './vercelV2GatewayRouter'

function request(url: string, method = 'GET'): VercelRequest {
  return { url, method, query: {}, headers: {} } as VercelRequest
}

function response() {
  const result = { status: 200, body: undefined as unknown }
  const value = {
    status(code: number) { result.status = code; return value },
    json(body: unknown) { result.body = body; return value },
  } as unknown as VercelResponse
  return { result, value }
}

function adminHandlers() {
  return {
    asset: vi.fn(async () => undefined),
    delivery: vi.fn(async () => undefined),
    draft: vi.fn(async () => undefined),
    publication: vi.fn(async () => undefined),
  }
}

describe('consolidated V2 Admin router', () => {
  it.each([
    ['/api/v2/drafts', 'draft', []],
    ['/api/v2/drafts/draft-1', 'draft', ['draft-1']],
    ['/api/v2/assets', 'asset', []],
    ['/api/v2/assets/asset-1', 'asset', ['asset-1']],
    ['/api/v2/assets/preview/asset-1', 'asset', ['asset-1', 'preview']],
    ['/api/v2/publications/course-1', 'publication', ['course-1']],
    ['/api/v2/publications/course-1/prepare', 'publication', ['course-1', 'prepare']],
    ['/api/v2/publications/course-1/publish', 'publication', ['course-1', 'publish']],
    ['/api/v2/publications/course-1/rollback', 'publication', ['course-1', 'rollback']],
    ['/api/v2/publications/course-1/unpublish', 'publication', ['course-1', 'unpublish']],
    ['/api/v2/publications/course-1/republish', 'publication', ['course-1', 'republish']],
    ['/api/v2/publications/course-1/disable', 'publication', ['course-1', 'disable']],
    ['/api/v2/publications/course-1/enable', 'publication', ['course-1', 'enable']],
    ['/api/v2/publications/course-1/archive', 'publication', ['course-1', 'archive']],
    ['/api/v2/publications/course-1/versions', 'publication', ['course-1', 'versions']],
    ['/api/v2/publications/course-1/versions/7', 'publication', ['course-1', 'versions', '7']],
    ['/api/v2/publications/course-1/versions/7/integrity', 'publication', ['course-1', 'integrity', '7']],
  ] as const)('preserves %s', async (url, target, expected) => {
    const handlers = adminHandlers()
    const res = response()
    await runV2AdminRouter(request(url), res.value, handlers)
    expect(handlers[target]).toHaveBeenCalledOnce()
    expect(handlers[target].mock.calls[0]?.slice(2)).toEqual(expected)
  })

  it.each([
    ['/api/v2/delivery/courses/course-1', 'active', { contentId: 'course-1' }],
    ['/api/v2/delivery/courses/course-1/versions/7', 'version', { contentId: 'course-1', version: '7' }],
    ['/api/v2/delivery/courses/course-1/versions/7/assets/a-1', 'asset', { contentId: 'course-1', version: '7', assetId: 'a-1' }],
  ] as const)('preserves private delivery route %s', async (url, kind, query) => {
    const handlers = adminHandlers()
    const req = request(url)
    await runV2AdminRouter(req, response().value, handlers)
    expect(handlers.delivery).toHaveBeenCalledWith(req, expect.anything(), kind)
    expect(req.query).toEqual(query)
  })

  it('keeps gateway routes outside the Firebase Admin auth boundary', async () => {
    const handlers = adminHandlers()
    const res = response()
    await runV2AdminRouter(request('/api/v2/gateway/courses/course-1'), res.value, handlers)
    expect(res.result.status).toBe(404)
    expect(Object.values(handlers).every((handler) => handler.mock.calls.length === 0)).toBe(true)
  })

  it('returns a sanitized 404 for unknown and malformed routes', async () => {
    for (const url of ['/api/v2/unknown', '/api/v2/drafts/one/extra', '/api/v2/drafts/%']) {
      const res = response()
      await runV2AdminRouter(request(url), res.value, adminHandlers())
      expect(res.result).toEqual({ status: 404, body: { ok: false, error: { code: 'ROUTE_NOT_FOUND', message: 'V2 API route not found' } } })
    }
  })
})

describe('consolidated V2 gateway router', () => {
  it.each([
    ['/api/v2/gateway/courses/course-1', 'active', { contentId: 'course-1' }],
    ['/api/v2/gateway/courses/course-1/versions/7', 'version', { contentId: 'course-1', version: '7' }],
    ['/api/v2/gateway/courses/course-1/versions/7/assets/a-1', 'asset', { contentId: 'course-1', version: '7', assetId: 'a-1' }],
  ] as const)('preserves service-auth route %s', async (url, kind, query) => {
    const handler = vi.fn(async () => undefined)
    const req = request(url)
    await runV2GatewayRouter(req, response().value, handler)
    expect(handler).toHaveBeenCalledWith(req, expect.anything(), kind)
    expect(req.query).toEqual(query)
  })

  it('does not accept Admin or unknown V2 routes', async () => {
    const handler = vi.fn(async () => undefined)
    for (const url of ['/api/v2/drafts', '/api/v2/delivery/courses/course-1', '/api/v2/gateway/unknown']) {
      const res = response()
      await runV2GatewayRouter(request(url), res.value, handler)
      expect(res.result.status).toBe(404)
    }
    expect(handler).not.toHaveBeenCalled()
  })

  it('canonicalizes the internal rewrite path before service verification', async () => {
    const handler = vi.fn(async () => undefined)
    const req = request('/api/internal-v2-gateway/courses/course-1?source=preview')
    await runV2GatewayRouter(req, response().value, handler)
    expect(req.url).toBe('/api/v2/gateway/courses/course-1?source=preview')
    expect(handler).toHaveBeenCalledWith(req, expect.anything(), 'active')
  })
})
