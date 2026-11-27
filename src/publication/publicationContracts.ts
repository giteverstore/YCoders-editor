import { canonicalize } from 'json-canonicalize'
import { z } from 'zod'
import type { AdminRole } from '../auth/permissions.js'
import { assetMetadataSchema } from '../assets/asset.schema.js'
import { contentEnvelopeSchema, contentTypeSchema, type ContentDocument, type ContentType } from '../content/core/envelope.js'
import { isoDateTimeSchema, uuidSchema } from '../content/core/identifiers.js'

export const PUBLICATION_CONTRACT_VERSION = 2 as const
export const V2_PUBLICATION_COLLECTION = 'editorV2Publications'
export const V2_PUBLICATION_AUDIT_COLLECTION = 'editorV2PublicationAudit'
export const V2_PUBLISHED_ASSET_PREFIX = 'editor-v2-published-assets/sha256'
export const IDEMPOTENCY_RETENTION_DAYS = 30
export const publicationNamespaceSchema = z.enum(['legacy', 'v2'])
export type PublicationNamespace = z.infer<typeof publicationNamespaceSchema>
export const publicationIdentitySchema = z.object({ namespace: publicationNamespaceSchema, contentType: contentTypeSchema, contentId: uuidSchema, publicationVersion: z.number().int().positive() }).strict()
export type PublicationIdentity = z.infer<typeof publicationIdentitySchema>

export const publicationStateSchema = z.enum(['draft', 'published', 'unpublished', 'disabled', 'archived'])
export const publishedVisibilitySchema = z.enum(['private', 'public', 'unlisted', 'hidden'])
export const contentHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/)
export const publicationPermissionSchema = z.enum(['publication:read', 'publication:publish', 'publication:release', 'publication:rollback', 'publication:unpublish', 'publication:disable', 'publication:enable', 'publication:archive'])
export type PublicationPermission = z.infer<typeof publicationPermissionSchema>
const mutationPermissions: PublicationPermission[] = ['publication:read', 'publication:publish', 'publication:release', 'publication:rollback', 'publication:unpublish', 'publication:disable', 'publication:enable', 'publication:archive']
export const publicationPermissions: Readonly<Record<AdminRole, ReadonlySet<PublicationPermission>>> = {
  SUPER_ADMIN: new Set(mutationPermissions), CONTENT_ADMIN: new Set(mutationPermissions), CONTENT_EDITOR: new Set(['publication:read']), CONTENT_REVIEWER: new Set(['publication:read']),
}

export const assetManifestEntrySchema = z.object({ assetId: uuidSchema, mimeType: assetMetadataSchema.shape.mimeType, byteLength: z.number().int().positive(), width: z.number().int().positive(), height: z.number().int().positive(), contentHash: contentHashSchema, publishedObjectPath: z.string().regex(/^editor-v2-published-assets\/sha256\/[a-f0-9]{64}\.(png|jpg|webp)$/) }).strict().superRefine((asset, context) => {
  if (!asset.publishedObjectPath.includes(`/sha256/${asset.contentHash.slice(7)}.`)) context.addIssue({ code: 'custom', path: ['publishedObjectPath'], message: 'Published asset path must contain its content hash' })
})
export const publicationSourceSchema = z.object({ draftId: uuidSchema, draftRevision: z.number().int().positive(), documentVersion: z.number().int().positive(), draftFingerprint: contentHashSchema }).strict()
export const publicationVersionSchema = z.object({
  contractVersion: z.literal(PUBLICATION_CONTRACT_VERSION), identity: publicationIdentitySchema.extend({ namespace: z.literal('v2') }), schemaVersion: z.literal('2.0.0'), contentVersion: z.number().int().positive(), artifactPath: z.string().regex(/^editor-v2-publications\/[0-9a-f-]{36}\/v[1-9][0-9]*\.json$/), artifactHash: contentHashSchema, documentHash: contentHashSchema, document: contentEnvelopeSchema, assetManifest: z.array(assetManifestEntrySchema).max(1000), source: publicationSourceSchema, publishedAt: isoDateTimeSchema, publishedBy: z.string().min(1).max(128), correlationId: uuidSchema, requestId: uuidSchema,
}).strict().superRefine((value, context) => {
  if (value.document.id !== value.identity.contentId) context.addIssue({ code: 'custom', path: ['document', 'id'], message: 'Published identity must equal contentId' })
  if (value.document.contentType !== value.identity.contentType) context.addIssue({ code: 'custom', path: ['identity', 'contentType'], message: 'Content type must match the document' })
  if (value.document.documentVersion !== value.contentVersion) context.addIssue({ code: 'custom', path: ['contentVersion'], message: 'Content version must match the document version' })
  if (value.source.draftId !== value.identity.contentId) context.addIssue({ code: 'custom', path: ['source', 'draftId'], message: 'Publication source must use stable content identity' })
  if (value.artifactPath !== `editor-v2-publications/${value.identity.contentId}/v${value.identity.publicationVersion}.json`) context.addIssue({ code: 'custom', path: ['artifactPath'], message: 'Artifact path must be version-addressed by publication identity' })
})

