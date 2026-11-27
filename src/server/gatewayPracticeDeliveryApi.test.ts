import { describe, expect, it, vi } from 'vitest'
import { handleGatewayPracticeDeliveryApi } from './gatewayPracticeDeliveryApi'

const request = (overrides: Record<string, unknown> = {}) => ({
  authorization:'Bearer service-token', correlationId:'correlation', method:'GET',
  path:'/api/v2/gateway/practice/candidates', kind:'candidates' as const, ...overrides,
})

describe('gateway Practice candidate API', () => {
  it('authenticates and serves the collection without treating candidates as a content ID', async () => {
    const verify = vi.fn(async () => ({ serviceId:'learner-gateway', correlationId:'verified-correlation' }))
    const candidates = vi.fn(async () => [{ namespace:'v2', contentType:'practice', contentId:'2d075567-672e-4f73-8dfa-f66871fc30ad', activePublicationVersion:3 }])
    const result = await handleGatewayPracticeDeliveryApi(request(), { verifier:{ verify } as never, service:{ candidates } as never })
    expect(verify).toHaveBeenCalledWith(expect.objectContaining({ authorization:'Bearer service-token', path:'/api/v2/gateway/practice/candidates' }))
    expect(candidates).toHaveBeenCalledWith('verified-correlation')
    expect(result).toMatchObject({ status:200, headers:{ 'Cache-Control':'private, no-store' }, body:{ ok:true, data:[{ contentId:'2d075567-672e-4f73-8dfa-f66871fc30ad' }] } })
  })

  it('rejects method mismatches before candidate loading', async () => {
    const candidates = vi.fn()
    const result = await handleGatewayPracticeDeliveryApi(request({ method:'POST' }), { verifier:{ verify:async () => ({ serviceId:'learner-gateway', correlationId:'correlation' }) } as never, service:{ candidates } as never })
    expect(result).toMatchObject({ status:405, body:{ error:{ code:'V2_METHOD_NOT_ALLOWED' } } })
    expect(candidates).not.toHaveBeenCalled()
  })
})
