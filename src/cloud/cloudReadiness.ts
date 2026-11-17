export type CloudReadiness = { enabled: boolean; reason: string | null }

export function resolveCloudReadiness(environment: Record<string, string | undefined> = import.meta.env): CloudReadiness {
  if (environment.VITE_ENABLE_CLOUD_DRAFTS !== 'true') return { enabled: false, reason: 'Cloud drafts are disabled for this deployment.' }
  const mode = environment.MODE ?? environment.NODE_ENV
  if (mode === 'test') return { enabled: true, reason: null }
  if (environment.DEV === 'true' || mode === 'development') {
    const project = environment.VITE_FIREBASE_PROJECT_ID ?? ''
    const authEmulator = environment.VITE_FIREBASE_AUTH_EMULATOR_URL ?? ''
    if (!project.startsWith('demo-') || !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(authEmulator)) {
      return { enabled: false, reason: 'Development cloud drafts require the demo Firebase project and loopback Auth emulator.' }
    }
  }
  const vercelEnvironment = environment.VITE_VERCEL_ENV ?? environment.VERCEL_ENV
  if (vercelEnvironment === 'preview' && environment.VITE_ENABLE_PREVIEW_CLOUD_DRAFTS !== 'true') {
    return { enabled: false, reason: 'Cloud drafts are disabled in Preview until an isolated backend is approved.' }
  }
  return { enabled: true, reason: null }
}

export const cloudReadiness = resolveCloudReadiness()
