import { Mark, mergeAttributes, type Editor } from '@tiptap/core'

export const TYPOGRAPHY_FAMILIES = { sans: 'YCoders Sans', serif: 'Serif', mono: 'Monospace' } as const
export const TYPOGRAPHY_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 36, 48] as const
export type TypographyFamily = keyof typeof TYPOGRAPHY_FAMILIES
export type TypographySize = typeof TYPOGRAPHY_SIZES[number]
export const typographyFontStack = (family: TypographyFamily) => family === 'serif' ? 'Georgia, Cambria, serif' : family === 'mono' ? "'DM Mono', Consolas, monospace" : "'DM Sans', Inter, sans-serif"

export const FontFamilyMark = Mark.create({ name: 'fontFamily', addAttributes() { return { family: { default: 'sans', parseHTML: (element) => element.getAttribute('data-font-family') } } }, parseHTML() { return [{ tag: 'span[data-ycoders-font-family]' }] }, renderHTML({ HTMLAttributes }) { const family = HTMLAttributes.family as TypographyFamily; if (!(family in TYPOGRAPHY_FAMILIES)) return ['span', {}, 0]; return ['span', mergeAttributes({ 'data-ycoders-font-family': '', 'data-font-family': family, style: `font-family:${typographyFontStack(family)}` }), 0] } })
export const FontSizeMark = Mark.create({ name: 'fontSize', addAttributes() { return { size: { default: 16, parseHTML: (element) => Number(element.getAttribute('data-font-size')) } } }, parseHTML() { return [{ tag: 'span[data-ycoders-font-size]' }] }, renderHTML({ HTMLAttributes }) { const size = Number(HTMLAttributes.size); if (!TYPOGRAPHY_SIZES.includes(size as TypographySize)) return ['span', {}, 0]; return ['span', mergeAttributes({ 'data-ycoders-font-size': '', 'data-font-size': String(size), style: `font-size:${size}px` }), 0] } })

export function typographySelectionState(editor: Editor): { family: TypographyFamily | 'mixed'; size: TypographySize | 'mixed' } {
  if (editor.state.selection.empty) return { family: (editor.getAttributes('fontFamily').family ?? 'sans') as TypographyFamily, size: (editor.getAttributes('fontSize').size ?? 16) as TypographySize }
  const families = new Set<TypographyFamily>(), sizes = new Set<TypographySize>()
  editor.state.doc.nodesBetween(editor.state.selection.from, editor.state.selection.to, (node) => { if (!node.isText) return; families.add((node.marks.find(({ type }) => type.name === 'fontFamily')?.attrs.family ?? 'sans') as TypographyFamily); sizes.add((node.marks.find(({ type }) => type.name === 'fontSize')?.attrs.size ?? 16) as TypographySize) })
  return { family: families.size === 1 ? [...families][0] : 'mixed', size: sizes.size === 1 ? [...sizes][0] : 'mixed' }
}
