import { describe, expect, it, vi } from 'vitest'

import { handleGatewayCourseDeliveryApi } from './gatewayCourseDeliveryApi'
import { GatewayServiceAuthError } from './gatewayServiceAuth'
import { createLazyCourseDeliveryService } from './vercelGatewayCourseDeliveryHandler'

describe('Vercel gateway delivery initialization', () => {
  it('verifies the service identity before initializing privileged delivery dependencies', async () => {
    const factory = vi.fn()
    const result = await handleGatewayCourseDeliveryApi({
      kind: 'active',
      method: 'GET',
      path: '/api/v2/gateway/courses/00000000-0000-4000-8000-000000000000',
      contentId: '00000000-0000-4000-8000-000000000000',
      correlationId: 'missing-token',
    }, {
      verifier: { verify: async () => { throw new GatewayServiceAuthError('GATEWAY_SERVICE_UNAUTHENTICATED', 'Google service identity is required') } },
      service: createLazyCourseDeliveryService(factory),
    })

    expect(result).toMatchObject({ status: 401, body: { error: { code: 'GATEWAY_SERVICE_UNAUTHENTICATED' } } })
    expect(factory).not.toHaveBeenCalled()
  })
})
