import 'fake-indexeddb/auto'
import { openDB } from 'idb'
import { describe, expect, it, vi } from 'vitest'

import { addBlock, createCourseDocument } from '../editor/core/courseEditor.commands'
import { shouldShowNavigationConfirmation } from './useUnsavedChangesWarning'
import { DraftChangeChannel, isDraftChangeEvent, type DraftChangeEvent } from './draftChangeChannel'
import { createCourseDraftExport, DraftImportError, duplicateCourseDraft, MAX_DRAFT_IMPORT_BYTES, parseCourseDraftImport, restoreCourseDraft, safeDraftFilename, serializeCourseDraftExport } from './draftTransfer'
import { COURSE_DRAFT_STORE, DRAFT_DATABASE_VERSION, DRAFT_METADATA_STORE, IndexedDbCourseDraftRepository } from './indexedDbCourseDraftRepository'

const ids = (prefix = 'c') => { let index = 0; return () => `${prefix}0000000-0000-4000-8000-${String(++index).padStart(12, '0')}` }
let databaseIndex = 0
const repository = (name = `ycoders-recovery-test-${++databaseIndex}`) => new IndexedDbCourseDraftRepository({ databaseName: name, now: () => '2026-11-16T13:00:00.000Z' })

describe('course draft export and import', () => {
  it('round-trips a validated backup and safe filename', async () => {
    const repo = repository()
    const record = await repo.create(createCourseDocument(ids()))
    const json = serializeCourseDraftExport(record, '2026-11-16T14:00:00.000Z')
    const parsed = parseCourseDraftImport(json)
    expect(parsed).toEqual(createCourseDraftExport(record, '2026-11-16T14:00:00.000Z'))
    expect(safeDraftFilename(record)).toMatch(/^ycoders-course-[a-z0-9-]+-r1\.json$/)
  })

  it('rejects invalid JSON, oversized files, and unsupported export versions', () => {
    expect(() => parseCourseDraftImport('{')).toThrowError(expect.objectContaining<Partial<DraftImportError>>({ code: 'invalid-json' }))
    expect(() => parseCourseDraftImport('{}', MAX_DRAFT_IMPORT_BYTES + 1)).toThrowError(expect.objectContaining<Partial<DraftImportError>>({ code: 'oversized' }))
    expect(() => parseCourseDraftImport(JSON.stringify({ formatVersion: 99 }))).toThrowError(expect.objectContaining<Partial<DraftImportError>>({ code: 'unsupported-export' }))
  })

  it('rejects unsupported content schemas and unsafe rich text', async () => {
    const repo = repository()
    let document = createCourseDocument(ids())
    const module = document.content.modules[0]
    if (module.organization !== 'lessons') throw new Error('Expected lessons')
    document = addBlock(document, module.lessons[0].id, 'richText', ids('d'))
    const record = await repo.create(document)
    const unsupported = createCourseDraftExport(record) as unknown as { draft: { schemaVersion: string } }
    unsupported.draft.schemaVersion = '3.0.0'
    expect(() => parseCourseDraftImport(JSON.stringify(unsupported))).toThrowError(expect.objectContaining<Partial<DraftImportError>>({ code: 'unsupported-schema' }))
    const unsafe = createCourseDraftExport(record) as unknown as { draft: { document: { content: { modules: Array<{ lessons: Array<{ blocks: Array<{ data: { document: { content: unknown[] } } }> }> }> } } } }
    unsafe.draft.document.content.modules[0].lessons[0].blocks[0].data.document.content = [{ type: 'html', value: '<script>alert(1)</script>' }]
    expect(() => parseCourseDraftImport(JSON.stringify(unsafe))).toThrowError(expect.objectContaining<Partial<DraftImportError>>({ code: 'invalid-export' }))
  })

  it('restores as a new identity while preserving structural IDs', async () => {
    const sourceRepo = repository(); const targetRepo = repository()
    const source = await sourceRepo.create(createCourseDocument(ids()))
    const restored = await restoreCourseDraft(targetRepo, createCourseDraftExport(source), 'new', () => 'e0000000-0000-4000-8000-000000000001', '2026-11-16T15:00:00.000Z')
    expect(restored.id).not.toBe(source.id)
    expect(restored.revision).toBe(1)
    expect(restored.document.content.modules[0].id).toBe(source.document.content.modules[0].id)
  })

  it('restores the original identity only when it is available', async () => {
    const sourceRepo = repository(); const targetRepo = repository()
    const source = await sourceRepo.create(createCourseDocument(ids()))
    const backup = createCourseDraftExport(source)
    const restored = await restoreCourseDraft(targetRepo, backup, 'original')
    expect(restored.id).toBe(source.id)
    expect(restored.revision).toBe(1)
    await expect(restoreCourseDraft(targetRepo, backup, 'original')).rejects.toEqual(expect.objectContaining<Partial<DraftImportError>>({ code: 'collision' }))
  })

  it('duplicates without changing the source or sharing publication identity', async () => {
    const repo = repository(); const source = await repo.create(createCourseDocument(ids()))
    const duplicate = await duplicateCourseDraft(repo, source, () => 'f0000000-0000-4000-8000-000000000001', '2026-11-16T16:00:00.000Z')
    expect(duplicate.id).not.toBe(source.id)
    expect(duplicate.document.title).toContain('Copy')
    expect(duplicate.document.slug).toContain('copy-f0000000')
    expect(duplicate.document.content.modules[0].id).toBe(source.document.content.modules[0].id)
    expect(duplicate.document.status).toMatchObject({ authoringState: 'draft', visibility: 'private', publishedDocumentVersion: null, publishedAt: null })
    expect((await repo.get(source.id))?.document).toEqual(source.document)
  })
})

