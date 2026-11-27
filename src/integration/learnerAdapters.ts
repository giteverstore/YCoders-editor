import { contentEnvelopeSchema, type ChallengeDocument, type CourseDocument, type PracticeDocument, type ProjectDocument } from '../content/core/envelope.js'
import type { ContentBlock } from '../content/blocks/block.schemas.js'
import type { AdapterFinding, AdapterResult, AdapterSource, AssetDeliveryDescriptor, LearnerBlock, LearnerChallenge, LearnerCourse, LearnerIdentity, LearnerPractice, LearnerProject, LearnerProjectValidator } from './learnerAdapter.types.js'
import { practiceArgumentTypeSchema, practiceExecutionModeSchema, practiceLanguageIdSchema, practiceResultTypeSchema, practiceSemanticValidatorIdSchema } from '../content/domains/practice/practice.execution.js'

export const SUPPORTED_COURSE_BLOCKS = Object.freeze(['richText', 'image', 'code', 'callout', 'hint', 'divider', 'table', 'quiz', 'exercise', 'expectedOutput', 'solution'] as const)
const supportedBlocks = new Set<string>(SUPPORTED_COURSE_BLOCKS)
const finding = (domain: AdapterFinding['domain'], code: string, path: string, message: string, requiredAction: string, severity: AdapterFinding['severity'] = 'error'): AdapterFinding => ({ domain, code, severity, path, message, requiredAction })
const fail = <T>(errors: AdapterFinding[], classification: 'requires-learner-upgrade' | 'requires-v2-schema-change' | 'invalid-publication', warnings: AdapterFinding[] = []): AdapterResult<T> => ({ ok: false, errors, warnings, classification })
const success = <T>(value: T, warnings: AdapterFinding[] = []): AdapterResult<T> => ({ ok: true, value, warnings, classification: warnings.length ? 'compatible-with-warnings' : 'compatible' })

export function assetDeliveryDescriptor(namespace: 'v2', contentId: string, publicationVersion: number, assetId: string): AssetDeliveryDescriptor {
  return { kind: 'versioned-v2-asset', namespace, contentId, publicationVersion, assetId, deliveryKey: `v2:${contentId}:v${publicationVersion}:asset:${assetId}` }
}

