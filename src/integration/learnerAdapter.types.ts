import type { ContentBlock } from '../content/blocks/block.schemas'
import type { ContentDocument, ContentType } from '../content/core/envelope'
import type { PublicationIdentity } from '../publication/publicationContracts'
import type { PracticeContent } from '../content/domains/practice/practice.schema'
import type { PracticeLanguageId } from '../content/domains/practice/practice.execution'

export type AdapterClassification = 'compatible' | 'compatible-with-warnings' | 'requires-learner-upgrade' | 'requires-v2-schema-change' | 'invalid-publication'
export type AdapterFinding = { domain: ContentType; code: string; severity: 'error' | 'warning'; path: string; message: string; requiredAction: string }
export type AdapterResult<T> = { ok: true; value: T; warnings: AdapterFinding[]; classification: AdapterClassification } | { ok: false; errors: AdapterFinding[]; warnings: AdapterFinding[]; classification: Exclude<AdapterClassification, 'compatible' | 'compatible-with-warnings'> }
export type PublishedAssetManifestEntry = { assetId: string; contentHash: string; mimeType: string; width: number; height: number; byteLength: number; publishedObjectPath: string }
export type LearnerContractExtension = {
  course?: { defaultLessonId?: string }
  challenge?: { streakIncrement?: number; comparison?: 'exact' | 'trimmed' | 'normalized-lines'; timezone?: 'Asia/Kolkata' }
  project?: { runtime?: string; entrypoint?: string; validatorIds?: Record<string, string> }
}
export type AdapterSource<T extends ContentDocument = ContentDocument> = { identity: PublicationIdentity; document: T; assetManifest: PublishedAssetManifestEntry[]; learnerContract?: LearnerContractExtension; previousStableIds?: string[] }
export type LearnerIdentity = { namespace: 'v2'; contentType: ContentType; contentId: string; publicationVersion: number }
export type AssetDeliveryDescriptor = { kind: 'versioned-v2-asset'; namespace: 'v2'; contentId: string; publicationVersion: number; assetId: string; deliveryKey: string }
export type LearnerBlock = Omit<ContentBlock, 'data'> & { data: unknown }

export type LearnerCourse = { identity: LearnerIdentity; courseId: string; title: string; description: string; category: string | null; language: string; difficulty: string; estimatedMinutes: number; defaultCompilerLanguage: PracticeLanguageId | null; learningOutcomes: string[]; prerequisites: string[]; courseIcon: AssetDeliveryDescriptor | null; defaultLessonId: string; modules: Array<{ id: string; title: string; organization: 'lessons' | 'sections'; lessons?: LearnerLesson[]; sections?: Array<{ id: string; title: string; lessons: LearnerLesson[] }> }>; navigation: Array<{ lessonId: string; previousLessonId: string | null; nextLessonId: string | null }> }
export type LearnerLesson = { id: string; title: string; estimatedMinutes: number; compilerLanguage: PracticeLanguageId | null; blocks: LearnerBlock[] }
export type LearnerPractice = { identity: LearnerIdentity; questionId: string; title: string; summary: string; difficulty: 'easy' | 'medium' | 'hard'; topics: string[]; tags: string[]; estimatedMinutes: number; languages: PracticeContent['languages']; starterCode: PracticeContent['starterCode']; examples: PracticeContent['examples']; constraints: string[]; hints: PracticeContent['hints']; instructions: LearnerBlock[]; execution: NonNullable<PracticeContent['execution']>; publicTests: NonNullable<PracticeContent['executablePublicTests']>; executionAssurance: 'browser-public-tests'; runSemantics: 'execute-and-evaluate-all-public-tests'; assets: AssetDeliveryDescriptor[] }
export type LearnerChallenge = { identity: LearnerIdentity; challengeId: string; title: string; scheduledDate: string; timezone: 'Asia/Kolkata'; difficulty: string; languages: unknown; starterCode: unknown; instructions: LearnerBlock[]; hints: unknown; verification: unknown; rewardCoins: 20; streakIncrement: 1; assignmentCreated: false }
export type LearnerProjectValidator = Record<string, unknown> & { id: string }
export type LearnerProject = { identity: LearnerIdentity; projectId: string; title: string; runtime: string; entrypoint: string; languages: unknown; instructions: LearnerBlock[]; files: Array<{ id: string; path: string; languageId: string; content: string }>; checkpoints: Array<{ id: string; title: string; description: LearnerBlock[]; tasks: Array<{ id: string; title: string; instructions: LearnerBlock[]; hints: unknown; validators: LearnerProjectValidator[] }> }>; requirements: string[]; learningObjectives: string[]; validators: LearnerProjectValidator[] }