describe('cross-tab draft notifications', () => {
  it('accepts metadata-only events, ignores the current source, and notifies subscribers', () => {
    const channel = new DraftChangeChannel('tab-a')
    const listener = vi.fn(); channel.subscribe(listener)
    const event: DraftChangeEvent = { formatVersion: 1, sourceId: 'tab-b', action: 'updated', id: 'draft-id', revision: 3, timestamp: '2026-11-16T12:00:00.000Z' }
    channel.receive(event)
    expect(listener).toHaveBeenCalledWith(event)
    channel.receive({ ...event, sourceId: 'tab-a' })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(event)).not.toContain('document')
    channel.close()
  })

  it('rejects malformed notification messages', () => {
    expect(isDraftChangeEvent({ formatVersion: 1, action: 'updated', document: {} })).toBe(false)
  })

  it('publishes repository create, update, and delete metadata', async () => {
    const publish = vi.fn()
    const repo = new IndexedDbCourseDraftRepository({ databaseName: `ycoders-recovery-test-${++databaseIndex}`, changes: { publish }, now: () => '2026-11-16T12:00:00.000Z' })
    const document = createCourseDocument(ids())
    await repo.create(document); const saved = await repo.save(document.id, { ...document, title: 'Updated' }, 1); await repo.delete(document.id, saved.revision)
    expect(publish.mock.calls.map((call) => call[0])).toEqual(['created', 'updated', 'deleted'])
    expect(publish.mock.calls.every((call) => call.length === 3)).toBe(true)
  })
})

describe('IndexedDB upgrade infrastructure', () => {
  it('opens an existing database without losing drafts and adds the v2 metadata store', async () => {
    const name = `ycoders-upgrade-test-${++databaseIndex}`
    const document = createCourseDocument(ids())
    const record = { id: document.id, contentType: 'course', schemaVersion: '2.0.0', revision: 1, document, createdAt: '2026-11-16T12:00:00.000Z', lastSavedAt: '2026-11-16T12:00:00.000Z' }
    const oldDatabase = await openDB(name, 1, { upgrade(database) { const store = database.createObjectStore(COURSE_DRAFT_STORE, { keyPath: 'id' }); store.createIndex('by-last-saved', 'lastSavedAt') } })
    await oldDatabase.put(COURSE_DRAFT_STORE, record); oldDatabase.close()
    const repo = repository(name)
    expect((await repo.get(document.id))?.document).toEqual(document)
    const upgraded = await openDB(name, DRAFT_DATABASE_VERSION)
    expect(upgraded.objectStoreNames.contains(COURSE_DRAFT_STORE)).toBe(true)
    expect(upgraded.objectStoreNames.contains(DRAFT_METADATA_STORE)).toBe(true)
    upgraded.close()
  })
})

describe('navigation confirmation state', () => {
  it('opens only for blocked dirty navigation and stays closed otherwise', () => {
    expect(shouldShowNavigationConfirmation(true, 'blocked')).toBe(true)
    expect(shouldShowNavigationConfirmation(false, 'blocked')).toBe(false)
    expect(shouldShowNavigationConfirmation(true, 'unblocked')).toBe(false)
    expect(shouldShowNavigationConfirmation(true, 'proceeding')).toBe(false)
  })
})