function identity(source: AdapterSource): LearnerIdentity | AdapterFinding[] {
  const { identity: value, document } = source
  const errors: AdapterFinding[] = []
  if (value.namespace !== 'v2') errors.push(finding(document.contentType, 'identity.namespace', '$.identity.namespace', 'Learner adapters require an explicit v2 namespace.', 'Route legacy and V2 identities explicitly.'))
  if (value.contentId !== document.id || value.contentType !== document.contentType) errors.push(finding(document.contentType, 'identity.mismatch', '$.identity', 'Publication identity does not match the immutable document.', 'Reject the corrupt publication.'))
  return errors.length ? errors : { namespace: 'v2', contentType: value.contentType, contentId: value.contentId, publicationVersion: value.publicationVersion }
}
function validateCurrent(source: AdapterSource) { const parsed = contentEnvelopeSchema.safeParse(source.document); return parsed.success ? [] : parsed.error.issues.map(issue => { const path = `$.${issue.path.join('.')}`; if (path.includes('.blocks')) return finding(source.document.contentType, 'block.unsupported', path, 'A block is invalid or unsupported by the current learner adapter.', 'Use a learner-supported, schema-valid block.'); if (source.document.contentType === 'challenge' && path.includes('scheduledDate')) return finding('challenge', 'challenge.date-invalid', path, 'Challenge date is not a valid Asia/Kolkata calendar date.', 'Use a valid YYYY-MM-DD calendar date.'); return finding(source.document.contentType, 'publication.invalid', path, issue.message, 'Publish a schema-valid immutable document.') }) }
function adaptBlocks(source: AdapterSource, blocks: ContentBlock[], path: string): { blocks: LearnerBlock[]; errors: AdapterFinding[] } {
  const errors: AdapterFinding[] = [], manifest = new Set(source.assetManifest.map(x => x.assetId))
  const mapped = blocks.flatMap((block, index) => {
    if (!supportedBlocks.has(block.type)) { errors.push(finding(source.document.contentType, 'block.unsupported', `${path}[${index}]`, `Block type ${block.type} is unsupported by the current learner adapter.`, 'Add learner rendering support or replace the block.')); return [] }
    if (block.type === 'quiz') {
      if (!block.data.mode) {
        errors.push(finding('course', 'quiz.mode-required', `${path}[${index}].data.mode`, 'Quiz answer mode must be explicit.', 'Choose single-correct or multiple-correct.'))
        return []
      }
      const { question, mode, options, explanation } = block.data
      return [{
        ...block,
        data: {
          question,
          mode,
          selectionMode: mode === 'multiple-correct' ? 'multiple' : 'single',
          options: options.map(({ id, text }) => ({ id, text })),
          correctOptionIds: options.filter(({ isCorrect }) => isCorrect).map(({ id }) => id),
          ...(explanation === undefined ? {} : { explanation }),
        },
      } as LearnerBlock]
    }
    if (block.type === 'exercise') {
      const { prompt, language, starterCode, publicTests = [] } = block.data
      return [{
        ...block,
        data: {
          prompt: structuredClone(prompt),
          ...(language === undefined ? {} : { language }),
          ...(starterCode === undefined ? {} : { starterCode }),
          publicTests: publicTests.map(({ id, input, expectedOutput }) => ({ id, input, expectedOutput })),
        },
      } as LearnerBlock]
    }
    if (block.type === 'hint') return [{ ...block, data: { hints: block.data.hints.map(({ id, title, content }) => ({ id, title, content: structuredClone(content) })) } } as LearnerBlock]
    if (block.type !== 'image') return [structuredClone(block) as LearnerBlock]
    if (!('assetId' in block.data)) { errors.push(finding(source.document.contentType, 'asset.external', `${path}[${index}].data`, 'External image URLs are not version-addressed V2 assets.', 'Publish the image through the immutable asset manifest.')); return [] }
    if (!manifest.has(block.data.assetId)) { errors.push(finding(source.document.contentType, 'asset.manifest-missing', `${path}[${index}].data.assetId`, 'The image is absent from the immutable asset manifest.', 'Repair the publication before learner delivery.')); return [] }
    return [{ ...block, data: { ...block.data, delivery: assetDeliveryDescriptor('v2', source.identity.contentId, source.identity.publicationVersion, block.data.assetId) } } as LearnerBlock]
  })
  return { blocks: mapped, errors }
}

