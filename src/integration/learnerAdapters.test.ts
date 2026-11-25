import { describe, expect, it } from 'vitest'
import { adaptChallenge, adaptCourse, adaptPractice, adaptProject, assetDeliveryDescriptor, SUPPORTED_COURSE_BLOCKS } from './learnerAdapters'
import * as fixtures from './learnerAdapter.fixtures'

describe('pure learner adapters', () => {
  it('preserves V2 identity, publication version, direct lesson order, and stable IDs', () => { const result = adaptCourse(fixtures.courseDirectFixture); expect(result.ok).toBe(true); if (!result.ok) return; expect(result.value.identity).toEqual({ namespace: 'v2', contentType: 'course', contentId: fixtures.courseDirectFixture.document.id, publicationVersion: 3 }); expect(result.value.defaultLessonId).toBe(fixtures.courseDirectFixture.document.content.modules[0].organization === 'lessons' ? fixtures.courseDirectFixture.document.content.modules[0].lessons[0].id : ''); expect(result.value.navigation[0]).toMatchObject({ previousLessonId: null, nextLessonId: null }) })
  it('preserves section hierarchy and deterministic navigation', () => { const one = adaptCourse(fixtures.courseSectionsFixture), two = adaptCourse(fixtures.courseSectionsFixture); expect(one).toEqual(two); expect(one.ok && one.value.modules[0].organization).toBe('sections'); expect(one.ok && one.value.navigation.map(x => x.lessonId)).toEqual(['11000000-0000-4000-8000-000000000003', '11000000-0000-4000-8000-000000000004']) })
  it('preserves authored Course metadata without fixture-specific constants', () => { const fixture = structuredClone(fixtures.courseDirectFixture); fixture.document.content.estimatedMinutes = 73; fixture.document.content.learningOutcomes = ['Understand a generic published Course.', 'Apply its concepts.']; fixture.document.content.courseMetadata.prerequisites = ['A generic prerequisite']; const result = adaptCourse(fixture); expect(result).toMatchObject({ ok: true, value: { estimatedMinutes: 73, learningOutcomes: fixture.document.content.learningOutcomes, prerequisites: fixture.document.content.courseMetadata.prerequisites } }) })
  it('creates version-addressed image descriptors without private paths or URLs', () => { const result = adaptCourse(fixtures.courseImageFixture); expect(result.ok).toBe(true); if (!result.ok) return; const module = result.value.modules[0], block = module.lessons?.[0].blocks[1]; expect(block?.data).toMatchObject({ delivery: assetDeliveryDescriptor('v2', fixtures.courseImageFixture.document.id, 5, '12000000-0000-4000-8000-000000000001') }); expect(JSON.stringify(block)).not.toContain('editor-v2-published-assets') })
  it('maps explicit Course quiz modes and learner-safe public exercise tests', () => {
    const fixture = structuredClone(fixtures.courseDirectFixture)
    const module = fixture.document.content.modules[0]
    if (module.organization !== 'lessons') throw new Error('Expected lesson module')
    const quizId = '12000000-0000-4000-8000-000000000021'
    module.lessons[0].blocks.push(
      { id: quizId, schemaVersion: 1, type: 'quiz', data: { question: 'Choose the values', mode: 'multiple-correct', explanation: 'A and B are correct.', options: [
        { id: '12000000-0000-4000-8000-000000000022', text: 'A', isCorrect: true },
        { id: '12000000-0000-4000-8000-000000000023', text: 'B', isCorrect: true },
        { id: '12000000-0000-4000-8000-000000000024', text: 'C', isCorrect: false },
      ] } },
      { id: '12000000-0000-4000-8000-000000000028', schemaVersion: 1, type: 'quiz', data: { question: 'Choose one value', mode: 'single-correct', options: [
        { id: '12000000-0000-4000-8000-000000000029', text: 'A', isCorrect: true },
        { id: '12000000-0000-4000-8000-00000000002a', text: 'B', isCorrect: false },
      ] } },
      { id: '12000000-0000-4000-8000-000000000025', schemaVersion: 1, type: 'exercise', data: { prompt: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Double the input.' }] }] }, language: 'javascript', starterCode: 'console.log(0)', publicTests: [{ id: '12000000-0000-4000-8000-000000000026', input: '2', expectedOutput: '4' }, { id: '12000000-0000-4000-8000-000000000027', input: '3', expectedOutput: '6' }] } },
    )
    const result = adaptCourse(fixture)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const blocks = result.value.modules[0].lessons?.[0].blocks ?? []
    const quiz = blocks.find(({ id }) => id === quizId)?.data as Record<string, unknown>
    expect(quiz).toMatchObject({ mode: 'multiple-correct', selectionMode: 'multiple', correctOptionIds: ['12000000-0000-4000-8000-000000000022', '12000000-0000-4000-8000-000000000023'], explanation: 'A and B are correct.' })
    expect(quiz.options).toEqual([{ id: '12000000-0000-4000-8000-000000000022', text: 'A' }, { id: '12000000-0000-4000-8000-000000000023', text: 'B' }, { id: '12000000-0000-4000-8000-000000000024', text: 'C' }])
    expect(blocks.find(({ id }) => id === '12000000-0000-4000-8000-000000000028')?.data).toMatchObject({ mode: 'single-correct', selectionMode: 'single', correctOptionIds: ['12000000-0000-4000-8000-000000000029'] })
    const exercise = blocks.find(({ id }) => id === '12000000-0000-4000-8000-000000000025')?.data
    expect(exercise).toMatchObject({ publicTests: [{ id: '12000000-0000-4000-8000-000000000026', input: '2', expectedOutput: '4' }, { id: '12000000-0000-4000-8000-000000000027', input: '3', expectedOutput: '6' }] })
    expect(JSON.stringify(result.value)).not.toContain('hiddenTests')
  })
  it('delivers Course icons by immutable version and permits legacy missing icons', () => {
    const fixture = structuredClone(fixtures.courseDirectFixture)
    const assetId = '12000000-0000-4000-8000-000000000031'
    fixture.document.content.courseIconAssetId = assetId
    fixture.assetManifest = [{ assetId, contentHash: `sha256:${'a'.repeat(64)}`, mimeType: 'image/png', width: 64, height: 64, byteLength: 100, publishedObjectPath: `editor-v2-published-assets/sha256/${'a'.repeat(64)}.png` }]
    const result = adaptCourse(fixture)
    expect(result).toMatchObject({ ok: true, value: { courseIcon: assetDeliveryDescriptor('v2', fixture.document.id, 3, assetId) } })
    expect(JSON.stringify(result)).not.toContain('publishedObjectPath')
    expect(adaptCourse(fixtures.courseDirectFixture)).toMatchObject({ ok: true, value: { courseIcon: null } })
    fixture.assetManifest = []
    expect(adaptCourse(fixture)).toMatchObject({ ok: false, errors: [expect.objectContaining({ code: 'course.icon-manifest-missing' })] })
  })
  it('preserves expectedOutput and Course solution blocks and inventories the complete learner block matrix', () => {
    const fixture = structuredClone(fixtures.courseDirectFixture), module = fixture.document.content.modules[0]
    if (module.organization !== 'lessons') throw new Error('Expected lesson module')
    const expectedOutput = { id: '12000000-0000-4000-8000-000000000041', schemaVersion: 1 as const, type: 'expectedOutput' as const, data: { value: '{"ok":true}', format: 'json' as const } }
    const solution = { id: '12000000-0000-4000-8000-000000000042', schemaVersion: 1 as const, type: 'solution' as const, data: { content: { type: 'doc' as const, content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text: 'Explain the answer.' }] }] }, code: { language: 'javascript', value: 'console.log(true)' } } }
    module.lessons[0].blocks.push(expectedOutput, solution)
    const result = adaptCourse(fixture)
    expect(result).toMatchObject({ ok: true })
    if (!result.ok) return
    const delivered = result.value.modules[0].lessons?.[0].blocks ?? []
    expect(delivered.find(({ id }) => id === expectedOutput.id)).toEqual(expectedOutput)
    expect(delivered.find(({ id }) => id === solution.id)).toEqual(solution)
    expect(SUPPORTED_COURSE_BLOCKS).toEqual(['richText', 'image', 'code', 'callout', 'divider', 'table', 'quiz', 'exercise', 'expectedOutput', 'solution'])
  })
  it('rejects removed lesson IDs, unsupported blocks, and implicit namespaces', () => { expect(adaptCourse(fixtures.courseRemovedLessonFixture)).toMatchObject({ ok: false, errors: [{ code: 'course.lesson-id-removed' }] }); expect(adaptCourse(fixtures.courseUnsupportedBlockFixture)).toMatchObject({ ok: false, errors: [{ code: 'block.unsupported' }] }); expect(adaptCourse(fixtures.wrongNamespaceFixture as never)).toMatchObject({ ok: false, classification: 'invalid-publication' }) })
  it('rejects duplicate structural IDs and invalid navigation targets', () => { expect(adaptCourse(fixtures.courseDuplicateIdFixture)).toMatchObject({ ok: false, classification: 'invalid-publication' }); expect(adaptCourse(fixtures.courseInvalidNavigationFixture)).toMatchObject({ ok: false, errors: [{ code: 'course.navigation-target-invalid' }] }) })

  it('maps the closed Practice DTO and browser-first Run contract', () => { const result = adaptPractice(fixtures.practiceExactFixture); expect(result).toMatchObject({ ok: true, value: { difficulty: 'easy', executionAssurance: 'browser-public-tests', runSemantics: 'execute-and-evaluate-all-public-tests', constraints: ['Input contains at most 1,000 characters.'] } }); if (!result.ok) return; expect(result.value.publicTests).toHaveLength(1); expect(result.value.execution.mode).toBe('function') })
  it('never serializes trusted reference solutions', () => { const result = adaptPractice(fixtures.practiceExactFixture); expect(result.ok).toBe(true); if (!result.ok) return; const serialized = JSON.stringify(result.value); expect(serialized).not.toContain('referenceSolutions'); expect(serialized).not.toContain("export const reverse =") })
  it('rejects legacy Practice content without inventing execution metadata', () => { const fixture = structuredClone(fixtures.practiceExactFixture); delete fixture.document.content.execution; delete fixture.document.content.executablePublicTests; expect(adaptPractice(fixture)).toMatchObject({ ok: false, errors: [{ code: 'practice.execution-contract-missing' }] }) })
  it('rejects unsupported Practice languages deterministically', () => { const fixture = structuredClone(fixtures.practiceExactFixture); fixture.document.content.languages.supported[0].id = 'rust'; fixture.document.content.languages.defaultLanguageId = 'rust'; expect(adaptPractice(fixture)).toMatchObject({ ok: false, errors: [{ code: 'practice.language-unsupported' }] }) })
  it.each([
    ['practice.execution-mode-unsupported', (fixture: typeof fixtures.practiceExactFixture) => { (fixture.document.content.execution as { mode: string }).mode = 'judge' }],
    ['practice.argument-type-unsupported', (fixture: typeof fixtures.practiceExactFixture) => { if (fixture.document.content.execution?.mode === 'function') (fixture.document.content.execution.arguments[0] as { type: string }).type = 'runtime-object' }],
    ['practice.return-type-unsupported', (fixture: typeof fixtures.practiceExactFixture) => { if (fixture.document.content.execution?.mode === 'function') (fixture.document.content.execution.result as { type: string }).type = 'runtime-value' }],
    ['practice.comparator-unsupported', (fixture: typeof fixtures.practiceExactFixture) => { (fixture.document.content.executablePublicTests![0].comparison as { kind: string }).kind = 'normalized-lines' }],
    ['practice.comparator-config-invalid', (fixture: typeof fixtures.practiceExactFixture) => { fixture.document.content.executablePublicTests![0].comparison = { kind: 'numeric-tolerance', tolerance: 0 } }],
    ['practice.semantic-validator-unsupported', (fixture: typeof fixtures.practiceExactFixture) => { fixture.document.content.executablePublicTests![0].comparison = { kind: 'semantic', validatorId: 'custom-code' } as never }],
  ])('emits typed compatibility error %s', (code, mutate) => { const fixture = structuredClone(fixtures.practiceExactFixture); mutate(fixture); expect(adaptPractice(fixture)).toMatchObject({ ok: false, errors: [expect.objectContaining({ code })] }) })

  it('maps compatible Challenge metadata without assignment or reward side effects', () => { const result = adaptChallenge(fixtures.challengeCompatibleFixture); expect(result).toMatchObject({ ok: true, value: { rewardCoins: 20, streakIncrement: 1, timezone: 'Asia/Kolkata', assignmentCreated: false } }) })
  it('rejects Challenge reward, date, and comparator incompatibilities', () => { expect(adaptChallenge(fixtures.challengeRewardMismatchFixture)).toMatchObject({ ok: false, errors: [{ code: 'challenge.reward-policy' }] }); expect(adaptChallenge(fixtures.challengeInvalidDateFixture)).toMatchObject({ ok: false, errors: [{ code: 'challenge.date-invalid' }] }); expect(adaptChallenge(fixtures.challengeUnsupportedVerificationFixture)).toMatchObject({ ok: false, errors: [{ code: 'challenge.comparator-unsupported' }] }) })

  it('maps explicit Project runtime contracts and preserves checkpoint/task/file identities', () => { const result = adaptProject(fixtures.projectCompatibleFixture); expect(result).toMatchObject({ ok: true, classification: 'requires-v2-schema-change', value: { projectId: fixtures.projectCompatibleFixture.document.id, runtime: 'nodejs-22', entrypoint: 'src/main.ts' } }); if (!result.ok) return; expect(result.value.files[0].id).toBe('src/main.ts'); expect(result.value.checkpoints[0].id).toBe(fixtures.projectCompatibleFixture.document.content.checkpoints[0].id); expect(result.value.checkpoints[0].tasks[0].validators[0].id).toBe('validator-task-file') })
  it('never invents Project runtime, entrypoint, or validator IDs', () => { expect(adaptProject(fixtures.projectMissingRuntimeFixture)).toMatchObject({ ok: false, errors: expect.arrayContaining([expect.objectContaining({ code: 'project.runtime-missing' })]) }); expect(adaptProject(fixtures.projectMissingEntrypointFixture)).toMatchObject({ ok: false, errors: expect.arrayContaining([expect.objectContaining({ code: 'project.entrypoint-missing' })]) }); expect(adaptProject(fixtures.projectMissingValidatorIdFixture)).toMatchObject({ ok: false, errors: expect.arrayContaining([expect.objectContaining({ code: 'project.validator-id-missing' })]) }) })
})
