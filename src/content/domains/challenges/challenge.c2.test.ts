import { describe, expect, it } from 'vitest'

import { dailyChallengeAssignmentSchema, assignmentScopeKey, assertSameImmutableAssignment, createDailyChallengeAssignment, resolveOrCreateAssignment, type ChallengeAssignmentRepository, type DailyChallengeAssignment } from './challenge.assignment'
import { analyzeLegacyChallenge, toLearnerSafeChallengePolicy, validateChallengePolicyCompatibility } from './challenge.compatibility'
import { applyChallengeStreak, challengeCompletionIdentity, challengeDateAt, challengeExecutionContext, challengeRewardIdentity, compareChallengeDates, eligibilitySnapshotHash, evaluatePracticeEligibility, historicalChallengePolicy, nextChallengeDate, nextResetBoundary, previousChallengeDate, selectPracticeCandidate, type PracticeCandidate } from './challenge.core'
import { challengePolicyDocumentSchema, type ChallengePolicyDocument } from './challenge.schema'
import { validChallengeDocument } from '../../fixtures/validDocuments'

const policyId = 'a0000000-0000-4000-8000-000000000901'
const practiceId = 'a0000000-0000-4000-8000-000000000902'
const secondPracticeId = 'a0000000-0000-4000-8000-000000000903'

const policy = (): ChallengePolicyDocument => ({
  id: policyId, contentType: 'challenge', schemaVersion: '2.0.0', documentVersion: 1,
  title: 'Global Daily Challenge', slug: 'global-daily-challenge',
  status: { authoringState: 'draft', visibility: 'private', hasUnpublishedChanges: true, publishedDocumentVersion: null, publishedAt: null },
  createdAt: '2026-11-22T00:00:00.000Z', updatedAt: '2026-11-22T00:00:00.000Z', createdBy: 'editor', updatedBy: 'editor', metadata: { summary: 'One shared challenge.', tags: [], locale: 'en' },
  content: { kind: 'policy', policyVersion: 1, enabled: true, schedule: { timezone: 'Asia/Kolkata', resetTime: '00:00:00' }, source: { mode: 'eligible-pool', includePracticeContentIds: [], excludePracticeContentIds: [], difficulties: [], topics: [] }, restrictions: { aiTutor: 'disabled', hints: 'practice-defined', retryPolicy: 'unlimited-until-completed' }, rewards: { coins: 20, streakIncrement: 1, practiceRewardMode: 'challenge-replaces-practice', policyVersion: 'challenge-reward-v1' } },
})

const candidate = (overrides: Partial<PracticeCandidate> = {}): PracticeCandidate => ({ namespace: 'v2', contentType: 'practice', contentId: practiceId, activePublicationVersion: 7, state: 'published', discoverable: true, difficulty: 'beginner', topics: ['arrays'], executionCompatible: true, publicTestsValid: true, supportedLanguages: ['python'], learnerDtoReady: true, ...overrides })
const assignment = (overrides: Partial<DailyChallengeAssignment> = {}): DailyChallengeAssignment => ({ schemaVersion: '1.0.0', assignmentId: assignmentScopeKey(policyId, '2026-11-22'), challengeDate: '2026-11-22', timezone: 'Asia/Kolkata', challengePolicyId: policyId, challengePolicyVersion: 1, practiceContentId: practiceId, practicePublicationVersion: 7, rewardCoins: 20, rewardPolicyVersion: 'challenge-reward-v1', streakIncrement: 1, practiceRewardMode: 'challenge-replaces-practice', restrictions: { aiTutor: 'disabled', hints: 'practice-defined', retryPolicy: 'unlimited-until-completed' }, assignedAt: '2026-11-22T00:00:00.000Z', assignmentSource: 'deterministic-pool', eligibilitySnapshotHash: `sha256:${'a'.repeat(64)}`, ...overrides })

