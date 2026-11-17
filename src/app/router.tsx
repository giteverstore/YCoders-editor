import { Navigate, createBrowserRouter } from 'react-router-dom'

import { StudioLayout } from './layouts/StudioLayout'
import { CourseEditorRoute } from '../features/courses/CourseEditorRoute'
import { CourseDraftListPage } from '../features/courses/CourseDraftListPage'
import { DomainEditorPage } from '../features/shared/DomainEditorPage'
import { DomainListPage } from '../features/shared/DomainListPage'
import { NotFoundPage } from '../features/shared/NotFoundPage'
import { domains } from '../lib/domains'
import { AuthGate } from '../auth/AuthGate'
import { LoginPage } from '../auth/LoginPage'
import { PracticeDraftListPage } from '../features/practice/PracticeDraftListPage'
import { PracticeEditorRoute } from '../features/practice/PracticeEditorRoute'
import { ChallengeDraftListPage } from '../features/challenges/ChallengeDraftListPage'
import { ChallengeEditorRoute } from '../features/challenges/ChallengeEditorRoute'
import { ProjectDraftListPage } from '../features/projects/ProjectDraftListPage'
import { ProjectEditorRoute } from '../features/projects/ProjectEditorRoute'

const domainRoutes = domains.map((domain) => ({
  path: domain.slug,
  children: [
    { index: true, element: domain.slug === 'courses' ? <CourseDraftListPage /> : domain.slug === 'practice' ? <PracticeDraftListPage /> : domain.slug === 'challenges' ? <ChallengeDraftListPage /> : domain.slug === 'projects'?<ProjectDraftListPage/>:<DomainListPage domain={domain} /> },
    { path: 'new', element: domain.slug === 'courses' ? <CourseEditorRoute /> : domain.slug === 'practice' ? <PracticeEditorRoute /> : domain.slug === 'challenges' ? <ChallengeEditorRoute /> : domain.slug==='projects'?<ProjectEditorRoute/>:<DomainEditorPage domain={domain} mode="create" /> },
    { path: ':id/edit', element: domain.slug === 'courses' ? <CourseEditorRoute /> : domain.slug === 'practice' ? <PracticeEditorRoute /> : domain.slug === 'challenges' ? <ChallengeEditorRoute /> : domain.slug==='projects'?<ProjectEditorRoute/>:<DomainEditorPage domain={domain} mode="edit" /> },
    ...(domain.slug === 'courses' ? [
      { path: 'local/new', element: <CourseEditorRoute source="local" /> },
      { path: 'local/:id/edit', element: <CourseEditorRoute source="local" /> },
      { path: 'cloud/new', element: <CourseEditorRoute source="cloud" /> },
      { path: 'cloud/:id/edit', element: <CourseEditorRoute source="cloud" /> },
    ] : []),
    ...(domain.slug === 'practice' ? [
      { path: 'local/new', element: <PracticeEditorRoute source="local" /> },
      { path: 'local/:id/edit', element: <PracticeEditorRoute source="local" /> },
      { path: 'cloud/new', element: <PracticeEditorRoute source="cloud" /> },
      { path: 'cloud/:id/edit', element: <PracticeEditorRoute source="cloud" /> },
    ] : []),
    ...(domain.slug === 'challenges' ? [{path:'local/new',element:<ChallengeEditorRoute source="local"/>},{path:'local/:id/edit',element:<ChallengeEditorRoute source="local"/>},{path:'cloud/new',element:<ChallengeEditorRoute source="cloud"/>},{path:'cloud/:id/edit',element:<ChallengeEditorRoute source="cloud"/>}] : []),
    ...(domain.slug === 'projects' ? [{path:'local/new',element:<ProjectEditorRoute source="local"/>},{path:'local/:id/edit',element:<ProjectEditorRoute source="local"/>},{path:'cloud/new',element:<ProjectEditorRoute source="cloud"/>},{path:'cloud/:id/edit',element:<ProjectEditorRoute source="cloud"/>}] : []),
  ],
}))

export const router = createBrowserRouter([
  {
    path: '/login', element: <LoginPage />,
  },
  {
    element: <AuthGate />,
    children: [
      { path: '/', element: <StudioLayout />, children: [
        { index: true, element: <Navigate to="/courses" replace /> },
        ...domainRoutes,
        { path: '*', element: <NotFoundPage /> },
      ] },
    ],
  },
])
