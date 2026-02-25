import React from 'react'
import { useToast } from '../../hooks/useToast'
import './ui.css'

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToast()

  if (toasts.length === 0) return null

  return (
    <div className="ui-toast-region" aria-live="polite">
      {toasts.map((toast) => (
        <div 
          key={toast.id} 
          className={`ui-toast toast-${toast.type} surface-glass-premium stagger-child`}
          onClick={() => removeToast(toast.id)}
        >
          <div className="ui-toast-title">{toast.title}</div>
          {toast.message && <div className="ui-toast-message">{toast.message}</div>}
        </div>
      ))}
    </div>
  )
}
