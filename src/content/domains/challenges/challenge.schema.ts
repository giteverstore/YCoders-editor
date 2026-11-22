import { z } from 'zod'

import { actorIdSchema, calendarDateSchema, isoDateTimeSchema, slugSchema, uuidSchema } from '../../core/identifiers.js'
import { lifecycleSchema } from '../../core/lifecycle.js'
import { CURRENT_SCHEMA_VERSION } from '../../core/versions.js'
import { codeByLanguageSchema, difficultySchema, domainBlocksSchema, hintSchema, languageConfigurationSchema } from '../shared.js'

export const legacyChallengeContentSchema = z.object({
  scheduledDate: calendarDateSchema,
  difficulty: difficultySchema,
  topics: z.array(z.string().min(1).max(80)).min(1).max(30),
  languages: languageConfigurationSchema,
  rewards: z.object({ points: z.number().int().nonnegative().max(1_000_000), badgeId: z.string().max(100).optional(), label: z.string().max(100).optional() }).strict(),
  instructions: domainBlocksSchema('challenge'),
  hints: z.array(hintSchema).max(20),
  starterCode: codeByLanguageSchema,
  verification: z.object({ mode: z.enum(['expected-output', 'test-cases']), expectedOutput: z.string().max(50_000).optional(), cases: z.array(z.object({ input: z.string().max(50_000), expectedOutput: z.string().max(50_000) }).strict()).max(100).optional() }).strict().superRefine((value, context) => {
    if (value.mode === 'expected-output' && value.expectedOutput === undefined) context.addIssue({ code: 'custom', path: ['expectedOutput'], message: 'Expected output is required for this mode' })
    if (value.mode === 'test-cases' && !value.cases?.length) context.addIssue({ code: 'custom', path: ['cases'], message: 'At least one test case is required' })
  }),
}).strict().superRefine((value, context) => {
  const supported = new Set(value.languages.supported.map((language) => language.id))
  value.starterCode.forEach((entry, index) => { if (!supported.has(entry.languageId)) context.addIssue({ code: 'custom', path: ['starterCode', index, 'languageId'], message: 'Language is not configured' }) })
})

export const challengePolicyContentSchema = z.object({
  kind: z.literal('policy'),
  policyVersion: z.number().int().positive(),
  enabled: z.boolean(),
  schedule: z.object({ timezone: z.literal('Asia/Kolkata'), resetTime: z.literal('00:00:00') }).strict(),
  source: z.object({
    mode: z.enum(['eligible-pool', 'fixed-practice']),
    fixedPracticeContentId: uuidSchema.optional(),
    includePracticeContentIds: z.array(uuidSchema).max(500),
    excludePracticeContentIds: z.array(uuidSchema).max(500),
    difficulties: z.array(difficultySchema).max(3),
    topics: z.array(z.string().trim().min(1).max(80)).max(30),
  }).strict().superRefine((value, context) => {
    if (value.mode === 'fixed-practice' && !value.fixedPracticeContentId) context.addIssue({ code: 'custom', path: ['fixedPracticeContentId'], message: 'Fixed-Practice mode requires one Practice content ID' })
    if (value.mode === 'eligible-pool' && value.fixedPracticeContentId) context.addIssue({ code: 'custom', path: ['fixedPracticeContentId'], message: 'Eligible-pool mode cannot fix a Practice content ID' })
    const excluded = new Set(value.excludePracticeContentIds)
    value.includePracticeContentIds.forEach((id, index) => { if (excluded.has(id)) context.addIssue({ code: 'custom', path: ['includePracticeContentIds', index], message: 'Practice content cannot be both included and excluded' }) })
  }),
  restrictions: z.object({
    aiTutor: z.literal('disabled'),
    hints: z.enum(['practice-defined', 'disabled']),
    retryPolicy: z.literal('unlimited-until-completed'),
  }).strict(),
  rewards: z.object({
    coins: z.literal(20),
    streakIncrement: z.literal(1),
    practiceRewardMode: z.literal('challenge-replaces-practice'),
    policyVersion: z.string().trim().min(1).max(128),
  }).strict(),
}).strict()

export const challengePolicyDocumentSchema = z.object({
  id: uuidSchema,
  contentType: z.literal('challenge'),
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  documentVersion: z.number().int().positive(),
  title: z.string().trim().min(1).max(200),
  slug: slugSchema,
  status: lifecycleSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  createdBy: actorIdSchema,
  updatedBy: actorIdSchema,
  metadata: z.object({ summary: z.string().max(500).optional(), tags: z.array(z.string().min(1).max(80)).max(30), locale: z.string().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/) }).strict(),
  content: challengePolicyContentSchema,
}).strict().superRefine((value, context) => {
  if (new Date(value.updatedAt) < new Date(value.createdAt)) context.addIssue({ code: 'custom', path: ['updatedAt'], message: 'updatedAt cannot precede createdAt' })
})

export const challengeContentSchema = z.union([challengePolicyContentSchema, legacyChallengeContentSchema])

export type ChallengeContent = z.infer<typeof challengeContentSchema>
export type ChallengePolicyContent = z.infer<typeof challengePolicyContentSchema>
export type ChallengePolicyDocument = z.infer<typeof challengePolicyDocumentSchema>
export type LegacyChallengeContent = z.infer<typeof legacyChallengeContentSchema>
export const isChallengePolicyContent = (value: ChallengeContent): value is ChallengePolicyContent => 'kind' in value && value.kind === 'policy'
