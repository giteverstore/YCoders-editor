import type { Firestore } from 'firebase-admin/firestore'

import { contentEnvelopeSchema } from '../content/core/envelope.js'
import { isChallengePolicyContent, type ChallengePolicyContent } from '../content/domains/challenges/challenge.schema.js'
import { eligibilitySnapshotHash, evaluatePracticeEligibility, type PracticeCandidate } from '../content/domains/challenges/challenge.core.js'
import { adaptPractice } from '../integration/learnerAdapters.js'
import type { PublishedAssetManifestEntry } from '../integration/learnerAdapter.types.js'
import { sha256Canonical, V2_PUBLICATION_COLLECTION } from '../publication/publicationContracts.js'

export type AuthoritativePracticeCandidate = PracticeCandidate & Readonly<{ title: string }>
export type ChallengePolicyEvidence = Readonly<{ eligibleCandidateCount: number; candidateSnapshotHash: string; validatedAt: string; policySourceHash: string }>
export interface ChallengeCandidateSource { list(): Promise<readonly AuthoritativePracticeCandidate[]> }

export class FirestoreChallengeCandidateSource implements ChallengeCandidateSource {
  constructor(private readonly firestore: Firestore) {}
  async list(): Promise<readonly AuthoritativePracticeCandidate[]> {
    const pointers = await this.firestore.collection(V2_PUBLICATION_COLLECTION).where('contentType', '==', 'practice').get()
    return Promise.all(pointers.docs.map(async (pointerSnapshot) => {
      const pointer = pointerSnapshot.data() as { namespace?: string; state?: PracticeCandidate['state']; visibility?: string; activeVersionNumber?: number | null; latestVersionNumber?: number }
      const activeVersion = Number.isSafeInteger(pointer.activeVersionNumber) && Number(pointer.activeVersionNumber) > 0 ? Number(pointer.activeVersionNumber) : null
      const version = activeVersion ?? (Number.isSafeInteger(pointer.latestVersionNumber) && Number(pointer.latestVersionNumber) > 0 ? Number(pointer.latestVersionNumber) : null)
      const versionSnapshot = version ? await pointerSnapshot.ref.collection('versions').doc(String(version)).get() : null
      const record = versionSnapshot?.exists ? versionSnapshot.data() as Record<string, unknown> : null
      const parsed = record ? contentEnvelopeSchema.safeParse(record.document) : null
      const document = parsed?.success && parsed.data.contentType === 'practice' ? parsed.data : null
      const adaptation = document && record ? adaptPractice({ identity: { namespace: 'v2', contentType: 'practice', contentId: pointerSnapshot.id, publicationVersion: version! }, document, assetManifest: Array.isArray(record.assetManifest) ? record.assetManifest as PublishedAssetManifestEntry[] : [] }) : null
      return {
        title: document?.title ?? 'Unavailable Practice', namespace: 'v2' as const, contentType: 'practice' as const, contentId: pointerSnapshot.id,
        activePublicationVersion: version ?? 1, state: pointer.state ?? 'unpublished', discoverable: pointer.visibility === 'public' && activeVersion !== null,
        difficulty: document?.content.difficulty ?? 'beginner', topics: document?.content.questionMetadata.topics ?? [],
        executionCompatible: Boolean(document?.content.execution), publicTestsValid: Boolean(document?.content.executablePublicTests?.length),
        supportedLanguages: document?.content.languages.supported.map(({ id }) => id) ?? [], learnerDtoReady: adaptation?.ok === true,
      }
    }))
  }
}

export async function validatePolicyCandidates(policyId: string, policy: ChallengePolicyContent, source: ChallengeCandidateSource, validatedAt = new Date().toISOString()) {
  if (!isChallengePolicyContent(policy)) throw new TypeError('Expected Challenge Policy content')
  const candidates = await source.list()
  const eligible = candidates.filter((candidate) => evaluatePracticeEligibility(policy, candidate).eligible)
  const fixed = policy.source.mode === 'fixed-practice' ? candidates.find(({ contentId }) => contentId === policy.source.fixedPracticeContentId) : undefined
  let code: string | null = null
  if (policy.source.mode === 'eligible-pool' && !eligible.length) code = 'challenge-policy.no-eligible-practice'
  if (policy.source.mode === 'fixed-practice' && !fixed) code = 'challenge-policy.fixed-practice-not-found'
  else if (policy.source.mode === 'fixed-practice' && fixed && !evaluatePracticeEligibility(policy, fixed).eligible) code = 'challenge-policy.fixed-practice-ineligible'
  const candidateSnapshotHash = await eligibilitySnapshotHash(eligible)
  const policySourceHash = await sha256Canonical(policy.source)
  const evidence: ChallengePolicyEvidence = { eligibleCandidateCount: eligible.length, candidateSnapshotHash, validatedAt, policySourceHash }
  return { candidates, eligible, evidence, code, policyId }
}
