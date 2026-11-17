import type { ContentBlock } from '../../content/blocks/block.schemas'
import type { ContentDocument } from '../../content/core/envelope'
import type { ValidationIssue } from '../../content/validation/validateContent'

export type StructuralSelection = {
  kind: 'module' | 'section' | 'lesson' | 'example' | 'testCase' | 'checkpoint' | 'task'
  id: string
}

export type EditorSelection =
  | { kind: 'none' }
  | { kind: 'structure'; entity: StructuralSelection }
  | { kind: 'block'; blockId: ContentBlock['id']; regionKey: string }

export type EditorOperation = {
  name: 'idle' | 'validating' | 'previewing'
  status: 'idle' | 'running' | 'succeeded' | 'failed'
  message?: string
}

export type EditorState = {
  document: ContentDocument
  selection: EditorSelection
  isDirty: boolean
  validationIssues: ValidationIssue[]
  operation: EditorOperation
}
