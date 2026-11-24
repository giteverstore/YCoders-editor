import { describe, expect, it, vi } from 'vitest'

import type { TokenVerifier } from './auth.server'
import type { PublicationBackend } from './publicationBackend'
import { handlePublicationApi } from './publicationApi'

const verifier: TokenVerifier = { verify: async () => ({ uid: 'content-admin', adminRole: 'CONTENT_ADMIN' }) }

describe('release domain publication gate', () => {
  it.each(['challenge', 'project'] as const)('blocks direct publication operations for %s', async (contentType) => {
    const backend = {
      contentType: vi.fn(async () => contentType),
      prepare: vi.fn(),
      publish: vi.fn(),
      lifecycle: vi.fn(),
    } as unknown as PublicationBackend

    const result = await handlePublicationApi({
      method: 'POST',
      authorization: 'Bearer valid-token',
      contentId: 'a0000000-0000-4000-8000-000000000001',
      action: 'prepare',
      body: { expectedDraftRevision: 1 },
    }, { verifier, backend })

    expect(result).toMatchObject({ status: 403, body: { error: { code: 'DOMAIN_WORK_IN_PROGRESS' } } })
    expect(backend.contentType).toHaveBeenCalledOnce()
    expect(backend.prepare).not.toHaveBeenCalled()
    expect(backend.publish).not.toHaveBeenCalled()
    expect(backend.lifecycle).not.toHaveBeenCalled()
  })
})
