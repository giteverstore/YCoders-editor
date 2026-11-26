import { z } from 'zod'

import { uuidSchema } from '../../core/identifiers.js'
import { domainBlocksSchema, difficultySchema } from '../shared.js'
import { practiceLanguageIdSchema } from '../practice/practice.execution.js'

const lessonSchema = z.object({
  id: uuidSchema,
  title: z.string().trim().min(1).max(200),
  estimatedMinutes: z.number().int().positive().max(1440),
  compilerLanguage: practiceLanguageIdSchema.optional(),
  blocks: domainBlocksSchema('course'),
}).strict()

const sectionSchema = z.object({ id: uuidSchema, title: z.string().trim().min(1).max(200), lessons: z.array(lessonSchema).min(1).max(100) }).strict()

const flatModuleSchema = z.object({
  id: uuidSchema,
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  organization: z.literal('lessons'),
  lessons: z.array(lessonSchema).min(1).max(100),
}).strict()

const sectionedModuleSchema = z.object({
  id: uuidSchema,
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  organization: z.literal('sections'),
  sections: z.array(sectionSchema).min(1).max(50),
}).strict()

export const courseModuleSchema = z.discriminatedUnion('organization', [flatModuleSchema, sectionedModuleSchema])

export const courseContentSchema = z.object({
  courseIconAssetId: uuidSchema.optional(),
  defaultCompilerLanguage: practiceLanguageIdSchema.optional(),
  description: z.string().min(1).max(5000),
  language: z.string().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/),
  difficulty: difficultySchema,
  estimatedMinutes: z.number().int().positive().max(100_000),
  learningOutcomes: z.array(z.string().trim().min(1).max(500)).min(1).max(50),
  modules: z.array(courseModuleSchema).min(1).max(100),
  courseMetadata: z.object({ category: z.string().trim().min(1).max(80).optional(), prerequisites: z.array(z.string().max(300)).max(30), topics: z.array(z.string().max(80)).max(30) }).strict(),
}).strict().superRefine((course, context) => {
  const structural: Array<{ id: string }> = []
  for (const module of course.modules) {
    structural.push(module)
    if (module.organization === 'lessons') structural.push(...module.lessons)
    else for (const section of module.sections) structural.push(section, ...section.lessons)
  }
  const ids = structural.map((item) => item.id)
  const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))]
  if (duplicates.length) context.addIssue({ code: 'custom', path: ['modules'], message: `Duplicate structural IDs: ${duplicates.join(', ')}` })
})

export type CourseContent = z.infer<typeof courseContentSchema>
export type CourseModule = z.infer<typeof courseModuleSchema>
export type CourseLesson = z.infer<typeof lessonSchema>
