import { z } from 'zod'

import { uuidSchema } from '../core/identifiers.js'
import { BLOCK_SCHEMA_VERSION } from '../core/versions.js'
import { richTextDocumentSchema } from './richText.schema.js'
import { practiceLanguageIdSchema } from '../domains/practice/practice.execution.js'

const base = { id: uuidSchema, schemaVersion: z.literal(BLOCK_SCHEMA_VERSION) }
const codeLanguageSchema = z.string().trim().min(1).max(40)
const imagePresentation = { size: z.enum(['small', 'medium', 'large', 'full', 'custom']).optional(), customWidth: z.number().positive().max(1600).optional(), customUnit: z.enum(['px', '%']).optional(), customHeight: z.number().positive().max(1200).optional(), heightUnit: z.enum(['auto', 'px']).optional(), objectFit: z.enum(['contain', 'cover']).optional(), alignment: z.enum(['left', 'center', 'right']).optional(), preserveAspectRatio: z.boolean().optional() }
const richTextHasVisibleContent = (node: unknown): boolean => typeof node === 'object' && node !== null && (('text' in node && typeof node.text === 'string' && node.text.trim().length > 0) || ('content' in node && Array.isArray(node.content) && node.content.some(richTextHasVisibleContent)))
const hintItemSchema = z.object({ id: uuidSchema, title: z.string().trim().min(1).max(160), content: richTextDocumentSchema }).strict().superRefine((value, context) => {
  if (!richTextHasVisibleContent(value.content)) context.addIssue({ code: 'custom', path: ['content'], message: 'hint.content-empty' })
})

export const blockSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('richText'), data: z.object({ document: richTextDocumentSchema }).strict() }).strict(),
  z.object({ ...base, type: z.literal('image'), data: z.union([
    z.object({ assetId: uuidSchema, alt: z.string().trim().min(1).max(300), caption: z.string().max(500).optional(), ...imagePresentation }).strict(),
    z.object({ src: z.string().url().refine((url) => ['http:', 'https:'].includes(new URL(url).protocol)), alt: z.string().trim().min(1).max(300), caption: z.string().max(500).optional(), ...imagePresentation }).strict(),
  ]).superRefine((value, context) => { if (value.size === 'custom' && value.customUnit === '%' && value.customWidth !== undefined && value.customWidth > 100) context.addIssue({ code: 'custom', path: ['customWidth'], message: 'Percentage width cannot exceed 100' }) }) }).strict(),
  z.object({ ...base, type: z.literal('code'), data: z.object({ language: codeLanguageSchema, code: z.string().max(50_000), filename: z.string().max(200).optional() }).strict() }).strict(),
  z.object({ ...base, type: z.literal('callout'), data: z.object({ tone: z.enum(['info', 'tip', 'warning', 'danger']), title: z.string().max(160).optional(), content: richTextDocumentSchema }).strict() }).strict(),
  z.object({ ...base, type: z.literal('hint'), data: z.object({ hints: z.array(hintItemSchema).min(1).max(100) }).strict().superRefine((value, context) => { const ids = value.hints.map(({ id }) => id); if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', path: ['hints'], message: 'hint.id-duplicate' }) }) }).strict(),
  z.object({ ...base, type: z.literal('divider'), data: z.object({ style: z.enum(['solid', 'dashed']).default('solid') }).strict() }).strict(),
  z.object({ ...base, type: z.literal('table'), data: z.object({ headers: z.array(z.string().max(300)).min(1).max(20), rows: z.array(z.array(z.string().max(2000)).max(20)).max(200) }).strict().superRefine((value, context) => value.rows.forEach((row, index) => { if (row.length !== value.headers.length) context.addIssue({ code: 'custom', path: ['rows', index], message: 'Row width must match header width' }) })) }).strict(),
  z.object({ ...base, type: z.literal('quiz'), data: z.object({ question: z.string().min(1).max(2000), mode: z.enum(['single-correct', 'multiple-correct']).optional(), options: z.array(z.object({ id: uuidSchema, text: z.string().trim().min(1).max(1000), isCorrect: z.boolean() }).strict()).min(2).max(100), explanation: z.string().max(3000).optional() }).strict().superRefine((value, context) => {
    const ids = value.options.map(({ id }) => id)
    if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', path: ['options'], message: 'quiz.option-id-duplicate' })
    if (value.options.some(({ text }) => !text.trim())) context.addIssue({ code: 'custom', path: ['options'], message: 'quiz.option-empty' })
    const correct = value.options.filter(({ isCorrect }) => isCorrect).length
    if (value.mode === 'single-correct' && correct !== 1) context.addIssue({ code: 'custom', path: ['options'], message: 'quiz.single-correct-answer-count-invalid' })
    if (value.mode === 'multiple-correct' && (correct < 2 || correct >= value.options.length)) context.addIssue({ code: 'custom', path: ['options'], message: 'quiz.multi-correct-answer-count-invalid' })
  }) }).strict(),
  z.object({ ...base, type: z.literal('exercise'), data: z.object({ prompt: richTextDocumentSchema, language: practiceLanguageIdSchema.optional(), starterCode: z.string().max(50_000).optional(), publicTests: z.array(z.object({ id: uuidSchema, input: z.string().max(20_000), expectedOutput: z.string().max(20_000) }).strict()).max(100).optional() }).strict().superRefine((value, context) => { const tests = value.publicTests ?? []; const ids = tests.map(({ id }) => id); if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', path: ['publicTests'], message: 'exercise.test-id-duplicate' }); if (tests.some(({ expectedOutput }) => expectedOutput === undefined)) context.addIssue({ code: 'custom', path: ['publicTests'], message: 'exercise.expected-output-missing' }); if ((value.language || value.starterCode) && tests.length === 0) context.addIssue({ code: 'custom', path: ['publicTests'], message: 'exercise.public-tests-missing' }); if ((value.starterCode !== undefined || tests.length > 0) && !value.language) context.addIssue({ code: 'custom', path: ['language'], message: 'exercise.execution-contract-invalid' }) }) }).strict(),
  z.object({ ...base, type: z.literal('expectedOutput'), data: z.object({ value: z.string().max(20_000), format: z.enum(['text', 'json']) }).strict() }).strict(),
  z.object({ ...base, type: z.literal('solution'), data: z.object({ content: richTextDocumentSchema, code: z.object({ language: codeLanguageSchema, value: z.string().max(50_000) }).strict().optional() }).strict() }).strict(),
])

export const blockTypes = ['richText', 'image', 'code', 'callout', 'hint', 'divider', 'table', 'quiz', 'exercise', 'expectedOutput', 'solution'] as const
export type BlockType = (typeof blockTypes)[number]
export type ContentBlock = z.infer<typeof blockSchema>
