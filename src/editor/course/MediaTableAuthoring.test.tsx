import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { replaceImageAsset, ImageBlockEditor } from '../../assets/ImageBlockEditor'
import { ModalDialog } from '../../components/ui/ModalDialog'
import { MODAL_PORTAL_TARGET, lockModalScroll, modalPortalTarget } from '../../components/ui/ModalPortal'
import { blockSchema, type ContentBlock } from '../../content/blocks/block.schemas'
import { DEFAULT_IMAGE_PRESENTATION, imageDisplayWidth, imagePresentation, validCustomImageWidth } from '../../content/blocks/imagePresentation'
import { BLOCK_SCHEMA_VERSION } from '../../content/core/versions'
import { addTableColumn, addTableRow, normalizeTableData, removeTableColumn, removeTableRow, renameTableHeader, TableBlockEditor } from './TableBlockEditor'

vi.mock('../../auth/authContext', () => ({ useAuth: () => ({ role: 'SUPER_ADMIN', getIdToken: async () => 'test' }) }))
vi.mock('../../assets/assetClient', () => ({ AssetClient: class {} }))

const image = { id: '10000000-0000-4000-8000-000000000001', schemaVersion: BLOCK_SCHEMA_VERSION, type: 'image' as const, data: { assetId: '10000000-0000-4000-8000-000000000002', alt: 'Diagram', caption: 'Caption' } }
const table = (data: Extract<ContentBlock, { type: 'table' }>['data']): Extract<ContentBlock, { type: 'table' }> => ({ id: '10000000-0000-4000-8000-000000000003', schemaVersion: BLOCK_SCHEMA_VERSION, type: 'table', data })

describe('viewport-safe media and table authoring', () => {
  it('exposes a shared modal with a fixed header and internally scrollable body contract', () => {
    const html = renderToStaticMarkup(<ModalDialog title="Choose asset" onClose={vi.fn()}><div>Body</div></ModalDialog>)
    expect(html).toContain('modal-backdrop')
    expect(html).toContain('modal-dialog__header')
    expect(html).toContain('modal-dialog__body')
    expect(html).toContain('aria-modal="true"')
  })

  it('mounts shared modals at the document root and restores page scroll state', () => {
    const body = { style: { overflow: 'auto' } }, root = { style: { overflow: 'scroll' } }, documentLike = { body, documentElement: root }
    expect(MODAL_PORTAL_TARGET).toBe('document.body')
    expect(modalPortalTarget(documentLike as unknown as Document)).toBe(body)
    const restore = lockModalScroll(documentLike as unknown as Document)
    expect(body.style.overflow).toBe('hidden')
    expect(root.style.overflow).toBe('hidden')
    restore()
    expect(body.style.overflow).toBe('auto')
    expect(root.style.overflow).toBe('scroll')
  })

  it('loads legacy images with defaults and validates custom widths', () => {
    expect(blockSchema.safeParse(image).success).toBe(true)
    expect(imagePresentation()).toEqual(DEFAULT_IMAGE_PRESENTATION)
    expect(imageDisplayWidth({ size: 'custom', customWidth: 75, customUnit: '%' })).toBe('75%')
    expect(validCustomImageWidth(101, '%')).toBe(false)
    expect(blockSchema.safeParse({ ...image, data: { ...image.data, size: 'custom', customWidth: 101, customUnit: '%' } }).success).toBe(false)
  })

  it('retains image presentation, alt, and caption when changing the shared asset', () => {
    const configured = { ...image, data: { ...image.data, size: 'large' as const, alignment: 'right' as const, preserveAspectRatio: true } }
    expect(replaceImageAsset(configured, '10000000-0000-4000-8000-000000000009').data).toEqual({ ...configured.data, assetId: '10000000-0000-4000-8000-000000000009' })
    const html = renderToStaticMarkup(<ImageBlockEditor block={configured} onChange={vi.fn()} />)
    expect(html).toContain('Display')
    expect(html).toContain('Alignment')
    expect(html).toContain('Shared library asset · large')
  })

  it('keeps row widths synchronized through column operations and repairs malformed legacy rows', () => {
    const malformed = normalizeTableData({ headers: ['A', 'B'], rows: [['1'], ['2', '3', 'ignored']] })
    expect(malformed.rows).toEqual([['1', ''], ['2', '3']])
    const added = addTableColumn(malformed)
    expect(added.rows.every((row) => row.length === 3)).toBe(true)
    const removed = removeTableColumn(added, 1)
    expect(removed.rows.every((row) => row.length === 2)).toBe(true)
  })

  it('adds, removes, and renames structured table rows without CSV parsing', () => {
    const initial = { headers: ['Name', 'Value'], rows: [['A', '1']] }
    expect(addTableRow(initial).rows[1]).toEqual(['', ''])
    expect(removeTableRow(addTableRow(initial), 0).rows).toEqual([['', '']])
    expect(renameTableHeader(initial, 1, 'Result').headers).toEqual(['Name', 'Result'])
    const html = renderToStaticMarkup(<TableBlockEditor block={table(initial)} onChange={vi.fn()} />)
    expect(html).toContain('Add row')
    expect(html).toContain('Add column')
    expect(html).not.toContain('comma separated')
  })
})
