import { BookCopy, BookOpen, Clock3, Download, HardDrive, Pencil, Trash2, Upload } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ButtonLink } from '../../components/ui/ButtonLink'
import { useCourseDraftList } from '../../drafts/useCourseDraftList'
import { useAuth } from '../../auth/authContext'
import { hasPermission } from '../../auth/permissions'
import { V2DraftApiClient } from '../../cloud/draftApiClient'
import { CloudCourseDraftRepository } from '../../cloud/cloudCourseDraftRepository'
import { cloudReadiness } from '../../cloud/cloudReadiness'
import type { DraftRepositoryError, DraftSummary } from '../../drafts/draft.types'

export function CourseDraftListPage() {
  const [source, setSource] = useState<'cloud' | 'local'>('cloud')
  return <section className="page-stack" aria-labelledby="courses-title">
    <div className="page-heading"><div><p className="eyebrow">Content library</p><h2 id="courses-title">Courses</h2><p>Cloud and local drafts remain separate until you explicitly transfer one.</p></div></div>
    <div className="draft-source-tabs" role="tablist" aria-label="Course draft source"><button role="tab" aria-selected={source === 'cloud'} className={source === 'cloud' ? 'active' : ''} onClick={() => setSource('cloud')}>Cloud Drafts</button><button role="tab" aria-selected={source === 'local'} className={source === 'local' ? 'active' : ''} onClick={() => setSource('local')}>Local Drafts</button></div>
    {source === 'cloud' ? <CloudDraftList /> : <LocalDraftList />}
  </section>
}

