import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { blockSchema } from '../../content/blocks/block.schemas'
import type { RichTextDocument } from '../../content/blocks/richText.schema'
import type { CourseDocument } from '../../content/core/envelope'
import { BLOCK_SCHEMA_VERSION } from '../../content/core/versions'
import { validCourseDocument } from '../../content/fixtures/validDocuments'
import { adaptCourse } from '../../integration/learnerAdapters'
import type { AdapterSource } from '../../integration/learnerAdapter.types'
import { validatePublicationCompatibility } from '../../publication/publicationContracts'
import { CoursePreview, toggleRevealedHint } from './CoursePreview'

const uuid = (digit: number) => `90000000-0000-4000-8000-${String(digit).padStart(12, '0')}`
const rich = (...content: Array<Record<string, unknown>>) => ({ type: 'doc' as const, content }) as RichTextDocument
const paragraph = (text: string) => ({ type: 'paragraph' as const, content: [{ type: 'text' as const, text }] })
const hintBlock = {
  id: uuid(1), schemaVersion: BLOCK_SCHEMA_VERSION, type: 'hint' as const, data: { hints: [
    { id: uuid(2), title: 'Hint 1', content: rich(paragraph('First clue')) },
    { id: uuid(3), title: 'Hint 2', content: rich(paragraph('Second clue')) },
  ] },
}

function courseSource(document: CourseDocument = structuredClone(validCourseDocument)): AdapterSource<CourseDocument> {
  return { identity: { namespace: 'v2', contentType: 'course', contentId: document.id, publicationVersion: 4 }, document, assetManifest: [] }
}

describe('Course hint contract', () => {
  it('accepts one or many rich-text hints and rejects malformed, empty, and duplicate entries', () => {
    expect(blockSchema.safeParse({ ...hintBlock, data: { hints: [hintBlock.data.hints[0]] } }).success).toBe(true)
    expect(blockSchema.safeParse(hintBlock).success).toBe(true)
    expect(blockSchema.safeParse({ ...hintBlock, data: { hints: [] } }).success).toBe(false)
    expect(blockSchema.safeParse({ ...hintBlock, data: { hints: [{ ...hintBlock.data.hints[0], title: ' ' }] } }).success).toBe(false)
    expect(blockSchema.safeParse({ ...hintBlock, data: { hints: [{ ...hintBlock.data.hints[0], content: rich({ type: 'paragraph' }) }] } }).success).toBe(false)
    expect(blockSchema.safeParse({ ...hintBlock, data: { hints: [hintBlock.data.hints[0], { ...hintBlock.data.hints[1], id: uuid(2) }] } }).success).toBe(false)
  })

  it('preserves stable IDs and exact order through publication validation and learner adaptation', () => {
    const document: CourseDocument = structuredClone(validCourseDocument)
    const module = document.content.modules[0]
    if (module.organization !== 'lessons') throw new Error('fixture')
    module.lessons[0].blocks = [hintBlock]
    expect(validatePublicationCompatibility(document).schemaValid).toBe(true)
    const result = adaptCourse(courseSource(document))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const delivered = result.value.modules[0].lessons?.[0].blocks[0]
    expect(delivered).toEqual(hintBlock)
    expect((delivered?.data as typeof hintBlock.data).hints.map(({ id }) => id)).toEqual([uuid(2), uuid(3)])
  })

  it('starts collapsed and tracks reveal/hide independently by stable hint ID', () => {
    const document: CourseDocument = structuredClone(validCourseDocument)
    const module = document.content.modules[0]
    if (module.organization !== 'lessons') throw new Error('fixture')
    module.lessons[0].blocks = [hintBlock]
    const html = renderToStaticMarkup(<CoursePreview document={document} />)
    expect(html).toContain('Hint 1')
    expect(html.match(/>Reveal</g)).toHaveLength(2)
    expect(html).not.toContain('First clue')
    let state: ReadonlySet<string> = new Set()
    state = toggleRevealedHint(state, uuid(2))
    expect([...state]).toEqual([uuid(2)])
    state = toggleRevealedHint(state, uuid(3))
    expect([...state]).toEqual([uuid(2), uuid(3)])
    state = toggleRevealedHint(state, uuid(2))
    expect([...state]).toEqual([uuid(3)])
  })
})

describe('Course rich-text structure', () => {
  it('survives draft-shaped document to publication validation to adapter without flattening paragraphs or hard breaks', () => {
    const document: CourseDocument = structuredClone(validCourseDocument)
    const module = document.content.modules[0]
    if (module.organization !== 'lessons') throw new Error('fixture')
    const richDocument = rich(paragraph('First paragraph.'), paragraph('Second paragraph.'), { type: 'paragraph', content: [{ type: 'text', text: 'Line one' }, { type: 'hardBreak' }, { type: 'text', text: 'Line two' }] })
    module.lessons[0].blocks = [{ id: uuid(4), schemaVersion: BLOCK_SCHEMA_VERSION, type: 'richText', data: { document: richDocument } }]
    expect(validatePublicationCompatibility(document).schemaValid).toBe(true)
    const adapted = adaptCourse(courseSource(document))
    expect(adapted.ok).toBe(true)
    if (!adapted.ok) return
    expect(adapted.value.modules[0].lessons?.[0].blocks[0].data).toEqual({ document: richDocument })
    const html = renderToStaticMarkup(<CoursePreview document={document} />)
    expect(html).toContain('<p>First paragraph.</p><p>Second paragraph.</p>')
    expect(html).toContain('<p>Line one<br/>Line two</p>')
  })

  it('keeps headings, lists, links, and historical rich-text fixtures valid', () => {
    const complex = rich(
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Heading' }] },
      { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Docs', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] }] }] }] },
    )
    expect(blockSchema.safeParse({ id: uuid(5), schemaVersion: BLOCK_SCHEMA_VERSION, type: 'richText', data: { document: complex } }).success).toBe(true)
    expect(validatePublicationCompatibility(structuredClone(validCourseDocument)).schemaValid).toBe(true)
  })
})