export const publicationPointerSchema = z.object({ contractVersion: z.literal(PUBLICATION_CONTRACT_VERSION), namespace: z.literal('v2'), contentId: uuidSchema, contentType: contentTypeSchema, state: publicationStateSchema, visibility: publishedVisibilitySchema, activeVersionNumber: z.number().int().positive().nullable(), latestVersionNumber: z.number().int().nonnegative(), revision: z.number().int().nonnegative(), updatedAt: isoDateTimeSchema, updatedBy: z.string().min(1).max(128) }).strict().superRefine((value, context) => {
  if (value.state === 'published' && value.activeVersionNumber === null) context.addIssue({ code: 'custom', path: ['state'], message: 'Published state requires an active version' })
  if (['draft', 'archived'].includes(value.state) && value.activeVersionNumber !== null) context.addIssue({ code: 'custom', path: ['activeVersionNumber'], message: `${value.state} state cannot have an active version` })
  if (value.visibility === 'public' && value.state !== 'published') context.addIssue({ code: 'custom', path: ['visibility'], message: 'Public visibility requires published state' })
  if (value.activeVersionNumber !== null && value.activeVersionNumber > value.latestVersionNumber) context.addIssue({ code: 'custom', path: ['activeVersionNumber'], message: 'Active version cannot exceed latest version' })
  if (value.state !== 'draft' && value.latestVersionNumber === 0) context.addIssue({ code: 'custom', path: ['latestVersionNumber'], message: 'Publication history is required outside draft state' })
})

export const transitionSchema = z.enum(['publish', 'publish-new-version', 'release', 'unpublish', 'republish', 'disable', 'enable', 'archive', 'rollback'])
export type PublicationState = z.infer<typeof publicationStateSchema>
export type PublicationTransition = z.infer<typeof transitionSchema>
const transitions: Readonly<Record<PublicationTransition, ReadonlySet<PublicationState>>> = { publish: new Set(['draft']), 'publish-new-version': new Set(['published']), release: new Set(['published']), unpublish: new Set(['published']), republish: new Set(['unpublished']), disable: new Set(['published', 'unpublished']), enable: new Set(['disabled']), archive: new Set(['draft', 'published', 'unpublished', 'disabled']), rollback: new Set(['published', 'unpublished', 'disabled']) }
export const canTransition = (from: PublicationState, action: PublicationTransition) => transitions[action].has(from)
export function nextState(from: PublicationState, action: PublicationTransition): PublicationState { if (!canTransition(from, action)) throw new Error(`Transition ${action} is not allowed from ${from}`); if (['publish', 'publish-new-version', 'release', 'republish', 'enable', 'rollback'].includes(action)) return 'published'; if (action === 'unpublish') return 'unpublished'; if (action === 'disable') return 'disabled'; return 'archived' }
export const canPublish = (role: AdminRole, permission: PublicationPermission) => publicationPermissions[role].has(permission)
export function nextVersionNumber(latest: number) { if (!Number.isSafeInteger(latest) || latest < 0 || latest >= Number.MAX_SAFE_INTEGER) throw new Error('Latest version must allow a safe next integer'); return latest + 1 }

