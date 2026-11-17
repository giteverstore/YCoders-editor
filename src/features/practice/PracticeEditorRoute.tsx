import { lazy, Suspense } from 'react'
const Page = lazy(() => import('./PracticeEditorPage').then((module) => ({ default: module.PracticeEditorPage })))
export function PracticeEditorRoute({ source = 'local' }: { source?: 'local' | 'cloud' }) { return <Suspense fallback={<div className="editor-loading">Loading Practice editor…</div>}><Page source={source} /></Suspense> }
