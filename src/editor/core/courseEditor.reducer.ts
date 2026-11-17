import type { CourseDocument } from '../../content/core/envelope'
import { validateContent, type ValidationIssue } from '../../content/validation/validateContent'

export type CourseEditorSelection = { kind: 'course' } | { kind: 'module' | 'section' | 'lesson'; id: string } | { kind: 'block'; id: string; lessonId: string }
export type EditorMode = 'edit' | 'preview'

export type CourseEditorState = {
  document: CourseDocument
  past: CourseDocument[]
  future: CourseDocument[]
  selection: CourseEditorSelection
  mode: EditorMode
  isDirty: boolean
  validationIssues: ValidationIssue[]
}

export type CourseEditorAction =
  | { type: 'commit'; document: CourseDocument }
  | { type: 'hydrate'; document: CourseDocument }
  | { type: 'select'; selection: CourseEditorSelection }
  | { type: 'mode'; mode: EditorMode }
  | { type: 'undo' }
  | { type: 'redo' }

export const HISTORY_LIMIT = 50
const issuesFor = (document: CourseDocument) => { const result = validateContent(document); return result.success ? [] : result.issues }

export function createCourseEditorState(document: CourseDocument): CourseEditorState {
  return { document, past: [], future: [], selection: { kind: 'course' }, mode: 'edit', isDirty: false, validationIssues: issuesFor(document) }
}

export function courseEditorReducer(state: CourseEditorState, action: CourseEditorAction): CourseEditorState {
  if (action.type === 'hydrate') return createCourseEditorState(action.document)
  if (action.type === 'select') return { ...state, selection: action.selection }
  if (action.type === 'mode') return { ...state, mode: action.mode }
  if (action.type === 'commit') return { ...state, document: action.document, past: [...state.past, state.document].slice(-HISTORY_LIMIT), future: [], isDirty: true, validationIssues: issuesFor(action.document) }
  if (action.type === 'undo') {
    const previous = state.past.at(-1)
    if (!previous) return state
    return { ...state, document: previous, past: state.past.slice(0, -1), future: [state.document, ...state.future].slice(0, HISTORY_LIMIT), isDirty: true, validationIssues: issuesFor(previous) }
  }
  const next = state.future[0]
  if (!next) return state
  return { ...state, document: next, past: [...state.past, state.document].slice(-HISTORY_LIMIT), future: state.future.slice(1), isDirty: true, validationIssues: issuesFor(next) }
}