export const auditEventSchema = z.object({ eventId: uuidSchema, correlationId: uuidSchema, requestId: uuidSchema, action: transitionSchema, actorUid: z.string().min(1).max(128), identity: publicationIdentitySchema, priorState: publicationStateSchema, newState: publicationStateSchema, priorActiveVersion: z.number().int().positive().nullable(), newActiveVersion: z.number().int().positive().nullable(), occurredAt: isoDateTimeSchema }).strict()
export const idempotencyRecordSchema = z.object({ requestId: uuidSchema, actorUid: z.string().min(1).max(128), contentId: uuidSchema, operation: transitionSchema, payloadHash: contentHashSchema, correlationId: uuidSchema, status: z.enum(['in-progress', 'committed', 'failed']), resultIdentity: publicationIdentitySchema.nullable(), createdAt: isoDateTimeSchema, expiresAt: isoDateTimeSchema }).strict().superRefine((value, context) => {
  if (new Date(value.expiresAt) <= new Date(value.createdAt)) context.addIssue({ code: 'custom', path: ['expiresAt'], message: 'Idempotency expiry must follow creation' })
  if (value.status === 'committed' && value.resultIdentity === null) context.addIssue({ code: 'custom', path: ['resultIdentity'], message: 'Committed request requires its original result' })
})
export type IdempotencyDecision = 'execute' | 'return-original' | 'reject-payload-mismatch' | 'reject-in-progress'
type IdempotencyRecord = z.infer<typeof idempotencyRecordSchema>
export function evaluateIdempotency(existing: IdempotencyRecord | null, input: Pick<IdempotencyRecord, 'requestId' | 'actorUid' | 'contentId' | 'operation' | 'payloadHash'>): IdempotencyDecision { if (!existing) return 'execute'; const same = existing.requestId === input.requestId && existing.actorUid === input.actorUid && existing.contentId === input.contentId && existing.operation === input.operation && existing.payloadHash === input.payloadHash; if (!same) return 'reject-payload-mismatch'; return existing.status === 'committed' ? 'return-original' : 'reject-in-progress' }

export const publishConfirmationSchema = z.object({ contentId: uuidSchema, contentType: contentTypeSchema, draftRevision: z.number().int().positive(), documentVersion: z.number().int().positive(), draftFingerprint: contentHashSchema, validationFingerprint: contentHashSchema, pointerRevision: z.number().int().nonnegative(), proposedVersionNumber: z.number().int().positive(), assetManifestHash: contentHashSchema, assetIds: z.array(uuidSchema), actorUid: z.string().min(1).max(128), operation: transitionSchema, issuedAt: isoDateTimeSchema, expiresAt: isoDateTimeSchema, completedSteps: z.tuple([z.literal(true), z.literal(true), z.literal(true)]) }).strict()
export const lifecycleOperationSchema = z.enum(['release', 'rollback', 'unpublish', 'republish', 'disable', 'enable', 'archive'])
export type LifecycleOperation = z.infer<typeof lifecycleOperationSchema>
export const lifecycleConfirmationSchema = z.object({ contentId: uuidSchema, contentType: contentTypeSchema, actorUid: z.string().min(1).max(128), operation: lifecycleOperationSchema,
  expectedPointerRevision: z.number().int().nonnegative(), currentState: publicationStateSchema, currentVisibility: publishedVisibilitySchema, currentActiveVersion: z.number().int().positive().nullable(),
  targetVersion: z.number().int().positive().nullable(), issuedAt: isoDateTimeSchema, expiresAt: isoDateTimeSchema, confirmed: z.literal(true), archiveConfirmed: z.boolean() }).strict().superRefine((value, context) => {
  if (value.operation === 'rollback' && value.targetVersion === null) context.addIssue({ code: 'custom', path: ['targetVersion'], message: 'Rollback requires a target version' })
  if (value.operation !== 'rollback' && value.targetVersion !== null) context.addIssue({ code: 'custom', path: ['targetVersion'], message: 'Only rollback accepts a target version' })
  if (value.operation === 'archive' && !value.archiveConfirmed) context.addIssue({ code: 'custom', path: ['archiveConfirmed'], message: 'Archive requires its second explicit confirmation' })
})

