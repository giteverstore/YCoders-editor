import type { ContentBlock } from '../../content/blocks/block.schemas'
import { createBlock } from '../../content/blocks/block.registry'
import type { CourseDocument } from '../../content/core/envelope'
import { CURRENT_SCHEMA_VERSION } from '../../content/core/versions'

type CourseModule = CourseDocument['content']['modules'][number]
type FlatModule = Extract<CourseModule, { organization: 'lessons' }>
type Lesson = FlatModule['lessons'][number]

export type IdFactory = () => string
const defaultId: IdFactory = () => crypto.randomUUID()

export function createCourseDocument(ids: IdFactory = defaultId, now = new Date().toISOString()): CourseDocument {
  const lesson: Lesson = { id: ids(), title: 'Introduction', estimatedMinutes: 15, blocks: [] }
  return {
    id: ids(), contentType: 'course', schemaVersion: CURRENT_SCHEMA_VERSION, documentVersion: 1,
    title: 'Untitled course', slug: 'untitled-course',
    status: { authoringState: 'draft', visibility: 'private', hasUnpublishedChanges: true, publishedDocumentVersion: null, publishedAt: null },
    createdAt: now, updatedAt: now, createdBy: 'local-editor', updatedBy: 'local-editor',
    metadata: { summary: '', tags: [], locale: 'en' },
    content: { description: 'Describe what learners will achieve.', language: 'en', difficulty: 'beginner', estimatedMinutes: 60, learningOutcomes: ['Describe the primary learning outcome'], courseMetadata: { prerequisites: [], topics: [] }, modules: [{ id: ids(), title: 'Module 1', organization: 'lessons', lessons: [lesson] }] },
  }
}

const updateDocument = (document: CourseDocument, update: (draft: CourseDocument) => void): CourseDocument => {
  const next = structuredClone(document)
  update(next)
  next.documentVersion = document.documentVersion + 1
  next.updatedAt = new Date().toISOString()
  next.status.hasUnpublishedChanges = true
  return next
}

export function updateCourse(document: CourseDocument, values: Partial<Pick<CourseDocument, 'title' | 'slug' | 'metadata'>> & { content?: Partial<Omit<CourseDocument['content'], 'modules'>> }): CourseDocument {
  return updateDocument(document, (draft) => {
    if (values.title !== undefined) draft.title = values.title
    if (values.slug !== undefined) draft.slug = values.slug
    if (values.metadata !== undefined) draft.metadata = values.metadata
    if (values.content) Object.assign(draft.content, values.content)
  })
}

export function addModule(document: CourseDocument, ids: IdFactory = defaultId): CourseDocument {
  return updateDocument(document, (draft) => draft.content.modules.push({ id: ids(), title: `Module ${draft.content.modules.length + 1}`, organization: 'lessons', lessons: [{ id: ids(), title: 'New lesson', estimatedMinutes: 15, blocks: [] }] }))
}

export function renameModule(document: CourseDocument, moduleId: string, title: string): CourseDocument {
  return updateDocument(document, (draft) => { const module = draft.content.modules.find((item) => item.id === moduleId); if (module) module.title = title })
}

export function removeModule(document: CourseDocument, moduleId: string): CourseDocument {
  return updateDocument(document, (draft) => { draft.content.modules = draft.content.modules.filter((module) => module.id !== moduleId) })
}

export function convertModuleToSections(document: CourseDocument, moduleId: string, ids: IdFactory = defaultId): CourseDocument {
  return updateDocument(document, (draft) => {
    const index = draft.content.modules.findIndex((module) => module.id === moduleId)
    const module = draft.content.modules[index]
    if (!module || module.organization === 'sections') return
    draft.content.modules[index] = { id: module.id, title: module.title, description: module.description, organization: 'sections', sections: [{ id: ids(), title: 'Section 1', lessons: module.lessons }] }
  })
}

export function addSection(document: CourseDocument, moduleId: string, ids: IdFactory = defaultId): CourseDocument {
  return updateDocument(document, (draft) => {
    const module = draft.content.modules.find((item) => item.id === moduleId)
    if (module?.organization === 'sections') module.sections.push({ id: ids(), title: `Section ${module.sections.length + 1}`, lessons: [{ id: ids(), title: 'New lesson', estimatedMinutes: 15, blocks: [] }] })
  })
}

