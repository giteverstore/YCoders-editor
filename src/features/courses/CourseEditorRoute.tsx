import { lazy, Suspense } from 'react'

const CourseEditorPage = lazy(() => import('./CourseEditorPage').then((module) => ({ default: module.CourseEditorPage })))

export function CourseEditorRoute({ source = 'local' }: { source?: 'local' | 'cloud' }) {
  return <Suspense fallback={<div className="editor-loading" role="status">Loading course editor…</div>}><CourseEditorPage source={source} /></Suspense>
}
