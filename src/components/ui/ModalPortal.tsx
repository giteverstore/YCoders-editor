import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export const MODAL_PORTAL_TARGET = 'document.body'
export function modalPortalTarget(documentLike: Pick<Document, 'body'>) { return documentLike.body }

let scrollLocks = 0
let priorBodyOverflow = ''
let priorRootOverflow = ''

export function lockModalScroll(documentLike: Pick<Document, 'body' | 'documentElement'>) {
  if (scrollLocks === 0) {
    priorBodyOverflow = documentLike.body.style.overflow
    priorRootOverflow = documentLike.documentElement.style.overflow
    documentLike.body.style.overflow = 'hidden'
    documentLike.documentElement.style.overflow = 'hidden'
  }
  scrollLocks += 1
  return () => {
    scrollLocks = Math.max(0, scrollLocks - 1)
    if (scrollLocks === 0) {
      documentLike.body.style.overflow = priorBodyOverflow
      documentLike.documentElement.style.overflow = priorRootOverflow
    }
  }
}

export function ModalPortal({ children }: { children: ReactNode }) {
  useEffect(() => lockModalScroll(window.document), [])
  return typeof globalThis.document === 'undefined' ? children : createPortal(children, modalPortalTarget(globalThis.document))
}
