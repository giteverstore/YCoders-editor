import { BookOpen, ChevronRight, FileText, FolderTree, Plus, Trash2 } from 'lucide-react'

import type { CourseDocument } from '../../content/core/envelope'
import { addLesson, addModule, addSection, convertModuleToSections, removeLesson, removeModule, removeSection, renameModule, renameSection, updateLesson } from '../core/courseEditor.commands'
import type { CourseEditorSelection } from '../core/courseEditor.reducer'

type Props = { document: CourseDocument; selection: CourseEditorSelection; commit: (document: CourseDocument) => void; select: (selection: CourseEditorSelection) => void }

export function StructureNavigator({ document, selection, commit, select }: Props) {
  const selected = (kind: string, id?: string) => selection.kind === kind && (!id || ('id' in selection && selection.id === id))
  return <div className="structure-nav"><div className="panel-title"><span>Structure</span><button type="button" onClick={() => commit(addModule(document))} aria-label="Add module"><Plus size={16} /></button></div>
    <button type="button" className={`tree-row tree-row--course ${selected('course') ? 'active' : ''}`} onClick={() => select({ kind: 'course' })}><BookOpen size={16} /><span>{document.title}</span></button>
    {document.content.modules.map((module) => <div className="tree-module" key={module.id}>
      <div className={`tree-row ${selected('module', module.id) ? 'active' : ''}`}><FolderTree size={15} /><input key={module.title} aria-label="Module title" defaultValue={module.title} onFocus={() => select({ kind: 'module', id: module.id })} onBlur={(event) => { if (event.target.value !== module.title) commit(renameModule(document, module.id, event.target.value)) }} /><button type="button" onClick={() => { if (window.confirm(`Delete ${module.title} and all its content?`)) commit(removeModule(document, module.id)) }} aria-label="Delete module"><Trash2 size={13} /></button></div>
      <div className="tree-children">
        {module.organization === 'lessons' ? <>
          {module.lessons.map((lesson) => <div className={`tree-row ${selected('lesson', lesson.id) ? 'active' : ''}`} key={lesson.id}><FileText size={14} /><button className="tree-label" type="button" onClick={() => select({ kind: 'lesson', id: lesson.id })}>{lesson.title}</button><button type="button" onClick={() => { if (window.confirm(`Delete ${lesson.title}?`)) commit(removeLesson(document, lesson.id)) }} aria-label="Delete lesson"><Trash2 size={12} /></button></div>)}
          <button className="tree-add" type="button" onClick={() => commit(addLesson(document, module.id))}><Plus size={12} /> Add lesson</button>
          <button className="tree-add" type="button" onClick={() => { if (window.confirm('Convert this module to sections? Existing lessons will be preserved in Section 1.')) commit(convertModuleToSections(document, module.id)) }}><ChevronRight size={12} /> Organize into sections</button>
        </> : <>
          {module.sections.map((section) => <div className="tree-section" key={section.id}><div className={`tree-row ${selected('section', section.id) ? 'active' : ''}`}><ChevronRight size={13} /><input key={section.title} aria-label="Section title" defaultValue={section.title} onFocus={() => select({ kind: 'section', id: section.id })} onBlur={(event) => { if (event.target.value !== section.title) commit(renameSection(document, section.id, event.target.value)) }} /><button type="button" onClick={() => { if (window.confirm(`Delete ${section.title} and its lessons?`)) commit(removeSection(document, section.id)) }} aria-label="Delete section"><Trash2 size={12} /></button></div><div className="tree-children">{section.lessons.map((lesson) => <div className={`tree-row ${selected('lesson', lesson.id) ? 'active' : ''}`} key={lesson.id}><FileText size={13} /><button className="tree-label" type="button" onClick={() => select({ kind: 'lesson', id: lesson.id })}>{lesson.title}</button><button type="button" onClick={() => { if (window.confirm(`Delete ${lesson.title}?`)) commit(removeLesson(document, lesson.id)) }} aria-label="Delete lesson"><Trash2 size={12} /></button></div>)}<button className="tree-add" type="button" onClick={() => commit(addLesson(document, section.id))}><Plus size={12} /> Add lesson</button></div></div>)}
          <button className="tree-add" type="button" onClick={() => commit(addSection(document, module.id))}><Plus size={12} /> Add section</button>
        </>}
      </div>
    </div>)}
  </div>
}

export function StructureInspector({ document, selection, commit }: Pick<Props, 'document' | 'selection' | 'commit'>) {
  if (selection.kind === 'course') return <div className="inspector-copy"><h3>Course metadata</h3><p>Edit fixed fields in the center panel. Template fields cannot be moved into lessons.</p><dl><dt>Document version</dt><dd>{document.documentVersion}</dd><dt>Schema</dt><dd>{document.schemaVersion}</dd></dl></div>
  if (selection.kind === 'lesson') {
    const lessons = document.content.modules.flatMap((module) => module.organization === 'lessons' ? module.lessons : module.sections.flatMap((section) => section.lessons)); const lesson = lessons.find((item) => item.id === selection.id)
    if (!lesson) return null
    return <div className="inspector-copy"><h3>Lesson properties</h3><label className="field"><span>Title</span><input key={lesson.title} defaultValue={lesson.title} onBlur={(event) => { if (event.target.value !== lesson.title) commit(updateLesson(document, lesson.id, { title: event.target.value })) }} /></label><label className="field"><span>Estimated minutes</span><input type="number" min="1" key={lesson.estimatedMinutes} defaultValue={lesson.estimatedMinutes} onBlur={(event) => { const value = Number(event.target.value); if (value !== lesson.estimatedMinutes) commit(updateLesson(document, lesson.id, { estimatedMinutes: value })) }} /></label><dl><dt>Stable ID</dt><dd><code>{lesson.id}</code></dd><dt>Blocks</dt><dd>{lesson.blocks.length}</dd></dl></div>
  }
  if (selection.kind === 'block') return <div className="inspector-copy"><h3>Selected block</h3><p>Edit the block directly in the lesson canvas. Reorder it with drag-and-drop or keyboard-accessible arrow controls.</p><dl><dt>Stable ID</dt><dd><code>{selection.id}</code></dd></dl></div>
  return <div className="inspector-copy"><h3>{selection.kind === 'module' ? 'Module' : 'Section'}</h3><p>Rename this structural item in the navigator. Its identity remains stable when reordered or renamed.</p><dl><dt>Stable ID</dt><dd><code>{selection.id}</code></dd></dl></div>
}
