import { z } from 'zod'
import { contentEnvelopeSchema, type ProjectDocument } from '../content/core/envelope.js'
import { CURRENT_SCHEMA_VERSION } from '../content/core/versions.js'
import { isoDateTimeSchema, uuidSchema } from '../content/core/identifiers.js'
import type { DraftRecord } from './draft.types.js'
export const projectDraftDocumentSchema = contentEnvelopeSchema.refine((v) => v.contentType === 'project', { message: 'Expected a Project document' }) as z.ZodType<ProjectDocument>
export const storedProjectDraftSchema: z.ZodType<DraftRecord<ProjectDocument>> = z.object({ id:uuidSchema,contentType:z.literal('project'),schemaVersion:z.literal(CURRENT_SCHEMA_VERSION),revision:z.number().int().positive(),document:projectDraftDocumentSchema,createdAt:isoDateTimeSchema,lastSavedAt:isoDateTimeSchema }).strict()
