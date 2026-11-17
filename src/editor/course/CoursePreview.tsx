import type { ContentBlock } from '../../content/blocks/block.schemas'
import type { CourseDocument } from '../../content/core/envelope'
import { ContentImage } from '../../assets/AssetPicker'

function RichNodes({ node }: { node: Record<string, unknown> }) {
  const type = node.type as string
  const children = (node.content as Record<string, unknown>[] | undefined)?.map((child, index) => <RichNodes key={index} node={child} />)
  if (type === 'text') {
    let content = <>{String(node.text ?? '')}</>
    for (const mark of (node.marks as Array<{ type: string; attrs?: { href?: string } }> | undefined) ?? []) {
      if (mark.type === 'bold') content = <strong>{content}</strong>
      if (mark.type === 'italic') content = <em>{content}</em>
      if (mark.type === 'underline') content = <u>{content}</u>
      if (mark.type === 'code') content = <code>{content}</code>
      if (mark.type === 'link') content = <a href={mark.attrs?.href} rel="noreferrer">{content}</a>
    }
    return content
  }
  if (type === 'paragraph') return <p>{children}</p>
  if (type === 'heading') { const level = (node.attrs as { level: number }).level; return level === 2 ? <h2>{children}</h2> : level === 3 ? <h3>{children}</h3> : <h4>{children}</h4> }
  if (type === 'bulletList') return <ul>{children}</ul>
  if (type === 'orderedList') return <ol>{children}</ol>
  if (type === 'listItem') return <li>{children}</li>
  if (type === 'blockquote') return <blockquote>{children}</blockquote>
  if (type === 'hardBreak') return <br />
  return <>{children}</>
}

function PreviewBlock({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case 'richText': return <RichNodes node={block.data.document as unknown as Record<string, unknown>} />
    case 'image': return <ContentImage data={block.data} />
    case 'code': return <pre><code>{block.data.code}</code></pre>
    case 'callout': return <aside className={`preview-callout preview-callout--${block.data.tone}`}><strong>{block.data.title}</strong><RichNodes node={block.data.content as unknown as Record<string, unknown>} /></aside>
    case 'divider': return <hr />
    case 'table': return <table><thead><tr>{block.data.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{block.data.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table>
    case 'quiz': return <div className="preview-card"><strong>Knowledge check: {block.data.question}</strong><ul>{block.data.options.map((option) => <li key={option.id}>{option.text}</li>)}</ul><small>Interactive submission is unavailable in preview.</small></div>
    case 'exercise': return <div className="preview-card"><strong>Exercise</strong><RichNodes node={block.data.prompt as unknown as Record<string, unknown>} />{block.data.starterCode && <pre>{block.data.starterCode}</pre>}</div>
    case 'expectedOutput': return <div><strong>Expected output</strong><pre>{block.data.value}</pre></div>
    case 'solution': return <details><summary>Solution</summary><RichNodes node={block.data.content as unknown as Record<string, unknown>} />{block.data.code && <pre>{block.data.code.value}</pre>}</details>
  }
}

export function CoursePreview({ document }: { document: CourseDocument }) {
  return <article className="course-preview"><div className="preview-notice">Standalone studio approximation — learner UI integration is not included.</div><header><span>{document.content.difficulty} · {document.content.estimatedMinutes} min</span><h1>{document.title}</h1><p>{document.content.description}</p></header>{document.content.modules.map((module) => <section key={module.id}><h2>{module.title}</h2>{(module.organization === 'lessons' ? module.lessons : module.sections.flatMap((section) => section.lessons)).map((lesson) => <div className="preview-lesson" key={lesson.id}><h3>{lesson.title}</h3>{lesson.blocks.map((block) => <PreviewBlock block={block} key={block.id} />)}</div>)}</section>)}</article>
}
