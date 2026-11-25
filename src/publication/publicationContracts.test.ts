import { describe, expect, it } from 'vitest'
import { adminRoles } from '../auth/permissions'
import type { ContentDocument } from '../content/core/envelope'
import { validChallengeDocument, validCourseDocument, validPracticeDocument, validProjectDocument } from '../content/fixtures/validDocuments'
import { assetManifestEntrySchema, canPublish, canTransition, canonicalJson, compareStableIds, evaluateIdempotency, nextState, nextVersionNumber, publicationIdentitySchema, publicationPointerSchema, publicationVersionSchema, sha256Canonical, validatePublicationCompatibility } from './publicationContracts'
import { courseCompatibility } from '../server/publicationBackend'

const hash = (c = 'a') => `sha256:${c.repeat(64)}`
const uuid = (last: string) => `a0000000-0000-4000-8000-${last.padStart(12, '0')}`

describe('final publication contracts', () => {
  it('surfaces adapter findings in Course readiness instead of false with no findings', () => {
    const document = structuredClone(validCourseDocument)
    document.content.courseIconAssetId = uuid('9')
    const report = courseCompatibility(document, [], validatePublicationCompatibility(document, { resolvedAssetIds: new Set([uuid('9')]) }))
    expect(report.learnerIntegrationReady).toBe(false)
    expect(report.findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'course.icon-manifest-missing', path: '$.content.courseIconAssetId' })]))
  })
  it('makes namespace part of historical identity', () => {
    expect(publicationIdentitySchema.parse({ namespace: 'v2', contentType: 'course', contentId: validCourseDocument.id, publicationVersion: 1 }).namespace).toBe('v2')
    expect(publicationIdentitySchema.safeParse({ contentType: 'course', contentId: validCourseDocument.id, publicationVersion: 1 }).success).toBe(false)
  })
  it('orders immutable numeric versions without reuse', () => {
    expect(nextVersionNumber(0)).toBe(1); expect(nextVersionNumber(7)).toBe(8)
    expect(() => nextVersionNumber(-1)).toThrow(); expect(() => nextVersionNumber(Number.MAX_SAFE_INTEGER)).toThrow()
  })
  it('uses RFC 8785 ordering and known SHA-256 vectors', async () => {
    expect(canonicalJson({ b: 1, a: 'x', nested: { z: false, a: null } })).toBe('{"a":"x","b":1,"nested":{"a":null,"z":false}}')
    expect(await sha256Canonical({})).toBe('sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a')
    expect(() => canonicalJson({ value: undefined })).toThrow()
  })
  it('requires content-addressed asset paths', () => {
    const digest = 'b'.repeat(64), base = { assetId: uuid('10'), mimeType: 'image/png' as const, byteLength: 12, width: 10, height: 20, contentHash: `sha256:${digest}`, publishedObjectPath: `editor-v2-published-assets/sha256/${digest}.png` }
    expect(assetManifestEntrySchema.safeParse(base).success).toBe(true)
    expect(assetManifestEntrySchema.safeParse({ ...base, publishedObjectPath: `editor-v2-published-assets/sha256/${'c'.repeat(64)}.png` }).success).toBe(false)
  })
  it('freezes lifecycle transitions and terminal archive', () => {
    expect(canTransition('draft', 'publish')).toBe(true); expect(canTransition('published', 'release')).toBe(true); expect(nextState('published', 'release')).toBe('published'); expect(canTransition('draft', 'rollback')).toBe(false); expect(canTransition('archived', 'publish')).toBe(false)
    for (const state of ['draft', 'unpublished', 'disabled', 'archived'] as const) expect(canTransition(state, 'release')).toBe(false)
    expect(() => nextState('archived', 'enable')).toThrow(); expect(nextState('disabled', 'rollback')).toBe('published')
  })
  it('limits mutations to SUPER_ADMIN and CONTENT_ADMIN', () => {
    for (const role of adminRoles) { expect(canPublish(role, 'publication:publish')).toBe(role === 'SUPER_ADMIN' || role === 'CONTENT_ADMIN'); expect(canPublish(role, 'publication:enable')).toBe(role === 'SUPER_ADMIN' || role === 'CONTENT_ADMIN') }
    expect(canPublish('CONTENT_REVIEWER', 'publication:read')).toBe(true)
  })
  it('separates versions from drafts and binds artifact identity', () => {
    const document = structuredClone(validCourseDocument) as ContentDocument
    const record = { contractVersion: 2 as const, identity: { namespace: 'v2' as const, contentType: 'course' as const, contentId: document.id, publicationVersion: 1 }, schemaVersion: '2.0.0' as const, contentVersion: document.documentVersion, artifactPath: `editor-v2-publications/${document.id}/v1.json`, artifactHash: hash('c'), documentHash: hash('d'), document, assetManifest: [], source: { draftId: document.id, draftRevision: 9, documentVersion: document.documentVersion, draftFingerprint: hash('e') }, publishedAt: '2026-11-16T00:00:00.000Z', publishedBy: 'admin', correlationId: uuid('1'), requestId: uuid('2') }
    expect(publicationVersionSchema.safeParse(record).success).toBe(true)
    expect(publicationVersionSchema.safeParse({ ...record, artifactPath: `editor-v2-publications/${document.id}/v2.json` }).success).toBe(false)
  })
  it('rejects impossible pointer states', () => {
    const pointer = { contractVersion: 2, namespace: 'v2', contentId: validCourseDocument.id, contentType: 'course', state: 'published', visibility: 'public', activeVersionNumber: null, latestVersionNumber: 1, revision: 1, updatedAt: '2026-11-16T00:00:00.000Z', updatedBy: 'admin' }
    expect(publicationPointerSchema.safeParse(pointer).success).toBe(false)
    expect(publicationPointerSchema.safeParse({ ...pointer, state: 'archived', visibility: 'hidden', activeVersionNumber: 1 }).success).toBe(false)
  })
  it('defines replay and mismatch idempotency', () => {
    const input = { requestId: uuid('3'), actorUid: 'admin', contentId: validCourseDocument.id, operation: 'publish' as const, payloadHash: hash() }
    expect(evaluateIdempotency(null, input)).toBe('execute')
    const record = { ...input, correlationId: uuid('4'), status: 'committed' as const, resultIdentity: { namespace: 'v2' as const, contentType: 'course' as const, contentId: validCourseDocument.id, publicationVersion: 1 }, createdAt: '2026-11-16T00:00:00.000Z', expiresAt: '2026-12-16T00:00:00.000Z' }
    expect(evaluateIdempotency(record, input)).toBe('return-original')
    expect(evaluateIdempotency(record, { ...input, payloadHash: hash('b') })).toBe('reject-payload-mismatch')
    expect(evaluateIdempotency({ ...record, status: 'in-progress', resultIdentity: null }, input)).toBe('reject-in-progress')
  })
  it('blocks unresolved external images while preserving editing validity', () => {
    const document = structuredClone(validCourseDocument) as ContentDocument
    if (document.contentType !== 'course') throw new Error('Expected Course fixture')
    if (document.content.modules[0].organization === 'lessons') document.content.modules[0].lessons[0].blocks.push({ id: uuid('20'), type: 'image', schemaVersion: 1, data: { src: 'https://example.com/image.png', alt: 'Example' } })
    const result = validatePublicationCompatibility(document as ContentDocument)
    expect(result.schemaValid).toBe(true); expect(result.storageReady).toBe(false); expect(result.findings.some(({ code }) => code === 'assets.external-image-unresolved')).toBe(true)
  })
  it('distinguishes V2 Practice validity from learner compatibility', () => {
    expect(validatePublicationCompatibility(validPracticeDocument).findings.some(({ code }) => code.startsWith('practice.'))).toBe(false)
    const future = structuredClone(validPracticeDocument) as ContentDocument
    if (future.contentType !== 'practice') throw new Error('Expected Practice fixture')
    delete future.content.execution
    delete future.content.executablePublicTests
    const result = validatePublicationCompatibility(future as ContentDocument)
    expect(result.schemaValid).toBe(true); expect(result.learnerRuntimeCompatible).toBe(false); expect(result.storageReady).toBe(false)
    expect(result.findings.map(({ code }) => code)).toContain('practice.execution-contract-missing')
  })
  it('requires an explicit Course quiz mode and valid correctness counts', () => {
    const document = structuredClone(validCourseDocument) as unknown as ContentDocument
    if (document.contentType !== 'course') throw new Error('Expected Course fixture')
    const module = document.content.modules[0]
    if (module.organization !== 'lessons') throw new Error('Expected lesson module')
    const blockId = uuid('41')
    module.lessons[0].blocks.push({ id: blockId, schemaVersion: 1, type: 'quiz', data: { question: 'Choose', options: [
      { id: uuid('42'), text: 'A', isCorrect: true },
      { id: uuid('43'), text: 'B', isCorrect: false },
    ] } } as never)
    let codes = validatePublicationCompatibility(document).findings.map(({ code }) => code)
    expect(codes).toEqual(expect.arrayContaining(['course.icon-required', 'quiz.mode-required']))

    const quiz = module.lessons[0].blocks.at(-1) as unknown as { data: { mode?: string; options: Array<{ id: string; text: string; isCorrect: boolean }> } }
    quiz.data.mode = 'single-correct'
    quiz.data.options[1].isCorrect = true
    codes = validatePublicationCompatibility(document).findings.map(({ code }) => code)
    expect(codes).toContain('quiz.single-correct-answer-count-invalid')
    quiz.data.mode = 'multiple-correct'
    quiz.data.options[1].isCorrect = false
    codes = validatePublicationCompatibility(document).findings.map(({ code }) => code)
    expect(codes).toContain('quiz.multi-correct-answer-count-invalid')
  })
  it('reports empty and duplicate quiz options and invalid exercise public cases', () => {
    const document = structuredClone(validCourseDocument)
    const module = document.content.modules[0]
    if (module.organization !== 'lessons') throw new Error('Expected lesson module')
    const sharedId = uuid('44')
    module.lessons[0].blocks.push(
      { id: uuid('45'), schemaVersion: 1, type: 'quiz', data: { question: 'Choose', mode: 'single-correct', options: [
        { id: sharedId, text: ' ', isCorrect: true }, { id: sharedId, text: 'B', isCorrect: false },
      ] } } as never,
      { id: uuid('46'), schemaVersion: 1, type: 'exercise', data: { prompt: { type: 'doc', content: [{ type: 'paragraph' }] }, language: 'javascript', starterCode: '', publicTests: [
        { id: uuid('47'), input: 4, expectedOutput: '4' }, { id: uuid('47'), input: '2' },
      ] } } as never,
    )
    const codes = validatePublicationCompatibility(document).findings.map(({ code }) => code)
    expect(codes).toEqual(expect.arrayContaining(['quiz.option-empty', 'quiz.option-id-duplicate', 'exercise.test-id-duplicate', 'exercise.test-input-invalid', 'exercise.expected-output-missing']))
  })
  it('blocks coding exercises without public tests and accepts the corrected Course', () => {
    const document = structuredClone(validCourseDocument)
    const module = document.content.modules[0]
    if (module.organization !== 'lessons') throw new Error('Expected lesson module')
    const exerciseId = uuid('48'), iconId = uuid('49')
    module.lessons[0].blocks.push({ id: exerciseId, schemaVersion: 1, type: 'exercise', data: { prompt: { type: 'doc', content: [{ type: 'paragraph' }] }, language: 'javascript', starterCode: 'console.log(0)' } } as never)
    expect(validatePublicationCompatibility(document).findings.map(({ code }) => code)).toContain('exercise.public-tests-missing')
    document.content.courseIconAssetId = iconId
    const exercise = module.lessons[0].blocks.at(-1) as { data: { publicTests?: Array<{ id: string; input: string; expectedOutput: string }> } }
    exercise.data.publicTests = [{ id: uuid('50'), input: '2', expectedOutput: '4' }]
    const corrected = validatePublicationCompatibility(document, { resolvedAssetIds: new Set([iconId]) })
    expect(corrected.storageReady).toBe(true)
    expect(corrected.findings.filter(({ code }) => code.startsWith('course.') || code.startsWith('quiz.') || code.startsWith('exercise.'))).toEqual([])
  })
  it('reports Challenge and Project compatibility gaps', () => {
    expect(validatePublicationCompatibility(validChallengeDocument).findings.map(({ code }) => code)).toEqual(expect.arrayContaining(['challenge.reward-incompatible', 'challenge.streak-contract-missing']))
    expect(validatePublicationCompatibility(validProjectDocument).findings.map(({ code }) => code)).toEqual(expect.arrayContaining(['project.runtime-missing', 'project.entrypoint-missing', 'project.validator-id-missing']))
  })
  it('blocks removal of learner-referenced stable IDs', () => {
    const next = structuredClone(validCourseDocument)
    if (next.content.modules[0].organization === 'lessons') next.content.modules[0].lessons = []
    expect(compareStableIds(validCourseDocument, next).some(({ code, severity }) => code === 'stable-id.removed.lesson' && severity === 'error')).toBe(true)
  })
  it('keeps exact history addressable independently of pointer state', () => {
    expect(publicationIdentitySchema.safeParse({ namespace: 'v2', contentType: 'project', contentId: validProjectDocument.id, publicationVersion: 4 }).success).toBe(true)
  })
})
