import { AlertTriangle, CheckCircle2, Download, Eye, PanelLeft, PanelRight, Pencil, Redo2, Save, Trash2, Undo2, Upload } from 'lucide-react'
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { CourseDetailsForm } from '../../editor/course/CourseDetailsForm'
import { CoursePreview } from '../../editor/course/CoursePreview'
import { LessonBlockCanvas } from '../../editor/course/LessonBlockCanvas'
import { StructureInspector, StructureNavigator } from '../../editor/course/StructureNavigator'
import { createCourseDocument } from '../../editor/core/courseEditor.commands'
import { courseEditorReducer, createCourseEditorState, type CourseEditorSelection } from '../../editor/core/courseEditor.reducer'
import { useCourseDraftPersistence } from '../../drafts/useCourseDraftPersistence'
import { useUnsavedChangesWarning } from '../../drafts/useUnsavedChangesWarning'
import type { CourseDocument } from '../../content/core/envelope'
import { UnsavedChangesDialog } from '../../components/ui/UnsavedChangesDialog'
import { useAuth } from '../../auth/authContext'
import { hasPermission } from '../../auth/permissions'
import { V2DraftApiClient } from '../../cloud/draftApiClient'
import { CloudCourseDraftRepository } from '../../cloud/cloudCourseDraftRepository'
import { cloudReadiness } from '../../cloud/cloudReadiness'
import { courseDraftRepository } from '../../drafts/indexedDbCourseDraftRepository'
import { backupCloudDraft, uploadLocalDraft } from '../../drafts/cloudTransfer'
import type { DraftRecord, DraftSource } from '../../drafts/draft.types'
import { PublicationWorkflow } from '../../publication/PublicationWorkflow'

type MobilePanel = 'structure' | 'canvas' | 'inspector'

