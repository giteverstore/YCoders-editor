import { z } from 'zod'

import { calendarDateSchema, isoDateTimeSchema, uuidSchema } from '../../core/identifiers.js'
import type { ChallengePolicyDocument } from './challenge.schema.js'
import type { PracticeCandidate } from './challenge.core.js'
const contentHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/)

export const CHALLENGE_TIMEZONE = 'Asia/Kolkata' as const
export const CHALLENGE_RESET_TIME = '00:00:00' as const

const assignmentRestrictionsSchema = z.object({
  aiTutor: z.literal('disabled'),
  hints: z.enum(['practice-defined', 'disabled']),
  retryPolicy: z.literal('unlimited-until-completed'),
}).strict()

export const dailyChallengeAssignmentSchema = z.object({
  schemaVersion: z.literal('1.0.0'),
  assignmentId: z.string().regex(/^[a-z0-9-]+:\d{4}-\d{2}-\d{2}$/),
  challengeDate: calendarDateSchema,
  timezone: z.literal(CHALLENGE_TIMEZONE),
  challengePolicyId: uuidSchema,
  challengePolicyVersion: z.number().int().positive(),
  practiceContentId: uuidSchema,
  practicePublicationVersion: z.number().int().positive(),
  rewardCoins: z.literal(20),
  rewardPolicyVersion: z.string().trim().min(1).max(128),
  streakIncrement: z.literal(1),
  practiceRewardMode: z.literal('challenge-replaces-practice'),
  restrictions: assignmentRestrictionsSchema,
  assignedAt: isoDateTimeSchema,
  assignmentSource: z.enum(['deterministic-pool', 'fixed-practice']),
  eligibilitySnapshotHash: contentHashSchema,
}).strict()

export type DailyChallengeAssignment = z.infer<typeof dailyChallengeAssignmentSchema>

export type ChallengeAssignmentRepository = {
  getByScope(policyId: string, challengeDate: string): Promise<DailyChallengeAssignment | null>
  createIfAbsent(assignment: DailyChallengeAssignment): Promise<{ created: boolean; assignment: DailyChallengeAssignment }>
  getHistoricalById(assignmentId: string): Promise<DailyChallengeAssignment | null>
}

export function assignmentScopeKey(policyId: string, challengeDate: string) {
  return `${policyId}:${challengeDate}`
}

export function createDailyChallengeAssignment(input: { policy: ChallengePolicyDocument; challengeDate: string; candidate: PracticeCandidate; assignedAt: string; eligibilitySnapshotHash: string }): DailyChallengeAssignment {
  const { policy, candidate } = input
  return dailyChallengeAssignmentSchema.parse({
    schemaVersion: '1.0.0',
    assignmentId: assignmentScopeKey(policy.id, input.challengeDate),
    challengeDate: input.challengeDate,
    timezone: policy.content.schedule.timezone,
    challengePolicyId: policy.id,
    challengePolicyVersion: policy.content.policyVersion,
    practiceContentId: candidate.contentId,
    practicePublicationVersion: candidate.activePublicationVersion,
    rewardCoins: policy.content.rewards.coins,
    rewardPolicyVersion: policy.content.rewards.policyVersion,
    streakIncrement: policy.content.rewards.streakIncrement,
    practiceRewardMode: policy.content.rewards.practiceRewardMode,
    restrictions: policy.content.restrictions,
    assignedAt: input.assignedAt,
    assignmentSource: policy.content.source.mode === 'fixed-practice' ? 'fixed-practice' : 'deterministic-pool',
    eligibilitySnapshotHash: input.eligibilitySnapshotHash,
  })
}

export function assertSameImmutableAssignment(existing: DailyChallengeAssignment, proposed: DailyChallengeAssignment) {
  const immutable = ['schemaVersion', 'assignmentId', 'challengeDate', 'timezone', 'challengePolicyId', 'challengePolicyVersion', 'practiceContentId', 'practicePublicationVersion', 'rewardCoins', 'rewardPolicyVersion', 'streakIncrement', 'practiceRewardMode', 'restrictions', 'assignedAt', 'assignmentSource', 'eligibilitySnapshotHash'] as const
  for (const field of immutable) if (JSON.stringify(existing[field]) !== JSON.stringify(proposed[field])) throw new Error(`Immutable assignment field changed: ${field}`)
}

export async function resolveOrCreateAssignment(repository: ChallengeAssignmentRepository, proposed: DailyChallengeAssignment) {
  const existing = await repository.getByScope(proposed.challengePolicyId, proposed.challengeDate)
  if (existing) return { created: false, assignment: existing }
  const result = await repository.createIfAbsent(proposed)
  return result
}
