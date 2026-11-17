import type { z } from 'zod'

import { contentEnvelopeSchema, type ContentDocument } from '../core/envelope'

export type ValidationIssue = {
  code: string
  message: string
  path: Array<string | number>
}

export type ContentValidationResult =
  | { success: true; data: ContentDocument; issues: [] }
  | { success: false; data: null; issues: ValidationIssue[]; error: z.ZodError }

export function validateContent(input: unknown): ContentValidationResult {
  const result = contentEnvelopeSchema.safeParse(input)
  if (result.success) return { success: true, data: result.data, issues: [] }
  return {
    success: false,
    data: null,
    error: result.error,
    issues: result.error.issues.map((issue) => ({ code: issue.code, message: issue.message, path: issue.path.map(String).map((part) => /^\d+$/.test(part) ? Number(part) : part) })),
  }
}