describe('C2 Challenge policy', () => {
  it('accepts the fixed contract and produces a minimal learner-safe projection', () => { const value = policy(); expect(challengePolicyDocumentSchema.safeParse(value).success).toBe(true); expect(validateChallengePolicyCompatibility(value, [candidate()])).toMatchObject({ schemaValid: true, orchestrationReady: true }); expect(toLearnerSafeChallengePolicy(value)).not.toHaveProperty('source') })
  it.each([
    ['timezone', (value: ChallengePolicyDocument) => { (value.content.schedule as { timezone: string }).timezone = 'UTC' }],
    ['reward', (value: ChallengePolicyDocument) => { (value.content.rewards as { coins: number }).coins = 21 }],
    ['AI', (value: ChallengePolicyDocument) => { (value.content.restrictions as { aiTutor: string }).aiTutor = 'enabled' }],
    ['source', (value: ChallengePolicyDocument) => { value.content.source.mode = 'fixed-practice'; delete value.content.source.fixedPracticeContentId }],
  ])('rejects invalid %s policy configuration', (_name, mutate) => { const value = policy(); mutate(value); expect(challengePolicyDocumentSchema.safeParse(value).success).toBe(false) })
  it('rejects include/exclude conflicts', () => { const value = policy(); value.content.source.includePracticeContentIds = [practiceId]; value.content.source.excludePracticeContentIds = [practiceId]; expect(challengePolicyDocumentSchema.safeParse(value).success).toBe(false) })
  it('contains no Practice coding content fields', () => { const serialized = JSON.stringify(policy().content); for (const field of ['instructions', 'starterCode', 'verification', 'execution', 'publicTests', 'referenceSolutions', 'languages']) expect(serialized).not.toContain(`"${field}"`) })
})

describe('C2 date and eligibility', () => {
  it('uses Asia/Kolkata date boundaries and calendar arithmetic', () => { expect(challengeDateAt(new Date('2026-11-21T18:29:00Z'))).toBe('2026-11-21'); expect(challengeDateAt(new Date('2026-11-21T18:31:00Z'))).toBe('2026-11-22'); expect(nextChallengeDate('2026-02-28')).toBe('2026-03-01'); expect(previousChallengeDate('2026-03-01')).toBe('2026-02-28'); expect(compareChallengeDates('2026-01-01', '2026-01-02')).toBeLessThan(0); expect(nextResetBoundary(new Date('2026-11-21T18:31:00Z')).toISOString()).toBe('2026-11-22T18:30:00.000Z') })
  it('returns eligible and deterministic diagnostic findings', () => { expect(evaluatePracticeEligibility(policy().content, candidate())).toEqual({ eligible: true, findings: ['eligible'] }); expect(evaluatePracticeEligibility(policy().content, candidate({ state: 'archived', discoverable: false, executionCompatible: false, publicTestsValid: false, supportedLanguages: [], learnerDtoReady: false })).findings).toEqual(['publication-not-published', 'publication-not-discoverable', 'practice-runtime-incompatible', 'public-tests-invalid', 'no-supported-language', 'learner-dto-incompatible']) })
  it('enforces include, exclude, fixed, difficulty, and topic filters', () => { const value = policy(); value.content.source.includePracticeContentIds = [practiceId]; value.content.source.excludePracticeContentIds = [secondPracticeId]; value.content.source.difficulties = ['advanced']; value.content.source.topics = ['graphs']; expect(evaluatePracticeEligibility(value.content, candidate()).findings).toEqual(['difficulty-mismatch', 'topic-mismatch']); expect(evaluatePracticeEligibility(value.content, candidate({ contentId: secondPracticeId })).findings).toEqual(expect.arrayContaining(['excluded-by-policy', 'not-included-by-policy'])) })
})

describe('C2 deterministic assignment core', () => {
  const candidates = [candidate(), candidate({ contentId: secondPracticeId, activePublicationVersion: 4, difficulty: 'advanced' })]
  it('is stable and independent of input ordering', () => { const input = { challengeDate: '2026-11-22', policyId, policyVersion: 1, candidates }; expect(selectPracticeCandidate(input)).toEqual(selectPracticeCandidate(input)); expect(selectPracticeCandidate(input)).toEqual(selectPracticeCandidate({ ...input, candidates: [...candidates].reverse() })) })
  it('incorporates date and deterministically avoids recent content', () => { const first = selectPracticeCandidate({ challengeDate: '2026-11-22', policyId, policyVersion: 1, candidates }); const next = selectPracticeCandidate({ challengeDate: '2026-11-23', policyId, policyVersion: 1, candidates, recentPracticeContentIds: [first.contentId] }); expect(next.contentId).not.toBe(first.contentId) })
  it('rejects an empty pool and hashes only safe candidate projections', async () => { expect(() => selectPracticeCandidate({ challengeDate: '2026-11-22', policyId, policyVersion: 1, candidates: [] })).toThrow('No eligible'); expect(await eligibilitySnapshotHash(candidates)).toMatch(/^sha256:[a-f0-9]{64}$/) })
  it('pins exact policy and Practice versions in a strict immutable assignment', () => { const value = assignment(); expect(dailyChallengeAssignmentSchema.parse(value)).toEqual(value); expect(() => assertSameImmutableAssignment(value, assignment({ practicePublicationVersion: 8 }))).toThrow('practicePublicationVersion') })
  it('creates the immutable assignment only from policy and safe candidate projections', () => { const value = createDailyChallengeAssignment({ policy: policy(), challengeDate: '2026-11-22', candidate: candidate(), assignedAt: '2026-11-22T00:00:00.000Z', eligibilitySnapshotHash: `sha256:${'b'.repeat(64)}` }); expect(value).toMatchObject({ challengePolicyVersion: 1, practiceContentId: practiceId, practicePublicationVersion: 7, rewardCoins: 20, practiceRewardMode: 'challenge-replaces-practice', restrictions: { aiTutor: 'disabled' } }); expect(JSON.stringify(value)).not.toContain('starterCode') })
})

