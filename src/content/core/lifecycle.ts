import { z } from 'zod'

export const authoringStateSchema = z.enum(['draft', 'published', 'unpublished', 'disabled', 'archived'])
export const publicationVisibilitySchema = z.enum(['private', 'scheduled', 'public', 'unlisted', 'hidden'])

export const lifecycleSchema = z
  .object({
    authoringState: authoringStateSchema,
    visibility: publicationVisibilitySchema,
    hasUnpublishedChanges: z.boolean(),
    publishedDocumentVersion: z.number().int().positive().nullable(),
    publishedAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.publishedDocumentVersion === null && value.publishedAt !== null) {
      context.addIssue({ code: 'custom', path: ['publishedAt'], message: 'A publication date requires a published document version' })
    }
    if (value.visibility === 'public' && value.publishedDocumentVersion === null) {
      context.addIssue({ code: 'custom', path: ['visibility'], message: 'Public content requires a published document version' })
    }
  })

export type Lifecycle = z.infer<typeof lifecycleSchema>
