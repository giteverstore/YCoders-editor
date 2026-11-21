import { z } from 'zod'

import { uuidSchema } from '../../core/identifiers.js'
import { codeByLanguageSchema, difficultySchema, domainBlocksSchema, hintSchema, languageConfigurationSchema } from '../shared.js'
import { executablePracticeTestCaseSchema, practiceExecutionContractSchema, practiceLanguageIdSchema } from './practice.execution.js'

const valueRepresentationSchema = z.discriminatedUnion('format', [
  z.object({ format: z.literal('text'), value: z.string().max(50_000) }).strict(),
  z.object({ format: z.literal('json'), value: z.json() }).strict(),
])

export const testCaseSchema = z.object({ id: uuidSchema, label: z.string().min(1).max(100), input: valueRepresentationSchema, expectedOutput: valueRepresentationSchema }).strict()

export const practiceContentSchema = z.object({
  difficulty: difficultySchema,
  languages: languageConfigurationSchema,
  questionMetadata: z.object({ topics: z.array(z.string().max(80)).max(30), estimatedMinutes: z.number().int().positive().max(1440) }).strict(),
  examples: z.array(z.object({ id: uuidSchema, input: valueRepresentationSchema, output: valueRepresentationSchema, explanation: z.string().max(2000).optional() }).strict()).min(1).max(20),
  constraints: z.array(z.string().min(1).max(1000)).max(50),
  hints: z.array(hintSchema).max(20),
  starterCode: codeByLanguageSchema,
  referenceSolutions: codeByLanguageSchema,
  publicTestCases: z.array(testCaseSchema).min(1).max(100),
  verification: z.object({ strategy: z.enum(['exact', 'trimmed', 'json-equivalent']), caseSensitive: z.boolean(), numericTolerance: z.number().positive().optional() }).strict(),
  execution: practiceExecutionContractSchema.optional(),
  executablePublicTests: z.array(executablePracticeTestCaseSchema).min(1).max(100).optional(),
  instructions: domainBlocksSchema('practice'),
}).strict().superRefine((value, context) => {
  const supported = new Set(value.languages.supported.map((language) => language.id))
  value.languages.supported.forEach((language, index) => { if (!practiceLanguageIdSchema.safeParse(language.id).success) context.addIssue({ code: 'custom', path: ['languages', 'supported', index, 'id'], message: `Unsupported Practice language: ${language.id}` }) })
  for (const field of ['starterCode', 'referenceSolutions'] as const) {
    value[field].forEach((entry, index) => { if (!supported.has(entry.languageId)) context.addIssue({ code: 'custom', path: [field, index, 'languageId'], message: 'Language is not configured' }) })
  }
  const identifiers = [...value.examples, ...value.hints, ...value.publicTestCases].map((item) => item.id)
  if (new Set(identifiers).size !== identifiers.length) context.addIssue({ code: 'custom', message: 'Example, hint, and test-case IDs must be unique' })
  if ((value.execution === undefined) !== (value.executablePublicTests === undefined)) context.addIssue({ code: 'custom', path: ['execution'], message: 'Execution contract and executable public tests must be supplied together' })
  value.executablePublicTests?.forEach((test, index) => { if (test.mode !== value.execution?.mode) context.addIssue({ code: 'custom', path: ['executablePublicTests', index, 'mode'], message: 'Public test mode must match the execution contract' }) })
})

export type PracticeContent = z.infer<typeof practiceContentSchema>