export function adaptCourse(source: AdapterSource<CourseDocument>): AdapterResult<LearnerCourse> {
  const invalid = validateCurrent(source), learnerIdentity = identity(source); if (invalid.length || Array.isArray(learnerIdentity)) return fail([...invalid, ...(Array.isArray(learnerIdentity) ? learnerIdentity : [])], 'invalid-publication')
  const errors: AdapterFinding[] = [], lessons: Array<{ id: string }> = [], modules: LearnerCourse['modules'] = []
  source.document.content.modules.forEach((module, mi) => { if (module.organization === 'lessons') { const adapted = module.lessons.map((lesson, li) => { const x = adaptBlocks(source, lesson.blocks, `$.content.modules[${mi}].lessons[${li}].blocks`); errors.push(...x.errors); lessons.push(lesson); return { ...lesson, compilerLanguage: lesson.compilerLanguage ?? source.document.content.defaultCompilerLanguage ?? null, blocks: x.blocks } }); modules.push({ id: module.id, title: module.title, organization: 'lessons', lessons: adapted }) } else { const sections = module.sections.map((section, si) => ({ id: section.id, title: section.title, lessons: section.lessons.map((lesson, li) => { const x = adaptBlocks(source, lesson.blocks, `$.content.modules[${mi}].sections[${si}].lessons[${li}].blocks`); errors.push(...x.errors); lessons.push(lesson); return { ...lesson, compilerLanguage: lesson.compilerLanguage ?? source.document.content.defaultCompilerLanguage ?? null, blocks: x.blocks } }) })); modules.push({ id: module.id, title: module.title, organization: 'sections', sections }) } })
  const ids = lessons.map(x => x.id), defaultLessonId = source.learnerContract?.course?.defaultLessonId ?? ids[0]
  if (!ids.includes(defaultLessonId)) errors.push(finding('course', 'course.navigation-target-invalid', '$.learnerContract.course.defaultLessonId', 'Default lesson does not reference a lesson in this publication.', 'Choose a stable lesson ID from this exact version.'))
  for (const removed of source.previousStableIds?.filter(id => !ids.includes(id)) ?? []) errors.push(finding('course', 'course.lesson-id-removed', '$.content.modules', `Previously stable lesson ID ${removed} was removed.`, 'Restore the stable lesson or publish a new independent identity.'))
  const courseIconAssetId = source.document.content.courseIconAssetId
  let courseIcon: AssetDeliveryDescriptor | null = null
  if (courseIconAssetId) {
    if (source.assetManifest.some(({ assetId }) => assetId === courseIconAssetId)) courseIcon = assetDeliveryDescriptor('v2', source.identity.contentId, source.identity.publicationVersion, courseIconAssetId)
    else errors.push(finding('course', 'course.icon-manifest-missing', '$.content.courseIconAssetId', 'The Course icon is absent from the immutable publication asset manifest.', 'Repair the publication manifest before learner delivery.'))
  }
  if (errors.length) return fail(errors, errors.some(x => x.code === 'publication.invalid') ? 'invalid-publication' : 'requires-learner-upgrade')
  return success({ identity: learnerIdentity, courseId: source.document.id, title: source.document.title, description: source.document.content.description, category: source.document.content.courseMetadata.category ?? null, language: source.document.content.language, difficulty: source.document.content.difficulty, estimatedMinutes: source.document.content.estimatedMinutes, defaultCompilerLanguage: source.document.content.defaultCompilerLanguage ?? null, learningOutcomes: [...source.document.content.learningOutcomes], prerequisites: [...source.document.content.courseMetadata.prerequisites], courseIcon, defaultLessonId, modules, navigation: ids.map((lessonId, index) => ({ lessonId, previousLessonId: ids[index - 1] ?? null, nextLessonId: ids[index + 1] ?? null })) })
}

export function adaptPractice(source: AdapterSource<PracticeDocument>): AdapterResult<LearnerPractice> {
  const contractErrors = practiceContractErrors(source.document as unknown as Record<string, unknown>); if (contractErrors.length) return fail(contractErrors, 'requires-learner-upgrade')
  const invalid = validateCurrent(source), learnerIdentity = identity(source); if (invalid.length || Array.isArray(learnerIdentity)) return fail([...invalid, ...(Array.isArray(learnerIdentity) ? learnerIdentity : [])], 'invalid-publication')
  const errors: AdapterFinding[] = [], content = source.document.content
  if (!content.execution || !content.executablePublicTests) errors.push(finding('practice', 'practice.execution-contract-missing', '$.content.execution', 'Legacy Practice content has no unambiguous executable contract.', 'Explicitly migrate the document before learner delivery.'))
  const blocks = adaptBlocks(source, source.document.content.instructions, '$.content.instructions'); errors.push(...blocks.errors)
  if (errors.length) return fail(errors, 'requires-learner-upgrade')
  const difficulty = ({ beginner: 'easy', intermediate: 'medium', advanced: 'hard' } as const)[content.difficulty]
  const assets = blocks.blocks.flatMap((block) => block.type === 'image' && typeof block.data === 'object' && block.data && 'delivery' in block.data ? [(block.data as { delivery: AssetDeliveryDescriptor }).delivery] : [])
  const value: LearnerPractice = { identity: learnerIdentity as LearnerIdentity, questionId: source.document.id, title: source.document.title, summary: source.document.metadata.summary ?? '', difficulty, topics: [...content.questionMetadata.topics], tags: [...source.document.metadata.tags], estimatedMinutes: content.questionMetadata.estimatedMinutes, languages: structuredClone(content.languages), starterCode: structuredClone(content.starterCode), examples: structuredClone(content.examples), constraints: [...content.constraints], hints: structuredClone(content.hints), instructions: blocks.blocks, execution: structuredClone(content.execution!), publicTests: structuredClone(content.executablePublicTests!), executionAssurance: 'browser-public-tests', runSemantics: 'execute-and-evaluate-all-public-tests', assets }
  if (JSON.stringify(value).includes('referenceSolutions')) return fail([finding('practice', 'practice.dto-safety-violation', '$', 'Trusted solution material entered the learner DTO.', 'Reject the unsafe adapter result.')], 'invalid-publication')
  return success(value)
}

