import React from 'react'
import './ui.css'

interface ToggleProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string
}

export const Toggle = React.forwardRef<HTMLInputElement, ToggleProps>(
  ({ label, className = '', ...props }, ref) => {
    return (
      <label className={`ui-toggle-wrapper ${className}`}>
        <div className="ui-toggle">
          <input type="checkbox" className="ui-toggle-input sr-only" ref={ref} {...props} />
          <div className="ui-toggle-bg"></div>
          <div className="ui-toggle-thumb"></div>
        </div>
        {label && <span className="ui-toggle-label">{label}</span>}
      </label>
    )
  }
)

Toggle.displayName = 'Toggle'
