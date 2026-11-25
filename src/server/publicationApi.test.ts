import { describe, expect, it, vi } from 'vitest'

import type { TokenVerifier } from './auth.server'
import { PublicationBackend } from './publicationBackend'
import { handlePublicationApi } from './publicationApi'
import { CourseDeliveryService, DeliveryError } from './courseDelivery'

const verifier: TokenVerifier = { verify: async () => ({ uid: 'content-admin', adminRole: 'CONTENT_ADMIN' }) }

describe('release domain publication gate', () => {
  it('restricts immutable Course adapter diagnostics to Content Admin roles', async () => {
    const backend = { contentType: vi.fn(async () => 'course'), courseAdapterDiagnostics: vi.fn(async () => ({ identity: { contentId: 'a0000000-0000-4000-8000-000000000001' }, publicationVersion: 1, findings: [{ code: 'asset.manifest-missing', path: '$.content.modules[0].lessons[0].blocks[1].data.assetId' }] })) } as unknown as PublicationBackend
    const request = { method: 'GET', action: 'diagnostics' as const, contentId: 'a0000000-0000-4000-8000-000000000001', version: '1', authorization: 'Bearer token' }
    const allowed = await handlePublicationApi(request, { verifier, backend })
    expect(allowed).toMatchObject({ status: 200, body: { data: { findings: [{ code: 'asset.manifest-missing' }] } } })
    const reviewer = await handlePublicationApi(request, { verifier: { verify: async () => ({ uid: 'reviewer', adminRole: 'CONTENT_REVIEWER' }) }, backend })
    expect(reviewer.status).toBe(403)
    expect(backend.courseAdapterDiagnostics).toHaveBeenCalledOnce()
  })
  it('reports exact immutable adapter findings and metadata to an authorized admin', async () => {
    const backend = Object.create(PublicationBackend.prototype) as PublicationBackend
    const contentId = 'a0000000-0000-4000-8000-000000000001'
    vi.spyOn(backend, 'version').mockResolvedValue({ identity: { namespace: 'v2', contentType: 'course', contentId, publicationVersion: 1 }, artifactPath: `editor-v2-publications/${contentId}/v1.json`, artifactHash: `sha256:${'a'.repeat(64)}`, assetManifest: [] })
    const exact = vi.spyOn(CourseDeliveryService.prototype, 'exact').mockRejectedValue(new DeliveryError('V2_ADAPTER_INCOMPATIBLE', 'incompatible', 422, { classification: 'requires-learner-upgrade', errors: [{ domain: 'course', code: 'course.icon-manifest-missing', severity: 'error', path: '$.content.courseIconAssetId', message: 'Missing icon.', requiredAction: 'Repair manifest.' }], warnings: [] }))
    try {
      const result = await backend.courseAdapterDiagnostics(contentId, 1)
      expect(result).toMatchObject({ identity: { contentId, publicationVersion: 1 }, publicationVersion: 1, classification: 'requires-learner-upgrade', learnerIntegrationReady: false, findings: [{ code: 'course.icon-manifest-missing', path: '$.content.courseIconAssetId', requiredAction: 'Repair manifest.' }] })
      expect(exact).toHaveBeenCalledWith(contentId, 1)
    } finally { exact.mockRestore() }
  })
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
