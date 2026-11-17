import type { BlockType } from '../blocks/block.schemas'
import type { ContentType } from '../core/envelope'

export type TemplateFieldType = 'text' | 'slug' | 'select' | 'number' | 'date' | 'string-list' | 'language-config' | 'structure' | 'configuration'

export type TemplateFieldDefinition = {
  key: string
  label: string
  fieldType: TemplateFieldType
  required: boolean
  movable: false
}

export type FlexibleRegionDefinition = {
  key: string
  label: string
  scope: 'document' | 'lesson' | 'checkpoint' | 'task'
  allowedBlocks: readonly BlockType[]
}

export type ContentTemplateDefinition = {
  contentType: ContentType
  displayName: string
  requiredMetadata: readonly string[]
  fixedFields: readonly TemplateFieldDefinition[]
  structuralContainers: readonly string[]
  flexibleRegions: readonly FlexibleRegionDefinition[]
}
