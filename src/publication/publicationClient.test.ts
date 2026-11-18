import { afterEach, describe, expect, it, vi } from 'vitest'
import { PublicationApiClient, PublicationApiError, publicationErrorMessage, type PublicationPreparation } from './publicationClient'
import { publicationEntryState } from './publicationWorkflowPolicy'
import { lifecycleOperations } from './publicationWorkflowPolicy'

const preparation = (overrides: Partial<PublicationPreparation> = {}): PublicationPreparation => ({ title: 'Course', contentId: '10000000-0000-4000-8000-000000000001', contentType: 'course', actorUid: 'admin-1', draftRevision: 3, documentVersion: 2,
  draftFingerprint: `sha256:${'1'.repeat(64)}`, validationFingerprint: `sha256:${'2'.repeat(64)}`, pointerRevision: 1, currentState: 'published', currentVisibility: 'private', currentActiveVersion: 1,
  proposedVersionNumber: 2, operation: 'publish-new-version', resultingVisibility: 'private', schemaValid: true, storageReady: true, learnerRuntimeCompatible: false,
  learnerIntegrationReady: false, findings: [], assetIds: ['20000000-0000-4000-8000-000000000001'], assetManifestHash: `sha256:${'3'.repeat(64)}`,
  issuedAt: '2026-11-16T10:00:00.000Z', expiresAt: '2026-11-16T10:10:00.000Z', canPublish: true, ...overrides })

describe('publication workflow policy', () => {
  it.each(['SUPER_ADMIN', 'CONTENT_ADMIN'])('enables clean cloud drafts for %s', role => expect(publicationEntryState(role, 'cloud', 2, false)).toMatchObject({ visible: true, enabled: true }))
  it.each(['CONTENT_EDITOR', 'CONTENT_REVIEWER'])('does not expose publish for %s', role => expect(publicationEntryState(role, 'cloud', 2, false)).toMatchObject({ visible: false, enabled: false }))
  it('blocks local and dirty cloud drafts', () => { expect(publicationEntryState('SUPER_ADMIN', 'local', 1, false).enabled).toBe(false); expect(publicationEntryState('CONTENT_ADMIN', 'cloud', 1, true).enabled).toBe(false) })
  it('exposes release only for published/private and makes archive terminal', () => { expect(lifecycleOperations('published', 'private')).toEqual(['release', 'rollback', 'unpublish', 'disable', 'archive']); expect(lifecycleOperations('published', 'public')).not.toContain('release'); expect(lifecycleOperations('unpublished')).toContain('republish'); expect(lifecycleOperations('disabled')).toEqual(['rollback', 'enable', 'archive']); expect(lifecycleOperations('archived')).toEqual([]) })
})

describe('PublicationApiClient', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('invokes the default fetch implementation with the browser global as its receiver', async () => {
    const request = vi.fn(function (this: typeof globalThis, input: RequestInfo | URL, init?: RequestInit) {
      expect(this).toBe(globalThis)
      expect(input).toBe(`/api/v2/publications/${preparation().contentId}/prepare`)
      expect(init?.headers).toEqual({ Authorization: 'Bearer staging-token', 'Content-Type': 'application/json' })
      return Promise.resolve(new Response(JSON.stringify({ ok: true, data: preparation() }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
    })
    vi.stubGlobal('fetch', request)

    await expect(new PublicationApiClient(async () => 'staging-token').prepare(preparation().contentId, 3)).resolves.toMatchObject({ draftRevision: 3 })
    expect(request).toHaveBeenCalledOnce()
  })

  it('uses authoritative preparation facts in all three confirmations', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: true, data: { identity: { namespace: 'v2', contentType: 'course', contentId: preparation().contentId, publicationVersion: 2 }, pointerRevision: 2, artifactPath: 'x', artifactHash: `sha256:${'4'.repeat(64)}`, replayed: false } }), { status: 201, headers: { 'content-type': 'application/json' } }))
    const client = new PublicationApiClient(async () => 'secret-token', '/api', request), context = preparation()
    await client.publish(context.contentId, context, '30000000-0000-4000-8000-000000000001')
    const init = request.mock.calls[0][1]!, body = JSON.parse(String(init.body))
    expect(body.confirmation).toMatchObject({ actorUid: 'admin-1', draftRevision: 3, pointerRevision: 1, proposedVersionNumber: 2, completedSteps: [true, true, true] })
    expect(String((init.headers as Record<string, string>).Authorization)).not.toBe(JSON.stringify(body))
  })
  it('keeps the caller request ID available for an uncertain retry', async () => {
    const request = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('lost response')), client = new PublicationApiClient(async () => 'token', '/api', request)
    await expect(client.publish(preparation().contentId, preparation(), '30000000-0000-4000-8000-000000000001')).rejects.toMatchObject({ code: 'NETWORK_UNCERTAIN' })
  })
  it.each([['CONFIRMATION_STALE', true], ['POINTER_CONFLICT', true], ['ASSET_HASH_CHANGED', true], ['PERMISSION_DENIED', false]])('maps %s restart behavior', (code, restart) => { const error = new PublicationApiError(409, code, publicationErrorMessage(code, 'fallback')); expect(error.requiresRestart).toBe(restart) })
  it('preserves domain findings supplied by preparation', () => { const findings = [
    { domain: 'practice', severity: 'warning', path: '$.content.verification', code: 'practice.numeric-tolerance-not-supported', explanation: 'Tolerance gap', requiredAction: 'Review', evidence: 'requires-learner-implementation' },
    { domain: 'challenge', severity: 'warning', path: '$.content.rewards', code: 'challenge.reward-incompatible', explanation: 'Reward gap', requiredAction: 'Review', evidence: 'confirmed-by-inspected-source' },
    { domain: 'project', severity: 'warning', path: '$.content', code: 'project.validator-id-missing', explanation: 'Validator gap', requiredAction: 'Review', evidence: 'requires-learner-implementation' },
  ] as PublicationPreparation['findings']; expect(preparation({ findings }).findings.map(x => x.code)).toEqual(findings.map(x => x.code)) })
  it('binds lifecycle requests to authoritative pointer state and the same request ID', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: true, data: { contentId: preparation().contentId, operation: 'rollback', priorState: 'published', state: 'published', visibility: 'private', activeVersionNumber: 1, latestVersionNumber: 2, pointerRevision: 5, targetVersion: 1, occurredAt: '2026-11-16T10:00:00.000Z', replayed: false } }), { status: 200 }))
    const client = new PublicationApiClient(async () => 'token', '/api', request), pointer = { contentId: preparation().contentId, contentType: 'course' as const, state: 'published', visibility: 'private', activeVersionNumber: 2, latestVersionNumber: 2, revision: 4, updatedAt: '2026-11-16T09:00:00.000Z', updatedBy: 'admin' }
    await client.lifecycle(pointer.contentId, pointer, 'admin-1', 'rollback', '30000000-0000-4000-8000-000000000009', 1, false)
    const body = JSON.parse(String(request.mock.calls[0][1]!.body)); expect(body).toMatchObject({ expectedPointerRevision: 4, targetVersion: 1, requestId: '30000000-0000-4000-8000-000000000009', confirmation: { actorUid: 'admin-1', operation: 'rollback', currentState: 'published', currentVisibility: 'private', currentActiveVersion: 2 } })
  })
})
