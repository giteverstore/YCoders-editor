import { BLOCK_SCHEMA_VERSION } from '../content/core/versions'
import type { ChallengeDocument, CourseDocument, PracticeDocument, ProjectDocument } from '../content/core/envelope'
import { validChallengeDocument, validCourseDocument, validPracticeDocument, validProjectDocument } from '../content/fixtures/validDocuments'
import type { PublicationIdentity } from '../publication/publicationContracts'
import type { AdapterSource } from './learnerAdapter.types'

const source = <T extends CourseDocument | PracticeDocument | ChallengeDocument | ProjectDocument>(document: T, version = 1): AdapterSource<T> => ({ identity: { namespace: 'v2', contentType: document.contentType, contentId: document.id, publicationVersion: version }, document, assetManifest: [] })
const clone = <T>(value: T): T => structuredClone(value)
export const courseDirectFixture = source(clone(validCourseDocument) as CourseDocument, 3)
export const courseSectionsFixture = (() => { const document = clone(validCourseDocument) as CourseDocument; document.content.modules = [{ id: '11000000-0000-4000-8000-000000000001', title: 'Sectioned module', organization: 'sections', sections: [{ id: '11000000-0000-4000-8000-000000000002', title: 'Basics', lessons: [{ id: '11000000-0000-4000-8000-000000000003', title: 'First', estimatedMinutes: 10, blocks: [] }, { id: '11000000-0000-4000-8000-000000000004', title: 'Second', estimatedMinutes: 10, blocks: [] }] }] }]; return source(document, 4) })()
export const courseImageFixture = (() => { const document = clone(validCourseDocument) as CourseDocument, assetId = '12000000-0000-4000-8000-000000000001'; const module = document.content.modules[0]; if (module.organization !== 'lessons') throw new Error('fixture'); module.lessons[0].blocks.push({ id: '12000000-0000-4000-8000-000000000002', type: 'image', schemaVersion: BLOCK_SCHEMA_VERSION, data: { assetId, alt: 'Diagram' } }); return { ...source(document, 5), assetManifest: [{ assetId, contentHash: `sha256:${'a'.repeat(64)}`, mimeType: 'image/png', width: 10, height: 10, byteLength: 100, publishedObjectPath: `editor-v2-published-assets/sha256/${'a'.repeat(64)}.png` }] } })()
export const courseRemovedLessonFixture = { ...courseDirectFixture, previousStableIds: ['19900000-0000-4000-8000-000000000001'] }
export const courseDuplicateIdFixture = (() => { const fixture = clone(courseSectionsFixture), module = fixture.document.content.modules[0]; if (module.organization !== 'sections') throw new Error('fixture'); module.sections[0].lessons[1].id = module.sections[0].lessons[0].id; return fixture })()
export const courseInvalidNavigationFixture = { ...courseDirectFixture, learnerContract: { course: { defaultLessonId: '19900000-0000-4000-8000-000000000009' } } }
export const courseUnsupportedBlockFixture = (() => { const fixture = clone(courseDirectFixture), module = fixture.document.content.modules[0]; if (module.organization !== 'lessons') throw new Error('fixture'); module.lessons[0].blocks.push({ id: '12000000-0000-4000-8000-000000000009', schemaVersion: 1, type: 'video', data: {} } as never); return fixture })()

export const practiceExactFixture = source(clone(validPracticeDocument) as PracticeDocument, 2)
export const practiceTrimmedFixture = (() => { const document = clone(validPracticeDocument) as PracticeDocument; document.content.verification.strategy = 'trimmed'; return source(document, 3) })()
export const practiceNormalizedLinesFixture = (() => { const document = clone(validPracticeDocument) as PracticeDocument; (document.content.verification as { strategy: string }).strategy = 'normalized-lines'; return source(document, 4) })()
export const practiceJsonFixture = (() => { const document = clone(validPracticeDocument) as PracticeDocument; document.content.verification.strategy = 'json-equivalent'; return source(document) })()
export const practiceToleranceFixture = (() => { const document = clone(validPracticeDocument) as PracticeDocument; document.content.verification.numericTolerance = 0.01; return source(document) })()

export const challengeCompatibleFixture = (() => { const document = clone(validChallengeDocument) as ChallengeDocument; document.content.rewards.points = 20; return { ...source(document, 6), learnerContract: { challenge: { streakIncrement: 1, comparison: 'exact' as const, timezone: 'Asia/Kolkata' as const } } } })()
export const challengeRewardMismatchFixture = (() => { const value = clone(challengeCompatibleFixture); value.document.content.rewards.points = 21; return value })()
export const challengeInvalidDateFixture = (() => { const value = clone(challengeCompatibleFixture); value.document.content.scheduledDate = '2026-02-30'; return value })()
export const challengeUnsupportedVerificationFixture = (() => { const value = clone(challengeCompatibleFixture); value.learnerContract.challenge!.comparison = 'semantic' as never; return value })()

const projectContract = { runtime: 'nodejs-22', entrypoint: 'src/main.ts', validatorIds: { 'checkpoints.0.tasks.0.validators.0': 'validator-task-file', 'validation.validators.0': 'validator-final-tests' } }
export const projectCompatibleFixture = { ...source(clone(validProjectDocument) as ProjectDocument, 7), learnerContract: { project: projectContract } }
export const projectMissingRuntimeFixture = (() => { const value = clone(projectCompatibleFixture); value.learnerContract.project = { ...value.learnerContract.project, runtime: undefined } as never; return value })()
export const projectMissingEntrypointFixture = (() => { const value = clone(projectCompatibleFixture); value.learnerContract.project = { ...value.learnerContract.project, entrypoint: undefined } as never; return value })()
export const projectMissingValidatorIdFixture = (() => { const value = clone(projectCompatibleFixture); value.learnerContract.project = { ...value.learnerContract.project, validatorIds: { 'checkpoints.0.tasks.0.validators.0': 'validator-task-file' } } as never; return value })()
export const wrongNamespaceFixture = { ...courseDirectFixture, identity: { ...courseDirectFixture.identity, namespace: 'legacy' } as PublicationIdentity }
