import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { createPracticeDocument } from '../../editor/core/practiceEditor.commands'
import { PracticeExecutionAuthoring } from './PracticeExecutionAuthoring'

describe('Practice execution authoring UI', () => {
  it('renders closed languages, mode-specific stdout controls, coverage, readiness, and DTO inspection action', () => { const html = renderToStaticMarkup(<PracticeExecutionAuthoring document={createPracticeDocument()} commit={() => undefined} readOnly={false} />); expect(html).toContain('Practice languages'); expect(html).toContain('Execution mode'); expect(html).toContain('Executable public tests'); expect(html).toContain('Language coverage'); expect(html).toContain('Practice learner readiness'); expect(html).toContain('Inspect learner DTO'); expect(html).toContain('Expected stdout'); expect(html).not.toContain('Mutation target argument') })
  it('renders explicit migration actions without mutating a legacy document', () => { const document = createPracticeDocument(); delete document.content.execution; delete document.content.executablePublicTests; const before = structuredClone(document); const html = renderToStaticMarkup(<PracticeExecutionAuthoring document={document} commit={() => undefined} readOnly={false} />); expect(html).toContain('Legacy Practice'); expect(html).toContain('Configure V2 Execution as stdout'); expect(document).toEqual(before) })
})
