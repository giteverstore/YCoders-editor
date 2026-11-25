import { useState, type ReactNode } from 'react'
import { Braces, ChevronRight, Copy, Dumbbell, Lightbulb, Play } from 'lucide-react'
import { AuthenticatedAssetImage, ContentImage } from '../../assets/AssetPicker'
import { calloutVariant, courseLanguage } from '../../content/blocks/coursePresentation'
import type { ContentBlock } from '../../content/blocks/block.schemas'
import type { CourseDocument } from '../../content/core/envelope'
import { imageDisplayWidth, imagePresentation } from '../../content/blocks/imagePresentation'

function RichNodes({ node }: { node: Record<string, unknown> }) {
  const type = node.type as string
  const children = (node.content as Record<string, unknown>[] | undefined)?.map((child, index) => <RichNodes key={index} node={child} />)
  if (type === 'text') { let content: ReactNode = String(node.text ?? ''); for (const mark of (node.marks as Array<{ type: string; attrs?: { href?: string } }> | undefined) ?? []) { if (mark.type === 'bold') content = <strong>{content}</strong>; if (mark.type === 'italic') content = <em>{content}</em>; if (mark.type === 'underline') content = <u>{content}</u>; if (mark.type === 'code') content = <code>{content}</code>; if (mark.type === 'link') content = <a href={mark.attrs?.href} rel="noreferrer">{content}</a> }; return content }
  if (type === 'paragraph') return <p>{children}</p>; if (type === 'heading') { const level = (node.attrs as { level: number }).level; return level === 2 ? <h2>{children}</h2> : level === 3 ? <h3>{children}</h3> : <h4>{children}</h4> }; if (type === 'bulletList') return <ul>{children}</ul>; if (type === 'orderedList') return <ol>{children}</ol>; if (type === 'listItem') return <li>{children}</li>; if (type === 'blockquote') return <blockquote>{children}</blockquote>; if (type === 'hardBreak') return <br />; return <>{children}</>
}

function richTextValue(node: Record<string, unknown>): string {
  if (node.type === 'text') return String(node.text ?? '')
  return ((node.content as Record<string, unknown>[] | undefined) ?? []).map(richTextValue).join(node.type === 'paragraph' ? '\n' : '')
}

export async function copyPreviewText(value: string): Promise<boolean> {
  try { if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value); else { const area = document.createElement('textarea'); area.value = value; area.style.position = 'fixed'; area.style.opacity = '0'; document.body.append(area); area.select(); const copied = document.execCommand('copy'); area.remove(); if (!copied) throw new Error('Copy unavailable') }; return true } catch { return false }
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  return <button className="learner-action" type="button" aria-label={label} onClick={() => void copyPreviewText(value).then((ok) => { setStatus(ok ? 'copied' : 'failed'); window.setTimeout(() => setStatus('idle'), 1600) })}><Copy size={14} aria-hidden="true" />{status === 'copied' ? 'Copied' : status === 'failed' ? 'Copy failed' : 'Copy'}</button>
}

function CodeCard({ code, language, filename, runnable = true, copyLabel = 'Copy code' }: { code: string; language: string; filename?: string; runnable?: boolean; copyLabel?: string }) {
  const definition = courseLanguage(language)
  return <section className="learner-code content-section"><header><span><Braces size={16} aria-hidden="true" />{filename || 'Code example'}</span><div className="learner-code-actions"><span>{definition?.label ?? language}</span><CopyButton value={code} label={copyLabel} />{runnable && definition?.compilerLanguage ? <button className="learner-action" type="button" disabled title="Execution is disabled in Preview"><Play size={14} aria-hidden="true" />Run Code</button> : null}</div></header><pre aria-label={`${definition?.label ?? language} code`}><code>{code}</code></pre></section>
}

function QuizPreview({ block }: { block: Extract<ContentBlock, { type: 'quiz' }> }) {
  const multiple = block.data.mode === 'multiple-correct', [selected, setSelected] = useState<string[]>([]), [submitted, setSubmitted] = useState(false)
  const correct = block.data.options.filter((option) => option.isCorrect).map((option) => option.id), passed = selected.length === correct.length && selected.every((id) => correct.includes(id))
  const choose = (id: string) => { setSubmitted(false); setSelected((current) => multiple ? current.includes(id) ? current.filter((value) => value !== id) : [...current, id] : [id]) }
  return <section className="learner-quiz content-section"><span className="learner-interactive-icon"><Lightbulb size={20} aria-hidden="true" /></span><div><span className="learner-kicker">Knowledge check</span><h3>{block.data.question}</h3><div className="learner-quiz-options">{block.data.options.map((option) => <label className={`${submitted && option.isCorrect ? 'is-correct' : ''} ${submitted && selected.includes(option.id) && !option.isCorrect ? 'is-incorrect' : ''}`} key={option.id}><input type={multiple ? 'checkbox' : 'radio'} name={`quiz-${block.id}`} checked={selected.includes(option.id)} onChange={() => choose(option.id)} /><span>{option.text}</span></label>)}</div>{submitted ? <p className={`learner-feedback ${passed ? 'is-correct' : 'is-incorrect'}`} role="status">{passed ? 'Correct.' : 'Not quite. Review the lesson and try again.'}</p> : null}{submitted && block.data.explanation ? <p className="learner-explanation">{block.data.explanation}</p> : null}<button type="button" className="learner-primary" onClick={() => setSubmitted(true)}>{selected.length ? 'Check Answer' : 'Choose an answer'}</button></div></section>
}

