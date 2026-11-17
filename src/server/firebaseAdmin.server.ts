import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'

import { FirestoreCourseDraftRepository } from './firestoreDraftRepository.js'
import { firebaseTokenVerifier } from './auth.server.js'
import { assertEmulatorTestEnvironment } from './emulatorSafety.js'
import { FirebaseAssetRepository } from './assetRepository.js'
import { PublicationBackend } from './publicationBackend.js'
import { CourseDeliveryService } from './courseDelivery.js'
import { createFirebaseBackendWifCredential, resolveFirebaseBackendWifConfig } from './firebaseBackendCredential.js'

export function assertSafeAdminEnvironment(environment: NodeJS.ProcessEnv = process.env): void {
  const production = environment.VERCEL_ENV === 'production'
  const authEmulator = Boolean(environment.FIREBASE_AUTH_EMULATOR_HOST)
  const firestoreEmulator = Boolean(environment.FIRESTORE_EMULATOR_HOST)
  if (!environment.FIREBASE_ADMIN_PROJECT_ID) throw new Error('FIREBASE_ADMIN_PROJECT_ID is required')
  if (!production && (!authEmulator || !firestoreEmulator)) {
    if (environment.VERCEL_ENV !== 'preview') throw new Error('Non-production Firebase Admin requires both Auth and Firestore emulators')
    resolveFirebaseBackendWifConfig(environment); return
  }
  if (!production) assertEmulatorTestEnvironment(environment)
}

function firebaseOptions(environment: NodeJS.ProcessEnv = process.env) {
  const emulatorMode = Boolean(environment.FIREBASE_AUTH_EMULATOR_HOST && environment.FIRESTORE_EMULATOR_HOST)
  if (emulatorMode) return { projectId: environment.FIREBASE_ADMIN_PROJECT_ID, storageBucket: environment.FIREBASE_STORAGE_BUCKET ?? `${environment.FIREBASE_ADMIN_PROJECT_ID}.appspot.com` }
  if (environment.VERCEL_ENV === 'preview') { const config = resolveFirebaseBackendWifConfig(environment); return { credential: createFirebaseBackendWifCredential(environment), projectId: config.projectId, storageBucket: config.storageBucket } }
  return { credential: applicationDefault(), projectId: environment.FIREBASE_ADMIN_PROJECT_ID, storageBucket: environment.FIREBASE_STORAGE_BUCKET ?? `${environment.FIREBASE_ADMIN_PROJECT_ID}.appspot.com` }
}

export function getAssetServerDependencies() {
  assertSafeAdminEnvironment()
  if (!process.env.VERCEL_ENV && !process.env.FIREBASE_STORAGE_EMULATOR_HOST) throw new Error('Non-production asset service requires the Storage emulator')
  const options = firebaseOptions(), app = getApps()[0] ?? initializeApp(options)
  return { verifier: firebaseTokenVerifier, repository: new FirebaseAssetRepository(getFirestore(app), getStorage(app).bucket(options.storageBucket)) }
}

export function getServerDependencies() {
  assertSafeAdminEnvironment()
  const app = getApps()[0] ?? initializeApp(firebaseOptions())
  return { verifier: firebaseTokenVerifier, repository: new FirestoreCourseDraftRepository(getFirestore(app)) }
}

export function getPublicationServerDependencies() {
  assertSafeAdminEnvironment()
  if (!process.env.VERCEL_ENV && !process.env.FIREBASE_STORAGE_EMULATOR_HOST) throw new Error('Non-production publication service requires the Storage emulator')
  const options = firebaseOptions(), bucketName = options.storageBucket!
  const app = getApps()[0] ?? initializeApp(options)
  return { verifier: firebaseTokenVerifier, backend: new PublicationBackend(getFirestore(app), getStorage(app).bucket(bucketName)) }
}

export function getCourseDeliveryServerDependencies() {
  const publication = getPublicationServerDependencies()
  const app = getApps()[0]!
  return { verifier: publication.verifier, service: new CourseDeliveryService(getFirestore(app), getStorage(app).bucket(firebaseOptions().storageBucket)) }
}
