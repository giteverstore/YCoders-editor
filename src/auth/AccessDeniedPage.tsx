import { ShieldX } from 'lucide-react'

import { useAuth } from './authContext'

export function AccessDeniedPage() {
  const { user, signOutUser } = useAuth()
  return <main className="auth-state"><span className="auth-icon"><ShieldX size={28} /></span><h1>Editor access denied</h1><p>{user?.email ?? 'This account'} is authenticated but does not have a recognized <code>adminRole</code> claim.</p><button className="button button--secondary" onClick={() => void signOutUser()}>Sign out</button></main>
}
