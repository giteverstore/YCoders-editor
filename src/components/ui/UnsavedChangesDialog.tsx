import { AlertTriangle } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { ModalPortal } from './ModalPortal'

type Props = { open: boolean; onStay: () => void; onDiscard: () => void }

export function UnsavedChangesDialog({ open, onStay, onDiscard }: Props) {
  const stayButton = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    stayButton.current?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onStay(); return }
      if (event.key !== 'Tab' || !dialog.current) return
      const controls = [...dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled)')]
      if (!controls.length) return
      const first = controls[0]; const last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', keydown)
    return () => { window.removeEventListener('keydown', keydown); previouslyFocused?.focus() }
  }, [onStay, open])
  if (!open) return null
  return <ModalPortal><div className="dialog-backdrop"><div ref={dialog} className="confirmation-dialog" role="alertdialog" aria-modal="true" aria-labelledby="unsaved-title" aria-describedby="unsaved-description"><span className="confirmation-dialog__icon"><AlertTriangle size={22} /></span><h2 id="unsaved-title">Discard unsaved changes?</h2><p id="unsaved-description">This course has changes that have not been saved to this browser. Leaving now will permanently discard those changes.</p><div><button ref={stayButton} type="button" className="button button--primary" onClick={onStay}>Stay and continue editing</button><button type="button" className="button button--danger" onClick={onDiscard}>Discard changes and leave</button></div></div></div></ModalPortal>
}
