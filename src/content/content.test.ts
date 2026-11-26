import { describe, expect, it } from 'vitest'

import { BLOCK_SCHEMA_VERSION, CURRENT_SCHEMA_VERSION } from './core/versions'
import { invalidFixtures } from './fixtures/invalidDocuments'
import { validChallengeDocument, validCourseDocument, validDocuments, validPracticeDocument, validProjectDocument } from './fixtures/validDocuments'
import { blockRegistry, createBlock } from './blocks/block.registry'
import { blockSchema } from './blocks/block.schemas'
import { richTextDocumentSchema } from './blocks/richText.schema'
import { contentEnvelopeSchema } from './core/envelope'
import type { CourseDocument } from './core/envelope'
import { templateRegistry } from './templates/template.registry'
import { validateContent } from './validation/validateContent'

const clone = <T>(value: T): T => structuredClone(value)

describe('V2 content documents', () => {
  it.each(validDocuments.map((document) => [document.contentType, document]))('validates a %s document', (_, document) => {
    const result = validateContent(document)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
  })

  it.each(validDocuments.map((document) => [document.contentType, document]))('survives a JSON serialization round trip for %s', (_, document) => {
    expect(contentEnvelopeSchema.parse(JSON.parse(JSON.stringify(document)))).toEqual(document)
  })

  it('returns stable issue paths for missing fields', () => {
    const result = validateContent(invalidFixtures.missingTitle)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.issues.some((issue) => issue.path.join('.') === 'title')).toBe(true)
  })

  it('rejects unsupported schema versions without coercion', () => {
    const result = validateContent(invalidFixtures.unsupportedVersion)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.issues.some((issue) => issue.path.includes('schemaVersion'))).toBe(true)
  })

  it('rejects duplicate structural identifiers', () => {
    const result = validateContent(invalidFixtures.duplicateCourseIds)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.issues.some((issue) => issue.message.includes('Duplicate structural IDs'))).toBe(true)
  })

  it('accepts additive Course metadata for new publications and keeps historical Courses valid', () => { const historical = clone(validCourseDocument); expect(validateContent(historical).success).toBe(true); const current = clone(validCourseDocument) as CourseDocument; current.content.courseMetadata.category = 'Developer Tools'; current.content.defaultCompilerLanguage = 'typescript'; const module = current.content.modules[0]; if (module.organization !== 'lessons') throw new Error('Expected lessons'); module.lessons[0].compilerLanguage = 'javascript'; expect(validateContent(current).success).toBe(true); current.content.courseMetadata.category = '   '; expect(validateContent(current).success).toBe(false); current.content.courseMetadata.category = 'Developer Tools'; current.content.defaultCompilerLanguage = 'rust' as never; expect(validateContent(current).success).toBe(false) })

  it('rejects unknown block types including video', () => {
    expect(validateContent(invalidFixtures.unsupportedBlock).success).toBe(false)
  })

  it('validates explicit single and multiple quiz modes without changing authored answers', () => {
    const quiz = { id: '91000000-0000-4000-8000-000000000001', schemaVersion: BLOCK_SCHEMA_VERSION, type: 'quiz', data: { question: 'Choose', mode: 'single-correct', options: [{ id: '91000000-0000-4000-8000-000000000002', text: ' A ', isCorrect: true }, { id: '91000000-0000-4000-8000-000000000003', text: 'B', isCorrect: false }] } } as const
    expect(blockSchema.safeParse(quiz).success).toBe(true)
    expect(blockSchema.safeParse({ ...quiz, data: { ...quiz.data, mode: 'multiple-correct', options: [...quiz.data.options, { id: '91000000-0000-4000-8000-000000000004', text: 'C', isCorrect: true }] } }).success).toBe(true)
    expect(blockSchema.safeParse({ ...quiz, data: { ...quiz.data, options: [{ ...quiz.data.options[0], id: quiz.data.options[1].id }] } }).success).toBe(false)
    expect(blockSchema.safeParse({ ...quiz, data: { ...quiz.data, mode: 'multiple-correct', options: [{ ...quiz.data.options[0], isCorrect: true }, { ...quiz.data.options[1], isCorrect: true }] } }).success).toBe(false)
  })

  it('supports unbounded-by-ui public exercise case arrays with stable IDs and optional legacy reading', () => {
    const exercise = { id: '91000000-0000-4000-8000-000000000011', schemaVersion: BLOCK_SCHEMA_VERSION, type: 'exercise', data: { prompt: { type: 'doc', content: [{ type: 'paragraph' }] }, language: 'javascript', starterCode: '', publicTests: [{ id: '91000000-0000-4000-8000-000000000012', input: '', expectedOutput: '' }] } } as const
    expect(blockSchema.safeParse(exercise).success).toBe(true)
    expect(blockSchema.safeParse({ ...exercise, data: { ...exercise.data, publicTests: [exercise.data.publicTests[0], exercise.data.publicTests[0]] } }).success).toBe(false)
    expect(blockSchema.safeParse({ ...exercise, data: { prompt: exercise.data.prompt } }).success).toBe(true)
  })

  it('rejects blocks disallowed by a domain', () => {
    const value: Record<string, unknown> = clone(validChallengeDocument)
    const content = value.content as { instructions: unknown[] }
    content.instructions = [{ id: '91000000-0000-4000-8000-000000000001', type: 'quiz', schemaVersion: BLOCK_SCHEMA_VERSION, data: { question: 'Choose', options: [{ id: '91000000-0000-4000-8000-000000000002', text: 'A', isCorrect: true }, { id: '91000000-0000-4000-8000-000000000003', text: 'B', isCorrect: false }] } }]
    const result = validateContent(value)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.issues.some((issue) => issue.message.includes('not permitted'))).toBe(true)
  })

  it('rejects incomplete challenge verification', () => {
    expect(validateContent(invalidFixtures.invalidChallengeVerification).success).toBe(false)
  })

  it('rejects executable project validator descriptors', () => {
    expect(validateContent(invalidFixtures.executableProjectValidator).success).toBe(false)
  })

  it('rejects configured code for an unsupported language', () => {
    const value = clone(validPracticeDocument)
    value.content.starterCode.push({ languageId: 'python', code: 'pass' })
    expect(validateContent(value).success).toBe(false)
  })

  it('keeps lifecycle visibility independent from authoring state', () => {
    const value: Record<string, unknown> = clone(validCourseDocument)
    value.status = { authoringState: 'draft', visibility: 'public', hasUnpublishedChanges: true, publishedDocumentVersion: 1, publishedAt: '2026-11-15T10:00:00.000Z' }
    expect(validateContent(value).success).toBe(true)
  })

  it('rejects public visibility without a published version', () => {
    const value: Record<string, unknown> = clone(validCourseDocument)
    const status = value.status as Record<string, unknown>
    status.visibility = 'public'
    expect(validateContent(value).success).toBe(false)
  })

  it('validates all default block factories', () => {
    Object.keys(blockRegistry).forEach((type, index) => {
      const id = `92000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`
      expect(blockSchema.safeParse(createBlock(type as keyof typeof blockRegistry, id)).success).toBe(true)
    })
  })

  it('exposes fixed, non-movable template fields for every domain', () => {
    for (const template of Object.values(templateRegistry)) {
      expect(template.fixedFields.length).toBeGreaterThan(0)
      expect(template.fixedFields.every((field) => field.movable === false)).toBe(true)
      expect(template.flexibleRegions.every((region) => region.allowedBlocks.length > 0)).toBe(true)
    }
  })

  it('rejects duplicate block IDs', () => {
    const value = clone(validCourseDocument)
    const block = value.content.modules[0].lessons[0].blocks[0]
    value.content.modules[0].lessons[0].blocks.push(clone(block))
    expect(validateContent(value).success).toBe(false)
  })

  it('validates representative project checkpoint and task data', () => {
    expect(validateContent(validProjectDocument).success).toBe(true)
  })
})

