import { z } from 'zod'

import { blockRegistry, type BlockDomain } from '../blocks/block.registry.js'
import { blockSchema } from '../blocks/block.schemas.js'
import { findDuplicateIds } from '../core/identifiers.js'

export const difficultySchema = z.enum(['beginner', 'intermediate', 'advanced'])
export const programmingLanguageSchema = z.object({ id: z.string().regex(/^[a-z][a-z0-9-]*$/), displayName: z.string().min(1).max(80), version: z.string().max(40).optional() }).strict()
export const codeByLanguageSchema = z.array(z.object({ languageId: z.string().min(1), code: z.string().max(100_000) }).strict()).max(20).superRefine((items, context) => {
  const duplicates = items.map((item) => item.languageId).filter((id, index, allItems) => allItems.indexOf(id) !== index)
  if (duplicates.length) context.addIssue({ code: 'custom', message: `Duplicate language entries: ${[...new Set(duplicates)].join(', ')}` })
})

export function domainBlocksSchema(domain: BlockDomain) {
  return z.array(blockSchema).max(500).superRefine((blocks, context) => {
    for (const [index, block] of blocks.entries()) {
      if (!blockRegistry[block.type].allowedIn[domain]) context.addIssue({ code: 'custom', path: [index, 'type'], message: `${block.type} blocks are not permitted in ${domain}` })
    }
    const duplicates = findDuplicateIds(blocks)
    if (duplicates.length) context.addIssue({ code: 'custom', message: `Duplicate block IDs: ${duplicates.join(', ')}` })
  })
}

export const languageConfigurationSchema = z.object({
  supported: z.array(programmingLanguageSchema).min(1).max(20),
  defaultLanguageId: z.string().min(1),
}).strict().superRefine((value, context) => {
  const ids = value.supported.map((language) => language.id)
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', path: ['supported'], message: 'Programming language IDs must be unique' })
  if (!ids.includes(value.defaultLanguageId)) context.addIssue({ code: 'custom', path: ['defaultLanguageId'], message: 'Default language must be supported' })
})

export const hintSchema = z.object({ id: z.uuid(), text: z.string().min(1).max(3000), cost: z.number().int().nonnegative().optional() }).strict()
