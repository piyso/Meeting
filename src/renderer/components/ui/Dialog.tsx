import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import './ui.css'

interface DialogProps {
  open: boolean
  onClose: () => void
  title?: React.ReactNode
  children: React.ReactNode
  width?: number
}

export const Dialog: React.FC<DialogProps> = ({ open, onClose, title, children, width = 440 }) => {
  const dialogRef = React.useRef<HTMLDivElement>(null)

  // ESC to close and Focus Trap
  useEffect(() => {
    if (!open) return

    // Auto focus the dialog itself or its first focusable child
    if (dialogRef.current) {
      dialogRef.current.focus()
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
        return
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusableElements = dialogRef.current.querySelectorAll(
          'a[href], button, textarea, input[type="text"], input[type="radio"], input[type="checkbox"], select, [tabindex]:not([tabindex="-1"])'
        )
        const firstElement = focusableElements[0] as HTMLElement
        const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement

        if (!e.shiftKey && document.activeElement === lastElement) {
          firstElement?.focus()
          e.preventDefault()
        } else if (e.shiftKey && document.activeElement === firstElement) {
          lastElement?.focus()
          e.preventDefault()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  const titleId = React.useId()

  if (!open) return null

  return createPortal(
    <div className="ui-dialog-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="ui-dialog-content surface-glass-premium slide-up focus:outline-none"
        style={{ width }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
      >
        {title && (
          <div className="ui-dialog-header">
            <h2 id={titleId}>{title}</h2>
          </div>
        )}
        <div className="ui-dialog-body">{children}</div>
      </div>
    </div>,
    document.body
  )
}
