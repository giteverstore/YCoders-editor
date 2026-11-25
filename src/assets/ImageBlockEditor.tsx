import { ImageIcon } from 'lucide-react'
import type { ContentBlock } from '../content/blocks/block.schemas'
import { AssetPicker, AuthenticatedAssetImage } from './AssetPicker'

export function ImageBlockEditor({ block, onChange }: { block: Extract<ContentBlock, { type: 'image' }>; onChange: (block: Extract<ContentBlock, { type: 'image' }>) => void }) {
  const assetId = 'assetId' in block.data ? block.data.assetId : undefined
  return <div className="block-form image-block-editor">
    <div className="author-image-preview">{assetId ? <AuthenticatedAssetImage assetId={assetId} alt={block.data.alt} /> : <span><ImageIcon size={24} />No image selected</span>}</div>
    <div className="image-block-actions"><AssetPicker context="lesson-image" selected={assetId} triggerLabel={assetId ? 'Change image' : 'Choose image'} onSelect={(id) => onChange({ ...block, data: { assetId: id, alt: block.data.alt, caption: block.data.caption } })} /><span>Shared library asset</span></div>
    <label>Alternative text<input value={block.data.alt} onChange={(event) => onChange({ ...block, data: { ...block.data, alt: event.target.value } })} /></label>
    <label>Caption<input value={block.data.caption ?? ''} onChange={(event) => onChange({ ...block, data: { ...block.data, caption: event.target.value || undefined } })} /></label>
  </div>
}