describe('rich-text security and structure', () => {
  it('accepts approved marks and safe links', () => {
    const document = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Docs', marks: [{ type: 'bold' }, { type: 'link', attrs: { href: 'https://example.com/docs' } }] }] }] }
    expect(richTextDocumentSchema.safeParse(document).success).toBe(true)
  })

  it.each(['javascript:alert(1)', 'data:text/html,hello', 'ftp://example.com/file'])('rejects unsafe link protocol %s', (href) => {
    const document = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Unsafe', marks: [{ type: 'link', attrs: { href } }] }] }] }
    expect(richTextDocumentSchema.safeParse(document).success).toBe(false)
  })

  it('rejects unsupported nodes and arbitrary HTML', () => {
    expect(richTextDocumentSchema.safeParse({ type: 'doc', content: [{ type: 'html', content: '<script>alert(1)</script>' }] }).success).toBe(false)
  })

  it('rejects invalid nesting', () => {
    expect(richTextDocumentSchema.safeParse({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] }] }).success).toBe(false)
  })

  it('rejects excessive nesting depth', () => {
    let node: Record<string, unknown> = { type: 'paragraph' }
    for (let index = 0; index < 13; index += 1) node = { type: 'blockquote', content: [node] }
    expect(richTextDocumentSchema.safeParse({ type: 'doc', content: [node] }).success).toBe(false)
  })
})
