import { BLOCK_SCHEMA_VERSION, CURRENT_SCHEMA_VERSION } from '../core/versions'

const ids = {
  course: '10000000-0000-4000-8000-000000000001', module: '10000000-0000-4000-8000-000000000002', lesson: '10000000-0000-4000-8000-000000000003',
  practice: '20000000-0000-4000-8000-000000000001', example: '20000000-0000-4000-8000-000000000002', test: '20000000-0000-4000-8000-000000000003',
  challenge: '30000000-0000-4000-8000-000000000001', hint: '30000000-0000-4000-8000-000000000002',
  project: '40000000-0000-4000-8000-000000000001', checkpoint: '40000000-0000-4000-8000-000000000002', task: '40000000-0000-4000-8000-000000000003',
  b1: '50000000-0000-4000-8000-000000000001', b2: '50000000-0000-4000-8000-000000000002', b3: '50000000-0000-4000-8000-000000000003', b4: '50000000-0000-4000-8000-000000000004',
}

const richDocument = (text: string) => ({ type: 'doc' as const, content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text }] }] })
const richBlock = (id: string, text: string) => ({ id, type: 'richText' as const, schemaVersion: BLOCK_SCHEMA_VERSION, data: { document: richDocument(text) } })
const languageConfig = { supported: [{ id: 'typescript', displayName: 'TypeScript', version: '5.x' }, { id: 'javascript', displayName: 'JavaScript' }], defaultLanguageId: 'typescript' }
const lifecycle = { authoringState: 'draft' as const, visibility: 'private' as const, hasUnpublishedChanges: true, publishedDocumentVersion: null, publishedAt: null }
const base = { schemaVersion: CURRENT_SCHEMA_VERSION, documentVersion: 1, status: lifecycle, createdAt: '2026-11-16T10:00:00.000Z', updatedAt: '2026-11-16T10:00:00.000Z', createdBy: 'author-1', updatedBy: 'author-1', metadata: { summary: 'Fixture for schema validation', tags: ['fixture'], locale: 'en' } }

export const validCourseDocument = {
  ...base, id: ids.course, contentType: 'course' as const, title: 'TypeScript Foundations', slug: 'typescript-foundations',
  content: { description: 'Learn typed JavaScript from first principles.', language: 'en', difficulty: 'beginner' as const, estimatedMinutes: 180, learningOutcomes: ['Use TypeScript types safely'], courseMetadata: { prerequisites: ['Basic JavaScript'], topics: ['TypeScript'] }, modules: [{ id: ids.module, title: 'Core types', organization: 'lessons' as const, lessons: [{ id: ids.lesson, title: 'Primitive types', estimatedMinutes: 20, blocks: [richBlock(ids.b1, 'Types describe the shape of values.')] }] }] },
}

export const validPracticeDocument = {
  ...base, id: ids.practice, contentType: 'practice' as const, title: 'Reverse a string', slug: 'reverse-a-string',
  content: { difficulty: 'beginner' as const, languages: languageConfig, questionMetadata: { topics: ['strings'], estimatedMinutes: 15 }, examples: [{ id: ids.example, input: { format: 'text' as const, value: 'coders' }, output: { format: 'text' as const, value: 'sredoc' }, explanation: 'Characters are reversed.' }], constraints: ['Input contains at most 1,000 characters.'], hints: [], starterCode: [{ languageId: 'typescript', code: 'export function reverse(value: string): string {\n  return value\n}' }], referenceSolutions: [{ languageId: 'typescript', code: 'export const reverse = (value: string) => [...value].reverse().join(\'\')' }], publicTestCases: [{ id: ids.test, label: 'Basic input', input: { format: 'text' as const, value: 'abc' }, expectedOutput: { format: 'text' as const, value: 'cba' } }], verification: { strategy: 'exact' as const, caseSensitive: true }, instructions: [richBlock(ids.b2, 'Return a new string with the character order reversed.')] },
}

export const validChallengeDocument = {
  ...base, id: ids.challenge, contentType: 'challenge' as const, title: 'Weekly array challenge', slug: 'weekly-array-challenge',
  content: { scheduledDate: '2026-11-23', difficulty: 'intermediate' as const, topics: ['arrays'], languages: languageConfig, rewards: { points: 250, badgeId: 'array-explorer', label: 'Array Explorer' }, instructions: [{ id: ids.b3, type: 'code' as const, schemaVersion: BLOCK_SCHEMA_VERSION, data: { language: 'typescript', code: 'const values = [1, 2, 3]' } }], hints: [{ id: ids.hint, text: 'Consider a single pass.' }], starterCode: [{ languageId: 'typescript', code: 'export function solve(values: number[]) {}' }], verification: { mode: 'test-cases' as const, cases: [{ input: '[1,2,3]', expectedOutput: '6' }] } },
}

export const validProjectDocument = {
  ...base, id: ids.project, contentType: 'project' as const, title: 'Build a task tracker', slug: 'build-a-task-tracker',
  content: { difficulty: 'intermediate' as const, learningObjectives: ['Model application state'], languages: languageConfig, projectMetadata: { topics: ['state', 'components'], estimatedMinutes: 240 }, starterWorkspace: { files: [{ path: 'src/main.ts', languageId: 'typescript', content: '' }], code: [{ languageId: 'typescript', code: 'export const tasks = []' }] }, instructions: [richBlock(ids.b4, 'Build the task tracker incrementally.')], checkpoints: [{ id: ids.checkpoint, title: 'Task model', description: [], tasks: [{ id: ids.task, title: 'Create the model', instructions: [], hints: [], validators: [{ kind: 'file-exists' as const, path: 'src/tasks.ts' }] }] }], completionCriteria: ['All task operations are represented.'], validation: { validators: [{ kind: 'tests-pass' as const, suiteId: 'task-model' }], requireAll: true } },
}

export const validDocuments = [validCourseDocument, validPracticeDocument, validChallengeDocument, validProjectDocument]