export type EvidenceClassification = 'confirmed-by-inspected-source' | 'approved-design-decision' | 'requires-learner-implementation' | 'requires-deployed-verification'
export type CompatibilityFinding = { domain: ContentType; severity: 'error' | 'warning' | 'info'; path: string; code: string; explanation: string; requiredAction: string; evidence: EvidenceClassification }
export type PublicationCompatibilityResult = { schemaValid: boolean; storageReady: boolean; learnerRuntimeCompatible: boolean; learnerIntegrationReady: boolean; findings: CompatibilityFinding[] }
const issue = (domain: ContentType, severity: CompatibilityFinding['severity'], path: string, code: string, explanation: string, requiredAction: string, evidence: EvidenceClassification): CompatibilityFinding => ({ domain, severity, path, code, explanation, requiredAction, evidence })
function containsExternalImage(value: unknown): boolean { if (Array.isArray(value)) return value.some(containsExternalImage); if (!value || typeof value !== 'object') return false; const record = value as Record<string, unknown>; const data = record.data as Record<string, unknown> | undefined; return (record.type === 'image' && typeof data?.src === 'string') || Object.values(record).some(containsExternalImage) }
export function collectAssetIds(value: unknown, output = new Set<string>()): Set<string> { if (Array.isArray(value)) value.forEach((item) => collectAssetIds(item, output)); else if (value && typeof value === 'object') { const record = value as Record<string, unknown>; if (typeof record.assetId === 'string') output.add(record.assetId); if (record.contentType === 'course') { const content = record.content as Record<string, unknown> | undefined; if (typeof content?.courseIconAssetId === 'string' && content.courseIconAssetId) output.add(content.courseIconAssetId) } Object.values(record).forEach((item) => collectAssetIds(item, output)) } return output }

