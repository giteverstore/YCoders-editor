import { z } from 'zod'

import { blockSchema } from '../content/blocks/block.schemas.js'
import { actorIdSchema, isoDateTimeSchema, uuidSchema } from '../content/core/identifiers.js'
import { lifecycleSchema } from '../content/core/lifecycle.js'
import { CURRENT_SCHEMA_VERSION } from '../content/core/versions.js'
import type { CourseDocument } from '../content/core/envelope.js'
import type { DraftRecord } from './draft.types.js'

const draftText = (max: number) => z.string().max(max)
const draftLesson = z.object({ id: uuidSchema, title: draftText(200), estimatedMinutes: z.number().int().nonnegative().max(1440), blocks: z.array(blockSchema).max(500) }).strict()
const directModule = z.object({ id: uuidSchema, title: draftText(200), description: draftText(2000).optional(), organization: z.literal('lessons'), lessons: z.array(draftLesson).max(100) }).strict()
const sectionedModule = z.object({ id: uuidSchema, title: draftText(200), description: draftText(2000).optional(), organization: z.literal('sections'), sections: z.array(z.object({ id: uuidSchema, title: draftText(200), lessons: z.array(draftLesson).max(100) }).strict()).max(50) }).strict()

export const courseDraftDocumentSchema: z.ZodType<CourseDocument> = z.object({
  id: uuidSchema,
  contentType: z.literal('course'),
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  documentVersion: z.number().int().positive(),
  title: draftText(200),
  slug: draftText(120),
  status: lifecycleSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  createdBy: actorIdSchema,
  updatedBy: actorIdSchema,
  metadata: z.object({ summary: draftText(500).optional(), tags: z.array(draftText(80)).max(30), locale: draftText(20) }).strict(),
  content: z.object({
    description: draftText(5000), language: draftText(30), difficulty: z.enum(['beginner', 'intermediate', 'advanced']), estimatedMinutes: z.number().int().nonnegative().max(100_000),
    learningOutcomes: z.array(draftText(500)).max(50), modules: z.array(z.discriminatedUnion('organization', [directModule, sectionedModule])).max(100),
    courseMetadata: z.object({ prerequisites: z.array(draftText(300)).max(30), topics: z.array(draftText(80)).max(30) }).strict(),
  }).strict(),
}).strict().superRefine((document, context) => {
  const ids = new Set<string>([document.id])
  const visit = (id: string, path: Array<string | number>) => { if (ids.has(id)) context.addIssue({ code: 'custom', path, message: `Duplicate identifier: ${id}` }); ids.add(id) }
  document.content.modules.forEach((module, moduleIndex) => {
    visit(module.id, ['content', 'modules', moduleIndex, 'id'])
    const groups = module.organization === 'lessons' ? [{ lessons: module.lessons, path: ['content', 'modules', moduleIndex, 'lessons'] as Array<string | number> }] : module.sections.map((section, sectionIndex) => { visit(section.id, ['content', 'modules', moduleIndex, 'sections', sectionIndex, 'id']); return { lessons: section.lessons, path: ['content', 'modules', moduleIndex, 'sections', sectionIndex, 'lessons'] as Array<string | number> } })
    groups.forEach((group) => group.lessons.forEach((lesson, lessonIndex) => { visit(lesson.id, [...group.path, lessonIndex, 'id']); lesson.blocks.forEach((block, blockIndex) => visit(block.id, [...group.path, lessonIndex, 'blocks', blockIndex, 'id'])) }))
  })
})

export const storedCourseDraftSchema: z.ZodType<DraftRecord<CourseDocument>> = z.object({
  id: uuidSchema, contentType: z.literal('course'), schemaVersion: z.literal(CURRENT_SCHEMA_VERSION), revision: z.number().int().positive(), document: courseDraftDocumentSchema, createdAt: isoDateTimeSchema, lastSavedAt: isoDateTimeSchema,
}).strict().superRefine((record, context) => {
  if (record.id !== record.document.id) context.addIssue({ code: 'custom', path: ['document', 'id'], message: 'Stored record and document IDs must match' })
  if (record.schemaVersion !== record.document.schemaVersion) context.addIssue({ code: 'custom', path: ['document', 'schemaVersion'], message: 'Stored record and document schema versions must match' })
})
