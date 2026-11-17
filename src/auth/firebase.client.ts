import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth'

const keys = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID', 'VITE_FIREBASE_MESSAGING_SENDER_ID'] as const

export type FirebaseClientServices = { app: FirebaseApp; auth: Auth }
let services: FirebaseClientServices | null | undefined

export function getFirebaseClientServices(): FirebaseClientServices | null {
  if (services !== undefined) return services
  const values = Object.fromEntries(keys.map((key) => [key, import.meta.env[key] as string | undefined])) as Record<(typeof keys)[number], string | undefined>
  if (keys.some((key) => !values[key]?.trim())) { services = null; return services }
  const app = getApps().length ? getApp() : initializeApp({ apiKey: values.VITE_FIREBASE_API_KEY, authDomain: values.VITE_FIREBASE_AUTH_DOMAIN, projectId: values.VITE_FIREBASE_PROJECT_ID, appId: values.VITE_FIREBASE_APP_ID, messagingSenderId: values.VITE_FIREBASE_MESSAGING_SENDER_ID })
  const auth = getAuth(app)
  if (import.meta.env.DEV && import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL) connectAuthEmulator(auth, import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL as string, { disableWarnings: true })
  services = { app, auth }
  return services
}
