import type { User } from 'firebase/auth'
import { createContext, useContext } from 'react'

import type { AdminRole } from './permissions'

export type AuthStatus = 'loading' | 'unauthenticated' | 'authorized' | 'denied' | 'unconfigured'
export type AuthContextValue = {
  status: AuthStatus
  user: User | null
  role: AdminRole | null
  error: string | null
  signInGoogle: () => Promise<void>
  signInEmail: (email: string, password: string) => Promise<void>
  signOutUser: () => Promise<void>
  getIdToken: (forceRefresh?: boolean) => Promise<string>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
export function useAuth(): AuthContextValue { const value = useContext(AuthContext); if (!value) throw new Error('useAuth must be used within AuthProvider'); return value }