export function validatePublicationCompatibility(document: ContentDocument, options: { resolvedAssetIds?: ReadonlySet<string> } = {}): PublicationCompatibilityResult {
  const findings: CompatibilityFinding[] = [], domain = document.contentType
  const parsed = contentEnvelopeSchema.safeParse(document)
  if (!parsed.success) findings.push(issue(domain, 'error', '$', 'schema.invalid', 'Document does not satisfy the V2 editing schema.', 'Correct schema errors before publication.', 'approved-design-decision'))
  if (containsExternalImage(document)) findings.push(issue(domain, 'error', '$.content', 'assets.external-image-unresolved', 'External HTTPS images are editable but cannot be published as immutable V2 assets.', 'Import the image into the private V2 asset registry.', 'approved-design-decision'))
  for (const id of collectAssetIds(document)) if (!options.resolvedAssetIds?.has(id)) findings.push(issue(domain, 'error', '$.content', 'assets.not-ready', `Referenced asset ${id} is not resolved for immutable publication.`, 'Resolve and hash every referenced private asset.', 'approved-design-decision'))
  if (domain === 'practice' && (!document.content.execution || !document.content.executablePublicTests)) findings.push(issue(domain, 'error', '$.content.execution', 'practice.execution-contract-missing', 'Legacy Practice content remains readable but cannot be delivered without an explicit execution contract.', 'Migrate the document explicitly; do not infer execution from generic text or JSON examples.', 'requires-learner-implementation'))
  if (domain === 'course') {
    if (!document.content.courseIconAssetId) findings.push(issue(domain, 'error', '$.content.courseIconAssetId', 'course.icon-required', 'Production-ready Courses require a Course icon.', 'Select or upload a versioned Course icon asset.', 'approved-design-decision'))
    const lessons = document.content.modules.flatMap((module) => module.organization === 'lessons' ? module.lessons : module.sections.flatMap((section) => section.lessons))
    for (const lesson of lessons) for (const block of lesson.blocks) {
      if (block.type === 'quiz') {
        if (!block.data.mode) findings.push(issue(domain, 'error', `$.content.lessons.${lesson.id}.blocks.${block.id}.mode`, 'quiz.mode-required', 'Quiz answer mode must be explicit.', 'Choose single-correct or multiple-correct.', 'approved-design-decision'))
        const options = block.data.options
        const correctCount = options.filter(({ isCorrect }) => isCorrect).length
        if (options.some(({ text }) => !text.trim())) findings.push(issue(domain, 'error', `$.content.blocks.${block.id}.options`, 'quiz.option-empty', 'Every quiz option needs non-empty text.', 'Enter text for every option.', 'approved-design-decision'))
        if (new Set(options.map(({ id }) => id)).size !== options.length) findings.push(issue(domain, 'error', `$.content.blocks.${block.id}.options`, 'quiz.option-id-duplicate', 'Quiz option IDs must be unique.', 'Assign a unique stable ID to every option.', 'approved-design-decision'))
        if (block.data.mode === 'single-correct' && (options.length < 2 || correctCount !== 1)) findings.push(issue(domain, 'error', `$.content.blocks.${block.id}.options`, 'quiz.single-correct-answer-count-invalid', 'Single-correct quizzes need at least two options and exactly one correct answer.', 'Mark exactly one option correct and retain at least two options.', 'approved-design-decision'))
        if (block.data.mode === 'multiple-correct' && (options.length < 2 || correctCount < 2 || correctCount >= options.length)) findings.push(issue(domain, 'error', `$.content.blocks.${block.id}.options`, 'quiz.multi-correct-answer-count-invalid', 'Multiple-correct quizzes need at least two correct options and at least one incorrect option.', 'Mark at least two options correct and leave at least one incorrect.', 'approved-design-decision'))
      }
      if (block.type === 'exercise') {
        const tests = block.data.publicTests ?? []
        const coding = Boolean(block.data.language || block.data.starterCode !== undefined || tests.length)
        if (coding && tests.length === 0) findings.push(issue(domain, 'error', `$.content.blocks.${block.id}.publicTests`, 'exercise.public-tests-missing', 'Coding exercises need at least one public test.', 'Add a learner-visible test with input and expected output.', 'approved-design-decision'))
        if (coding && !block.data.language) findings.push(issue(domain, 'error', `$.content.blocks.${block.id}.language`, 'exercise.execution-contract-invalid', 'Coding exercises need a supported execution language.', 'Select a supported language for this exercise.', 'approved-design-decision'))
        if (new Set(tests.map(({ id }) => id)).size !== tests.length) findings.push(issue(domain, 'error', `$.content.blocks.${block.id}.publicTests`, 'exercise.test-id-duplicate', 'Public test IDs must be unique.', 'Assign a unique stable ID to every public test.', 'approved-design-decision'))
        if (tests.some(({ input }) => typeof input !== 'string')) findings.push(issue(domain, 'error', `$.content.blocks.${block.id}.publicTests`, 'exercise.test-input-invalid', 'Every public test input must be text.', 'Provide a text input for every test case.', 'approved-design-decision'))
        if (tests.some(({ expectedOutput }) => expectedOutput === undefined)) findings.push(issue(domain, 'error', `$.content.blocks.${block.id}.publicTests`, 'exercise.expected-output-missing', 'Every public test needs an expected output.', 'Provide expected output; use an empty string when appropriate.', 'approved-design-decision'))
      }
    }
  }
  if (domain === 'challenge') { if (document.content.rewards.points !== 20) findings.push(issue(domain, 'warning', '$.content.rewards.points', 'challenge.reward-incompatible', 'Current learner assignments require a fixed 20-coin reward.', 'Map to the approved reward contract or defer learner delivery.', 'confirmed-by-inspected-source')); findings.push(issue(domain, 'warning', '$.content.rewards', 'challenge.streak-contract-missing', 'V2 does not represent the required streak increment of one.', 'Add an explicit compatibility contract before assignment integration.', 'requires-learner-implementation')) }
  if (domain === 'project') { findings.push(issue(domain, 'warning', '$.content.starterWorkspace', 'project.runtime-missing', 'No explicit learner runtime identifier exists.', 'Add an explicit runtime contract; do not infer it from language.', 'requires-learner-implementation'), issue(domain, 'warning', '$.content.starterWorkspace', 'project.entrypoint-missing', 'No explicit Project entrypoint exists.', 'Add an entrypoint field or lossless derivation rule.', 'requires-learner-implementation'), issue(domain, 'warning', '$.content.checkpoints.*.tasks.*.validators', 'project.validator-id-missing', 'Project validators lack stable IDs.', 'Add stable validator identities.', 'requires-learner-implementation')) }
  const errors = findings.some((item) => item.severity === 'error'), learnerGaps = findings.some((item) => item.evidence === 'requires-learner-implementation')
  return { schemaValid: parsed.success, storageReady: parsed.success && !errors, learnerRuntimeCompatible: parsed.success && !errors && !learnerGaps, learnerIntegrationReady: false, findings }
}

