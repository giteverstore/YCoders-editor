import { describe, expect, it } from 'vitest'
import { createProjectDocument, changeProject } from '../../editor/core/projectEditor'
import { createWorkingProjectExport } from './projectConflictExport'
import { parseProjectDraftImport } from '../../drafts/projectDraftTransfer'

describe('Project conflict recovery export', () => {
  it('exports the current unsaved working state with the expected revision', () => { const working=changeProject(createProjectDocument(),d=>{d.title='Unsaved';d.content.starterWorkspace.files[0].content='changed';d.content.validation.validators=[{kind:'tests-pass',suiteId:'recovery'}]});const backup=parseProjectDraftImport(createWorkingProjectExport(working,4,'2026-11-16T12:00:00.000Z'));expect(backup.draft.revision).toBe(4);expect(backup.draft.document.title).toBe('Unsaved');expect(backup.draft.document.content.starterWorkspace.files[0].content).toBe('changed');expect(backup.draft.document.content.validation.validators).toEqual([{kind:'tests-pass',suiteId:'recovery'}]) })
  it('does not mutate the working document',()=>{const working=createProjectDocument(),before=structuredClone(working);createWorkingProjectExport(working,2);expect(working).toEqual(before)})
  it('rejects invalid working content without changing it',()=>{const working=createProjectDocument();working.content.starterWorkspace.files[0].path='../unsafe';expect(()=>createWorkingProjectExport(working,1)).toThrow();expect(working.content.starterWorkspace.files[0].path).toBe('../unsafe')})
})