function practiceContractErrors(document: Record<string, unknown>): AdapterFinding[] {
  const content = document.content as Record<string, unknown> | undefined, errors: AdapterFinding[] = []
  const languages = ((content?.languages as { supported?: Array<{ id?: unknown }> } | undefined)?.supported ?? [])
  languages.forEach((language, index) => { if (!practiceLanguageIdSchema.safeParse(language.id).success) errors.push(finding('practice', 'practice.language-unsupported', `$.content.languages.supported[${index}].id`, `Practice language ${String(language.id)} is unsupported.`, 'Use one of the closed V2 Practice language IDs.')) })
  const execution = content?.execution as Record<string, unknown> | undefined
  if (execution && !practiceExecutionModeSchema.safeParse(execution.mode).success) errors.push(finding('practice', 'practice.execution-mode-unsupported', '$.content.execution.mode', `Practice execution mode ${String(execution.mode)} is unsupported.`, 'Use stdout, function, or stateful execution.'))
  const argumentSpecs = [...((execution?.arguments as Array<Record<string, unknown>> | undefined) ?? []), ...((execution?.constructorArguments as Array<Record<string, unknown>> | undefined) ?? [])]
  argumentSpecs.forEach((argument, index) => { if (!practiceArgumentTypeSchema.safeParse(argument.type).success) errors.push(finding('practice', 'practice.argument-type-unsupported', `$.content.execution.arguments[${index}].type`, `Practice argument type ${String(argument.type)} is unsupported.`, 'Use an inventoried portable argument type.')) })
  const result = execution?.result as Record<string, unknown> | undefined
  if (result && !practiceResultTypeSchema.safeParse(result.type).success) errors.push(finding('practice', 'practice.return-type-unsupported', '$.content.execution.result.type', `Practice result type ${String(result.type)} is unsupported.`, 'Use an inventoried portable result type.'))
  const tests = (content?.executablePublicTests as Array<Record<string, unknown>> | undefined) ?? []
  tests.forEach((test, index) => {
    const comparison = test.comparison as Record<string, unknown> | undefined, kind = comparison?.kind
    if (!['exact-text', 'trimmed-text', 'json-equivalent', 'numeric-tolerance', 'semantic'].includes(String(kind))) errors.push(finding('practice', 'practice.comparator-unsupported', `$.content.executablePublicTests[${index}].comparison.kind`, `Practice comparator ${String(kind)} is unsupported.`, 'Use a closed V2 comparator.'))
    else if (kind === 'numeric-tolerance' && !(typeof comparison?.tolerance === 'number' && Number.isFinite(comparison.tolerance) && comparison.tolerance > 0)) errors.push(finding('practice', 'practice.comparator-config-invalid', `$.content.executablePublicTests[${index}].comparison.tolerance`, 'Numeric tolerance must be finite and positive.', 'Provide an explicit positive tolerance.'))
    else if (kind === 'semantic' && !practiceSemanticValidatorIdSchema.safeParse(comparison?.validatorId).success) errors.push(finding('practice', 'practice.semantic-validator-unsupported', `$.content.executablePublicTests[${index}].comparison.validatorId`, `Practice semantic validator ${String(comparison?.validatorId)} is unsupported.`, 'Use a registered declarative validator ID.'))
    for (const [argumentIndex, argument] of ((test.arguments as Array<Record<string, unknown>> | undefined) ?? []).entries()) if (!practiceArgumentTypeSchema.safeParse(argument.type).success) errors.push(finding('practice', 'practice.argument-type-unsupported', `$.content.executablePublicTests[${index}].arguments[${argumentIndex}].type`, `Practice argument type ${String(argument.type)} is unsupported.`, 'Use an inventoried portable argument type.'))
    const expected = test.expectedResult as Record<string, unknown> | undefined
    if (expected && !practiceResultTypeSchema.safeParse(expected.type).success) errors.push(finding('practice', 'practice.return-type-unsupported', `$.content.executablePublicTests[${index}].expectedResult.type`, `Practice result type ${String(expected.type)} is unsupported.`, 'Use an inventoried portable result type.'))
  })
  return errors
}

