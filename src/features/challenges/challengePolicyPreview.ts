import type { ChallengePolicyContent } from '../../content/domains/challenges/challenge.schema'
import { challengeDateAt, eligibilitySnapshotHash, evaluatePracticeEligibility, selectPracticeCandidate, type EligibilityCode, type PracticeCandidate } from '../../content/domains/challenges/challenge.core'

export type PracticeCandidateSummary = PracticeCandidate & Readonly<{ title: string }>
export type ChallengeCandidateSource = { listSafeCandidates(): Promise<readonly PracticeCandidateSummary[]> }
export const emptyChallengeCandidateSource: ChallengeCandidateSource = { listSafeCandidates: async () => [] }

export type PolicyReadinessFinding = Readonly<{ severity: 'blocking' | 'warning' | 'ready'; code: string; message: string }>
export type CandidateEvaluation = Readonly<{ candidate: PracticeCandidateSummary; eligible: boolean; findings: readonly EligibilityCode[] }>

export function evaluatePolicyCandidates(policy: ChallengePolicyContent, candidates: readonly PracticeCandidateSummary[]) {
  const evaluations: CandidateEvaluation[] = candidates.map((candidate) => ({ candidate, ...evaluatePracticeEligibility(policy, candidate) }))
  const eligible = evaluations.filter((value) => value.eligible)
  const findings: PolicyReadinessFinding[] = []
  if (policy.source.mode === 'eligible-pool' && eligible.length === 0) findings.push({ severity: 'blocking', code: 'challenge-policy.zero-eligible-candidates', message: 'At least one eligible Practice publication is required.' })
  if (policy.source.mode === 'fixed-practice') {
    const fixed = evaluations.find(({ candidate }) => candidate.contentId === policy.source.fixedPracticeContentId)
    if (!fixed) findings.push({ severity: 'blocking', code: 'challenge-policy.fixed-practice-unavailable', message: 'The fixed Practice content ID is unavailable.' })
    else if (!fixed.eligible) findings.push({ severity: 'blocking', code: 'challenge-policy.fixed-practice-ineligible', message: 'The fixed Practice publication is not learner-ready.' })
  }
  if (!findings.length) findings.push({ severity: 'ready', code: 'challenge-policy.ready', message: `${eligible.length} eligible Practice publication(s) are available.` })
  return { evaluations, eligible, findings, totals: { candidates: candidates.length, eligible: eligible.length, incompatible: candidates.length - eligible.length } }
}

export async function previewAssignmentNow(input: { policyId: string; policy: ChallengePolicyContent; candidates: readonly PracticeCandidateSummary[]; now?: Date; seed?: string }) {
  const challengeDate = challengeDateAt(input.now)
  const readiness = evaluatePolicyCandidates(input.policy, input.candidates)
  if (readiness.findings.some(({ severity }) => severity === 'blocking')) return { ok: false as const, challengeDate, readiness }
  const candidates = readiness.eligible.map(({ candidate }) => candidate)
  const selected = selectPracticeCandidate({ challengeDate, policyId: input.policyId, policyVersion: input.policy.policyVersion, candidates, seed: input.seed }) as PracticeCandidateSummary
  return { ok: true as const, challengeDate, selected, eligibilitySnapshotHash: await eligibilitySnapshotHash(candidates), readiness }
}
