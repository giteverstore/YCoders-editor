import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { BLOCK_SCHEMA_VERSION } from '../../content/core/versions'
import { CALLOUT_VARIANTS, COURSE_LANGUAGES, calloutVariant, courseLanguage } from '../../content/blocks/coursePresentation'
import type { ContentBlock } from '../../content/blocks/block.schemas'
import type { CourseDocument } from '../../content/core/envelope'
import { validCourseDocument } from '../../content/fixtures/validDocuments'
import { CoursePreview, copyPreviewText } from './CoursePreview'

vi.mock('../../assets/AssetPicker', () => ({ AuthenticatedAssetImage: ({ assetId, alt }: { assetId: string; alt: string }) => <img data-asset-id={assetId} alt={alt} />, ContentImage: ({ data }: { data: { alt: string } }) => <img data-testid="content-image" alt={data.alt} /> }))
const id = (n: number) => `60000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const rich = (text: string) => ({ type: 'doc' as const, content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text }] }] })
function parityDocument() {
  const document: CourseDocument = structuredClone(validCourseDocument)
  const module = document.content.modules[0]
  if (module.organization !== 'lessons') throw new Error('Fixture must use lesson organization')
  module.lessons[0].blocks = [
    { id: id(1), type: 'richText', schemaVersion: BLOCK_SCHEMA_VERSION, data: { document: rich('Learner prose') } },
    { id: id(2), type: 'code', schemaVersion: BLOCK_SCHEMA_VERSION, data: { language: 'python', code: 'print("exact")', filename: 'main.py' } },
    ...Object.keys(CALLOUT_VARIANTS).map((tone, index) => ({ id: id(10 + index), type: 'callout' as const, schemaVersion: BLOCK_SCHEMA_VERSION, data: { tone: tone as keyof typeof CALLOUT_VARIANTS, title: `${tone} title`, content: rich(`${tone} content`) } })),
    { id: id(20), type: 'image', schemaVersion: BLOCK_SCHEMA_VERSION, data: { assetId: id(90), alt: 'Diagram alt', caption: 'Diagram caption' } },
    { id: id(21), type: 'quiz', schemaVersion: BLOCK_SCHEMA_VERSION, data: { question: 'One?', mode: 'single-correct' as const, options: [{ id: id(31), text: 'Yes', isCorrect: true }, { id: id(32), text: 'No', isCorrect: false }] } },
    { id: id(22), type: 'quiz', schemaVersion: BLOCK_SCHEMA_VERSION, data: { question: 'Many?', mode: 'multiple-correct' as const, options: [{ id: id(33), text: 'A', isCorrect: true }, { id: id(34), text: 'B', isCorrect: true }, { id: id(35), text: 'C', isCorrect: false }] } },
    { id: id(23), type: 'exercise', schemaVersion: BLOCK_SCHEMA_VERSION, data: { prompt: rich('Solve it'), language: 'python' as const, starterCode: 'print(1)', publicTests: [{ id: id(41), input: '1', expectedOutput: 'one' }, { id: id(42), input: '2', expectedOutput: 'two' }] } },
    { id: id(24), type: 'expectedOutput', schemaVersion: BLOCK_SCHEMA_VERSION, data: { value: 'exact output', format: 'text' as const } },
    { id: id(25), type: 'solution', schemaVersion: BLOCK_SCHEMA_VERSION, data: { content: rich('Solution text'), code: { language: 'python', value: 'print("solution")' } } },
  ] as ContentBlock[]
  return document
}

describe('Course presentation contracts', () => {
  it('centralizes canonical language and compiler mappings', () => {
    expect(COURSE_LANGUAGES.map(({ id }) => id)).toEqual(['python', 'java', 'javascript', 'typescript', 'c', 'cpp', 'csharp', 'php', 'r', 'html', 'css', 'json', 'sql', 'bash', 'text'])
    expect(courseLanguage('python')).toMatchObject({ label: 'Python', monacoLanguage: 'python', compilerLanguage: 'python' })
    expect(courseLanguage('html')?.compilerLanguage).toBeUndefined()
    expect(courseLanguage('legacy-lang')).toBeUndefined()
  })
  it('maps callout tones and gracefully handles legacy values', () => {
    expect(Object.keys(CALLOUT_VARIANTS)).toEqual(['info', 'tip', 'warning', 'danger'])
    expect(calloutVariant('warning')).toMatchObject({ label: 'Warning' })
    expect(calloutVariant('legacy')).toEqual({ label: 'Note', icon: '•' })
  })
  it('copies the exact underlying value through the Clipboard API', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    await expect(copyPreviewText('line 1\nline 2')).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('line 1\nline 2')
    vi.unstubAllGlobals()
  })
})

describe('Course Preview learner parity', () => {
  it('renders the full block contract in order without author controls or metadata', () => {
    const document = parityDocument(), html = renderToStaticMarkup(<CoursePreview document={document} />)
    for (const value of ['Diagram caption', 'learner-code', 'Run Code', 'type="radio"', 'type="checkbox"', 'Test 1', 'Test 2', 'aria-label="Copy code"', 'aria-label="Copy expected output"', 'aria-label="Copy solution"']) expect(html).toContain(value)
    expect(html).not.toContain('Submit')
    expect(html).not.toContain(document.id)
    expect(html).not.toContain('Delete')
    const positions = ['Learner prose', 'print(&quot;exact&quot;)', 'info title', 'Diagram caption', 'One?', 'Many?', 'Solve it', 'exact output', 'Solution text'].map((value) => html.indexOf(value))
    expect(positions.every((value, index) => value >= 0 && (index === 0 || value > positions[index - 1]))).toBe(true)
  })
  it('disables execution and provides responsive viewport modes', () => {
    const html = renderToStaticMarkup(<CoursePreview document={parityDocument()} />)
    expect(html).toContain('Execution is disabled in Preview')
    for (const mode of ['Desktop', 'Tablet', 'Mobile']) expect(html).toContain(mode)
  })
})
