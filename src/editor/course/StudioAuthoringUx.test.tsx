import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { AssetMetadata } from '../../assets/asset.schema'
import { ASSET_PICKER_COPY, mergeUploadedAsset } from '../../assets/AssetPicker'
import { ImageBlockEditor } from '../../assets/ImageBlockEditor'
import { validCourseDocument } from '../../content/fixtures/validDocuments'
import { BLOCK_SCHEMA_VERSION } from '../../content/core/versions'
import { CourseDetailsForm } from './CourseDetailsForm'
import { COURSE_BLOCK_GROUPS } from './LessonBlockCanvas'

vi.mock('../../auth/authContext', () => ({ useAuth: () => ({ role: 'SUPER_ADMIN', getIdToken: async () => 'test' }) }))
vi.mock('../../assets/assetClient', () => ({ AssetClient: class {} }))

const asset = (id: string): AssetMetadata => ({ id, originalFilename: 'shared.png', objectPath: `editor-v2-assets/${id}/shared.png`, mimeType: 'image/png', size: 100, width: 100, height: 100, createdAt: '2026-11-25T00:00:00.000Z', createdBy: 'author', status: 'ready' })

describe('Studio authoring UX contracts', () => {
  it('uses contextual copy while explaining the shared asset model', () => {
    expect(ASSET_PICKER_COPY['course-icon'].title).toBe('Choose course icon')
    expect(ASSET_PICKER_COPY['lesson-image'].title).toBe('Choose lesson image')
    expect(ASSET_PICKER_COPY['course-icon'].helper).toContain('square image')
    expect(ASSET_PICKER_COPY['lesson-image'].helper).toContain('shared asset')
  })

  it('reuses an uploaded asset without duplicating its identity', () => {
    const first = asset('10000000-0000-4000-8000-000000000001'), second = asset('10000000-0000-4000-8000-000000000002')
    expect(mergeUploadedAsset([first, second], { ...first, originalFilename: 'updated.png' })).toEqual([{ ...first, originalFilename: 'updated.png' }, second])
  })

  it('groups every Course block in the compact picker exactly once', () => {
    const types = COURSE_BLOCK_GROUPS.flatMap(({ types: values }) => values)
    expect(types).toEqual(['richText', 'callout', 'hint', 'image', 'table', 'divider', 'code', 'expectedOutput', 'solution', 'quiz', 'exercise'])
    expect(new Set(types).size).toBe(types.length)
  })

  it('renders a dedicated bounded Course icon presentation and context', () => {
    const document = structuredClone(validCourseDocument)
    document.content.courseIconAssetId = '10000000-0000-4000-8000-000000000009'
    const html = renderToStaticMarkup(<CourseDetailsForm document={document} issues={[]} commit={vi.fn()} />)
    expect(html).toContain('course-icon-preview')
    expect(html).toContain('Reusable shared library asset')
    expect(html).toContain('Replace')
  })

  it('renders an Image block as a bounded preview with lesson-image controls', () => {
    const block = { id: '10000000-0000-4000-8000-000000000003', schemaVersion: BLOCK_SCHEMA_VERSION, type: 'image' as const, data: { assetId: '10000000-0000-4000-8000-000000000004', alt: 'Diagram', caption: 'Caption' } }
    const html = renderToStaticMarkup(<ImageBlockEditor block={block} onChange={vi.fn()} />)
    expect(html).toContain('author-image-preview')
    expect(html).toContain('Change image')
    expect(html).toContain('Shared library asset')
    expect(html).toContain('Alternative text')
  })
})
