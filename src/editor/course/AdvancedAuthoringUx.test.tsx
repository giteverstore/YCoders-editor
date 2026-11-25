import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { readStudioSidebarPreference, STUDIO_SIDEBAR_PREFERENCE, writeStudioSidebarPreference } from '../../app/layouts/StudioLayout'
import { ImageBlockEditor } from '../../assets/ImageBlockEditor'
import { blockSchema } from '../../content/blocks/block.schemas'
import { imageDisplayStyle, imagePresentation, validCustomImageHeight } from '../../content/blocks/imagePresentation'
import { richTextDocumentSchema } from '../../content/blocks/richText.schema'
import { BLOCK_SCHEMA_VERSION } from '../../content/core/versions'
import { validCourseDocument } from '../../content/fixtures/validDocuments'
import { CoursePreview, toggleExpandedSet } from './CoursePreview'

vi.mock('../../auth/authContext', () => ({ useAuth: () => ({ role: 'SUPER_ADMIN', getIdToken: async () => 'test' }) }))
vi.mock('../../assets/assetClient', () => ({ AssetClient: class {} }))
vi.mock('../../assets/AssetPicker', async (importOriginal) => { const actual = await importOriginal<typeof import('../../assets/AssetPicker')>(); return { ...actual, AuthenticatedAssetImage: ({ assetId, alt }: { assetId: string; alt: string }) => <img data-asset-id={assetId} alt={alt} />, ContentImage: ({ data }: { data: { alt: string } }) => <img alt={data.alt} /> } })

const image = { id: '10000000-0000-4000-8000-000000000001', schemaVersion: BLOCK_SCHEMA_VERSION, type: 'image' as const, data: { assetId: '10000000-0000-4000-8000-000000000002', alt: 'Diagram' } }

describe('advanced image presentation', () => {
  it('defaults legacy height to Auto and preserves aspect ratio', () => { expect(imagePresentation()).toMatchObject({ heightUnit: 'auto', preserveAspectRatio: true, objectFit: 'contain' }); expect(blockSchema.safeParse(image).success).toBe(true) })
  it('persists safe unlocked dimensions and object fit while rejecting invalid height', () => {
    const configured = { ...image, data: { ...image.data, size: 'custom' as const, customWidth: 640, customUnit: 'px' as const, customHeight: 300, heightUnit: 'px' as const, preserveAspectRatio: false, objectFit: 'cover' as const } }
    expect(blockSchema.safeParse(configured).success).toBe(true)
    expect(imageDisplayStyle(configured.data)).toEqual({ maxWidth: '640px', height: '300px', objectFit: 'cover' })
    expect(validCustomImageHeight(0)).toBe(false); expect(validCustomImageHeight(1201)).toBe(false)
    expect(blockSchema.safeParse({ ...configured, data: { ...configured.data, customHeight: 1201 } }).success).toBe(false)
  })
  it('keeps explicit height inactive while aspect lock is enabled', () => { expect(imageDisplayStyle({ size: 'custom', customWidth: 640, customHeight: 300, heightUnit: 'px', preserveAspectRatio: true })).toMatchObject({ height: 'auto' }); expect(renderToStaticMarkup(<ImageBlockEditor block={{ ...image, data: { ...image.data, size: 'custom' } }} onChange={vi.fn()} />)).toContain('Height mode') })
})

describe('fullscreen Preview and collapsible navigation', () => {
  it('renders the fixed learner takeover contract and only compact Preview controls', () => { const html = renderToStaticMarkup(<CoursePreview document={structuredClone(validCourseDocument)} onExit={vi.fn()} />); for (const text of ['Back to Editor', 'Desktop', 'Tablet', 'Mobile', 'Simulated YCoders learner Course']) expect(html).toContain(text); expect(html).not.toContain('Add block') })
  it('collapses and expands outline groups through local immutable state', () => { const expanded = new Set(['module']); expect(toggleExpandedSet(expanded, 'module').has('module')).toBe(false); expect(toggleExpandedSet(new Set(), 'module').has('module')).toBe(true); expect(expanded.has('module')).toBe(true) })
  it('stores the Studio icon-rail preference only in supplied local storage', () => { const values = new Map<string, string>(), storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }; writeStudioSidebarPreference(storage, true); expect(values.get(STUDIO_SIDEBAR_PREFERENCE)).toBe('true'); expect(readStudioSidebarPreference(storage)).toBe(true) })
})

describe('fixed learner typography contract', () => {
  const standard = { type: 'doc' as const, content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text: 'Learner text', marks: [{ type: 'bold' as const }, { type: 'italic' as const }, { type: 'underline' as const }, { type: 'code' as const }] }] }] }
  it('preserves the accepted inline formatting marks', () => { expect(richTextDocumentSchema.safeParse(standard).success).toBe(true) })
  it('rejects deferred font family and font size marks', () => { for (const mark of [{ type: 'fontFamily', attrs: { family: 'serif' } }, { type: 'fontSize', attrs: { size: 24 } }]) expect(richTextDocumentSchema.safeParse({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Unsupported', marks: [mark] }] }] }).success).toBe(false) })
  it('renders fixed learner typography without custom font metadata', () => { const document = structuredClone(validCourseDocument); const module = document.content.modules[0]; if (module.organization !== 'lessons') throw new Error('fixture'); module.lessons[0].blocks = [{ id: '10000000-0000-4000-8000-000000000099', schemaVersion: BLOCK_SCHEMA_VERSION, type: 'richText', data: { document: standard } }]; const html = renderToStaticMarkup(<CoursePreview document={document} />); for (const value of ['Learner text', '<strong>', '<em>', '<u>', '<code>']) expect(html).toContain(value); expect(html).not.toContain('data-font-family'); expect(html).not.toContain('data-font-size') })
})
