import React from 'react'
import './ui.css'

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  options: { value: string; label: string }[]
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, className = '', ...props }, ref) => {
    return (
      <div className={`ui-select-group ${className}`}>
        {label && <label className="ui-select-label">{label}</label>}
        <div className="ui-select-wrapper">
          <select ref={ref} className="ui-select" {...props}>
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {/* Custom chevron overlay to replace native OSX dropdown styling */}
          <span className="ui-select-chevron">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </span>
        </div>
      </div>
    )
  }
)

Select.displayName = 'Select'