function CloudDraftList() {
  const auth = useAuth()
  const repository = useMemo(() => new CloudCourseDraftRepository(new V2DraftApiClient(auth.getIdToken)), [auth.getIdToken])
  const [drafts, setDrafts] = useState<DraftSummary[]>([])
  const [loading, setLoading] = useState(cloudReadiness.enabled)
  const [error, setError] = useState<string | null>(cloudReadiness.reason)
  const canWrite = auth.role ? hasPermission(auth.role, 'draft:write') : false
  const canDelete = auth.role ? hasPermission(auth.role, 'draft:delete') : false
  const cloudError = useCallback((cause: unknown) => { const code = (cause as DraftRepositoryError)?.code; return code === 'permission' ? 'Your role cannot read cloud drafts.' : code === 'authentication' ? 'Your session expired. Sign in again.' : cause instanceof Error ? cause.message : 'Unable to load cloud drafts.' }, [])
  const load = useCallback(async () => { if (!cloudReadiness.enabled) return; setLoading(true); try { setDrafts(await repository.list()); setError(null) } catch (cause) { setError(cloudError(cause)) } finally { setLoading(false) } }, [cloudError, repository])
  useEffect(() => {
    if (!cloudReadiness.enabled) return
    let active = true
    repository.list().then((items) => { if (active) { setDrafts(items); setError(null) } }).catch((cause: unknown) => { if (active) setError(cloudError(cause)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [cloudError, repository])
  const remove = async (draft: DraftSummary) => { if (!window.confirm(`Delete cloud draft “${draft.title || 'Untitled course'}” at revision ${draft.revision}?`)) return; try { await repository.delete(draft.id, draft.revision); await load() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to delete cloud draft.') } }
  return <div className="source-panel"><div className="source-panel-heading"><div><strong>Cloud drafts</strong><span>Loaded through the authenticated V2 API. No automatic synchronization.</span></div>{canWrite && cloudReadiness.enabled && <ButtonLink to="/courses/cloud/new" icon="plus">Create cloud course</ButtonLink>}</div>
    {error && <div className="persistence-message conflict" role="alert">{error}</div>}
    {loading ? <div className="draft-list-loading" role="status">Loading cloud drafts…</div> : !error && drafts.length === 0 ? <div className="empty-state"><BookOpen size={27} /><h3>No cloud course drafts</h3><p>A cloud document is created only after an explicit Save.</p></div> : drafts.length > 0 && <div className="draft-table-wrap"><table className="draft-table"><thead><tr><th>Course</th><th>Updated</th><th>Revision</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{drafts.map((draft) => <tr key={draft.id}><td><strong>{draft.title || 'Untitled course'}</strong><span>/{draft.slug || 'no-slug'}</span></td><td><span className="date-cell"><Clock3 size={13} />{formatDate(draft.lastSavedAt)}</span></td><td>r{draft.revision}</td><td><span className="cloud-badge">Cloud draft</span></td><td><div className="row-actions"><Link to={`/courses/cloud/${draft.id}/edit`} aria-label={`${canWrite ? 'Edit' : 'View'} ${draft.title}`}><Pencil size={15} /></Link>{canDelete && <button type="button" title="Delete cloud draft" onClick={() => void remove(draft)}><Trash2 size={15} /></button>}</div></td></tr>)}</tbody></table></div>}
  </div>
}

function LocalDraftList() {
  const fileInput = useRef<HTMLInputElement>(null)
  const { drafts, isLoading, message, pendingImport, deleteDraft, exportDraft, selectImportFile, restoreImport, cancelImport, duplicateDraft } = useCourseDraftList()
  return <div className="source-panel">
    <div className="source-panel-heading"><div><strong>Local drafts</strong><span>Stored only in this browser and device.</span></div><div className="heading-actions"><input ref={fileInput} className="sr-only" type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void selectImportFile(file); event.target.value = '' }} /><button className="button button--secondary" type="button" onClick={() => fileInput.current?.click()}><Upload size={16} /> Import backup</button><ButtonLink to="/courses/local/new" icon="plus">Create local course</ButtonLink></div></div>
    <div className="local-storage-note"><HardDrive size={17} /><span>These drafts are not cloud-backed. Clearing browser storage removes them.</span></div>
    {message && <div className="persistence-message" role="status">{message}</div>}
    {pendingImport && <div className="import-panel"><div><strong>Restore “{pendingImport.draft.document.title || 'Untitled course'}”</strong><span>Backup revision {pendingImport.draft.revision} · exported {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(pendingImport.exportedAt))}</span></div><p>Choose whether to generate a new course identity or restore the original ID. Neither option overwrites an existing draft.</p><div><button className="button button--primary" onClick={() => void restoreImport('new')}>Restore as new draft</button><button className="button button--secondary" onClick={() => void restoreImport('original')}>Restore original identity</button><button className="text-button" onClick={cancelImport}>Cancel</button></div></div>}
    {isLoading ? <div className="draft-list-loading" role="status">Loading local drafts…</div> : drafts.length === 0 ? <div className="empty-state"><span className="empty-state__icon"><BookOpen size={27} /></span><h3>No local course drafts</h3><p>Create a course and save it to keep the draft in this browser.</p><ButtonLink to="/courses/local/new" icon="plus" variant="secondary">Create your first course</ButtonLink></div> : <div className="draft-table-wrap"><table className="draft-table"><thead><tr><th>Course</th><th>Last saved</th><th>Revision</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{drafts.map((draft) => <tr key={draft.id}><td><strong>{draft.title || 'Untitled course'}</strong><span>/{draft.slug || 'no-slug'}</span></td><td><span className="date-cell"><Clock3 size={13} />{formatDate(draft.lastSavedAt)}</span></td><td>r{draft.revision}</td><td><span className="local-badge">Local draft</span></td><td><div className="row-actions"><Link to={`/courses/local/${draft.id}/edit`} aria-label={`Edit ${draft.title}`}><Pencil size={15} /></Link><button type="button" title="Export backup" aria-label={`Export ${draft.title}`} onClick={() => void exportDraft(draft)}><Download size={15} /></button><button type="button" title="Duplicate" aria-label={`Duplicate ${draft.title}`} onClick={() => void duplicateDraft(draft)}><BookCopy size={15} /></button><button type="button" title="Delete" aria-label={`Delete ${draft.title}`} onClick={() => { if (window.confirm(`Delete the local draft “${draft.title || 'Untitled course'}”?`)) void deleteDraft(draft) }}><Trash2 size={15} /></button></div></td></tr>)}</tbody></table></div>}
  </div>
}

function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) }
