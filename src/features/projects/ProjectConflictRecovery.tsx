import { useState } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import type { ProjectDocument } from '../../content/core/envelope'
import type { DraftConflict } from '../../drafts/useCourseDraftPersistence'
import { createWorkingProjectExport } from './projectConflictExport'

export function ProjectConflictRecovery({ conflict, document, reloadLatest }: { conflict: DraftConflict; document: ProjectDocument; reloadLatest: () => Promise<boolean> }) {
  const [message, setMessage] = useState<string | null>(null)
  const exportChanges = () => {
    try {
      const url = URL.createObjectURL(new Blob([createWorkingProjectExport(document, conflict.expectedRevision)], { type: 'application/json' }))
      const anchor = window.document.createElement('a'); anchor.href = url; anchor.download = `ycoders-project-working-${document.id}.json`; anchor.click(); URL.revokeObjectURL(url)
      setMessage('Working changes exported. Your editor content was not modified.')
    } catch (error) { setMessage(error instanceof Error ? `Export failed: ${error.message}` : 'Export failed. Your working content remains in memory.') }
  }
  const reload = async () => {
    if (!window.confirm('Reload the latest authoritative revision? Your unsaved working changes will be discarded. Export them first if needed.')) return
    try { setMessage((await reloadLatest()) ? 'Latest revision loaded; the conflict is resolved.' : 'Reload failed. Working changes were preserved.') }
    catch (error) { setMessage(error instanceof Error ? `Reload failed: ${error.message}. Working changes were preserved.` : 'Reload failed. Working changes were preserved.') }
  }
  return <div className="persistence-message conflict" role="alert"><div><strong>Revision conflict</strong><p>The save expected revision {conflict.expectedRevision}, but the authoritative draft is revision {conflict.currentRevision}. Your working edits remain in memory and Save is locked until you reload.</p></div><div className="transfer-actions"><button type="button" onClick={exportChanges}><Download size={15}/> Export My Changes</button><button type="button" onClick={() => void reload()}><RefreshCw size={15}/> Reload Latest Version</button></div>{message && <p role="status">{message}</p>}</div>
}
