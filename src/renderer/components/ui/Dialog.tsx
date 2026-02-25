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
  // ESC to close
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  const titleId = React.useId()

  return createPortal(
    <div className="ui-dialog-overlay" onClick={onClose}>
      <div 
        className="ui-dialog-content surface-glass-premium slide-up" 
        style={{ width }} 
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
      >
        {title && <div className="ui-dialog-header"><h2 id={titleId}>{title}</h2></div>}
        <div className="ui-dialog-body">
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}
