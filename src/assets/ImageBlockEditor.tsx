import { ImageIcon } from 'lucide-react'
import type { ContentBlock } from '../content/blocks/block.schemas'
import { AssetPicker, AuthenticatedAssetImage } from './AssetPicker'
import { imagePresentation, validCustomImageWidth, type ImageAlignment, type ImageSize } from '../content/blocks/imagePresentation'

export function replaceImageAsset(block: Extract<ContentBlock, { type: 'image' }>, assetId: string): Extract<ContentBlock, { type: 'image' }> { return { ...block, data: { ...block.data, assetId } } }

export function ImageBlockEditor({ block, onChange }: { block: Extract<ContentBlock, { type: 'image' }>; onChange: (block: Extract<ContentBlock, { type: 'image' }>) => void }) {
  const assetId = 'assetId' in block.data ? block.data.assetId : undefined
  const presentation = imagePresentation(block.data)
  const setPresentation = (values: Partial<typeof presentation>) => onChange({ ...block, data: { ...block.data, ...values } })
  return <div className="block-form image-block-editor">
    <div className="author-image-preview">{assetId ? <AuthenticatedAssetImage assetId={assetId} alt={block.data.alt} /> : <span><ImageIcon size={24} />No image selected</span>}</div>
    <div className="image-block-actions"><AssetPicker context="lesson-image" selected={assetId} triggerLabel={assetId ? 'Change image' : 'Choose image'} onSelect={(id) => onChange(replaceImageAsset(block, id))} /><span>Shared library asset · {presentation.size}</span></div>
    <fieldset className="image-display-controls"><legend>Display</legend><label>Size<select value={presentation.size} onChange={(event) => setPresentation({ size: event.target.value as ImageSize })}><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option><option value="full">Full width</option><option value="custom">Custom</option></select></label><label>Alignment<select value={presentation.alignment} onChange={(event) => setPresentation({ alignment: event.target.value as ImageAlignment })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>{presentation.size === 'custom' && <><label>Custom width<input type="number" min="1" max={presentation.customUnit === '%' ? 100 : 1600} value={presentation.customWidth} aria-invalid={!validCustomImageWidth(presentation.customWidth, presentation.customUnit)} onChange={(event) => setPresentation({ customWidth: Number(event.target.value) })} /></label><label>Unit<select value={presentation.customUnit} onChange={(event) => setPresentation({ customUnit: event.target.value as 'px' | '%' })}><option value="px">px</option><option value="%">%</option></select></label><label className="inline-control"><input type="checkbox" checked={presentation.preserveAspectRatio} onChange={(event) => setPresentation({ preserveAspectRatio: event.target.checked })} /> Preserve aspect ratio</label></>}</fieldset>
    <label>Alternative text<input value={block.data.alt} onChange={(event) => onChange({ ...block, data: { ...block.data, alt: event.target.value } })} /></label>
    <label>Caption<input value={block.data.caption ?? ''} onChange={(event) => onChange({ ...block, data: { ...block.data, caption: event.target.value || undefined } })} /></label>
  </div>
}
