import 'fake-indexeddb/auto'
import { openDB } from 'idb'
import { describe, expect, it } from 'vitest'

import { contentEnvelopeSchema } from '../content/core/envelope'
import { createCourseDocument, updateCourse } from '../editor/core/courseEditor.commands'
import { courseEditorReducer, createCourseEditorState } from '../editor/core/courseEditor.reducer'
import { documentFingerprint, hasUnsavedChanges, shouldWarnBeforeNavigation } from './draftState'
import { COURSE_DRAFT_STORE, DRAFT_DATABASE_VERSION, IndexedDbCourseDraftRepository } from './indexedDbCourseDraftRepository'
import { DraftConflictError, DraftRepositoryError, UnsupportedDraftSchemaError } from './draft.types'

const ids = () => { let index = 0; return () => `b0000000-0000-4000-8000-${String(++index).padStart(12, '0')}` }
let databaseIndex = 0
const repository = (name = `ycoders-editor-test-${++databaseIndex}`) => new IndexedDbCourseDraftRepository({ databaseName: name, now: () => '2026-11-16T12:00:00.000Z' })

describe('IndexedDB course draft repository', () => {
  it('creates, lists, and loads a local draft', async () => {
    const repo = repository()
    const document = createCourseDocument(ids())
    const created = await repo.create(document)
    expect(created.revision).toBe(1)
    expect((await repo.get(document.id))?.document).toEqual(document)
    expect(await repo.list()).toEqual([expect.objectContaining({ id: document.id, title: document.title, status: 'local-draft', revision: 1 })])
  })

  it('prevents duplicate creates', async () => {
    const repo = repository()
    const document = createCourseDocument(ids())
    await repo.create(document)
    await expect(repo.create(document)).rejects.toMatchObject({ code: 'duplicate' })
  })

  it('saves updates and increments revisions', async () => {
    const repo = repository()
    const document = createCourseDocument(ids())
    await repo.create(document)
    const saved = await repo.save(document.id, updateCourse(document, { title: 'Saved title' }), 1)
    expect(saved.revision).toBe(2)
    expect((await repo.get(document.id))?.document.title).toBe('Saved title')
  })

  it('rejects stale writes from a second repository client', async () => {
    const name = `ycoders-editor-test-${++databaseIndex}`
    const first = repository(name)
    const second = repository(name)
    const document = createCourseDocument(ids())
    await first.create(document)
    const firstRead = await first.get(document.id)
    const secondRead = await second.get(document.id)
    await first.save(document.id, updateCourse(firstRead!.document, { title: 'Tab one' }), firstRead!.revision)
    await expect(second.save(document.id, updateCourse(secondRead!.document, { title: 'Tab two' }), secondRead!.revision)).rejects.toEqual(expect.objectContaining<Partial<DraftConflictError>>({ expectedRevision: 1, currentRevision: 2, code: 'conflict' }))
    expect((await first.get(document.id))?.document.title).toBe('Tab one')
  })

  it('checks revisions when deleting and preserves newer data', async () => {
    const repo = repository()
    const document = createCourseDocument(ids())
    await repo.create(document)
    await repo.save(document.id, updateCourse(document, { title: 'Newer' }), 1)
    await expect(repo.delete(document.id, 1)).rejects.toBeInstanceOf(DraftConflictError)
    expect(await repo.get(document.id)).not.toBeNull()
    await repo.delete(document.id, 2)
    expect(await repo.get(document.id)).toBeNull()
  })

  it('returns null for a missing draft', async () => {
    expect(await repository().get('b0000000-0000-4000-8000-999999999999')).toBeNull()
  })

  it('reports unsupported stored schema versions', async () => {
    const name = `ycoders-editor-test-${++databaseIndex}`
    const repo = repository(name)
    const document = createCourseDocument(ids())
    const created = await repo.create(document)
    const database = await openDB(name, DRAFT_DATABASE_VERSION)
    await database.put(COURSE_DRAFT_STORE, { ...created, schemaVersion: '9.0.0' })
    await expect(repo.get(document.id)).rejects.toBeInstanceOf(UnsupportedDraftSchemaError)
  })

  it('stores editing-valid drafts without weakening publication validation', async () => {
    const repo = repository()
    const document = createCourseDocument(ids())
    const incomplete = structuredClone(document)
    incomplete.title = ''
    incomplete.slug = 'NOT A VALID SLUG'
    incomplete.content.modules = []
    expect(contentEnvelopeSchema.safeParse(incomplete).success).toBe(false)
    await expect(repo.create(incomplete)).resolves.toMatchObject({ revision: 1 })
  })

  it('round-trips quiz mode/options, public exercise tests, and the Course icon reference', async () => {
    const repo = repository(), document = structuredClone(createCourseDocument(ids()))
    document.content.courseIconAssetId = 'b0000000-0000-4000-8000-000000000011'
    const module = document.content.modules[0]
    if (module.organization !== 'lessons') throw new Error('fixture')
    module.lessons[0].blocks.push(
      { id: 'b0000000-0000-4000-8000-000000000012', schemaVersion: 1, type: 'quiz', data: { question: 'Select', mode: 'multiple-correct', options: [{ id: 'b0000000-0000-4000-8000-000000000013', text: 'A', isCorrect: true }, { id: 'b0000000-0000-4000-8000-000000000014', text: 'B', isCorrect: true }, { id: 'b0000000-0000-4000-8000-000000000015', text: 'C', isCorrect: false }] } } as never,
      { id: 'b0000000-0000-4000-8000-000000000016', schemaVersion: 1, type: 'exercise', data: { prompt: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Code' }] }] }, language: 'javascript', starterCode: '', publicTests: [{ id: 'b0000000-0000-4000-8000-000000000017', input: 'x', expectedOutput: 'y' }] } } as never,
    )
    await repo.create(document)
    const recovered = (await repo.get(document.id))!.document
    expect(recovered.content.courseIconAssetId).toBe(document.content.courseIconAssetId)
    expect(JSON.stringify(recovered)).toContain('multiple-correct')
    expect(JSON.stringify(recovered)).toContain('expectedOutput')
  })

  it('rejects unsafe or structurally arbitrary draft JSON', async () => {
    const repo = repository()
    const document = createCourseDocument(ids())
    const unsafe = structuredClone(document) as typeof document & { arbitrary?: string }
    unsafe.arbitrary = '<script>alert(1)</script>'
    await expect(repo.create(unsafe)).rejects.toEqual(expect.objectContaining<Partial<DraftRepositoryError>>({ code: 'invalid-draft' }))
  })

  it('round-trips serialized documents without identity changes', async () => {
    const repo = repository()
    const document = JSON.parse(JSON.stringify(createCourseDocument(ids())))
    await repo.create(document)
    expect(JSON.parse(JSON.stringify((await repo.get(document.id))?.document))).toEqual(document)
  })
})

describe('dirty state and navigation safety', () => {
  it('tracks clean, edited, and undo-to-saved transitions by snapshot', () => {
    const saved = createCourseDocument(ids())
    const fingerprint = documentFingerprint(saved)
    expect(hasUnsavedChanges(saved, fingerprint)).toBe(false)
    let state = createCourseEditorState(saved)
    state = courseEditorReducer(state, { type: 'commit', document: updateCourse(state.document, { title: 'Edited' }) })
    expect(hasUnsavedChanges(state.document, fingerprint)).toBe(true)
    state = courseEditorReducer(state, { type: 'undo' })
    expect(hasUnsavedChanges(state.document, fingerprint)).toBe(false)
  })

  it('keeps newer edits dirty when a captured in-flight snapshot is saved', async () => {
    const original = createCourseDocument(ids())
    const captured = structuredClone(original)
    const save = new Promise<string>((resolve) => setTimeout(() => resolve(documentFingerprint(captured)), 5))
    const editedDuringSave = updateCourse(original, { title: 'Edited while saving' })
    const savedFingerprint = await save
    expect(hasUnsavedChanges(editedDuringSave, savedFingerprint)).toBe(true)
  })

  it('warns only when the current document differs from the saved snapshot', () => {
    const document = createCourseDocument(ids())
    const fingerprint = documentFingerprint(document)
    expect(shouldWarnBeforeNavigation(document, fingerprint)).toBe(false)
    expect(shouldWarnBeforeNavigation(updateCourse(document, { title: 'Changed' }), fingerprint)).toBe(true)
    expect(shouldWarnBeforeNavigation(document, null)).toBe(true)
  })
})
