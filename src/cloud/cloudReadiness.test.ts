import { describe, expect, it } from 'vitest'
import { resolveCloudReadiness } from './cloudReadiness'

describe('cloud readiness guard', () => {
  it('does not enable cloud drafts from Firebase variables alone', () => expect(resolveCloudReadiness({ VITE_FIREBASE_PROJECT_ID: 'production' }).enabled).toBe(false))
  it('requires demo Firebase and loopback Auth in development', () => {
    expect(resolveCloudReadiness({ MODE: 'development', VITE_ENABLE_CLOUD_DRAFTS: 'true', VITE_FIREBASE_PROJECT_ID: 'real-project', VITE_FIREBASE_AUTH_EMULATOR_URL: 'http://localhost:9099' }).enabled).toBe(false)
    expect(resolveCloudReadiness({ MODE: 'development', VITE_ENABLE_CLOUD_DRAFTS: 'true', VITE_FIREBASE_PROJECT_ID: 'demo-ycoders-editor-v2', VITE_FIREBASE_AUTH_EMULATOR_URL: 'http://127.0.0.1:9099' }).enabled).toBe(true)
  })
  it('keeps preview disabled without a second explicit approval switch', () => expect(resolveCloudReadiness({ MODE: 'production', VITE_VERCEL_ENV: 'preview', VITE_ENABLE_CLOUD_DRAFTS: 'true' }).enabled).toBe(false))
})
