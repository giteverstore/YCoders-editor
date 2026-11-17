import type { ContentDocument } from '../content/core/envelope'

export function documentFingerprint(document: ContentDocument): string {
  return JSON.stringify(document)
}

export function hasUnsavedChanges(document: ContentDocument, savedFingerprint: string | null): boolean {
  return savedFingerprint === null || documentFingerprint(document) !== savedFingerprint
}

export function shouldWarnBeforeNavigation(document: ContentDocument, savedFingerprint: string | null): boolean {
  return hasUnsavedChanges(document, savedFingerprint)
}
