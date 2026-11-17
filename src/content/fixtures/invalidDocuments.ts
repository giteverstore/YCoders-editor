import { validChallengeDocument, validCourseDocument, validPracticeDocument, validProjectDocument } from './validDocuments'

const clone = <T>(value: T): T => structuredClone(value)

export const invalidFixtures = {
  unsupportedVersion: { ...clone(validCourseDocument), schemaVersion: '3.0.0' },
  missingTitle: (() => { const value: Record<string, unknown> = clone(validCourseDocument); delete value.title; return value })(),
  duplicateCourseIds: (() => { const value = clone(validCourseDocument); value.content.modules[0].lessons[0].id = value.content.modules[0].id; return value })(),
  unsupportedBlock: (() => { const value: Record<string, unknown> = clone(validPracticeDocument); const content = value.content as Record<string, unknown>; content.instructions = [{ id: '90000000-0000-4000-8000-000000000001', type: 'video', schemaVersion: 1, data: { url: 'https://example.com/video' } }]; return value })(),
  invalidChallengeVerification: (() => { const value: Record<string, unknown> = clone(validChallengeDocument); const content = value.content as { verification: unknown }; content.verification = { mode: 'test-cases' }; return value })(),
  executableProjectValidator: (() => { const value: Record<string, unknown> = clone(validProjectDocument); const content = value.content as { validation: { validators: unknown[] } }; content.validation.validators = [{ kind: 'script', source: 'process.exit(0)' }]; return value })(),
}
