import { X } from 'lucide-react'
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'

type Props = {
  title: string
  eyebrow?: string
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
  onClose: () => void
}

export function ModalDialog({ title, eyebrow, description, children, footer, className = '', onClose }: Props) {
  const dialog = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.current?.querySelector<HTMLElement>('input,button,select,textarea,[tabindex]:not([tabindex="-1"])')?.focus()
    return () => { document.body.style.overflow = previousOverflow; prior?.focus() }
  }, [])
  const keyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
    if (event.key !== 'Tab' || !dialog.current) return
    const items = [...dialog.current.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
    if (!items.length) return
    const first = items[0], last = items.at(-1)!
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div ref={dialog} className={`modal-dialog ${className}`} role="dialog" aria-modal="true" aria-labelledby="modal-dialog-title" onKeyDown={keyDown}>
      <header className="modal-dialog__header"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2 id="modal-dialog-title">{title}</h2>{description && <div className="modal-dialog__description">{description}</div>}</div><button className="icon-button" type="button" aria-label={`Close ${title}`} onClick={onClose}><X size={18} /></button></header>
      <div className="modal-dialog__body">{children}</div>
      {footer && <footer className="modal-dialog__footer">{footer}</footer>}
    </div>
  </div>
}
