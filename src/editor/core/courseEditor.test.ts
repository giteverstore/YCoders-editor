import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import StarterKit from '@tiptap/starter-kit'
import { getSchema } from '@tiptap/core'
import { describe, expect, it } from 'vitest'

import { richTextDocumentSchema } from '../../content/blocks/richText.schema'
import { validateContent } from '../../content/validation/validateContent'
import { addBlock, addLesson, addModule, addSection, convertModuleToSections, createCourseDocument, duplicateBlock, findLesson, removeBlock, removeLesson, removeModule, removeSection, renameModule, renameSection, reorderBlock, updateCourse, updateLesson } from './courseEditor.commands'
import { courseEditorReducer, createCourseEditorState, HISTORY_LIMIT } from './courseEditor.reducer'

const ids = () => { let index = 0; return () => `a0000000-0000-4000-8000-${String(++index).padStart(12, '0')}` }

describe('course editor commands', () => {
  it('creates a schema-valid course with stable UUID identities', () => {
    const document = createCourseDocument(ids(), '2026-11-16T10:00:00.000Z')
    expect(validateContent(document).success).toBe(true)
    const module = document.content.modules[0]
    if (module.organization !== 'lessons') throw new Error('Expected direct lessons')
    expect(module.id).not.toBe(module.lessons[0].id)
  })

  it('updates fixed fields immutably', () => {
    const original = createCourseDocument(ids())
    const next = updateCourse(original, { title: 'Changed' })
    expect(next).not.toBe(original)
    expect(original.title).toBe('Untitled course')
    expect(next.title).toBe('Changed')
  })

  it('supports module CRUD without mutating the source', () => {
    const original = createCourseDocument(ids())
    const added = addModule(original, ids())
    const moduleId = added.content.modules[1].id
    const renamed = renameModule(added, moduleId, 'Advanced topics')
    const removed = removeModule(renamed, moduleId)
    expect(original.content.modules).toHaveLength(1)
    expect(renamed.content.modules[1].title).toBe('Advanced topics')
    expect(removed.content.modules).toHaveLength(1)
  })

  it('explicitly converts direct lessons into a section without losing content', () => {
    const original = createCourseDocument(ids())
    const module = original.content.modules[0]
    const lessonId = module.organization === 'lessons' ? module.lessons[0].id : ''
    const converted = convertModuleToSections(original, module.id, ids())
    const convertedModule = converted.content.modules[0]
    expect(convertedModule.organization).toBe('sections')
    if (convertedModule.organization === 'sections') expect(convertedModule.sections[0].lessons[0].id).toBe(lessonId)
    expect(original.content.modules[0].organization).toBe('lessons')
  })

  it('does not mix sections into a direct-lesson module', () => {
    const original = createCourseDocument(ids())
    const next = addSection(original, original.content.modules[0].id, ids())
    expect(next.content.modules[0].organization).toBe('lessons')
  })

  it('supports section CRUD after conversion', () => {
    const factory = ids()
    const original = createCourseDocument(factory)
    const moduleId = original.content.modules[0].id
    const converted = convertModuleToSections(original, moduleId, factory)
    const added = addSection(converted, moduleId, factory)
    const module = added.content.modules[0]
    expect(module.organization).toBe('sections')
    if (module.organization !== 'sections') return
    const sectionId = module.sections[1].id
    const renamed = renameSection(added, sectionId, 'Projects')
    const removed = removeSection(renamed, sectionId)
    const renamedModule = renamed.content.modules[0]
    const removedModule = removed.content.modules[0]
    if (renamedModule.organization === 'sections') expect(renamedModule.sections[1].title).toBe('Projects')
    if (removedModule.organization === 'sections') expect(removedModule.sections).toHaveLength(1)
  })

  it('supports lesson CRUD while preserving stable identifiers', () => {
    const original = createCourseDocument(ids())
    const moduleId = original.content.modules[0].id
    const added = addLesson(original, moduleId, ids())
    const module = added.content.modules[0]
    if (module.organization !== 'lessons') return
    const id = module.lessons[1].id
    const renamed = updateLesson(added, id, { title: 'Arrays' })
    expect(findLesson(renamed, id)?.title).toBe('Arrays')
    expect(findLesson(removeLesson(renamed, id), id)).toBeUndefined()
  })

  it('inserts, duplicates, reorders, and removes blocks with stable IDs', () => {
    const factory = ids()
    const original = createCourseDocument(factory)
    const module = original.content.modules[0]
    if (module.organization !== 'lessons') return
    const lessonId = module.lessons[0].id
    const withFirst = addBlock(original, lessonId, 'richText', factory)
    const withSecond = addBlock(withFirst, lessonId, 'divider', factory)
    const blocks = findLesson(withSecond, lessonId)?.blocks ?? []
    const duplicated = duplicateBlock(withSecond, lessonId, blocks[0].id, factory)
    const duplicateBlocks = findLesson(duplicated, lessonId)?.blocks ?? []
    expect(duplicateBlocks[1].id).not.toBe(duplicateBlocks[0].id)
    expect(duplicateBlocks[1].data).toEqual(duplicateBlocks[0].data)
    const reordered = reorderBlock(duplicated, lessonId, duplicateBlocks[2].id, 0)
    expect(findLesson(reordered, lessonId)?.blocks[0].type).toBe('divider')
    const removed = removeBlock(reordered, lessonId, duplicateBlocks[0].id)
    expect(findLesson(removed, lessonId)?.blocks).toHaveLength(2)
    expect(findLesson(original, lessonId)?.blocks).toHaveLength(0)
  })
})

