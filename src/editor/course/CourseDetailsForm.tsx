import type { CourseDocument } from '../../content/core/envelope'
import type { ValidationIssue } from '../../content/validation/validateContent'
import { templateRegistry } from '../../content/templates/template.registry'
import { updateCourse } from '../core/courseEditor.commands'
import { AssetPicker, AuthenticatedAssetImage } from '../../assets/AssetPicker'

type Props = { document: CourseDocument; issues: ValidationIssue[]; commit: (document: CourseDocument) => void }

export function CourseDetailsForm({ document, issues, commit }: Props) {
  const error = (path: string) => issues.find((issue) => issue.path.join('.') === path)?.message
  const fields = templateRegistry.course.fixedFields
  return <div className="course-details"><div className="canvas-heading"><div><p className="eyebrow">Fixed course template</p><h2>Course details</h2><p>These required fields stay outside the flexible lesson canvas.</p></div></div>
    <div className="form-grid">
      <label className="field field--wide"><span>{fields[0].label} <b>*</b></span><input key={document.title} defaultValue={document.title} onBlur={(event) => commit(updateCourse(document, { title: event.target.value }))} />{error('title') && <small className="field-error">{error('title')}</small>}</label>
      <label className="field"><span>{fields[2].label} <b>*</b></span><input key={document.slug} defaultValue={document.slug} onBlur={(event) => commit(updateCourse(document, { slug: event.target.value }))} />{error('slug') && <small className="field-error">{error('slug')}</small>}</label>
      <label className="field"><span>{fields[3].label} <b>*</b></span><input key={document.content.language} defaultValue={document.content.language} onBlur={(event) => commit(updateCourse(document, { content: { language: event.target.value } }))} />{error('content.language') && <small className="field-error">{error('content.language')}</small>}</label>
      <label className="field field--wide"><span>{fields[1].label} <b>*</b></span><textarea rows={4} key={document.content.description} defaultValue={document.content.description} onBlur={(event) => commit(updateCourse(document, { content: { description: event.target.value } }))} />{error('content.description') && <small className="field-error">{error('content.description')}</small>}</label>
      <label className="field"><span>{fields[4].label} <b>*</b></span><select value={document.content.difficulty} onChange={(event) => commit(updateCourse(document, { content: { difficulty: event.target.value as CourseDocument['content']['difficulty'] } }))}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></label>
      <label className="field"><span>{fields[5].label} <b>*</b></span><input type="number" min="1" key={document.content.estimatedMinutes} defaultValue={document.content.estimatedMinutes} onBlur={(event) => commit(updateCourse(document, { content: { estimatedMinutes: Number(event.target.value) } }))} /></label>
      <label className="field field--wide"><span>{fields[6].label} <b>*</b></span><textarea rows={4} key={document.content.learningOutcomes.join('\n')} defaultValue={document.content.learningOutcomes.join('\n')} onBlur={(event) => commit(updateCourse(document, { content: { learningOutcomes: event.target.value.split('\n').map((value) => value.trim()).filter(Boolean) } }))} /><small className="field-help">One outcome per line.</small></label>
      <label className="field field--wide"><span>Summary</span><textarea rows={2} key={document.metadata.summary} defaultValue={document.metadata.summary} onBlur={(event) => commit(updateCourse(document, { metadata: { ...document.metadata, summary: event.target.value } }))} /></label>
      <label className="field"><span>Prerequisites</span><textarea rows={3} key={document.content.courseMetadata.prerequisites.join('\n')} defaultValue={document.content.courseMetadata.prerequisites.join('\n')} onBlur={(event) => commit(updateCourse(document, { content: { courseMetadata: { ...document.content.courseMetadata, prerequisites: event.target.value.split('\n').filter(Boolean) } } }))} /></label>
      <label className="field"><span>Topics</span><textarea rows={3} key={document.content.courseMetadata.topics.join('\n')} defaultValue={document.content.courseMetadata.topics.join('\n')} onBlur={(event) => commit(updateCourse(document, { content: { courseMetadata: { ...document.content.courseMetadata, topics: event.target.value.split('\n').filter(Boolean) } } }))} /></label>
      <section className="field field--wide course-icon-field"><h3>Course icon</h3><p className="field-help">Shown on YCoders course cards and course pages. Use a square image (PNG, JPEG, or WebP, up to 2 MiB).</p>{document.content.courseIconAssetId ? <div className="course-icon-preview"><AuthenticatedAssetImage assetId={document.content.courseIconAssetId} alt={`${document.title} icon preview`} /><button type="button" onClick={() => commit(updateCourse(document, { content: { courseIconAssetId: undefined } }))}>Remove icon</button></div> : <p>No icon selected yet. Required for production-ready Course publication.</p>}<AssetPicker selected={document.content.courseIconAssetId} onSelect={(courseIconAssetId) => commit(updateCourse(document, { content: { courseIconAssetId } }))}/></section>
    </div>
  </div>
}
