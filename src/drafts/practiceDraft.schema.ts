import { z } from 'zod'
import { contentEnvelopeSchema, type PracticeDocument } from '../content/core/envelope'
import { CURRENT_SCHEMA_VERSION } from '../content/core/versions'
import { isoDateTimeSchema, uuidSchema } from '../content/core/identifiers'
import type { DraftRecord } from './draft.types'

export const practiceDraftDocumentSchema: z.ZodType<PracticeDocument> = contentEnvelopeSchema.refine((document) => document.contentType === 'practice', { message: 'Expected a Practice document' }) as z.ZodType<PracticeDocument>
export const storedPracticeDraftSchema: z.ZodType<DraftRecord<PracticeDocument>> = z.object({ id: uuidSchema, contentType: z.literal('practice'), schemaVersion: z.literal(CURRENT_SCHEMA_VERSION), revision: z.number().int().positive(), document: practiceDraftDocumentSchema, createdAt: isoDateTimeSchema, lastSavedAt: isoDateTimeSchema }).strict().superRefine((record, context) => { if (record.id !== record.document.id) context.addIssue({ code: 'custom', path: ['document', 'id'], message: 'Stored record and document IDs must match' }) })
