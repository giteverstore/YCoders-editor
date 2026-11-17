import { z } from 'zod'

import { uuidSchema } from '../../core/identifiers.js'
import { codeByLanguageSchema, difficultySchema, domainBlocksSchema, hintSchema, languageConfigurationSchema } from '../shared.js'

const validatorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('file-exists'), path: z.string().min(1).max(500).refine((path) => !path.includes('..'), 'Parent path segments are not allowed') }).strict(),
  z.object({ kind: z.literal('file-contains'), path: z.string().min(1).max(500).refine((path) => !path.includes('..')), pattern: z.string().min(1).max(1000), match: z.enum(['literal', 'regex']) }).strict(),
  z.object({ kind: z.literal('output-equals'), commandId: z.string().regex(/^[a-z][a-z0-9-]*$/), expected: z.string().max(50_000), normalizeWhitespace: z.boolean() }).strict(),
  z.object({ kind: z.literal('tests-pass'), suiteId: z.string().regex(/^[a-z][a-z0-9-]*$/) }).strict(),
])

const projectTaskSchema = z.object({ id: uuidSchema, title: z.string().min(1).max(200), instructions: domainBlocksSchema('project'), hints: z.array(hintSchema).max(20), validators: z.array(validatorSchema).min(1).max(50) }).strict()
const checkpointSchema = z.object({ id: uuidSchema, title: z.string().min(1).max(200), description: domainBlocksSchema('project'), tasks: z.array(projectTaskSchema).min(1).max(100) }).strict()

export const projectContentSchema = z.object({
  difficulty: difficultySchema,
  learningObjectives: z.array(z.string().min(1).max(500)).min(1).max(50),
  languages: languageConfigurationSchema,
  projectMetadata: z.object({ topics: z.array(z.string().max(80)).max(30), estimatedMinutes: z.number().int().positive().max(100_000) }).strict(),
  starterWorkspace: z.object({ files: z.array(z.object({ path: z.string().min(1).max(500).refine((path) => !path.includes('..')), languageId: z.string().min(1), content: z.string().max(100_000) }).strict()).max(200), code: codeByLanguageSchema }).strict(),
  instructions: domainBlocksSchema('project'),
  checkpoints: z.array(checkpointSchema).min(1).max(100),
  completionCriteria: z.array(z.string().min(1).max(500)).min(1).max(50),
  validation: z.object({ validators: z.array(validatorSchema).min(1).max(100), requireAll: z.boolean() }).strict(),
}).strict().superRefine((value, context) => {
  const entities: Array<{ id: string }> = []
  value.checkpoints.forEach((checkpoint) => entities.push(checkpoint, ...checkpoint.tasks))
  const ids = entities.map((item) => item.id)
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', path: ['checkpoints'], message: 'Checkpoint and task IDs must be unique' })
  const supported = new Set(value.languages.supported.map((language) => language.id))
  value.starterWorkspace.files.forEach((file, index) => { if (!supported.has(file.languageId)) context.addIssue({ code: 'custom', path: ['starterWorkspace', 'files', index, 'languageId'], message: 'Language is not configured' }) })
})

export type ProjectContent = z.infer<typeof projectContentSchema>
export type ProjectValidator = z.infer<typeof validatorSchema>