type StableEntity = { kind: string; id: string }
export function stableEntities(document: ContentDocument): StableEntity[] { const entities: StableEntity[] = [{ kind: document.contentType, id: document.id }]; if (document.contentType === 'course') for (const module of document.content.modules) { entities.push({ kind: 'module', id: module.id }); const lessons = module.organization === 'lessons' ? module.lessons : module.sections.flatMap((section) => { entities.push({ kind: 'section', id: section.id }); return section.lessons }); for (const lesson of lessons) { entities.push({ kind: 'lesson', id: lesson.id }); lesson.blocks.forEach((block) => { if (block.type === 'hint') block.data.hints.forEach((hint) => entities.push({ kind: 'hint', id: hint.id })) }) } } if (document.contentType === 'practice') entities.push({ kind: 'question', id: document.id }); if (document.contentType === 'challenge') entities.push({ kind: 'challenge', id: document.id }); if (document.contentType === 'project') for (const checkpoint of document.content.checkpoints) { entities.push({ kind: 'checkpoint', id: checkpoint.id }); checkpoint.tasks.forEach((task) => entities.push({ kind: 'task', id: task.id })) } collectAssetIds(document).forEach((id) => entities.push({ kind: 'asset', id })); return entities }
export function compareStableIds(previous: ContentDocument, next: ContentDocument): CompatibilityFinding[] { if (previous.id !== next.id || previous.contentType !== next.contentType) return [issue(next.contentType, 'error', '$.id', 'identity.changed', 'Published identity and domain cannot change.', 'Publish as a new content identity.', 'approved-design-decision')]; const current = new Set(stableEntities(next).map(({ kind, id }) => `${kind}:${id}`)); return stableEntities(previous).filter(({ kind, id }) => !current.has(`${kind}:${id}`)).map(({ kind, id }) => issue(next.contentType, ['lesson', 'checkpoint', 'task'].includes(kind) ? 'error' : 'warning', '$.content', `stable-id.removed.${kind}`, `Previously published ${kind} ID ${id} was removed.`, 'Restore it or explicitly approve a breaking change.', 'confirmed-by-inspected-source')) }

function assertCanonicalValue(value: unknown, seen = new Set<object>()): void {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') throw new TypeError('Canonical JSON accepts JSON values only')
  if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('Canonical JSON rejects non-finite numbers')
  if (!value || typeof value !== 'object') return
  if (seen.has(value)) throw new TypeError('Canonical JSON rejects cyclic values')
  seen.add(value)
  if (Array.isArray(value)) { for (let index = 0; index < value.length; index += 1) { if (!(index in value)) throw new TypeError('Canonical JSON rejects sparse arrays'); assertCanonicalValue(value[index], seen) } }
  else for (const item of Object.values(value)) assertCanonicalValue(item, seen)
  seen.delete(value)
}
export const canonicalJson = (value: unknown) => { assertCanonicalValue(value); return canonicalize(value) }
export async function sha256Canonical(value: unknown): Promise<z.infer<typeof contentHashSchema>> { const bytes = new TextEncoder().encode(canonicalJson(value)); const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes); return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}` }
