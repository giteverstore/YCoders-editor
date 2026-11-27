import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'

import type { PracticeDocument } from '../content/core/envelope.js'
import { uuidSchema } from '../content/core/identifiers.js'
import { practiceLanguageIdSchema, type PracticeLanguageId } from '../content/domains/practice/practice.execution.js'
import { practiceContentSchema } from '../content/domains/practice/practice.schema.js'

export const practiceVerificationSubmissionSchema = z.object({
  practiceContentId: uuidSchema,
  publicationVersion: z.number().int().positive(),
  language: practiceLanguageIdSchema,
  sourceCode: z.string().min(1).max(200_000),
  challengeAssignmentId: z.string().min(1).max(200).optional(),
}).strict()
export type PracticeVerificationSubmission = z.infer<typeof practiceVerificationSubmissionSchema>

export type VerifiedLearnerPrincipal = { uid: string }
export type ImmutablePracticePublication = { contentId: string; publicationVersion: number; documentHash: string; document: PracticeDocument }
export interface PracticePublicationResolver { resolvePracticeVersion(contentId: string, publicationVersion: number): Promise<ImmutablePracticePublication | null> }

export type CanonicalChallengeAssignment = { assignmentId: string; learnerUid: string; practiceContentId: string; publicationVersion: number; status: 'assigned' | 'completed' | 'expired'; aiEnabled: false }
export interface ChallengeAssignmentResolver { resolveForLearner(assignmentId: string, learnerUid: string): Promise<CanonicalChallengeAssignment | null> }

export type TrustedPracticeProjection = {
  contentId: string
  publicationVersion: number
  documentHash: string
  language: PracticeLanguageId
  execution: NonNullable<PracticeDocument['content']['execution']>
  privateTests: NonNullable<PracticeDocument['content']['trustedVerification']>['privateTests']
  referenceSolution: string
  policyVersion: string
  limits: NonNullable<PracticeDocument['content']['trustedVerification']>['limits']
}

export type ExecutorFailureKind = 'compile-error' | 'runtime-error' | 'timeout' | 'resource-limit' | 'wrong-answer' | 'unavailable'
export type IsolatedExecutionResult = { outcome: 'passed' } | { outcome: 'failed'; kind: ExecutorFailureKind; diagnostic?: string }
export interface IsolatedPracticeExecutor {
  execute(request: { language: PracticeLanguageId; sourceCode: string; execution: TrustedPracticeProjection['execution']; tests: TrustedPracticeProjection['privateTests']; limits: TrustedPracticeProjection['limits'] }): Promise<IsolatedExecutionResult>
}

export type PracticeVerificationReceipt = {
  verificationId: string
  learnerUid: string
  practiceContentId: string
  publicationVersion: number
  challengeAssignmentId?: string
  language: PracticeLanguageId
  outcome: 'verified'
  policyVersion: string
  verifiedAt: string
  publicationDocumentHash: string
}
export type PracticeVerificationResult = { verified: true; receipt: PracticeVerificationReceipt } | { verified: false; reason: ExecutorFailureKind | 'invalid-request' | 'publication-missing' | 'verification-material-missing' | 'unsupported-language' | 'assignment-invalid' }

export class PracticeVerificationService {
  constructor(private readonly publications: PracticePublicationResolver, private readonly executor: IsolatedPracticeExecutor, private readonly assignments?: ChallengeAssignmentResolver, private readonly now = () => new Date().toISOString(), private readonly nonce: () => string = randomUUID) {}

  async verify(principal: VerifiedLearnerPrincipal | null, untrusted: unknown): Promise<PracticeVerificationResult> {
    if (!principal?.uid) return { verified: false, reason: 'invalid-request' }
    const parsed = practiceVerificationSubmissionSchema.safeParse(untrusted)
    if (!parsed.success) return { verified: false, reason: 'invalid-request' }
    const submission = parsed.data
    if (submission.challengeAssignmentId) {
      const assignment = await this.assignments?.resolveForLearner(submission.challengeAssignmentId, principal.uid)
      if (!assignment || assignment.learnerUid !== principal.uid || assignment.assignmentId !== submission.challengeAssignmentId || assignment.practiceContentId !== submission.practiceContentId || assignment.publicationVersion !== submission.publicationVersion || assignment.status === 'expired' || assignment.aiEnabled !== false) return { verified: false, reason: 'assignment-invalid' }
    }
    const publication = await this.publications.resolvePracticeVersion(submission.practiceContentId, submission.publicationVersion)
    if (!publication || publication.contentId !== submission.practiceContentId || publication.publicationVersion !== submission.publicationVersion || publication.document.id !== submission.practiceContentId) return { verified: false, reason: 'publication-missing' }
    const projection = createTrustedPracticeProjection(publication, submission.language)
    if (!projection.ok) return { verified: false, reason: projection.reason }
    let execution: IsolatedExecutionResult
    try { execution = await this.executor.execute({ language: submission.language, sourceCode: submission.sourceCode, execution: projection.value.execution, tests: structuredClone(projection.value.privateTests), limits: projection.value.limits }) }
    catch { execution = { outcome: 'failed', kind: 'unavailable' } }
    if (execution.outcome !== 'passed') return { verified: false, reason: execution.kind }
    const seed = `${principal.uid}:${submission.practiceContentId}:${submission.publicationVersion}:${submission.challengeAssignmentId ?? 'practice'}:${this.nonce()}`
    return { verified: true, receipt: { verificationId: `pv_${createHash('sha256').update(seed).digest('hex')}`, learnerUid: principal.uid, practiceContentId: submission.practiceContentId, publicationVersion: submission.publicationVersion, ...(submission.challengeAssignmentId ? { challengeAssignmentId: submission.challengeAssignmentId } : {}), language: submission.language, outcome: 'verified', policyVersion: projection.value.policyVersion, verifiedAt: this.now(), publicationDocumentHash: publication.documentHash } }
  }
}

export function createTrustedPracticeProjection(publication: ImmutablePracticePublication, language: PracticeLanguageId): { ok: true; value: TrustedPracticeProjection } | { ok: false; reason: 'verification-material-missing' | 'unsupported-language' } {
  const content = practiceContentSchema.safeParse(publication.document.content)
  if (!content.success || !content.data.execution || !content.data.trustedVerification) return { ok: false, reason: 'verification-material-missing' }
  if (!content.data.languages.supported.some(({ id }) => id === language)) return { ok: false, reason: 'unsupported-language' }
  const reference = content.data.referenceSolutions.find(({ languageId }) => languageId === language)?.code
  if (!reference?.trim()) return { ok: false, reason: 'verification-material-missing' }
  return { ok: true, value: { contentId: publication.contentId, publicationVersion: publication.publicationVersion, documentHash: publication.documentHash, language, execution: structuredClone(content.data.execution), privateTests: structuredClone(content.data.trustedVerification.privateTests), referenceSolution: reference, policyVersion: content.data.trustedVerification.policyVersion, limits: structuredClone(content.data.trustedVerification.limits) } }
}

/** Test-only executor. Production wiring must provide an isolated out-of-process implementation. */
export class DeterministicFakePracticeExecutor implements IsolatedPracticeExecutor {
  constructor(private readonly result: IsolatedExecutionResult) {}
  async execute(): Promise<IsolatedExecutionResult> { return structuredClone(this.result) }
}
