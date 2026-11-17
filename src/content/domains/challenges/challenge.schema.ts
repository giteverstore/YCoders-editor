import { z } from 'zod'

import { calendarDateSchema } from '../../core/identifiers.js'
import { codeByLanguageSchema, difficultySchema, domainBlocksSchema, hintSchema, languageConfigurationSchema } from '../shared.js'

export const challengeContentSchema = z.object({
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

export type ChallengeContent = z.infer<typeof challengeContentSchema>