function PreviewBlock({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case 'richText': return <section className="learner-reading content-section"><RichNodes node={block.data.document as unknown as Record<string, unknown>} /></section>
    case 'image': { const presentation = imagePresentation(block.data); return <figure className={`learner-image learner-image--${presentation.alignment} content-section`} style={{ maxWidth: imageDisplayWidth(block.data) }}><ContentImage data={block.data} />{block.data.caption ? <figcaption>{block.data.caption}</figcaption> : null}</figure> }
    case 'code': return <CodeCard {...block.data} />
    case 'callout': { const variant = calloutVariant(block.data.tone); return <aside className={`learner-callout learner-callout--${block.data.tone} content-section`}><span aria-hidden="true">{variant.icon}</span><div><strong>{block.data.title || variant.label}</strong><RichNodes node={block.data.content as unknown as Record<string, unknown>} /></div></aside> }
    case 'divider': return <hr className={block.data.style === 'dashed' ? 'is-dashed' : ''} />
    case 'table': return <div className="learner-table content-section"><table><thead><tr>{block.data.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{block.data.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>
    case 'quiz': return <QuizPreview block={block} />
    case 'exercise': return <section className="learner-exercise content-section"><div className="learner-exercise-top"><span className="learner-interactive-icon"><Dumbbell size={20} aria-hidden="true" /></span>{block.data.language ? <span className="learner-pill">{courseLanguage(block.data.language)?.label ?? block.data.language}</span> : null}</div><h3>Exercise</h3><div className="learner-reading"><RichNodes node={block.data.prompt as unknown as Record<string, unknown>} /></div>{block.data.starterCode ? <CodeCard code={block.data.starterCode} language={block.data.language ?? 'text'} runnable={false} /> : null}{(block.data.publicTests ?? []).length ? <section className="learner-tests" aria-label="Public exercise tests"><h4>Public tests</h4><p>Run checks every public test in your browser.</p>{block.data.publicTests?.map((test, index) => <article key={test.id}><strong>Test {index + 1}</strong><pre>Input: {test.input}</pre><div className="learner-test-output"><pre>Expected: {test.expectedOutput}</pre><CopyButton value={test.expectedOutput} label={`Copy expected output for test ${index + 1}`} /></div></article>)}</section> : null}<div className="learner-exercise-actions"><button type="button" className="learner-primary" disabled title="Execution is disabled in Preview"><Play size={14} />Run</button></div></section>
    case 'expectedOutput': return <section className="learner-code content-section"><header><span>Example terminal output</span><CopyButton value={block.data.value} label="Copy expected output" /></header><pre aria-label="Example terminal output"><code>{block.data.value}</code></pre></section>
    case 'solution': { const text = richTextValue(block.data.content as unknown as Record<string, unknown>).trim(); return <details className="learner-solution content-section"><summary><ChevronRight size={16} aria-hidden="true" />Solution{!block.data.code && text ? <CopyButton value={text} label="Copy solution" /> : null}</summary><div><section className="learner-reading"><RichNodes node={block.data.content as unknown as Record<string, unknown>} /></section>{block.data.code ? <CodeCard code={block.data.code.value} language={block.data.code.language} runnable={false} copyLabel="Copy solution" /> : null}</div></details> }
  }
}

export function CoursePreview({ document }: { document: CourseDocument }) {
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop')
  return <div className="course-preview-shell"><nav className="preview-viewports" aria-label="Preview viewport"><button className={viewport === 'desktop' ? 'active' : ''} onClick={() => setViewport('desktop')}>Desktop</button><button className={viewport === 'tablet' ? 'active' : ''} onClick={() => setViewport('tablet')}>Tablet</button><button className={viewport === 'mobile' ? 'active' : ''} onClick={() => setViewport('mobile')}>Mobile</button></nav><article className={`course-preview course-preview--${viewport}`}><header className="learner-lesson-hero">{document.content.courseIconAssetId ? <AuthenticatedAssetImage assetId={document.content.courseIconAssetId} alt={`${document.title} icon`} /> : null}<span>{document.content.difficulty} · {document.content.estimatedMinutes} min</span><h1>{document.title}</h1><p>{document.content.description}</p></header>{document.content.modules.map((module) => <section className="learner-module" key={module.id}><h2>{module.title}</h2>{(module.organization === 'lessons' ? module.lessons : module.sections.flatMap((section) => section.lessons)).map((lesson) => <section className="preview-lesson" key={lesson.id}><header><span>Lesson · {lesson.estimatedMinutes ?? 0} min</span><h2>{lesson.title}</h2></header><div className="learner-lesson-body">{lesson.blocks.map((block) => <PreviewBlock block={block} key={block.id} />)}</div></section>)}</section>)}</article></div>
}
