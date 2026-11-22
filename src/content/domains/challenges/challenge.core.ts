import { canonicalJson, sha256Canonical } from '../../../publication/publicationContracts.js'
import type { ChallengePolicyContent } from './challenge.schema.js'

export const CHALLENGE_TIMEZONE = 'Asia/Kolkata' as const
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/

export function parseChallengeDate(value: string) {
  const match = DATE.exec(value)
  if (!match) throw new Error('Challenge date must use YYYY-MM-DD.')
  const [year, month, day] = match.slice(1).map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error('Challenge date is invalid.')
  return date
}

export function challengeDateAt(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: CHALLENGE_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function shiftChallengeDate(value: string, days: number) { const date = parseChallengeDate(value); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10) }
export const nextChallengeDate = (value: string) => shiftChallengeDate(value, 1)
export const previousChallengeDate = (value: string) => shiftChallengeDate(value, -1)
export const compareChallengeDates = (left: string, right: string) => { parseChallengeDate(left); parseChallengeDate(right); return left.localeCompare(right) }
export function nextResetBoundary(now = new Date()) { const tomorrow = nextChallengeDate(challengeDateAt(now)); return new Date(`${tomorrow}T00:00:00+05:30`) }

export type PracticeCandidate = Readonly<{
  namespace: 'v2'
  contentType: 'practice'
  contentId: string
  activePublicationVersion: number
  state: 'published' | 'unpublished' | 'disabled' | 'archived'
  discoverable: boolean
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  topics: readonly string[]
  executionCompatible: boolean
  publicTestsValid: boolean
  supportedLanguages: readonly string[]
  learnerDtoReady: boolean
}>

export type EligibilityCode = 'eligible' | 'excluded-by-policy' | 'not-included-by-policy' | 'fixed-practice-mismatch' | 'difficulty-mismatch' | 'topic-mismatch' | 'publication-not-discoverable' | 'publication-not-published' | 'practice-runtime-incompatible' | 'public-tests-invalid' | 'no-supported-language' | 'learner-dto-incompatible'
export type EligibilityResult = Readonly<{ eligible: boolean; findings: readonly EligibilityCode[] }>

export function evaluatePracticeEligibility(policy: ChallengePolicyContent, candidate: PracticeCandidate): EligibilityResult {
  const findings: EligibilityCode[] = []
  if (candidate.namespace !== 'v2' || candidate.contentType !== 'practice') findings.push('learner-dto-incompatible')
  if (candidate.state !== 'published') findings.push('publication-not-published')
  if (!candidate.discoverable) findings.push('publication-not-discoverable')
  if (!candidate.executionCompatible) findings.push('practice-runtime-incompatible')
  if (!candidate.publicTestsValid) findings.push('public-tests-invalid')
  if (!candidate.supportedLanguages.length) findings.push('no-supported-language')
  if (!candidate.learnerDtoReady) findings.push('learner-dto-incompatible')
  if (policy.source.excludePracticeContentIds.includes(candidate.contentId)) findings.push('excluded-by-policy')
  if (policy.source.includePracticeContentIds.length && !policy.source.includePracticeContentIds.includes(candidate.contentId)) findings.push('not-included-by-policy')
  if (policy.source.mode === 'fixed-practice' && policy.source.fixedPracticeContentId !== candidate.contentId) findings.push('fixed-practice-mismatch')
  if (policy.source.difficulties.length && !policy.source.difficulties.includes(candidate.difficulty)) findings.push('difficulty-mismatch')
  if (policy.source.topics.length && !policy.source.topics.some((topic) => candidate.topics.includes(topic))) findings.push('topic-mismatch')
  return { eligible: findings.length === 0, findings: findings.length ? findings : ['eligible'] }
}

function hash32(value: string) { let result = 2166136261; for (const character of value) { result ^= character.charCodeAt(0); result = Math.imul(result, 16777619) } return result >>> 0 }
export function canonicalCandidateSnapshot(candidates: readonly PracticeCandidate[]) { return [...candidates].map(({ contentId, activePublicationVersion, difficulty, topics, supportedLanguages }) => ({ contentId, activePublicationVersion, difficulty, topics: [...topics].sort(), supportedLanguages: [...supportedLanguages].sort() })).sort((a, b) => a.contentId.localeCompare(b.contentId) || a.activePublicationVersion - b.activePublicationVersion) }
export const eligibilitySnapshotHash = (candidates: readonly PracticeCandidate[]) => sha256Canonical(canonicalCandidateSnapshot(candidates))

export function selectPracticeCandidate(input: { challengeDate: string; policyId: string; policyVersion: number; candidates: readonly PracticeCandidate[]; seed?: string; recentPracticeContentIds?: readonly string[] }) {
  parseChallengeDate(input.challengeDate)
  if (!input.candidates.length) throw new Error('No eligible Practice candidates are available.')
  const ordered = [...input.candidates].sort((a, b) => a.contentId.localeCompare(b.contentId) || a.activePublicationVersion - b.activePublicationVersion)
  const recent = new Set(input.recentPracticeContentIds ?? [])
  const nonRecent = ordered.filter(({ contentId }) => !recent.has(contentId))
  const pool = nonRecent.length ? nonRecent : ordered
  const snapshot = canonicalJson(canonicalCandidateSnapshot(ordered))
  return pool[hash32(`${input.seed ?? 'challenge-v1'}\u0000${input.challengeDate}\u0000${input.policyId}\u0000${input.policyVersion}\u0000${snapshot}`) % pool.length]
}

export function challengeCompletionIdentity(input: { learnerUid: string; assignmentId: string; challengeDate: string; challengePolicyVersion: number; practiceContentId: string; practicePublicationVersion: number }) { parseChallengeDate(input.challengeDate); return canonicalJson(input) }
export function challengeRewardIdentity(input: { learnerUid: string; assignmentId: string; challengeDate: string; rewardPolicyVersion: string }) { parseChallengeDate(input.challengeDate); return canonicalJson(input) }
export const challengeExecutionContext = Object.freeze({ activityType: 'DAILY_CHALLENGE' as const, practiceRewardSuppressed: true, completionFlow: 'daily-challenge-only' as const, aiTutor: 'disabled' as const })
export type HistoricalChallengeStatus = 'completed' | 'missed' | 'unlocked-via-challenge-pass' | 'review-only' | 'unavailable'
export const historicalChallengePolicy = Object.freeze({ rewardMayBeGrantedAfterChallengePass: true, streakAppliedOnRecovery: false, duplicateRewardAllowed: false })

export type ChallengeStreak = Readonly<{ current: number; longest: number; lastQualifiedDate: string | null; processedDates: readonly string[] }>
export function applyChallengeStreak(state: ChallengeStreak, challengeDate: string, options: { historicalRecovery?: boolean } = {}): ChallengeStreak {
  parseChallengeDate(challengeDate)
  if (options.historicalRecovery || state.processedDates.includes(challengeDate)) return state
  const consecutive = state.lastQualifiedDate !== null && nextChallengeDate(state.lastQualifiedDate) === challengeDate
  const current = state.lastQualifiedDate === null ? 1 : consecutive ? state.current + 1 : 1
  return { current, longest: Math.max(state.longest, current), lastQualifiedDate: challengeDate, processedDates: [...state.processedDates, challengeDate] }
}
