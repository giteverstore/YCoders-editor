import { useCallback, useEffect, useState } from 'react'

import { courseDraftRepository } from './indexedDbCourseDraftRepository'
import type { DraftRepository, DraftSummary } from './draft.types'
import type { CourseDocument } from '../content/core/envelope'
import { createCourseDraftExport, duplicateCourseDraft, parseCourseDraftImport, restoreCourseDraft, safeDraftFilename, serializeCourseDraftExport, type CourseDraftExport, type ImportIdentityMode, MAX_DRAFT_IMPORT_BYTES } from './draftTransfer'
import { draftChangeChannel } from './draftChangeChannel'

export function useCourseDraftList(repository: DraftRepository<CourseDocument> = courseDraftRepository) {
  const [drafts, setDrafts] = useState<DraftSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [pendingImport, setPendingImport] = useState<CourseDraftExport | null>(null)

  const refresh = useCallback(async () => {
    setIsLoading(true)
    try { setDrafts(await repository.list()); setMessage(null) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to read local drafts') }
    finally { setIsLoading(false) }
  }, [repository])

  useEffect(() => {
    let active = true
    repository.list().then((records) => { if (active) { setDrafts(records); setMessage(null) } }).catch((error: unknown) => { if (active) setMessage(error instanceof Error ? error.message : 'Unable to read local drafts') }).finally(() => { if (active) setIsLoading(false) })
    return () => { active = false }
  }, [repository])
  useEffect(() => draftChangeChannel.subscribe(() => { void refresh() }), [refresh])

  const deleteDraft = useCallback(async (draft: DraftSummary) => {
    try { await repository.delete(draft.id, draft.revision); setDrafts((current) => current.filter((item) => item.id !== draft.id)); setMessage('Local draft deleted'); return true }
    catch (error) { setMessage(error instanceof Error ? `${error.message}. The list has been refreshed.` : 'Unable to delete the local draft'); await refresh(); return false }
  }, [refresh, repository])

  const exportDraft = useCallback(async (draft: DraftSummary) => {
    try {
      const record = await repository.get(draft.id)
      if (!record) throw new Error('The local draft no longer exists')
      const validated = createCourseDraftExport(record)
      const url = URL.createObjectURL(new Blob([serializeCourseDraftExport(record, validated.exportedAt)], { type: 'application/json' }))
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = safeDraftFilename(record); anchor.click(); URL.revokeObjectURL(url)
      setMessage('Backup exported. The draft was not modified.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to export the draft') }
  }, [repository])

  const selectImportFile = useCallback(async (file: File) => {
    try {
      if (file.size > MAX_DRAFT_IMPORT_BYTES) throw new Error(`File exceeds the ${MAX_DRAFT_IMPORT_BYTES / 1024 / 1024} MB import limit`)
      const backup = parseCourseDraftImport(await file.text(), file.size)
      setPendingImport(backup); setMessage(null); return true
    } catch (error) { setPendingImport(null); setMessage(error instanceof Error ? error.message : 'Unable to read the backup'); return false }
  }, [])

  const restoreImport = useCallback(async (mode: ImportIdentityMode) => {
    if (!pendingImport) return false
    try { await restoreCourseDraft(repository, pendingImport, mode); setPendingImport(null); setMessage(mode === 'new' ? 'Backup restored as a new local draft' : 'Original draft identity restored locally'); await refresh(); return true }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to restore the backup'); return false }
  }, [pendingImport, refresh, repository])

  const duplicateDraft = useCallback(async (draft: DraftSummary) => {
    try { const source = await repository.get(draft.id); if (!source) throw new Error('The source draft no longer exists'); await duplicateCourseDraft(repository, source); setMessage('Course duplicated as a new local draft'); await refresh(); return true }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to duplicate the course'); return false }
  }, [refresh, repository])

  return { drafts, isLoading, message, pendingImport, refresh, deleteDraft, exportDraft, selectImportFile, restoreImport, cancelImport: () => setPendingImport(null), duplicateDraft }
}
