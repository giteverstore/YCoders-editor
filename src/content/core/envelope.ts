import { z } from 'zod'

import { challengeContentSchema } from '../domains/challenges/challenge.schema.js'
import { courseContentSchema } from '../domains/courses/course.schema.js'
import { practiceContentSchema } from '../domains/practice/practice.schema.js'
import { projectContentSchema } from '../domains/projects/project.schema.js'
import { actorIdSchema, isoDateTimeSchema, slugSchema, uuidSchema } from './identifiers.js'
import { lifecycleSchema } from './lifecycle.js'
import { CURRENT_SCHEMA_VERSION } from './versions.js'

export const contentTypeSchema = z.enum(['course', 'practice', 'challenge', 'project'])
export type ContentType = z.infer<typeof contentTypeSchema>

const commonEnvelope = {
  id: uuidSchema,
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
}

export const contentEnvelopeSchema = z.discriminatedUnion('contentType', [
  z.object({ ...commonEnvelope, contentType: z.literal('course'), content: courseContentSchema }).strict(),
  z.object({ ...commonEnvelope, contentType: z.literal('practice'), content: practiceContentSchema }).strict(),
  z.object({ ...commonEnvelope, contentType: z.literal('challenge'), content: challengeContentSchema }).strict(),
  z.object({ ...commonEnvelope, contentType: z.literal('project'), content: projectContentSchema }).strict(),
]).superRefine((value, context) => {
  if (new Date(value.updatedAt) < new Date(value.createdAt)) context.addIssue({ code: 'custom', path: ['updatedAt'], message: 'updatedAt cannot precede createdAt' })
})

export type ContentDocument = z.infer<typeof contentEnvelopeSchema>
export type CourseDocument = Extract<ContentDocument, { contentType: 'course' }>
export type PracticeDocument = Extract<ContentDocument, { contentType: 'practice' }>
export type ChallengeDocument = Extract<ContentDocument, { contentType: 'challenge' }>
export type ProjectDocument = Extract<ContentDocument, { contentType: 'project' }>
