import { z } from 'zod'

import { BLOCK_SCHEMA_VERSION } from '../core/versions.js'
import { blockSchema, type BlockType, type ContentBlock } from './block.schemas.js'

export type BlockDomain = 'course' | 'practice' | 'challenge' | 'project'
export type BlockCategory = 'writing' | 'media' | 'code' | 'assessment' | 'structure'

export type BlockDefinition<T extends BlockType = BlockType> = {
  type: T
  displayName: string
  description: string
  category: BlockCategory
  allowedIn: Readonly<Record<BlockDomain, boolean>>
  schema: z.ZodType<Extract<ContentBlock, { type: T }>>
  createDefaultData: () => Extract<ContentBlock, { type: T }>['data']
}

const all = { course: true, practice: true, challenge: true, project: true } as const
const technical = { course: true, practice: true, challenge: true, project: true } as const
const assessment = { course: true, practice: true, challenge: false, project: false } as const
const document = { type: 'doc' as const, content: [{ type: 'paragraph' as const }] }
const pickSchema = <T extends BlockType>(type: T) => {
  const schema = blockSchema.options.find((option) => option.shape.type.value === type)
  if (!schema) throw new Error(`Missing schema for block type: ${type}`)
  return schema as unknown as BlockDefinition<T>['schema']
}

export const blockRegistry = {
  richText: { type: 'richText', displayName: 'Rich text', description: 'Structured prose with constrained formatting.', category: 'writing', allowedIn: all, schema: pickSchema('richText'), createDefaultData: () => ({ document }) },
  image: { type: 'image', displayName: 'Image', description: 'A private V2 image asset.', category: 'media', allowedIn: all, schema: pickSchema('image'), createDefaultData: () => ({ assetId: '00000000-0000-4000-8000-000000000001', alt: 'Describe the image' }) },
  code: { type: 'code', displayName: 'Code', description: 'A non-executable code listing.', category: 'code', allowedIn: technical, schema: pickSchema('code'), createDefaultData: () => ({ language: 'text', code: '' }) },
  callout: { type: 'callout', displayName: 'Callout', description: 'Highlighted supporting information.', category: 'writing', allowedIn: all, schema: pickSchema('callout'), createDefaultData: () => ({ tone: 'info', content: document }) },
  divider: { type: 'divider', displayName: 'Divider', description: 'A vertical-flow section separator.', category: 'structure', allowedIn: all, schema: pickSchema('divider'), createDefaultData: () => ({ style: 'solid' }) },
  table: { type: 'table', displayName: 'Table', description: 'Tabular text content.', category: 'structure', allowedIn: all, schema: pickSchema('table'), createDefaultData: () => ({ headers: ['Column'], rows: [] }) },
  quiz: { type: 'quiz', displayName: 'Quiz', description: 'A knowledge-check question.', category: 'assessment', allowedIn: assessment, schema: pickSchema('quiz'), createDefaultData: () => ({ question: 'Question', options: [{ id: '00000000-0000-4000-8000-000000000001', text: 'Answer', isCorrect: true }, { id: '00000000-0000-4000-8000-000000000002', text: 'Alternative', isCorrect: false }] }) },
  exercise: { type: 'exercise', displayName: 'Exercise', description: 'A guided learner exercise.', category: 'assessment', allowedIn: assessment, schema: pickSchema('exercise'), createDefaultData: () => ({ prompt: document }) },
  expectedOutput: { type: 'expectedOutput', displayName: 'Expected output', description: 'A static expected result.', category: 'code', allowedIn: technical, schema: pickSchema('expectedOutput'), createDefaultData: () => ({ value: '', format: 'text' }) },
  solution: { type: 'solution', displayName: 'Solution', description: 'An instructional solution.', category: 'assessment', allowedIn: assessment, schema: pickSchema('solution'), createDefaultData: () => ({ content: document }) },
} satisfies { [K in BlockType]: BlockDefinition<K> }

export function blocksForDomain(domain: BlockDomain): BlockDefinition[] {
  return Object.values(blockRegistry).filter((definition) => definition.allowedIn[domain]) as BlockDefinition[]
}

export function createBlock<T extends BlockType>(type: T, id: string): Extract<ContentBlock, { type: T }> {
  const definition = blockRegistry[type]
  return { id, type, schemaVersion: BLOCK_SCHEMA_VERSION, data: definition.createDefaultData() } as Extract<ContentBlock, { type: T }>
}
