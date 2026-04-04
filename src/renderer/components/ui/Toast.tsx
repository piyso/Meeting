import React from 'react'
import { useToast } from '../../hooks/useToast'
import './ui.css'

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToast()

  if (toasts.length === 0) return null

  return (
    <div className="ui-toast-region" aria-live="polite">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`ui-toast toast-${toast.type} surface-glass-premium stagger-child`}
        >
          <div className="flex-1 min-w-0" onClick={() => removeToast(toast.id)}>
            <div className="ui-toast-title">{toast.title}</div>
            {toast.message && <div className="ui-toast-message">{toast.message}</div>}
          </div>
          {toast.undoAction && (
            <button
              onClick={e => {
                e.stopPropagation()
                toast.undoAction?.()
                removeToast(toast.id)
              }}
              className="ml-3 px-3 py-1.5 text-xs font-semibold rounded-md bg-white/10 hover:bg-white/20 transition-colors text-white whitespace-nowrap"
            >
              {toast.undoLabel || 'Undo'}
            </button>
          )}
          {!toast.undoAction && (
            <button
              onClick={e => {
                e.stopPropagation()
                removeToast(toast.id)
              }}
              className="ml-3 p-1.5 opacity-50 hover:opacity-100 transition-opacity"
              aria-label="Close"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
