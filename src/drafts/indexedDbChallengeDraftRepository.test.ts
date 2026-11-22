import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { validChallengeDocument } from '../content/fixtures/validDocuments'
import { createChallengeDocument, changeChallenge } from '../editor/core/challengeEditor'
import { DraftConflictError } from './draft.types'
import { IndexedDbChallengeDraftRepository } from './indexedDbChallengeDraftRepository'

const names: string[] = []
const repository = () => { const databaseName = `challenge-policy-test-${crypto.randomUUID()}`; names.push(databaseName); return new IndexedDbChallengeDraftRepository({ databaseName, now: () => '2026-11-22T10:00:00.000Z' }) }
afterEach(async () => { await Promise.all(names.splice(0).map((name) => new Promise<void>((resolve) => { const request = indexedDB.deleteDatabase(name); request.onsuccess = () => resolve(); request.onerror = () => resolve(); request.onblocked = () => resolve() }))) })

describe('IndexedDB Challenge draft repository', () => {
  it('round-trips new Challenge Policy drafts through the existing store', async () => { const repo = repository(), document = createChallengeDocument(); await repo.create(document); const loaded = await repo.get(document.id); expect(loaded?.document).toEqual(document); const saved = await repo.save(document.id, changeChallenge(document, (value) => { value.title = 'Saved Policy' }), 1); expect(saved).toMatchObject({ revision: 2, document: { title: 'Saved Policy' } }) })
  it('preserves legacy Challenge content without conversion', async () => { const repo = repository(); await repo.create(structuredClone(validChallengeDocument)); const loaded = await repo.get(validChallengeDocument.id); expect(loaded?.document.content).toEqual(validChallengeDocument.content); expect(loaded?.document.content).not.toHaveProperty('kind') })
  it('retains revision conflict protection', async () => { const repo = repository(), document = createChallengeDocument(); await repo.create(document); await repo.save(document.id, document, 1); await expect(repo.save(document.id, document, 1)).rejects.toBeInstanceOf(DraftConflictError) })
})
