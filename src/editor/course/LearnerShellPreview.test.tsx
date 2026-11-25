import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { validCourseDocument } from '../../content/fixtures/validDocuments'
import { CoursePreview, PREVIEW_LEARNER_STATE, PREVIEW_PORTAL_TARGET, PREVIEW_SAFETY_BOUNDARIES, lockPreviewScroll, previewCourseLessons, previewPortalTarget } from './CoursePreview'

vi.mock('../../assets/AssetPicker', () => ({ AuthenticatedAssetImage: ({ assetId, alt }: { assetId: string; alt: string }) => <img data-asset-id={assetId} alt={alt} />, ContentImage: ({ data }: { data: { alt: string } }) => <img alt={data.alt} /> }))

describe('YCoders learner shell Preview', () => {
  it('renders the learner header, draft outline, active lesson, compiler, and result tabs', () => {
    const document = structuredClone(validCourseDocument), lessons = previewCourseLessons(document)
    const html = renderToStaticMarkup(<CoursePreview document={document} initialLessonId={lessons[0]?.lesson.id} onExit={vi.fn()} />)
    for (const value of ['Simulated YCoders learner Course', 'YCoders', 'Lesson progress', 'Course outline', document.content.modules[0].title, 'aria-current="page"', lessons[0]?.lesson.title, 'Preview compiler', 'Output', 'Expected', 'Errors', 'Back to Editor']) expect(html).toContain(value)
  })

  it('derives module and lesson hierarchy and local navigation order from the draft', () => {
    const document = structuredClone(validCourseDocument), module = document.content.modules[0]
    expect(previewCourseLessons(document).map(({ lesson }) => lesson.id)).toEqual(module.lessons.map(({ id }) => id))
  })

  it('keeps compiler execution disabled and centralizes all non-mutating safety boundaries', () => {
    const html = renderToStaticMarkup(<CoursePreview document={structuredClone(validCourseDocument)} />)
    expect(html).toContain('Execution is unavailable in Editor Preview')
    expect(html).toContain('disabled=""')
    expect(PREVIEW_SAFETY_BOUNDARIES).toEqual(['no-progress-writes', 'no-completion-writes', 'no-reward-writes', 'no-compiler-execution', 'no-ai-requests'])
    expect(PREVIEW_LEARNER_STATE).toMatchObject({ streak: 0, coins: 0, compilerState: 'idle' })
  })

  it('declares desktop, tablet, and mobile responsive Preview contracts without author controls in the learner pane', () => {
    const html = renderToStaticMarkup(<CoursePreview document={structuredClone(validCourseDocument)} />)
    for (const mode of ['Desktop', 'Tablet', 'Mobile']) expect(html).toContain(mode)
    const learnerPane = html.slice(html.indexOf('class="yc-preview"'))
    for (const authorControl of ['Add block', 'Delete block', 'Change image']) expect(learnerPane).not.toContain(authorControl)
    expect(learnerPane).toContain('Course')
    expect(learnerPane).toContain('AI')
  })

  it('targets document.body and restores both body and root scroll locks', () => { const body = { style: { overflow: 'auto' } }, root = { style: { overflow: 'scroll' } }, documentLike = { body, documentElement: root }; expect(PREVIEW_PORTAL_TARGET).toBe('document.body'); expect(previewPortalTarget(documentLike as unknown as Document)).toBe(body); const restore = lockPreviewScroll(documentLike as unknown as Document); expect(body.style.overflow).toBe('hidden'); expect(root.style.overflow).toBe('hidden'); restore(); expect(body.style.overflow).toBe('auto'); expect(root.style.overflow).toBe('scroll') })
})
