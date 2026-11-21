import { describe, expect, it } from 'vitest'

import { createPracticeDocument } from '../core/practiceEditor.commands'
import { inspectPracticeLearnerReadiness, serializeLearnerDtoPreview } from './practiceLearnerReadiness'

describe('Practice learner readiness', () => {
  it('reports a new execution-authored Practice as learner safe', () => { const document = createPracticeDocument(); document.content.referenceSolutions[0].code = 'REFERENCE_SENTINEL_DO_NOT_DELIVER'; const result = inspectPracticeLearnerReadiness(document); expect(result).toMatchObject({ legacy: false, schemaValid: true, executionComplete: true, languageCompatible: true, publicTestsValid: true, dtoSafe: true, learnerDeliverable: true }); expect(serializeLearnerDtoPreview(result)).not.toContain('REFERENCE_SENTINEL_DO_NOT_DELIVER'); expect(serializeLearnerDtoPreview(result)).not.toContain('referenceSolutions') })
  it('distinguishes editable legacy content from learner delivery readiness', () => { const document = createPracticeDocument(); delete document.content.execution; delete document.content.executablePublicTests; const result = inspectPracticeLearnerReadiness(document); expect(result.legacy).toBe(true); expect(result.schemaValid).toBe(true); expect(result.learnerDeliverable).toBe(false); expect(result.findings.map(({ code }) => code)).toContain('practice.execution-contract-missing') })
})
