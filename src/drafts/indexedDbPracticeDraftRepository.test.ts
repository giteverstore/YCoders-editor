import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { createPracticeDocument, updatePractice } from '../editor/core/practiceEditor.commands'
import { DraftConflictError } from './draft.types'
import { IndexedDbPracticeDraftRepository } from './indexedDbPracticeDraftRepository'

const names: string[] = []; const repository = () => { const databaseName = `practice-test-${crypto.randomUUID()}`; names.push(databaseName); return new IndexedDbPracticeDraftRepository({ databaseName, now: () => '2026-11-16T10:00:00.000Z' }) }
afterEach(async () => { await Promise.all(names.splice(0).map((name) => new Promise<void>((resolve) => { const request = indexedDB.deleteDatabase(name); request.onsuccess = () => resolve(); request.onerror = () => resolve(); request.onblocked = () => resolve() }))) })
describe('IndexedDB Practice repository', () => {
  it('creates, lists, loads, saves, and deletes without affecting Course storage', async () => { const repo = repository(); const document = createPracticeDocument(); const created = await repo.create(document); expect(created.revision).toBe(1); expect(await repo.list()).toHaveLength(1); const saved = await repo.save(document.id, updatePractice(document, (d) => { d.title = 'Saved' }), 1); expect(saved.revision).toBe(2); await repo.delete(document.id, 2); expect(await repo.get(document.id)).toBeNull() })
  it('rejects stale revisions', async () => { const repo = repository(); const document = createPracticeDocument(); await repo.create(document); await repo.save(document.id, document, 1); await expect(repo.save(document.id, document, 1)).rejects.toBeInstanceOf(DraftConflictError) })
  it('rejects duplicate IDs', async () => { const repo = repository(); const document = createPracticeDocument(); await repo.create(document); await expect(repo.create(document)).rejects.toMatchObject({ code: 'duplicate' }) })
  it('round-trips execution contracts and executable tests without shadow state', async () => { const repo = repository(); const document = createPracticeDocument(); await repo.create(document); const loaded = await repo.get(document.id); expect(loaded?.document.content.execution).toEqual(document.content.execution); expect(loaded?.document.content.executablePublicTests).toEqual(document.content.executablePublicTests) })
})
