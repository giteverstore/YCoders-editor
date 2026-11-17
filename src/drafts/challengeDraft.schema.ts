import { z } from 'zod'
import { contentEnvelopeSchema, type ChallengeDocument } from '../content/core/envelope.js'
import { CURRENT_SCHEMA_VERSION } from '../content/core/versions.js'
import { isoDateTimeSchema, uuidSchema } from '../content/core/identifiers.js'
import type { DraftRecord } from './draft.types.js'
export const challengeDraftDocumentSchema = contentEnvelopeSchema.refine((value) => value.contentType === 'challenge', { message: 'Expected a Challenge document' }) as z.ZodType<ChallengeDocument>
export const storedChallengeDraftSchema: z.ZodType<DraftRecord<ChallengeDocument>> = z.object({ id: uuidSchema, contentType: z.literal('challenge'), schemaVersion: z.literal(CURRENT_SCHEMA_VERSION), revision: z.number().int().positive(), document: challengeDraftDocumentSchema, createdAt: isoDateTimeSchema, lastSavedAt: isoDateTimeSchema }).strict()
