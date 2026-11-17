import { z } from 'zod'

import { uuidSchema } from '../core/identifiers.js'
import { BLOCK_SCHEMA_VERSION } from '../core/versions.js'
import { richTextDocumentSchema } from './richText.schema.js'

const base = { id: uuidSchema, schemaVersion: z.literal(BLOCK_SCHEMA_VERSION) }
const codeLanguageSchema = z.string().trim().min(1).max(40)

export const blockSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('richText'), data: z.object({ document: richTextDocumentSchema }).strict() }).strict(),
  z.object({ ...base, type: z.literal('image'), data: z.union([
    z.object({ assetId: uuidSchema, alt: z.string().trim().min(1).max(300), caption: z.string().max(500).optional() }).strict(),
    z.object({ src: z.string().url().refine((url) => ['http:', 'https:'].includes(new URL(url).protocol)), alt: z.string().trim().min(1).max(300), caption: z.string().max(500).optional() }).strict(),
  ]) }).strict(),
  z.object({ ...base, type: z.literal('code'), data: z.object({ language: codeLanguageSchema, code: z.string().max(50_000), filename: z.string().max(200).optional() }).strict() }).strict(),
  z.object({ ...base, type: z.literal('callout'), data: z.object({ tone: z.enum(['info', 'tip', 'warning', 'danger']), title: z.string().max(160).optional(), content: richTextDocumentSchema }).strict() }).strict(),
  z.object({ ...base, type: z.literal('divider'), data: z.object({ style: z.enum(['solid', 'dashed']).default('solid') }).strict() }).strict(),
  z.object({ ...base, type: z.literal('table'), data: z.object({ headers: z.array(z.string().max(300)).min(1).max(20), rows: z.array(z.array(z.string().max(2000)).max(20)).max(200) }).strict().superRefine((value, context) => value.rows.forEach((row, index) => { if (row.length !== value.headers.length) context.addIssue({ code: 'custom', path: ['rows', index], message: 'Row width must match header width' }) })) }).strict(),
  z.object({ ...base, type: z.literal('quiz'), data: z.object({ question: z.string().min(1).max(2000), options: z.array(z.object({ id: uuidSchema, text: z.string().min(1).max(1000), isCorrect: z.boolean() }).strict()).min(2).max(10), explanation: z.string().max(3000).optional() }).strict().refine((value) => value.options.some((option) => option.isCorrect), { path: ['options'], message: 'At least one option must be correct' }) }).strict(),
  z.object({ ...base, type: z.literal('exercise'), data: z.object({ prompt: richTextDocumentSchema, language: codeLanguageSchema.optional(), starterCode: z.string().max(50_000).optional() }).strict() }).strict(),
  z.object({ ...base, type: z.literal('expectedOutput'), data: z.object({ value: z.string().max(20_000), format: z.enum(['text', 'json']) }).strict() }).strict(),
  z.object({ ...base, type: z.literal('solution'), data: z.object({ content: richTextDocumentSchema, code: z.object({ language: codeLanguageSchema, value: z.string().max(50_000) }).strict().optional() }).strict() }).strict(),
])

export const blockTypes = ['richText', 'image', 'code', 'callout', 'divider', 'table', 'quiz', 'exercise', 'expectedOutput', 'solution'] as const
export type BlockType = (typeof blockTypes)[number]
export type ContentBlock = z.infer<typeof blockSchema>
