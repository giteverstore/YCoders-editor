import type { PracticeDocument } from '../../content/core/envelope'
import { validateContent } from '../../content/validation/validateContent'
import { collectAssetIds, validatePublicationCompatibility } from '../../publication/publicationContracts'
import { adaptPractice } from '../../integration/learnerAdapters'
import type { AdapterFinding, LearnerPractice, PublishedAssetManifestEntry } from '../../integration/learnerAdapter.types'

const hash = `sha256:${'0'.repeat(64)}`
const manifest = (document: PracticeDocument): PublishedAssetManifestEntry[] => [...collectAssetIds(document)].map((assetId) => ({ assetId, contentHash: hash, mimeType: 'image/png', width: 1, height: 1, byteLength: 1, publishedObjectPath: `editor-v2-published-assets/sha256/${'0'.repeat(64)}.png` }))

export type PracticeReadiness = {
  legacy: boolean; schemaValid: boolean; executionComplete: boolean; languageCompatible: boolean; publicTestsValid: boolean
  dtoSafe: boolean; learnerDeliverable: boolean; findings: Array<{ code: string; message: string; path: string }>; dto: LearnerPractice | null
}

export function inspectPracticeLearnerReadiness(document: PracticeDocument): PracticeReadiness {
  const schema = validateContent(document), assets = manifest(document)
  const publication = validatePublicationCompatibility(document, { resolvedAssetIds: new Set(assets.map(({ assetId }) => assetId)) })
  const adapted = adaptPractice({ identity: { namespace: 'v2', contentType: 'practice', contentId: document.id, publicationVersion: 1 }, document, assetManifest: assets })
  const adapterFindings: AdapterFinding[] = adapted.ok ? adapted.warnings : adapted.errors
  const findings = [...publication.findings.map((finding) => ({ code: finding.code, message: finding.explanation, path: finding.path })), ...adapterFindings.map((finding) => ({ code: finding.code, message: finding.message, path: finding.path }))]
    .filter((finding, index, all) => all.findIndex((candidate) => candidate.code === finding.code && candidate.path === finding.path) === index)
  const serialized = adapted.ok ? JSON.stringify(adapted.value) : ''
  const dtoSafe = adapted.ok && !serialized.includes('referenceSolutions') && !serialized.includes('publishedObjectPath') && !serialized.includes('draftRevision')
  const languages = document.content.languages, languageCompatible = languages.supported.length > 0 && languages.supported.some(({ id }) => id === languages.defaultLanguageId) && !findings.some(({ code }) => code === 'practice.language-unsupported')
  const tests = document.content.executablePublicTests
  const executionComplete = Boolean(document.content.execution && tests?.length)
  const publicTestsValid = executionComplete && !findings.some(({ code, path }) => code.includes('comparator') || code.includes('validator') || path.includes('executablePublicTests'))
  return { legacy: !document.content.execution || !tests, schemaValid: schema.success, executionComplete, languageCompatible, publicTestsValid, dtoSafe, learnerDeliverable: schema.success && publication.learnerRuntimeCompatible && adapted.ok && dtoSafe, findings, dto: adapted.ok && dtoSafe ? adapted.value : null }
}

export function serializeLearnerDtoPreview(readiness: PracticeReadiness): string { return readiness.dto ? JSON.stringify(readiness.dto, null, 2) : '' }
