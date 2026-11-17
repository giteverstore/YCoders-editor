import { describe, expect, it } from 'vitest'
import { assetDeliveryDescriptor } from '../integration/learnerAdapters'
import { handleCourseDeliveryApi } from './courseDeliveryApi'
import { DeliveryError, deliveryCacheHeaders, isActivelyDiscoverable, resolveAssetDeliveryEndpoint } from './courseDelivery'

describe('private Course delivery policy', () => {
  it('requires published/public for active discovery only', () => { expect(isActivelyDiscoverable('published', 'public')).toBe(true); for (const [state, visibility] of [['published', 'private'], ['unpublished', 'hidden'], ['disabled', 'hidden'], ['archived', 'hidden']]) expect(isActivelyDiscoverable(state, visibility)).toBe(false) })
  it('maps semantic asset descriptors to explicit exact-version endpoints', () => { const descriptor = assetDeliveryDescriptor('v2', '10000000-0000-4000-8000-000000000001', 7, '20000000-0000-4000-8000-000000000001'); expect(resolveAssetDeliveryEndpoint(descriptor)).toBe('/api/v2/delivery/courses/10000000-0000-4000-8000-000000000001/versions/7/assets/20000000-0000-4000-8000-000000000001') })
  it('uses conservative cache headers by response class', () => { expect(deliveryCacheHeaders('active')).toEqual({ 'Cache-Control': 'private, no-store' }); expect(deliveryCacheHeaders('version')).toMatchObject({ 'Cache-Control': 'private, no-cache', Vary: 'Authorization' }); expect(deliveryCacheHeaders('asset')).toMatchObject({ Vary: 'Authorization' }) })
  it('maps authentication and typed delivery failures without leaking internals', async () => {
    const service = { active: async () => { throw new Error('should not run') } }
    const unauthorized = await handleCourseDeliveryApi({ kind: 'active', contentId: '10000000-0000-4000-8000-000000000001' }, { verifier: { verify: async () => ({ uid: 'x' }) }, service: service as never }); expect(unauthorized).toMatchObject({ status: 401, body: { error: { code: 'V2_UNAUTHORIZED' } } })
    const failed = await handleCourseDeliveryApi({ kind: 'active', contentId: '10000000-0000-4000-8000-000000000001', authorization: 'Bearer token' }, { verifier: { verify: async () => ({ uid: 'x', adminRole: 'CONTENT_REVIEWER' }) }, service: { active: async () => { throw new DeliveryError('V2_NOT_DISCOVERABLE', 'hidden', 404) } } as never }); expect(failed).toMatchObject({ status: 404, body: { error: { code: 'V2_NOT_DISCOVERABLE', message: 'hidden' } } }); expect(JSON.stringify(failed)).not.toContain('objectPath')
  })
})
