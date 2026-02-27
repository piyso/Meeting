import React from 'react'
import './ui.css' // We will put generic UI flex utility classes here

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode
  size?: 'sm' | 'md'
  tooltip?: string
  active?: boolean
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, size = 'md', tooltip, active, className = '', disabled, ...props }, ref) => {
    const activeClass = active ? 'active' : ''
    const sizeClass = size === 'sm' ? 'ui-icon-btn-sm' : 'ui-icon-btn-md'

    const button = (
      <button
        ref={ref}
        disabled={disabled}
        className={`ui-icon-btn ${sizeClass} ${activeClass} ${className}`}
        aria-label={props['aria-label'] || tooltip}
        {...props}
      >
        {icon}
      </button>
    )

    if (tooltip) {
      return (
        <div className="ui-tooltip-wrapper">
          {button}
          {/* A pure CSS tooltip can be added here, or we use the Tooltip component wrapper later */}
        </div>
      )
    }

    return button
  }
)

IconButton.displayName = 'IconButton'
