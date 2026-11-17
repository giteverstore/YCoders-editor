import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from './authContext'
import { AccessDeniedPage } from './AccessDeniedPage'

export function AuthGate() {
  const auth = useAuth()
  const location = useLocation()
  if (auth.status === 'loading') return <div className="auth-state" role="status"><div className="auth-spinner" /><h1>Checking your session…</h1><p>Editor content remains hidden until authentication and role checks finish.</p></div>
  if (auth.status === 'unconfigured') return <div className="auth-state"><h1>Firebase is not configured</h1><p>Add the documented Vite Firebase variables to run the authenticated Editor Studio. Local IndexedDB data has not been removed.</p></div>
  if (auth.status === 'unauthenticated') return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (auth.status === 'denied') return <AccessDeniedPage />
  return <Outlet />
}
