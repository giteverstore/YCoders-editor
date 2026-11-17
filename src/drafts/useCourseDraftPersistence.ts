import { useCallback, useEffect, useRef, useState } from 'react'

import type { ContentDocument } from '../content/core/envelope'
import { CURRENT_SCHEMA_VERSION } from '../content/core/versions'
import { courseDraftRepository } from './indexedDbCourseDraftRepository'
import { documentFingerprint, hasUnsavedChanges } from './draftState'
import { DraftConflictError, DraftRepositoryError, type DraftRepository, type DraftSource } from './draft.types'
import { draftChangeChannel, type DraftChangeEvent } from './draftChangeChannel'

export type DraftLoadState = 'new' | 'loading' | 'ready' | 'not-found' | 'unsupported' | 'error'
export type DraftConflict = { expectedRevision: number; currentRevision: number }

type Options<TDocument extends ContentDocument> = {
  id?: string
  document: TDocument
  hydrate: (document: TDocument) => void
  repository?: DraftRepository<TDocument>
  source?: DraftSource
}

export function useCourseDraftPersistence<TDocument extends ContentDocument>({ id, document, hydrate, repository = courseDraftRepository as unknown as DraftRepository<TDocument>, source = 'local' }: Options<TDocument>) {
  const [loadState, setLoadState] = useState<DraftLoadState>(id ? 'loading' : 'new')
  const [revision, setRevision] = useState<number | null>(null)
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [savedFingerprint, setSavedFingerprint] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [conflict, setConflict] = useState<DraftConflict | null>(null)
  const [createdId, setCreatedId] = useState<string | null>(null)
  const [wasDeleted, setWasDeleted] = useState(false)
  const [externalChange, setExternalChange] = useState<DraftChangeEvent | null>(null)
  const documentRef = useRef(document)
  const savingRef = useRef(false)
  const skipLoadId = useRef<string | null>(null)
  useEffect(() => { documentRef.current = document }, [document])

  useEffect(() => {
    if (!id) return
    if (skipLoadId.current === id) { skipLoadId.current = null; return }
    let active = true
    Promise.resolve().then(() => { if (active) { setLoadState('loading'); setMessage(null) } return repository.get(id) }).then((record) => {
      if (!active) return
      if (!record) { setLoadState('not-found'); return }
      hydrate(record.document); setRevision(record.revision); setLastSavedAt(record.lastSavedAt); setSavedFingerprint(documentFingerprint(record.document)); setLoadState('ready')
    }).catch((error: unknown) => {
      if (!active) return
      if (error instanceof DraftRepositoryError && error.code === 'unsupported-schema') setLoadState('unsupported')
      else { setLoadState('error'); setMessage(error instanceof Error ? error.message : 'Unable to load the local draft') }
    })
    return () => { active = false }
  }, [hydrate, id, repository])

  useEffect(() => source === 'local' ? draftChangeChannel.subscribe((event) => {
    if (event.id === id && (event.action === 'deleted' || revision === null || event.revision > revision)) setExternalChange(event)
  }) : undefined, [id, revision, source])

  const save = useCallback(async () => {
    if (savingRef.current) return false
    if (conflict) return false
    savingRef.current = true; setIsSaving(true); setMessage(null)
    const captured = structuredClone(documentRef.current)
    const capturedFingerprint = documentFingerprint(captured)
    try {
      if (revision === null) {
        const record = await repository.create(captured)
        setRevision(record.revision); setLastSavedAt(record.lastSavedAt); setSavedFingerprint(capturedFingerprint); setLoadState('ready'); setMessage(`Draft saved to ${source === 'cloud' ? 'cloud' : 'this browser'}`)
        skipLoadId.current = record.id; setCreatedId(record.id)
      } else {
        const record = await repository.save(captured.id, captured, revision)
        setRevision(record.revision); setLastSavedAt(record.lastSavedAt); setSavedFingerprint(capturedFingerprint); setMessage(`Draft saved to ${source === 'cloud' ? 'cloud' : 'this browser'}`); setExternalChange(null)
      }
      return true
    } catch (error) {
      if (error instanceof DraftConflictError) { setConflict({ expectedRevision: error.expectedRevision, currentRevision: error.currentRevision }); setMessage('A newer local revision exists. Your working changes are preserved.') }
      else setMessage(error instanceof Error ? error.message : 'Unable to save the local draft')
      return false
    } finally { savingRef.current = false; setIsSaving(false) }
  }, [conflict, repository, revision, source])

  const reloadLatest = useCallback(async () => {
    if (!id) return false
    const record = await repository.get(id)
    if (!record) { setLoadState('not-found'); return false }
    hydrate(record.document); setRevision(record.revision); setLastSavedAt(record.lastSavedAt); setSavedFingerprint(documentFingerprint(record.document)); setConflict(null); setExternalChange(null); setMessage(`Latest ${source} revision loaded`); return true
  }, [hydrate, id, repository, source])

  const deleteDraft = useCallback(async () => {
    if (!id || revision === null) return false
    try { await repository.delete(id, revision); setSavedFingerprint(documentFingerprint(documentRef.current)); setWasDeleted(true); return true }
    catch (error) { if (error instanceof DraftConflictError) setConflict({ expectedRevision: error.expectedRevision, currentRevision: error.currentRevision }); setMessage(error instanceof Error ? error.message : 'Unable to delete the draft'); return false }
  }, [id, repository, revision])

  return { loadState, revision, lastSavedAt, savedFingerprint, isDirty: hasUnsavedChanges(document, savedFingerprint), isSaving, message, conflict, externalChange, createdId, wasDeleted, save, reloadLatest, deleteDraft, schemaVersion: CURRENT_SCHEMA_VERSION }
}
