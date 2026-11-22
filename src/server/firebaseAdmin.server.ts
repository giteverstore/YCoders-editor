import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { Firestore } from '@google-cloud/firestore'
import { Storage } from '@google-cloud/storage'

import { FirestoreCourseDraftRepository } from './firestoreDraftRepository.js'
import { firebaseTokenVerifier } from './auth.server.js'
import { assertEmulatorTestEnvironment } from './emulatorSafety.js'
import { FirebaseAssetRepository } from './assetRepository.js'
import { PublicationBackend } from './publicationBackend.js'
import { CourseDeliveryService } from './courseDelivery.js'
import { createFirebaseBackendWifAuthClient, createFirebaseBackendWifCredential, resolveFirebaseBackendWifConfig } from './firebaseBackendCredential.js'
import { PracticeDeliveryService } from './practiceDelivery.js'
import { FirestoreChallengeCandidateSource } from './challengeCandidateService.js'

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

function firebaseResources(environment: NodeJS.ProcessEnv = process.env) {
  assertSafeAdminEnvironment(environment)
  const options = firebaseOptions(environment)
  const app = getApps()[0] ?? initializeApp(options)
  if (environment.VERCEL_ENV === 'preview' && !environment.FIRESTORE_EMULATOR_HOST) {
    const config = resolveFirebaseBackendWifConfig(environment), authClient = createFirebaseBackendWifAuthClient(environment)
    return { app, firestore: new Firestore({ projectId: config.projectId, databaseId: '(default)', preferRest: true, authClient }), bucket: new Storage({ projectId: config.projectId, authClient }).bucket(config.storageBucket) }
  }
  return { app, firestore: getFirestore(app), bucket: getStorage(app).bucket(options.storageBucket) }
}

export function getAssetServerDependencies() {
  if (!process.env.VERCEL_ENV && !process.env.FIREBASE_STORAGE_EMULATOR_HOST) throw new Error('Non-production asset service requires the Storage emulator')
  const resources = firebaseResources()
  return { verifier: firebaseTokenVerifier, repository: new FirebaseAssetRepository(resources.firestore, resources.bucket) }
}

export function getServerDependencies() {
  const resources = firebaseResources()
  return { verifier: firebaseTokenVerifier, repository: new FirestoreCourseDraftRepository(resources.firestore) }
}

export function getPublicationServerDependencies() {
  if (!process.env.VERCEL_ENV && !process.env.FIREBASE_STORAGE_EMULATOR_HOST) throw new Error('Non-production publication service requires the Storage emulator')
  const resources = firebaseResources()
  return { verifier: firebaseTokenVerifier, backend: new PublicationBackend(resources.firestore, resources.bucket, undefined, new FirestoreChallengeCandidateSource(resources.firestore)) }
}

export function getChallengeCandidateServerDependencies() { const resources = firebaseResources(); return { verifier: firebaseTokenVerifier, source: new FirestoreChallengeCandidateSource(resources.firestore) } }

export function getCourseDeliveryServerDependencies() {
  const publication = getPublicationServerDependencies()
  const resources = firebaseResources()
  return { verifier: publication.verifier, service: new CourseDeliveryService(resources.firestore, resources.bucket) }
}

export function getPracticeDeliveryServerDependencies() {
  const publication = getPublicationServerDependencies()
  const resources = firebaseResources()
  return { verifier: publication.verifier, service: new PracticeDeliveryService(resources.firestore, resources.bucket) }
}
