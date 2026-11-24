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
import { DomainWorkInProgressPage } from '../features/shared/DomainWorkInProgressPage'
import { getReleaseDomainStatus } from '../lib/releaseDomains'

const domainRoutes = domains.map((domain) => getReleaseDomainStatus(domain.slug) === 'work-in-progress'
  ? {
    path: domain.slug,
    children: [
      { index: true, element: <DomainWorkInProgressPage domain={domain.plural} /> },
      { path: '*', element: <DomainWorkInProgressPage domain={domain.plural} /> },
    ],
  }
  : {
    path: domain.slug,
    children: [
    { index: true, element: domain.slug === 'courses' ? <CourseDraftListPage /> : domain.slug === 'practice' ? <PracticeDraftListPage /> : <DomainListPage domain={domain} /> },
    { path: 'new', element: domain.slug === 'courses' ? <CourseEditorRoute /> : domain.slug === 'practice' ? <PracticeEditorRoute /> : <DomainEditorPage domain={domain} mode="create" /> },
    { path: ':id/edit', element: domain.slug === 'courses' ? <CourseEditorRoute /> : domain.slug === 'practice' ? <PracticeEditorRoute /> : <DomainEditorPage domain={domain} mode="edit" /> },
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
  ],
  })

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