describe('course editor history', () => {
  it('supports consecutive undo and redo', () => {
    const document = createCourseDocument(ids())
    let state = createCourseEditorState(document)
    state = courseEditorReducer(state, { type: 'commit', document: updateCourse(state.document, { title: 'One' }) })
    state = courseEditorReducer(state, { type: 'commit', document: updateCourse(state.document, { title: 'Two' }) })
    state = courseEditorReducer(state, { type: 'undo' })
    expect(state.document.title).toBe('One')
    state = courseEditorReducer(state, { type: 'undo' })
    expect(state.document.title).toBe('Untitled course')
    state = courseEditorReducer(state, { type: 'redo' })
    state = courseEditorReducer(state, { type: 'redo' })
    expect(state.document.title).toBe('Two')
  })

  it('undoes and redoes quiz mode/options, public exercise cases, and Course icon together', () => {
    let state = createCourseEditorState(createCourseDocument(ids()))
    const changed = structuredClone(state.document)
    changed.content.courseIconAssetId = 'b0000000-0000-4000-8000-000000000011'
    const module = changed.content.modules[0]
    if (module.organization !== 'lessons') throw new Error('fixture')
    module.lessons[0].blocks.push(
      { id: 'b0000000-0000-4000-8000-000000000012', schemaVersion: 1, type: 'quiz', data: { question: 'Choose', mode: 'multiple-correct', options: [{ id: 'b0000000-0000-4000-8000-000000000013', text: 'A', isCorrect: true }, { id: 'b0000000-0000-4000-8000-000000000014', text: 'B', isCorrect: true }, { id: 'b0000000-0000-4000-8000-000000000015', text: 'C', isCorrect: false }] } } as never,
      { id: 'b0000000-0000-4000-8000-000000000016', schemaVersion: 1, type: 'exercise', data: { prompt: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Solve' }] }] }, language: 'javascript', starterCode: '', publicTests: [{ id: 'b0000000-0000-4000-8000-000000000017', input: 'x', expectedOutput: 'y' }] } } as never,
    )
    state = courseEditorReducer(state, { type: 'commit', document: changed })
    state = courseEditorReducer(state, { type: 'undo' })
    expect(state.document.content.courseIconAssetId).toBeUndefined()
    state = courseEditorReducer(state, { type: 'redo' })
    expect(JSON.stringify(state.document)).toContain('multiple-correct')
    expect(JSON.stringify(state.document)).toContain('expectedOutput')
    expect(state.document.content.courseIconAssetId).toBe('b0000000-0000-4000-8000-000000000011')
  })

  it('does not record selection and invalidates redo after a new edit', () => {
    const document = createCourseDocument(ids())
    let state = createCourseEditorState(document)
    state = courseEditorReducer(state, { type: 'select', selection: { kind: 'lesson', id: 'x' } })
    expect(state.past).toHaveLength(0)
    state = courseEditorReducer(state, { type: 'commit', document: updateCourse(state.document, { title: 'One' }) })
    state = courseEditorReducer(state, { type: 'undo' })
    state = courseEditorReducer(state, { type: 'commit', document: updateCourse(state.document, { title: 'New path' }) })
    expect(state.future).toHaveLength(0)
  })

  it('enforces the explicit history limit and exposes validation issues', () => {
    let state = createCourseEditorState(createCourseDocument(ids()))
    for (let index = 0; index < HISTORY_LIMIT + 5; index += 1) state = courseEditorReducer(state, { type: 'commit', document: updateCourse(state.document, { title: `Title ${index}` }) })
    expect(state.past).toHaveLength(HISTORY_LIMIT)
    state = courseEditorReducer(state, { type: 'commit', document: updateCourse(state.document, { slug: 'INVALID SLUG' }) })
    expect(state.validationIssues.some((issue) => issue.path.join('.') === 'slug')).toBe(true)
  })
})

describe('Tiptap JSON compatibility', () => {
  const schema = getSchema([StarterKit.configure({ codeBlock: false, horizontalRule: false, strike: false, link: false, underline: false }), Underline, Link.configure({ protocols: ['http', 'https', 'mailto'] })])

  it('round-trips Tiptap nodes through ProseMirror JSON and E2 validation', () => {
    const input = { type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Overview' }] }, { type: 'orderedList', attrs: { start: 1, type: null }, content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Read docs', marks: [{ type: 'link', attrs: { href: 'https://example.com', target: '_blank', rel: 'noopener noreferrer', class: null } }] }] }] }] }] }
    const serialized = schema.nodeFromJSON(input).toJSON()
    const result = richTextDocumentSchema.safeParse(serialized)
    expect(result.success, result.success ? '' : JSON.stringify(result.error.issues)).toBe(true)
  })

  it('rejects unsafe links and invalid nesting after serialization', () => {
    const unsafe = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'bad', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)', target: null, rel: null, class: null } }] }] }] }
    expect(richTextDocumentSchema.safeParse(schema.nodeFromJSON(unsafe).toJSON()).success).toBe(false)
    expect(richTextDocumentSchema.safeParse({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'listItem', content: [] }] }] }).success).toBe(false)
  })
})
