import { afterEach, describe, expect, it, vi } from 'vitest'

import { V2DraftApiClient } from './draftApiClient'

describe('V2DraftApiClient browser fetch binding', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('invokes the default fetch implementation with the browser global as its receiver', async () => {
    const request = vi.fn(function (this: typeof globalThis, input: RequestInfo | URL, init?: RequestInit) {
      expect(this).toBe(globalThis)
      expect(input).toBe('/api/v2/drafts?contentType=course')
      expect(init?.headers).toEqual({ Authorization: 'Bearer staging-token' })
      return Promise.resolve(new Response(JSON.stringify({ ok: true, data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
    })
    vi.stubGlobal('fetch', request)

    await expect(new V2DraftApiClient(async () => 'staging-token').list()).resolves.toEqual([])
    expect(request).toHaveBeenCalledOnce()
  })
})
