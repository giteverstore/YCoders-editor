import { describe, expect, it, vi } from 'vitest'

import type { PracticeDocument } from '../content/core/envelope'
import { validPracticeDocument } from '../content/fixtures/validDocuments'
import { adaptPractice } from '../integration/learnerAdapters'
import type { AdapterSource } from '../integration/learnerAdapter.types'
import { DeterministicFakePracticeExecutor, PracticeVerificationService, createTrustedPracticeProjection, practiceVerificationSubmissionSchema, type ChallengeAssignmentResolver, type ImmutablePracticePublication, type IsolatedPracticeExecutor, type PracticePublicationResolver } from './practiceVerification'

const contentId = validPracticeDocument.id
const privateTest = { id: '80000000-0000-4000-8000-000000000001', label: 'Private empty input', mode: 'function' as const, arguments: [{ type: 'string' as const, value: '' }], expectedResult: { type: 'string' as const, value: '' }, comparison: { kind: 'json-equivalent' as const } }
const submission = { practiceContentId: contentId, publicationVersion: 7, language: 'typescript' as const, sourceCode: 'export const reverse = value => [...value].reverse().join("")' }

function publication(version = 7): ImmutablePracticePublication {
  const document: PracticeDocument = structuredClone(validPracticeDocument)
  document.content.trustedVerification = { policyVersion: 'practice-verifier-v1', privateTests: [privateTest], limits: { timeoutMs: 3000, memoryMb: 128, outputBytes: 65536 } }
  return { contentId, publicationVersion: version, documentHash: `sha256:${'a'.repeat(64)}`, document }
}
function resolver(value: ImmutablePracticePublication | null = publication()): PracticePublicationResolver { return { resolvePracticeVersion: vi.fn(async () => value) } }
const assignment: ChallengeAssignmentResolver = { resolveForLearner: vi.fn(async (id, uid) => ({ assignmentId: id, learnerUid: uid, practiceContentId: contentId, publicationVersion: 7, status: 'assigned' as const, aiEnabled: false as const })) }

describe('trusted Practice verification projection', () => {
  it('keeps private tests and reference solutions in the server projection but out of learner delivery', () => {
    const source = publication()
    const projection = createTrustedPracticeProjection(source, 'typescript')
    expect(projection).toMatchObject({ ok: true, value: { publicationVersion: 7, privateTests: [{ label: 'Private empty input' }], referenceSolution: expect.stringContaining('reverse') } })
    const adapted = adaptPractice({ identity: { namespace: 'v2', contentType: 'practice', contentId, publicationVersion: 7 }, document: source.document, assetManifest: [] } satisfies AdapterSource<PracticeDocument>)
    expect(adapted.ok).toBe(true)
    expect(JSON.stringify(adapted)).not.toMatch(/Private empty input|trustedVerification|referenceSolutions/)
  })

  it('rejects missing and malformed verification material without changing historical document validity', () => {
    expect(createTrustedPracticeProjection({ ...publication(), document: structuredClone(validPracticeDocument) as PracticeDocument }, 'typescript')).toEqual({ ok: false, reason: 'verification-material-missing' })
    const malformed = publication(); malformed.document.content.trustedVerification!.privateTests = []
    expect(createTrustedPracticeProjection(malformed, 'typescript')).toEqual({ ok: false, reason: 'verification-material-missing' })
  })
})

describe('PracticeVerificationService', () => {
  it('requires verified identity and rejects browser-controlled authority fields', async () => {
    const service = new PracticeVerificationService(resolver(), new DeterministicFakePracticeExecutor({ outcome: 'passed' }))
    await expect(service.verify(null, submission)).resolves.toEqual({ verified: false, reason: 'invalid-request' })
    for (const injected of [{ learnerUid: 'victim' }, { verified: true }, { rewardAmount: 20 }, { privateTests: [privateTest] }, { expectedOutput: 'yes' }]) await expect(service.verify({ uid: 'learner' }, { ...submission, ...injected })).resolves.toEqual({ verified: false, reason: 'invalid-request' })
    expect(practiceVerificationSubmissionSchema.safeParse(submission).success).toBe(true)
  })

  it('resolves the exact immutable version internally and emits a server receipt only after private-test pass', async () => {
    const publications = resolver(), executor: IsolatedPracticeExecutor = { execute: vi.fn(async (request) => { expect(request.tests).toEqual([privateTest]); expect(request.limits.memoryMb).toBe(128); return { outcome: 'passed' as const } }) }
    const result = await new PracticeVerificationService(publications, executor, undefined, () => '2026-11-27T10:00:00.000Z', () => 'nonce').verify({ uid: 'learner-1' }, submission)
    expect(publications.resolvePracticeVersion).toHaveBeenCalledWith(contentId, 7)
    expect(result).toMatchObject({ verified: true, receipt: { learnerUid: 'learner-1', publicationVersion: 7, policyVersion: 'practice-verifier-v1', outcome: 'verified', verifiedAt: '2026-11-27T10:00:00.000Z' } })
  })

  it.each(['compile-error', 'runtime-error', 'timeout', 'resource-limit', 'wrong-answer', 'unavailable'] as const)('does not verify %s', async (kind) => {
    const service = new PracticeVerificationService(resolver(), new DeterministicFakePracticeExecutor({ outcome: 'failed', kind }))
    await expect(service.verify({ uid: 'learner' }, submission)).resolves.toEqual({ verified: false, reason: kind })
  })

  it('fails closed when the executor throws or the publication/version/language is unavailable', async () => {
    const throwing: IsolatedPracticeExecutor = { execute: vi.fn(async () => { throw new Error('offline') }) }
    await expect(new PracticeVerificationService(resolver(), throwing).verify({ uid: 'learner' }, submission)).resolves.toEqual({ verified: false, reason: 'unavailable' })
    await expect(new PracticeVerificationService(resolver(null), throwing).verify({ uid: 'learner' }, submission)).resolves.toEqual({ verified: false, reason: 'publication-missing' })
    await expect(new PracticeVerificationService(resolver(publication(8)), throwing).verify({ uid: 'learner' }, submission)).resolves.toEqual({ verified: false, reason: 'publication-missing' })
    await expect(new PracticeVerificationService(resolver(), throwing).verify({ uid: 'learner' }, { ...submission, language: 'python' })).resolves.toEqual({ verified: false, reason: 'unsupported-language' })
  })

  it('binds Challenge mode to the authenticated owner and exact pinned Practice version', async () => {
    const challenge = { ...submission, challengeAssignmentId: 'daily:2026-11-27' }
    const service = new PracticeVerificationService(resolver(), new DeterministicFakePracticeExecutor({ outcome: 'passed' }), assignment)
    await expect(service.verify({ uid: 'learner' }, challenge)).resolves.toMatchObject({ verified: true, receipt: { challengeAssignmentId: 'daily:2026-11-27' } })
    const wrongOwner: ChallengeAssignmentResolver = { resolveForLearner: vi.fn(async () => ({ assignmentId: challenge.challengeAssignmentId, learnerUid: 'other', practiceContentId: contentId, publicationVersion: 7, status: 'assigned' as const, aiEnabled: false as const })) }
    await expect(new PracticeVerificationService(resolver(), new DeterministicFakePracticeExecutor({ outcome: 'passed' }), wrongOwner).verify({ uid: 'learner' }, challenge)).resolves.toEqual({ verified: false, reason: 'assignment-invalid' })
    await expect(service.verify({ uid: 'learner' }, { ...challenge, publicationVersion: 6 })).resolves.toEqual({ verified: false, reason: 'assignment-invalid' })
  })
})
