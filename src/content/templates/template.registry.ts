import { blocksForDomain } from '../blocks/block.registry'
import type { BlockType } from '../blocks/block.schemas'
import type { ContentType } from '../core/envelope'
import type { ContentTemplateDefinition, TemplateFieldDefinition } from './template.types'

const field = (key: string, label: string, fieldType: TemplateFieldDefinition['fieldType'], required = true): TemplateFieldDefinition => ({ key, label, fieldType, required, movable: false })
const allowed = (domain: ContentType) => blocksForDomain(domain).map((definition) => definition.type) as BlockType[]

export const templateRegistry = {
  course: {
    contentType: 'course', displayName: 'Course', requiredMetadata: ['title', 'slug', 'status', 'locale'],
    fixedFields: [field('title', 'Course title', 'text'), field('content.description', 'Description', 'text'), field('slug', 'Slug', 'slug'), field('content.language', 'Language', 'select'), field('content.difficulty', 'Difficulty', 'select'), field('content.estimatedMinutes', 'Estimated duration', 'number'), field('content.learningOutcomes', 'Learning outcomes', 'string-list'), field('content.modules', 'Modules and lessons', 'structure')],
    structuralContainers: ['modules', 'sections', 'lessons'],
    flexibleRegions: [{ key: 'lesson.blocks', label: 'Lesson content', scope: 'lesson', allowedBlocks: allowed('course') }],
  },
  practice: {
    contentType: 'practice', displayName: 'Practice', requiredMetadata: ['title', 'slug', 'status', 'locale'],
    fixedFields: [field('title', 'Problem title', 'text'), field('slug', 'Slug', 'slug'), field('content.difficulty', 'Difficulty', 'select'), field('content.languages', 'Programming languages', 'language-config'), field('content.questionMetadata', 'Problem metadata', 'configuration'), field('content.examples', 'Examples', 'structure'), field('content.constraints', 'Constraints', 'string-list'), field('content.publicTestCases', 'Test cases', 'structure'), field('content.starterCode', 'Starter code', 'configuration'), field('content.referenceSolutions', 'Reference solutions', 'configuration')],
    structuralContainers: ['examples', 'publicTestCases'],
    flexibleRegions: [{ key: 'content.instructions', label: 'Explanation and instruction', scope: 'document', allowedBlocks: allowed('practice') }],
  },
  challenge: {
    contentType: 'challenge', displayName: 'Challenge', requiredMetadata: ['title', 'slug', 'status', 'locale'],
    fixedFields: [field('title', 'Challenge title', 'text'), field('slug', 'Slug', 'slug'), field('content.scheduledDate', 'Scheduled date', 'date'), field('content.difficulty', 'Difficulty', 'select'), field('content.languages', 'Programming languages', 'language-config'), field('content.rewards', 'Rewards', 'configuration'), field('content.verification', 'Verification', 'configuration')],
    structuralContainers: [],
    flexibleRegions: [{ key: 'content.instructions', label: 'Instructions and supporting content', scope: 'document', allowedBlocks: allowed('challenge') }],
  },
  project: {
    contentType: 'project', displayName: 'Project', requiredMetadata: ['title', 'slug', 'status', 'locale'],
    fixedFields: [field('title', 'Project title', 'text'), field('slug', 'Slug', 'slug'), field('content.difficulty', 'Difficulty', 'select'), field('content.learningObjectives', 'Learning objectives', 'string-list'), field('content.languages', 'Programming languages', 'language-config'), field('content.projectMetadata', 'Project configuration', 'configuration'), field('content.checkpoints', 'Checkpoints and tasks', 'structure'), field('content.validation', 'Validation', 'configuration')],
    structuralContainers: ['checkpoints', 'tasks'],
    flexibleRegions: [{ key: 'content.instructions', label: 'Project instructions', scope: 'document', allowedBlocks: allowed('project') }, { key: 'checkpoint.description', label: 'Checkpoint description', scope: 'checkpoint', allowedBlocks: allowed('project') }, { key: 'task.instructions', label: 'Task instructions', scope: 'task', allowedBlocks: allowed('project') }],
  },
} satisfies Record<ContentType, ContentTemplateDefinition>

export function getTemplate(contentType: ContentType): ContentTemplateDefinition {
  return templateRegistry[contentType]
}
