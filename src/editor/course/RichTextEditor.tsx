import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Bold, Braces, Italic, Link2, List, ListOrdered, Quote, UnderlineIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { richTextDocumentSchema, type RichTextDocument } from '../../content/blocks/richText.schema'

type Props = { value: RichTextDocument; onCommit: (value: RichTextDocument) => void; label?: string }

export function RichTextEditor({ value, onCommit, label = 'Rich text' }: Props) {
  const lastCommitted = useRef(JSON.stringify(value))
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false, horizontalRule: false, strike: false, link: false, underline: false }),
      Underline,
      Link.configure({ openOnClick: false, protocols: ['http', 'https', 'mailto'], HTMLAttributes: { target: null, rel: 'noopener noreferrer' } }),
    ],
    content: value,
    editorProps: { attributes: { class: 'tiptap-surface', 'aria-label': label } },
    onBlur: ({ editor: instance }) => {
      const json = instance.getJSON()
      const parsed = richTextDocumentSchema.safeParse(json)
      if (parsed.success && JSON.stringify(parsed.data) !== lastCommitted.current) {
        lastCommitted.current = JSON.stringify(parsed.data)
        onCommit(parsed.data)
      }
    },
  })

  useEffect(() => {
    if (!editor) return
    const serialized = JSON.stringify(value)
    if (serialized !== lastCommitted.current && serialized !== JSON.stringify(editor.getJSON())) {
      lastCommitted.current = serialized
      editor.commands.setContent(value)
    }
  }, [editor, value])

  if (!editor) return null
  const link = () => {
    const previous = editor.getAttributes('link').href as string | undefined
    const href = window.prompt('Link URL (http, https, or mailto)', previous ?? 'https://')
    if (href === null) return
    if (!href) editor.chain().focus().unsetLink().run()
    else {
      try {
        if (['http:', 'https:', 'mailto:'].includes(new URL(href).protocol)) editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
        else window.alert('Only http, https, and mailto links are allowed.')
      } catch {
        window.alert('Enter a complete http, https, or mailto URL.')
      }
    }
  }

  return (
    <div className="rich-editor">
      <div className="rich-toolbar" aria-label="Text formatting">
        <button type="button" className={editor.isActive('bold') ? 'active' : ''} onClick={() => editor.chain().focus().toggleBold().run()} aria-label="Bold"><Bold size={15} /></button>
        <button type="button" className={editor.isActive('italic') ? 'active' : ''} onClick={() => editor.chain().focus().toggleItalic().run()} aria-label="Italic"><Italic size={15} /></button>
        <button type="button" className={editor.isActive('underline') ? 'active' : ''} onClick={() => editor.chain().focus().toggleUnderline().run()} aria-label="Underline"><UnderlineIcon size={15} /></button>
        <button type="button" className={editor.isActive('code') ? 'active' : ''} onClick={() => editor.chain().focus().toggleCode().run()} aria-label="Inline code"><Braces size={15} /></button>
        <button type="button" onClick={link} aria-label="Link"><Link2 size={15} /></button>
        <button type="button" className={editor.isActive('bulletList') ? 'active' : ''} onClick={() => editor.chain().focus().toggleBulletList().run()} aria-label="Bullet list"><List size={15} /></button>
        <button type="button" className={editor.isActive('orderedList') ? 'active' : ''} onClick={() => editor.chain().focus().toggleOrderedList().run()} aria-label="Numbered list"><ListOrdered size={15} /></button>
        <button type="button" className={editor.isActive('blockquote') ? 'active' : ''} onClick={() => editor.chain().focus().toggleBlockquote().run()} aria-label="Blockquote"><Quote size={15} /></button>
        <select aria-label="Text style" value={editor.isActive('heading', { level: 2 }) ? '2' : editor.isActive('heading', { level: 3 }) ? '3' : '0'} onChange={(event) => { const level = Number(event.target.value); if (level === 0) editor.chain().focus().setParagraph().run(); else editor.chain().focus().toggleHeading({ level: level as 2 | 3 }).run() }}>
          <option value="0">Paragraph</option><option value="2">Heading 2</option><option value="3">Heading 3</option>
        </select>
      </div>
      <EditorContent editor={editor} />
      <small className="field-help">Changes are added to history when this field loses focus.</small>
    </div>
  )
}