export function adaptChallenge(source: AdapterSource<ChallengeDocument>): AdapterResult<LearnerChallenge> {
  const invalid = validateCurrent(source), learnerIdentity = identity(source); if (invalid.length || Array.isArray(learnerIdentity)) return fail([...invalid, ...(Array.isArray(learnerIdentity) ? learnerIdentity : [])], 'invalid-publication')
  const errors: AdapterFinding[] = [], contract = source.learnerContract?.challenge
  if (source.document.content.rewards.points !== 20) errors.push(finding('challenge', 'challenge.reward-policy', '$.content.rewards.points', 'Current learner assignments require exactly 20 coins.', 'Author the confirmed reward or upgrade assignment/reward integration.'))
  if (contract?.streakIncrement !== 1) errors.push(finding('challenge', 'challenge.streak-contract-missing', '$.learnerContract.challenge.streakIncrement', 'The immutable publication does not explicitly require a +1 streak.', 'Add a frozen Challenge streak field to V2.', 'error'))
  if (contract?.timezone !== 'Asia/Kolkata') errors.push(finding('challenge', 'challenge.timezone-contract-missing', '$.learnerContract.challenge.timezone', 'Challenge calendar dates require explicit Asia/Kolkata semantics.', 'Add an explicit timezone contract to V2.'))
  if (!isCalendarDate(source.document.content.scheduledDate)) errors.push(finding('challenge', 'challenge.date-invalid', '$.content.scheduledDate', 'Challenge date is not a valid Asia/Kolkata calendar date.', 'Use a valid YYYY-MM-DD calendar date.'))
  if (contract?.comparison && !['exact', 'trimmed', 'normalized-lines'].includes(contract.comparison)) errors.push(finding('challenge', 'challenge.comparator-unsupported', '$.learnerContract.challenge.comparison', 'Challenge comparator is unsupported.', 'Use a confirmed learner comparator.'))
  const blocks = adaptBlocks(source, source.document.content.instructions, '$.content.instructions'); errors.push(...blocks.errors)
  if (errors.length) return fail(errors, errors.some(x => x.code.includes('contract-missing')) ? 'requires-v2-schema-change' : 'requires-learner-upgrade')
  return success({ identity: learnerIdentity, challengeId: source.document.id, title: source.document.title, scheduledDate: source.document.content.scheduledDate, timezone: 'Asia/Kolkata', difficulty: source.document.content.difficulty, languages: structuredClone(source.document.content.languages), starterCode: structuredClone(source.document.content.starterCode), instructions: blocks.blocks, hints: structuredClone(source.document.content.hints), verification: structuredClone(source.document.content.verification), rewardCoins: 20, streakIncrement: 1, assignmentCreated: false })
}

