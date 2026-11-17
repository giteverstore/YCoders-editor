import { z } from 'zod'

const linkMarkSchema = z.object({ type: z.literal('link'), attrs: z.object({
  href: z.string().url().refine((url) => ['http:', 'https:', 'mailto:'].includes(new URL(url).protocol), 'Only http, https, and mailto links are allowed'),
  target: z.enum(['_blank', '_self']).nullable().optional(),
  rel: z.enum(['noopener noreferrer nofollow', 'noopener noreferrer']).nullable().optional(),
  class: z.null().optional(),
  title: z.string().max(300).nullable().optional(),
}).strict() }).strict()
const markSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('bold') }).strict(),
  z.object({ type: z.literal('italic') }).strict(),
  z.object({ type: z.literal('underline') }).strict(),
  z.object({ type: z.literal('code') }).strict(),
  linkMarkSchema,
])

type RichTextNodeInput = {
  type: 'doc' | 'paragraph' | 'heading' | 'bulletList' | 'orderedList' | 'listItem' | 'blockquote' | 'text' | 'hardBreak'
  attrs?: { level: 1 | 2 | 3 | 4 } | { start: number; type?: null }
  text?: string
  marks?: z.infer<typeof markSchema>[]
  content?: RichTextNodeInput[]
}

const richTextNodeSchema: z.ZodType<RichTextNodeInput> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('text'), text: z.string().min(1).max(10_000), marks: z.array(markSchema).max(8).optional() }).strict(),
    z.object({ type: z.literal('hardBreak') }).strict(),
    z.object({ type: z.literal('paragraph'), content: z.array(richTextNodeSchema).max(500).optional() }).strict(),
    z.object({ type: z.literal('heading'), attrs: z.object({ level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]) }).strict(), content: z.array(richTextNodeSchema).min(1).max(100) }).strict(),
    z.object({ type: z.literal('bulletList'), content: z.array(richTextNodeSchema).min(1).max(100) }).strict(),
    z.object({ type: z.literal('orderedList'), attrs: z.object({ start: z.number().int().positive(), type: z.null().optional() }).strict().optional(), content: z.array(richTextNodeSchema).min(1).max(100) }).strict(),
    z.object({ type: z.literal('listItem'), content: z.array(richTextNodeSchema).min(1).max(100) }).strict(),
    z.object({ type: z.literal('blockquote'), content: z.array(richTextNodeSchema).min(1).max(100) }).strict(),
    z.object({ type: z.literal('doc'), content: z.array(richTextNodeSchema).max(1000) }).strict(),
  ]),
)

const allowedChildren: Record<RichTextNodeInput['type'], RichTextNodeInput['type'][]> = {
  doc: ['paragraph', 'heading', 'bulletList', 'orderedList', 'blockquote'],
  paragraph: ['text', 'hardBreak'],
  heading: ['text', 'hardBreak'],
  bulletList: ['listItem'],
  orderedList: ['listItem'],
  listItem: ['paragraph', 'bulletList', 'orderedList'],
  blockquote: ['paragraph'],
  text: [],
  hardBreak: [],
}

function inspectNode(node: RichTextNodeInput, context: z.RefinementCtx, depth = 1): void {
  if (depth > 12) context.addIssue({ code: 'custom', message: 'Rich text nesting exceeds 12 levels' })
  for (const [index, child] of (node.content ?? []).entries()) {
    if (!allowedChildren[node.type].includes(child.type)) {
      context.addIssue({ code: 'custom', path: ['content', index], message: `${child.type} is not allowed inside ${node.type}` })
    }
    inspectNode(child, context, depth + 1)
  }
}

export const richTextDocumentSchema = richTextNodeSchema
  .refine((node) => node.type === 'doc', 'Rich text root must be a doc node')
  .superRefine((node, context) => {
    if (JSON.stringify(node).length > 100_000) context.addIssue({ code: 'custom', message: 'Rich text document exceeds 100 KB' })
    inspectNode(node, context)
  })

export type RichTextDocument = z.infer<typeof richTextDocumentSchema>
