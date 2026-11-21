import { describe, expect, it, vi } from 'vitest'

import { createPracticeDocument } from '../editor/core/practiceEditor.commands'
import type { CloudDraftRecord } from '../server/cloudDraft.types'
import { CloudPracticeDraftRepository } from './cloudPracticeDraftRepository'
import type { V2DraftApiClient } from './draftApiClient'

describe('CloudPracticeDraftRepository execution persistence', () => {
  it('sends and restores execution fields as part of the versioned document', async () => {
    const document = createPracticeDocument(), create = vi.fn().mockImplementation(async (value) => ({ id: value.id, contentType: 'practice', schemaVersion: value.schemaVersion, revision: 1, document: structuredClone(value), createdAt: value.createdAt, updatedAt: value.updatedAt, createdBy: value.createdBy, updatedBy: value.updatedBy } satisfies CloudDraftRecord))
    const api = { create } as unknown as V2DraftApiClient, repository = new CloudPracticeDraftRepository(api)
    const saved = await repository.create(document)
    expect(create).toHaveBeenCalledWith(document)
    expect(saved.document.content.execution).toEqual(document.content.execution)
    expect(saved.document.content.executablePublicTests).toEqual(document.content.executablePublicTests)
  })
})
