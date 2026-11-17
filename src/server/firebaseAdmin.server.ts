import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'

import { FirestoreCourseDraftRepository } from './firestoreDraftRepository.js'
import { firebaseTokenVerifier } from './auth.server.js'
import { assertEmulatorTestEnvironment } from './emulatorSafety.js'
import { FirebaseAssetRepository } from './assetRepository.js'
import { PublicationBackend } from './publicationBackend.js'
import { CourseDeliveryService } from './courseDelivery.js'

export function assertSafeAdminEnvironment(environment: NodeJS.ProcessEnv = process.env): void {
  const production = environment.VERCEL_ENV === 'production'
  const authEmulator = Boolean(environment.FIREBASE_AUTH_EMULATOR_HOST)
  const firestoreEmulator = Boolean(environment.FIRESTORE_EMULATOR_HOST)
  if (!environment.FIREBASE_ADMIN_PROJECT_ID) throw new Error('FIREBASE_ADMIN_PROJECT_ID is required')
  if (!production && (!authEmulator || !firestoreEmulator)) throw new Error('Non-production Firebase Admin requires both Auth and Firestore emulators')
  if (!production) assertEmulatorTestEnvironment(environment)
}

export function getAssetServerDependencies() {
  assertSafeAdminEnvironment()
  if (!process.env.VERCEL_ENV && !process.env.FIREBASE_STORAGE_EMULATOR_HOST) throw new Error('Non-production asset service requires the Storage emulator')
  const emulatorMode = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST && process.env.FIRESTORE_EMULATOR_HOST)
  const app = getApps()[0] ?? initializeApp({ ...(emulatorMode ? {} : { credential: applicationDefault() }), projectId: process.env.FIREBASE_ADMIN_PROJECT_ID, storageBucket: `${process.env.FIREBASE_ADMIN_PROJECT_ID}.appspot.com` })
  return { verifier: firebaseTokenVerifier, repository: new FirebaseAssetRepository(getFirestore(app), getStorage(app).bucket(`${process.env.FIREBASE_ADMIN_PROJECT_ID}.appspot.com`)) }
}

export function getServerDependencies() {
  assertSafeAdminEnvironment()
  const emulatorMode = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST && process.env.FIRESTORE_EMULATOR_HOST)
  const app = getApps()[0] ?? initializeApp({ ...(emulatorMode ? {} : { credential: applicationDefault() }), projectId: process.env.FIREBASE_ADMIN_PROJECT_ID })
  return { verifier: firebaseTokenVerifier, repository: new FirestoreCourseDraftRepository(getFirestore(app)) }
}

export function getPublicationServerDependencies() {
  assertSafeAdminEnvironment()
  if (!process.env.VERCEL_ENV && !process.env.FIREBASE_STORAGE_EMULATOR_HOST) throw new Error('Non-production publication service requires the Storage emulator')
  const emulatorMode = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST && process.env.FIRESTORE_EMULATOR_HOST)
  const bucketName = `${process.env.FIREBASE_ADMIN_PROJECT_ID}.appspot.com`
  const app = getApps()[0] ?? initializeApp({ ...(emulatorMode ? {} : { credential: applicationDefault() }), projectId: process.env.FIREBASE_ADMIN_PROJECT_ID, storageBucket: bucketName })
  return { verifier: firebaseTokenVerifier, backend: new PublicationBackend(getFirestore(app), getStorage(app).bucket(bucketName)) }
}

export function getCourseDeliveryServerDependencies() {
  const publication = getPublicationServerDependencies()
  const app = getApps()[0]!
  return { verifier: publication.verifier, service: new CourseDeliveryService(getFirestore(app), getStorage(app).bucket(`${process.env.FIREBASE_ADMIN_PROJECT_ID}.appspot.com`)) }
}
