import type { ChallengeDocument } from '../../core/envelope.js'
import { challengePolicyDocumentSchema, type ChallengePolicyDocument } from './challenge.schema.js'
import { isChallengePolicyContent } from './challenge.schema.js'
import { evaluatePracticeEligibility, type PracticeCandidate } from './challenge.core.js'

export type ChallengePolicyFinding = Readonly<{ code: string; path: string; message: string; severity: 'error' | 'info' }>

export function validateChallengePolicyCompatibility(document: unknown, candidates?: readonly PracticeCandidate[]) {
  const parsed = challengePolicyDocumentSchema.safeParse(document)
  const findings: ChallengePolicyFinding[] = parsed.success ? [] : parsed.error.issues.map((issue) => ({ code: 'challenge-policy.invalid', path: `$.${issue.path.join('.')}`, message: issue.message, severity: 'error' as const }))
  if (parsed.success && candidates) {
    const evaluations = candidates.map((candidate) => ({ candidate, result: evaluatePracticeEligibility(parsed.data.content, candidate) }))
    if (parsed.data.content.source.mode === 'eligible-pool' && !evaluations.some(({ result }) => result.eligible)) findings.push({ code: 'challenge-policy.zero-eligible-candidates', path: '$.content.source', message: 'At least one eligible Practice publication is required.', severity: 'error' })
    if (parsed.data.content.source.mode === 'fixed-practice') {
      const fixed = evaluations.find(({ candidate }) => candidate.contentId === parsed.data.content.source.fixedPracticeContentId)
      if (!fixed?.result.eligible) findings.push({ code: 'challenge-policy.fixed-practice-ineligible', path: '$.content.source.fixedPracticeContentId', message: 'The fixed Practice publication must be active and learner-ready.', severity: 'error' })
    }
  }
  return { schemaValid: parsed.success, orchestrationReady: parsed.success && candidates !== undefined && findings.length === 0, findings }
}

export function analyzeLegacyChallenge(document: ChallengeDocument, linkedPracticeContentId?: string) {
  if (isChallengePolicyContent(document.content)) throw new TypeError('Expected legacy Challenge content')
  const findings: ChallengePolicyFinding[] = [
    { code: 'legacy.identity-reusable', path: '$.id', message: 'Identity, title, slug, summary, and tags may seed a new policy draft.', severity: 'info' },
    { code: 'legacy.reward-review-required', path: '$.content.rewards.points', message: document.content.rewards.points === 20 ? 'Reward maps to the approved 20-coin policy.' : 'Legacy reward differs from the approved 20-coin policy and cannot be copied.', severity: document.content.rewards.points === 20 ? 'info' : 'error' },
    { code: 'legacy.filters-reviewable', path: '$.content', message: 'Difficulty and topics may be reviewed as eligibility filters; they are not migrated automatically.', severity: 'info' },
    { code: 'legacy.practice-content-duplicated', path: '$.content', message: 'Instructions, languages, hints, starter code, and verification require separate Practice migration.', severity: 'error' },
    linkedPracticeContentId
      ? { code: 'legacy.practice-link-proposed', path: '$.content', message: `A manually supplied Practice link is available: ${linkedPracticeContentId}.`, severity: 'info' }
      : { code: 'legacy.manual-migration-required', path: '$.content', message: 'No Practice content ID is linked; manual migration is required.', severity: 'error' },
  ]
  return { classification: 'legacy-challenge-content' as const, autoMigratable: false, findings }
}

export type LearnerSafeChallengePolicy = Readonly<{
  policyId: string
  policyVersion: number
  timezone: 'Asia/Kolkata'
  resetTime: '00:00:00'
  restrictions: ChallengePolicyDocument['content']['restrictions']
  rewards: ChallengePolicyDocument['content']['rewards']
}>

export function toLearnerSafeChallengePolicy(document: ChallengePolicyDocument): LearnerSafeChallengePolicy {
  return { policyId: document.id, policyVersion: document.content.policyVersion, timezone: document.content.schedule.timezone, resetTime: document.content.schedule.resetTime, restrictions: structuredClone(document.content.restrictions), rewards: structuredClone(document.content.rewards) }
}