function isCalendarDate(value: string) { const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value); if (!match) return false; const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]), date = new Date(Date.UTC(year, month - 1, day)); return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day }

export function adaptProject(source: AdapterSource<ProjectDocument>): AdapterResult<LearnerProject> {
  const invalid = validateCurrent(source), learnerIdentity = identity(source); if (invalid.length || Array.isArray(learnerIdentity)) return fail([...invalid, ...(Array.isArray(learnerIdentity) ? learnerIdentity : [])], 'invalid-publication')
  const contract = source.learnerContract?.project, errors: AdapterFinding[] = []
  if (!contract?.runtime) errors.push(finding('project', 'project.runtime-missing', '$.learnerContract.project.runtime', 'Project runtime is not explicit.', 'Add a runtime identifier to the frozen V2 Project contract.'))
  if (!contract?.entrypoint) errors.push(finding('project', 'project.entrypoint-missing', '$.learnerContract.project.entrypoint', 'Project entrypoint is not explicit.', 'Add an entrypoint to the frozen V2 Project contract.'))
  const mapValidator = (validator: object, path: string): LearnerProjectValidator => { const id = contract?.validatorIds?.[path]; if (!id) errors.push(finding('project', 'project.validator-id-missing', path, 'Project validator has no stable identity.', 'Add stable validator IDs to the V2 schema.')); return { id: id ?? '', ...structuredClone(validator) } }
  const projectInstructions = adaptBlocks(source, source.document.content.instructions, '$.content.instructions'); errors.push(...projectInstructions.errors)
  const checkpoints = source.document.content.checkpoints.map((checkpoint, ci) => { const description = adaptBlocks(source, checkpoint.description, `$.content.checkpoints[${ci}].description`); errors.push(...description.errors); return { id: checkpoint.id, title: checkpoint.title, description: description.blocks, tasks: checkpoint.tasks.map((task, ti) => { const instructions = adaptBlocks(source, task.instructions, `$.content.checkpoints[${ci}].tasks[${ti}].instructions`); errors.push(...instructions.errors); return { id: task.id, title: task.title, instructions: instructions.blocks, hints: structuredClone(task.hints), validators: task.validators.map((validator, vi) => mapValidator(validator, `checkpoints.${ci}.tasks.${ti}.validators.${vi}`)) } }) } })
  const validators = source.document.content.validation.validators.map((validator, vi) => mapValidator(validator, `validation.validators.${vi}`))
  const paths = source.document.content.starterWorkspace.files.map(x => x.path); if (contract?.entrypoint && !paths.includes(contract.entrypoint)) errors.push(finding('project', 'project.entrypoint-not-found', '$.learnerContract.project.entrypoint', 'Entrypoint does not reference a workspace file.', 'Use an exact stable workspace path.'))
  if (errors.length) return fail(errors, 'requires-v2-schema-change')
  return { ...success({ identity: learnerIdentity, projectId: source.document.id, title: source.document.title, runtime: contract!.runtime!, entrypoint: contract!.entrypoint!, languages: structuredClone(source.document.content.languages), instructions: projectInstructions.blocks, files: source.document.content.starterWorkspace.files.map(file => ({ id: file.path, ...structuredClone(file) })), checkpoints, requirements: [...source.document.content.completionCriteria], learningObjectives: [...source.document.content.learningObjectives], validators }), classification: 'requires-v2-schema-change', warnings: [finding('project', 'project.contract-extension', '$.learnerContract.project', 'Mapping uses explicit fields not yet present in the frozen E2 Project schema.', 'Promote these fields through a versioned schema change.', 'warning')] }
}
