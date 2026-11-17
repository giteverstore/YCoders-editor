import { LogIn, Sparkles } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'

import { useAuth } from './authContext'

export function LoginPage() {
  const auth = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  if (auth.status === 'authorized') return <Navigate to="/courses" replace />
  const submit = async (event: FormEvent) => { event.preventDefault(); setSubmitting(true); await auth.signInEmail(email, password); setSubmitting(false) }
  return <main className="login-page"><section className="login-card"><span className="brand__mark"><Sparkles size={20} /></span><p className="eyebrow">Ycoders Editor Studio</p><h1>Sign in to author content</h1><p>Use an existing Ycoders Firebase Admin identity.</p>{auth.status === 'unconfigured' && <div className="auth-error">Firebase client configuration is missing. See <code>.env.example</code>.</div>}{auth.error && <div className="auth-error" role="alert">{auth.error}</div>}<button className="google-button" disabled={submitting || auth.status === 'unconfigured'} onClick={async () => { setSubmitting(true); await auth.signInGoogle(); setSubmitting(false) }}>Continue with Google</button><div className="login-divider"><span>or email and password</span></div><form onSubmit={submit}><label>Email<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label><button className="button button--primary" disabled={submitting || auth.status === 'unconfigured'}><LogIn size={16} />{submitting ? 'Signing in…' : 'Sign in'}</button></form><small>Authorization is determined only by the verified <code>adminRole</code> custom claim.</small></section></main>
}
