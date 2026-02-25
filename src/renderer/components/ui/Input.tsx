import React from 'react'
import './ui.css'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  icon?: React.ReactNode
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, className = '', ...props }, ref) => {
    const hasIconClass = icon ? 'has-icon' : ''
    const hasErrorClass = error ? 'has-error' : ''

    return (
      <div className={`ui-input-group ${className}`}>
        {label && <label className="ui-input-label">{label}</label>}
        <div className="ui-input-wrapper">
          {icon && <span className="ui-input-icon">{icon}</span>}
          <input
            ref={ref}
            className={`ui-input ${hasIconClass} ${hasErrorClass}`}
            {...props}
          />
        </div>
        {error && <span className="ui-input-error">{error}</span>}
      </div>
    )
  }
)

Input.displayName = 'Input'
