export const EMULATOR_PROJECT_ID = 'demo-ycoders-editor-v2'

export function assertEmulatorTestEnvironment(environment: NodeJS.ProcessEnv = process.env): void {
  const projectValues = [environment.GCLOUD_PROJECT, environment.GOOGLE_CLOUD_PROJECT, environment.FIREBASE_PROJECT_ID, environment.FIREBASE_ADMIN_PROJECT_ID].filter(Boolean)
  if (!projectValues.length || projectValues.some((project) => project !== EMULATOR_PROJECT_ID)) throw new Error(`Every configured emulator project ID must equal ${EMULATOR_PROJECT_ID}`)
  assertLoopbackHost('FIREBASE_AUTH_EMULATOR_HOST', environment.FIREBASE_AUTH_EMULATOR_HOST)
  assertLoopbackHost('FIRESTORE_EMULATOR_HOST', environment.FIRESTORE_EMULATOR_HOST)
  if (environment.GOOGLE_APPLICATION_CREDENTIALS) throw new Error('Emulator tests reject GOOGLE_APPLICATION_CREDENTIALS')
  if (environment.VERCEL_ENV === 'production') throw new Error('Emulator tests cannot run with VERCEL_ENV=production')
  if (environment.FIREBASE_CONFIG) {
    try { const config = JSON.parse(environment.FIREBASE_CONFIG) as { projectId?: string }; if (config.projectId !== EMULATOR_PROJECT_ID) throw new Error('FIREBASE_CONFIG project does not match the emulator project') }
    catch (error) { if (error instanceof Error && error.message.includes('does not match')) throw error; throw new Error('FIREBASE_CONFIG must be inline demo-project JSON during emulator tests', { cause: error }) }
  }
}

function assertLoopbackHost(name: string, value: string | undefined): void {
  if (!value) throw new Error(`${name} is required for emulator tests`)
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(value)) throw new Error(`${name} must use a loopback host and explicit port`)
}