describe('C2 identities, reward, streak, and legacy compatibility', () => {
  it('makes completion version- and assignment-sensitive while reward is assignment-scoped', () => { const base = { learnerUid: 'learner', assignmentId: `${policyId}:2026-11-22`, challengeDate: '2026-11-22', challengePolicyVersion: 1, practiceContentId: practiceId, practicePublicationVersion: 7 }; expect(challengeCompletionIdentity(base)).not.toBe(challengeCompletionIdentity({ ...base, practicePublicationVersion: 8 })); expect(challengeCompletionIdentity(base)).not.toBe(challengeCompletionIdentity({ ...base, assignmentId: `${policyId}:2026-11-23`, challengeDate: '2026-11-23' })); expect(challengeRewardIdentity({ learnerUid: 'learner', assignmentId: base.assignmentId, challengeDate: base.challengeDate, rewardPolicyVersion: 'v1' })).not.toContain('practicePublicationVersion') })
  it('suppresses Practice reward and hard-disables AI', () => { expect(challengeExecutionContext).toEqual({ activityType: 'DAILY_CHALLENGE', practiceRewardSuppressed: true, completionFlow: 'daily-challenge-only', aiTutor: 'disabled' }) })
  it('freezes historical recovery without streak or duplicate reward', () => { expect(historicalChallengePolicy).toEqual({ rewardMayBeGrantedAfterChallengePass: true, streakAppliedOnRecovery: false, duplicateRewardAllowed: false }) })
  it('models first, consecutive, missed, duplicate, and historical streak transitions', () => { const empty = { current: 0, longest: 0, lastQualifiedDate: null, processedDates: [] }; const one = applyChallengeStreak(empty, '2026-11-20'); const two = applyChallengeStreak(one, '2026-11-21'); expect(one.current).toBe(1); expect(two.current).toBe(2); expect(applyChallengeStreak(two, '2026-11-23')).toMatchObject({ current: 1, longest: 2 }); expect(applyChallengeStreak(two, '2026-11-21')).toBe(two); expect(applyChallengeStreak(two, '2026-11-19', { historicalRecovery: true })).toBe(two) })
  it('marks legacy content for manual Practice migration without conversion', () => { const result = analyzeLegacyChallenge(validChallengeDocument); expect(result).toMatchObject({ classification: 'legacy-challenge-content', autoMigratable: false }); expect(result.findings.map(({ code }) => code)).toContain('legacy.practice-content-duplicated'); expect(result.findings.map(({ code }) => code)).toContain('legacy.manual-migration-required') })
})

describe('C2 atomic repository contract', () => {
  class MemoryRepository implements ChallengeAssignmentRepository {
    values = new Map<string, DailyChallengeAssignment>()
    async getByScope(id: string, date: string) { return this.values.get(assignmentScopeKey(id, date)) ?? null }
    async createIfAbsent(value: DailyChallengeAssignment) { const key = assignmentScopeKey(value.challengePolicyId, value.challengeDate); const existing = this.values.get(key); if (existing) return { created: false, assignment: existing }; this.values.set(key, structuredClone(value)); return { created: true, assignment: value } }
    async getHistoricalById(id: string) { return [...this.values.values()].find(({ assignmentId }) => assignmentId === id) ?? null }
  }
  it('gets existing, creates absent, resolves concurrent losers to one winner, and preserves history', async () => { const repository = new MemoryRepository(); const value = assignment(); expect(await repository.getByScope(policyId, value.challengeDate)).toBeNull(); const attempts = await Promise.all([resolveOrCreateAssignment(repository, value), resolveOrCreateAssignment(repository, assignment({ practiceContentId: secondPracticeId }))]); expect(attempts.filter(({ created }) => created)).toHaveLength(1); expect(new Set(attempts.map(({ assignment: winner }) => winner.practiceContentId))).toEqual(new Set([practiceId])); expect((await resolveOrCreateAssignment(repository, assignment({ practiceContentId: secondPracticeId }))).assignment.practiceContentId).toBe(practiceId); expect(await repository.getHistoricalById(value.assignmentId)).toMatchObject({ practicePublicationVersion: 7 }) })
})