export function renameSection(document: CourseDocument, sectionId: string, title: string): CourseDocument {
  return updateDocument(document, (draft) => { for (const module of draft.content.modules) if (module.organization === 'sections') { const section = module.sections.find((item) => item.id === sectionId); if (section) section.title = title } })
}

export function removeSection(document: CourseDocument, sectionId: string): CourseDocument {
  return updateDocument(document, (draft) => { for (const module of draft.content.modules) if (module.organization === 'sections') module.sections = module.sections.filter((section) => section.id !== sectionId) })
}

function lessonsIn(module: CourseModule): Lesson[] { return module.organization === 'lessons' ? module.lessons : module.sections.flatMap((section) => section.lessons) }

export function addLesson(document: CourseDocument, parentId: string, ids: IdFactory = defaultId): CourseDocument {
  return updateDocument(document, (draft) => {
    for (const module of draft.content.modules) {
      if (module.organization === 'lessons' && module.id === parentId) module.lessons.push({ id: ids(), title: 'New lesson', estimatedMinutes: 15, blocks: [] })
      if (module.organization === 'sections') module.sections.find((section) => section.id === parentId)?.lessons.push({ id: ids(), title: 'New lesson', estimatedMinutes: 15, blocks: [] })
    }
  })
}

export function updateLesson(document: CourseDocument, lessonId: string, values: Partial<Pick<Lesson, 'title' | 'estimatedMinutes'>>): CourseDocument {
  return updateDocument(document, (draft) => { for (const module of draft.content.modules) { const lesson = lessonsIn(module).find((item) => item.id === lessonId); if (lesson) Object.assign(lesson, values) } })
}

export function removeLesson(document: CourseDocument, lessonId: string): CourseDocument {
  return updateDocument(document, (draft) => { for (const module of draft.content.modules) { if (module.organization === 'lessons') module.lessons = module.lessons.filter((lesson) => lesson.id !== lessonId); else for (const section of module.sections) section.lessons = section.lessons.filter((lesson) => lesson.id !== lessonId) } })
}

export function findLesson(document: CourseDocument, lessonId: string): Lesson | undefined {
  for (const module of document.content.modules) { const lesson = lessonsIn(module).find((item) => item.id === lessonId); if (lesson) return lesson }
}

const updateLessonBlocks = (document: CourseDocument, lessonId: string, update: (blocks: ContentBlock[]) => void) => updateDocument(document, (draft) => { const lesson = findLesson(draft, lessonId); if (lesson) update(lesson.blocks) })

export function addBlock(document: CourseDocument, lessonId: string, type: ContentBlock['type'], ids: IdFactory = defaultId): CourseDocument {
  return updateLessonBlocks(document, lessonId, (blocks) => blocks.push(createBlock(type, ids())))
}

export function removeBlock(document: CourseDocument, lessonId: string, blockId: string): CourseDocument {
  return updateLessonBlocks(document, lessonId, (blocks) => { const index = blocks.findIndex((block) => block.id === blockId); if (index >= 0) blocks.splice(index, 1) })
}

export function duplicateBlock(document: CourseDocument, lessonId: string, blockId: string, ids: IdFactory = defaultId): CourseDocument {
  return updateLessonBlocks(document, lessonId, (blocks) => { const index = blocks.findIndex((block) => block.id === blockId); if (index >= 0) blocks.splice(index + 1, 0, { ...structuredClone(blocks[index]), id: ids() }) })
}

export function reorderBlock(document: CourseDocument, lessonId: string, blockId: string, targetIndex: number): CourseDocument {
  return updateLessonBlocks(document, lessonId, (blocks) => { const index = blocks.findIndex((block) => block.id === blockId); if (index < 0) return; const [block] = blocks.splice(index, 1); blocks.splice(Math.max(0, Math.min(targetIndex, blocks.length)), 0, block) })
}

export function updateBlock(document: CourseDocument, lessonId: string, block: ContentBlock): CourseDocument {
  return updateLessonBlocks(document, lessonId, (blocks) => { const index = blocks.findIndex((item) => item.id === block.id); if (index >= 0) blocks[index] = structuredClone(block) })
}
