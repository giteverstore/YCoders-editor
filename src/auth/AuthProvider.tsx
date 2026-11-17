import { GoogleAuthProvider, onIdTokenChanged, signInWithEmailAndPassword, signInWithPopup, signOut, type User } from 'firebase/auth'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { getFirebaseClientServices } from './firebase.client'
import { isAdminRole, type AdminRole } from './permissions'
import { AuthContext, type AuthStatus } from './authContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const services = useMemo(() => getFirebaseClientServices(), [])
  const [status, setStatus] = useState<AuthStatus>(services ? 'loading' : 'unconfigured')
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState<AdminRole | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!services) return
    return onIdTokenChanged(services.auth, async (nextUser) => {
      setError(null); setUser(nextUser)
      if (!nextUser) { setRole(null); setStatus('unauthenticated'); return }
      try {
        const token = await nextUser.getIdTokenResult()
        const nextRole = token.claims.adminRole
        if (isAdminRole(nextRole)) { setRole(nextRole); setStatus('authorized') }
        else { setRole(null); setStatus('denied') }
      } catch { setRole(null); setStatus('unauthenticated'); setError('Your session expired. Sign in again.') }
    })
  }, [services])

  const signInGoogle = useCallback(async () => { if (!services) return; setError(null); try { await signInWithPopup(services.auth, new GoogleAuthProvider()) } catch (cause) { setError(toAuthMessage(cause)) } }, [services])
  const signInEmail = useCallback(async (email: string, password: string) => { if (!services) return; setError(null); try { await signInWithEmailAndPassword(services.auth, email, password) } catch (cause) { setError(toAuthMessage(cause)) } }, [services])
  const signOutUser = useCallback(async () => { if (services) await signOut(services.auth) }, [services])
  const getIdToken = useCallback(async (forceRefresh = false) => { if (!services?.auth.currentUser) throw new Error('Authentication is required'); return services.auth.currentUser.getIdToken(forceRefresh) }, [services])

  return <AuthContext.Provider value={{ status, user, role, error, signInGoogle, signInEmail, signOutUser, getIdToken }}>{children}</AuthContext.Provider>
}
function toAuthMessage(cause: unknown): string {
  const code = typeof cause === 'object' && cause !== null && 'code' in cause ? String(cause.code) : ''
  if (code.includes('invalid-credential')) return 'The email or password is incorrect.'
  if (code.includes('popup-closed')) return 'Google sign-in was cancelled.'
  if (code.includes('too-many-requests')) return 'Too many attempts. Try again later.'
  return 'Authentication failed. Check your connection and try again.'
}

