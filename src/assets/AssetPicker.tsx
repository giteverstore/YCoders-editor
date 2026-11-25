import { ImagePlus, LoaderCircle, Search, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { AssetMetadata } from './asset.schema'
import { AssetClient } from './assetClient'
import { useAuth } from '../auth/authContext'
import { hasPermission } from '../auth/permissions'
import { ModalDialog } from '../components/ui/ModalDialog'

export type AssetPickerContext = 'course-icon' | 'lesson-image'
type Props = { selected?: string; onSelect: (id: string) => void; context?: AssetPickerContext; triggerLabel?: string }
export const ASSET_PICKER_COPY = {
  'course-icon': { title: 'Choose course icon', helper: 'Select an existing asset or upload a new square image.', trigger: 'Choose from library' },
  'lesson-image': { title: 'Choose lesson image', helper: 'Select an existing shared asset or upload a new image.', trigger: 'Choose image' },
} as const
export function mergeUploadedAsset(assets: AssetMetadata[], uploaded: AssetMetadata) { return [uploaded, ...assets.filter(({ id }) => id !== uploaded.id)] }

export function AssetPicker({ selected, onSelect, context = 'lesson-image', triggerLabel }: Props) {
  const auth = useAuth(), client = useMemo(() => new AssetClient(auth.getIdToken), [auth.getIdToken])
  const [open, setOpen] = useState(false), [assets, setAssets] = useState<AssetMetadata[]>([]), [cursor, setCursor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null), [loading, setLoading] = useState(false), [uploading, setUploading] = useState(false), [query, setQuery] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const canUpload = Boolean(auth.role && hasPermission(auth.role, 'asset:upload')), labels = ASSET_PICKER_COPY[context]
  const filtered = assets.filter((asset) => asset.originalFilename.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const close = () => { if (!uploading) setOpen(false) }
  const load = async () => { setLoading(true); try { const page = await client.list(); setAssets(page.items); setCursor(page.nextCursor); setError(null) } catch { setError("Assets couldn't be loaded. Try again.") } finally { setLoading(false) } }
  useEffect(() => { if (open) void load() }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const choose = (id: string) => { onSelect(id); setOpen(false) }
  const upload = async (file: File) => { setUploading(true); setError(null); try { const asset = await client.upload(file); setAssets((current) => mergeUploadedAsset(current, asset)); choose(asset.id) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Upload failed. Try again.') } finally { setUploading(false) } }
  const more = async () => { if (!cursor) return; setLoading(true); try { const page = await client.list(cursor); setAssets((current) => [...current, ...page.items.filter((asset) => !current.some(({ id }) => id === asset.id))]); setCursor(page.nextCursor) } catch { setError("More assets couldn't be loaded.") } finally { setLoading(false) } }
  return <>
    <button type="button" className="button button--secondary" onClick={() => setOpen(true)}><ImagePlus size={16} />{triggerLabel ?? labels.trigger}</button>
    {open && <ModalDialog className="asset-dialog" eyebrow="Shared asset library" title={labels.title} description={<p>{labels.helper}</p>} onClose={close}>
      <div className="asset-dialog-toolbar"><label className="asset-search"><Search size={15} /><span className="sr-only">Search assets</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by filename" /></label>{canUpload && <><input ref={fileInput} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = '' }} /><button type="button" className="button button--primary" disabled={uploading} onClick={() => fileInput.current?.click()}>{uploading ? <LoaderCircle className="spin" size={16} /> : <Upload size={16} />}{uploading ? 'Uploading…' : 'Upload image'}</button></>}</div>
      <p className="asset-reuse-note">Assets uploaded to Editor Studio can be reused across courses and lessons.</p>
      {error && <div className="ui-alert ui-alert--error" role="alert"><span>{error}</span><button type="button" onClick={() => void load()}>Retry</button></div>}
      <div className="asset-dialog-results">{loading && assets.length === 0 ? <div className="asset-state" role="status"><LoaderCircle className="spin" size={22} />Loading assets…</div> : filtered.length === 0 ? <div className="asset-state"><ImagePlus size={28} /><strong>{query ? 'No matching assets' : 'No assets yet'}</strong><span>{query ? 'Try a different filename.' : 'Upload your first asset to reuse it throughout Editor Studio.'}</span></div> : <div className="asset-grid">{filtered.map((asset) => <button type="button" className={selected === asset.id ? 'active' : ''} aria-pressed={selected === asset.id} key={asset.id} onClick={() => choose(asset.id)}><span className="asset-thumb"><AuthenticatedAssetImage assetId={asset.id} alt="" /></span><strong title={asset.originalFilename}>{asset.originalFilename}</strong><span>{asset.width}×{asset.height} · {Math.ceil(asset.size / 1024)} KiB</span><small>{new Date(asset.createdAt).toLocaleDateString()}</small></button>)}</div>}</div>
      {cursor && !query && <button className="button button--secondary asset-more" type="button" disabled={loading} onClick={() => void more()}>{loading ? 'Loading…' : 'Load more'}</button>}
    </ModalDialog>}
  </>
}

export function AuthenticatedAssetImage({ assetId, alt }: { assetId: string; alt: string }) { const auth = useAuth(), client = useMemo(() => new AssetClient(auth.getIdToken), [auth.getIdToken]), [result, setResult] = useState<{ id: string; src?: string; failed?: boolean } | null>(null); useEffect(() => { let active = true, url: string | undefined; client.preview(assetId).then((value) => { url = value; if (active) setResult({ id: assetId, src: value }); else URL.revokeObjectURL(value) }).catch(() => { if (active) setResult({ id: assetId, failed: true }) }); return () => { active = false; if (url) URL.revokeObjectURL(url) } }, [assetId, client]); const current = result?.id === assetId ? result : null; return current?.failed ? <span className="image-fallback" role="img" aria-label={`Image unavailable: ${alt}`}>Image unavailable</span> : current?.src ? <img src={current.src} alt={alt} /> : <span className="image-loading" role="status">Loading image…</span> }
export function ContentImage({ data }: { data: { assetId: string; alt: string; caption?: string } | { src: string; alt: string; caption?: string } }) { return <figure>{'assetId' in data ? <AuthenticatedAssetImage assetId={data.assetId} alt={data.alt} /> : data.src.startsWith('https://') ? <img src={data.src} alt={data.alt} /> : <span role="img" aria-label={`Invalid image: ${data.alt}`}>Image unavailable</span>}{data.caption && <figcaption>{data.caption}</figcaption>}</figure> }
