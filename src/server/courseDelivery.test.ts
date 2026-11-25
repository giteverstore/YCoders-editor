import { describe, expect, it, vi } from 'vitest'
import { assetDeliveryDescriptor } from '../integration/learnerAdapters'
import { handleCourseDeliveryApi } from './courseDeliveryApi'
import { DeliveryError, deliveryCacheHeaders, isActivelyDiscoverable, resolveAssetDeliveryEndpoint } from './courseDelivery'
import { handleGatewayCourseDeliveryApi } from './gatewayCourseDeliveryApi'

describe('private Course delivery policy', () => {
  it('requires published/public for active discovery only', () => { expect(isActivelyDiscoverable('published', 'public')).toBe(true); for (const [state, visibility] of [['published', 'private'], ['unpublished', 'hidden'], ['disabled', 'hidden'], ['archived', 'hidden']]) expect(isActivelyDiscoverable(state, visibility)).toBe(false) })
  it('maps semantic asset descriptors to explicit exact-version endpoints', () => { const descriptor = assetDeliveryDescriptor('v2', '10000000-0000-4000-8000-000000000001', 7, '20000000-0000-4000-8000-000000000001'); expect(resolveAssetDeliveryEndpoint(descriptor)).toBe('/api/v2/delivery/courses/10000000-0000-4000-8000-000000000001/versions/7/assets/20000000-0000-4000-8000-000000000001') })
  it('uses conservative cache headers by response class', () => { expect(deliveryCacheHeaders('active')).toEqual({ 'Cache-Control': 'private, no-store' }); expect(deliveryCacheHeaders('version')).toMatchObject({ 'Cache-Control': 'private, no-cache', Vary: 'Authorization' }); expect(deliveryCacheHeaders('asset')).toMatchObject({ Vary: 'Authorization' }) })
  it('maps authentication and typed delivery failures without leaking internals', async () => {
    const service = { active: async () => { throw new Error('should not run') } }
    const unauthorized = await handleCourseDeliveryApi({ kind: 'active', contentId: '10000000-0000-4000-8000-000000000001' }, { verifier: { verify: async () => ({ uid: 'x' }) }, service: service as never }); expect(unauthorized).toMatchObject({ status: 401, body: { error: { code: 'V2_UNAUTHORIZED' } } })
    const failed = await handleCourseDeliveryApi({ kind: 'active', contentId: '10000000-0000-4000-8000-000000000001', authorization: 'Bearer token' }, { verifier: { verify: async () => ({ uid: 'x', adminRole: 'CONTENT_REVIEWER' }) }, service: { active: async () => { throw new DeliveryError('V2_NOT_DISCOVERABLE', 'hidden', 404) } } as never }); expect(failed).toMatchObject({ status: 404, body: { error: { code: 'V2_NOT_DISCOVERABLE', message: 'hidden' } } }); expect(JSON.stringify(failed)).not.toContain('objectPath')
  })
  it('keeps adapter findings in server diagnostics and out of learner responses', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const request = { kind: 'version' as const, method: 'GET', path: '/api/v2/gateway/courses/10000000-0000-4000-8000-000000000001/versions/1', contentId: '10000000-0000-4000-8000-000000000001', version: '1', correlationId: 'correlation' }
    try {
      const result = await handleGatewayCourseDeliveryApi(request, { verifier: { verify: async () => ({ serviceId: 'gateway', environment: 'production', correlationId: 'correlation' }) } as never, service: { exact: async () => { throw new DeliveryError('V2_ADAPTER_INCOMPATIBLE', 'V2 Course cannot be represented by the current learner contract', 422, { errors: [{ code: 'asset.external', path: '$.private', message: 'secret' }] }) } } as never })
      expect(result).toMatchObject({ status: 422, body: { error: { code: 'V2_ADAPTER_INCOMPATIBLE' } } })
      expect(JSON.stringify(result.body)).not.toMatch(/secret|private|details/)
      expect(warning).toHaveBeenCalledWith('v2_gateway.adapter_incompatible', expect.objectContaining({ contentId: request.contentId, publicationVersion: '1', findings: [{ code: 'asset.external', path: '$.private' }], correlationId: 'correlation' }))
    } finally { warning.mockRestore() }
  })
})
