import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { validCourseDocument } from '../../content/fixtures/validDocuments'
import { CoursePreview } from './CoursePreview'

vi.mock('../../assets/AssetPicker', () => ({
  AuthenticatedAssetImage: ({ assetId, alt }: { assetId: string; alt: string }) => <img data-testid="course-icon" data-asset-id={assetId} alt={alt} />,
  ContentImage: () => <div data-testid="content-image" />,
}))

describe('Course preview icon', () => {
  it('previews the selected icon through authenticated asset delivery', () => {
    const document = structuredClone(validCourseDocument)
    document.content.courseIconAssetId = 'b0000000-0000-4000-8000-000000000011'
    const html = renderToStaticMarkup(<CoursePreview document={document} />)
    expect(html).toContain('data-testid="course-icon"')
    expect(html).toContain(`data-asset-id="${document.content.courseIconAssetId}"`)
    expect(html).toContain(`${document.title} icon`)
  })

  it('keeps legacy Course previews readable without an icon', () => {
    const html = renderToStaticMarkup(<CoursePreview document={structuredClone(validCourseDocument)} />)
    expect(html).not.toContain('data-testid="course-icon"')
    expect(html).toContain(validCourseDocument.title)
  })
})