export function CourseEditorPage({ source = 'local' }: { source?: DraftSource }) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const auth = useAuth()
  const cloudRepository = useMemo(() => new CloudCourseDraftRepository(new V2DraftApiClient(auth.getIdToken)), [auth.getIdToken])
  const repository = source === 'cloud' ? cloudRepository : courseDraftRepository
  const canWrite = auth.role ? hasPermission(auth.role, 'draft:write') : false
  const canDelete = auth.role ? hasPermission(auth.role, 'draft:delete') : false
  const readOnly = source === 'cloud' && !canWrite
  const initialDocument = useMemo(() => createCourseDocument(), [])
  const [state, dispatch] = useReducer(courseEditorReducer, initialDocument, createCourseEditorState)
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('canvas')
  const commit = (document: typeof state.document) => dispatch({ type: 'commit', document })
  const editorCommit = readOnly ? () => undefined : commit
  const select = (selection: CourseEditorSelection) => { dispatch({ type: 'select', selection }); if (selection.kind === 'lesson' || selection.kind === 'course') setMobilePanel('canvas') }
  const selectedLessonId = state.selection.kind === 'lesson' ? state.selection.id : state.selection.kind === 'block' ? state.selection.lessonId : null
  const hydrate = useCallback((document: CourseDocument) => dispatch({ type: 'hydrate', document }), [])
  const persistence = useCourseDraftPersistence({ id, document: state.document, hydrate, repository, source })
  const [transferMessage, setTransferMessage] = useState<string | null>(null)
  const navigationConfirmation = useUnsavedChangesWarning((persistence.loadState === 'new' || persistence.loadState === 'ready') && persistence.isDirty)
  useEffect(() => { if (persistence.createdId && !persistence.isDirty) navigate(`/courses/${source}/${persistence.createdId}/edit`, { replace: true }) }, [navigate, persistence.createdId, persistence.isDirty, source])
  useEffect(() => { if (persistence.wasDeleted && !persistence.isDirty) navigate('/courses', { replace: true }) }, [navigate, persistence.isDirty, persistence.wasDeleted])

  if (source === 'cloud' && !cloudReadiness.enabled) return <div className="draft-state"><AlertTriangle size={28} /><h2>Cloud drafts unavailable</h2><p>{cloudReadiness.reason}</p><button className="button button--secondary" onClick={() => navigate('/courses')}>Return to courses</button></div>
  if (persistence.loadState === 'loading') return <div className="draft-state" role="status"><span className="editor-placeholder__icon"><Save size={28} /></span><h2>Loading {source} draft…</h2><p>{source === 'local' ? 'Reading this course from this browser’s IndexedDB storage.' : 'Loading the authoritative cloud revision through the secure API.'}</p></div>
  if (persistence.loadState === 'not-found') return <div className="draft-state"><span className="editor-placeholder__icon"><AlertTriangle size={28} /></span><h2>{source === 'local' ? 'Local' : 'Cloud'} draft not found</h2><p>No {source} course draft with ID <code>{id}</code> exists.</p><button className="button button--secondary" onClick={() => navigate('/courses')}>Return to courses</button></div>
  if (persistence.loadState === 'unsupported') return <div className="draft-state"><span className="editor-placeholder__icon"><AlertTriangle size={28} /></span><h2>Unsupported draft schema</h2><p>This local draft was created with a schema version the current studio cannot safely open.</p><button className="button button--secondary" onClick={() => navigate('/courses')}>Return to courses</button></div>
  if (persistence.loadState === 'error') return <div className="draft-state"><span className="editor-placeholder__icon"><AlertTriangle size={28} /></span><h2>Local storage unavailable</h2><p>{persistence.message}</p><button className="button button--secondary" onClick={() => window.location.reload()}>Try again</button></div>

  return <div className="course-editor-page">
    <UnsavedChangesDialog open={navigationConfirmation.isOpen} onStay={navigationConfirmation.stay} onDiscard={navigationConfirmation.discard} />
    <div className="memory-warning"><AlertTriangle size={15} /><span><strong>{source === 'local' ? 'Local draft.' : 'Cloud draft.'}</strong> {source === 'local' ? 'Saved copies remain in this browser and device.' : `Revision ${persistence.revision ?? 'new'} is stored by the V2 draft API.${readOnly ? ' Your role has read-only access.' : ''}`}</span></div>
    <PublicationWorkflow contentId={state.document.id} contentType="course" title={state.document.title} source={source} revision={persistence.revision} isDirty={persistence.isDirty} />
    <div className="editor-commandbar">
      <div><button type="button" disabled={readOnly || !state.past.length} onClick={() => dispatch({ type: 'undo' })}><Undo2 size={15} /> Undo</button><button type="button" disabled={readOnly || !state.future.length} onClick={() => dispatch({ type: 'redo' })}><Redo2 size={15} /> Redo</button><button type="button" disabled={readOnly || persistence.isSaving || !persistence.isDirty || Boolean(persistence.conflict)} onClick={() => void persistence.save()}><Save size={15} /> {persistence.isSaving ? 'Saving…' : 'Save'}</button>{id && (source === 'local' || canDelete) && <button type="button" onClick={() => { if (window.confirm(`Delete this ${source} draft? This cannot be undone.`)) void persistence.deleteDraft() }}><Trash2 size={15} /> Delete</button>}</div>
      <div className={`validation-pill ${state.validationIssues.length ? 'invalid' : 'valid'}`}>{state.validationIssues.length ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}{state.validationIssues.length ? `${state.validationIssues.length} validation issue${state.validationIssues.length === 1 ? '' : 's'}` : 'Document valid'}</div>
      <div className="mode-switch"><span className={`save-state ${persistence.isDirty ? 'dirty' : ''}`}>{persistence.isDirty ? 'Unsaved changes' : `Saved · r${persistence.revision}`}</span><button type="button" className={state.mode === 'edit' ? 'active' : ''} onClick={() => dispatch({ type: 'mode', mode: 'edit' })}><Pencil size={14} /> Edit</button><button type="button" className={state.mode === 'preview' ? 'active' : ''} onClick={() => dispatch({ type: 'mode', mode: 'preview' })}><Eye size={14} /> Preview</button></div>
    </div>
    {persistence.message && <div className={`persistence-message ${persistence.conflict ? 'conflict' : ''}`} role="status"><span>{persistence.message}{persistence.conflict && ` Expected revision ${persistence.conflict.expectedRevision}; current revision ${persistence.conflict.currentRevision}.`}</span>{persistence.conflict && <button type="button" onClick={() => { if (window.confirm('Reload the latest saved revision and discard your current working changes?')) void persistence.reloadLatest() }}>Reload latest</button>}</div>}
    {persistence.conflict && <div className="persistence-message conflict"><button type="button" onClick={() => exportWorkingDocument(state.document)}><Download size={15} /> Export working JSON</button></div>}
    <div className="transfer-actions"><span className={source === 'cloud' ? 'cloud-badge' : 'local-badge'}>{source === 'cloud' ? 'Cloud source' : 'Local source'}</span>{source === 'local' && canWrite && cloudReadiness.enabled && id && <button type="button" onClick={() => void transferLocalToCloud()}><Upload size={15} /> Upload Local Draft to Cloud</button>}{source === 'cloud' && id && <button type="button" onClick={() => void transferCloudToLocal()}><Download size={15} /> Save Cloud Draft as Local Copy</button>}{transferMessage && <span role="status">{transferMessage}</span>}</div>
    {persistence.externalChange && <div className="persistence-message conflict" role="status"><span>{persistence.externalChange.action === 'deleted' ? 'This draft was deleted in another tab.' : `Another tab saved revision ${persistence.externalChange.revision}.`} Your working content has not been replaced.</span>{persistence.externalChange.action !== 'deleted' && <button type="button" onClick={() => { if (window.confirm('Reload the other tab’s latest revision and discard your current working changes?')) void persistence.reloadLatest() }}>Reload latest</button>}</div>}
    {state.mode === 'preview' ? <CoursePreview document={state.document} /> : <>
      <div className="mobile-editor-tabs" role="tablist"><button className={mobilePanel === 'structure' ? 'active' : ''} onClick={() => setMobilePanel('structure')}><PanelLeft size={15} /> Structure</button><button className={mobilePanel === 'canvas' ? 'active' : ''} onClick={() => setMobilePanel('canvas')}><Pencil size={15} /> Canvas</button><button className={mobilePanel === 'inspector' ? 'active' : ''} onClick={() => setMobilePanel('inspector')}><PanelRight size={15} /> Inspector</button></div>
      <div className="course-editor-grid">
        <aside className={`editor-panel editor-panel--structure ${mobilePanel === 'structure' ? 'mobile-active' : ''}`}><StructureNavigator document={state.document} selection={state.selection} commit={editorCommit} select={select} /></aside>
        <section className={`editor-canvas ${mobilePanel === 'canvas' ? 'mobile-active' : ''}`}>{selectedLessonId ? <LessonBlockCanvas document={state.document} lessonId={selectedLessonId} selection={state.selection} commit={editorCommit} select={select} /> : <CourseDetailsForm document={state.document} issues={state.validationIssues} commit={editorCommit} />}</section>
        <aside className={`editor-panel editor-panel--inspector ${mobilePanel === 'inspector' ? 'mobile-active' : ''}`}><div className="panel-title"><span>Inspector</span></div><StructureInspector document={state.document} selection={state.selection} commit={editorCommit} />{state.validationIssues.length > 0 && <div className="validation-list"><h3>Validation</h3><ul>{state.validationIssues.slice(0, 8).map((issue, index) => <li key={`${issue.path.join('.')}-${index}`}><strong>{issue.path.join('.') || 'Document'}</strong><span>{issue.message}</span></li>)}</ul>{state.validationIssues.length > 8 && <small>+ {state.validationIssues.length - 8} more issues</small>}</div>}</aside>
      </div>
    </>}
  </div>

  async function transferLocalToCloud() {
    if (!id || !window.confirm(`Upload local draft ${state.document.id} to the cloud? The local draft will remain unchanged.`)) return
    setTransferMessage('Checking cloud destination…')
    try {
      const local = await courseDraftRepository.get(id); if (!local) throw new Error('Local draft no longer exists.')
      let result: DraftRecord<CourseDocument>
      try { result = await uploadLocalDraft(local, cloudRepository) }
      catch (error) {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'duplicate' || !window.confirm('That ID already exists in cloud storage. Create an independent cloud copy with a new ID?')) throw error
        result = await uploadLocalDraft(local, cloudRepository, true)
      }
      setTransferMessage(`Uploaded as cloud draft ${result.id}, revision ${result.revision}.`)
    } catch (error) { setTransferMessage(error instanceof Error ? error.message : 'Upload failed. The local draft is unchanged.') }
  }

  async function transferCloudToLocal() {
    if (!id || !window.confirm(`Save cloud revision ${persistence.revision} as a separate local recovery copy?`)) return
    try {
      const cloud = await cloudRepository.get(id); if (!cloud) throw new Error('Cloud draft no longer exists.')
      const result = await backupCloudDraft(cloud, courseDraftRepository)
      setTransferMessage(`Local recovery copy created as ${result.id}, revision 1.`)
    } catch (error) { setTransferMessage(error instanceof Error ? error.message : 'Local backup failed. The cloud draft is unchanged.') }
  }
}

function exportWorkingDocument(document: CourseDocument) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' }))
  const anchor = window.document.createElement('a'); anchor.href = url; anchor.download = `ycoders-working-${document.id}.json`; anchor.click(); URL.revokeObjectURL(url)
}
