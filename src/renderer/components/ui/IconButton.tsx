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
    const sizeMap = {
      sm: 'w-[24px] h-[24px]',
      md: 'w-[32px] h-[32px]',
    }

    const stateClasses = active
      ? 'bg-[var(--color-bg-glass)] border-[var(--color-border-subtle)] text-white'
      : 'bg-transparent text-[var(--color-text-secondary)] hover:text-white hover:bg-[var(--color-bg-glass-hover)]'

    const baseStaticRawClasses = `ui-icon-btn ${sizeMap[size]} ${stateClasses}`

    const button = (
      <button
        ref={ref}
        disabled={disabled}
        className={`${baseStaticRawClasses} ${className}`}
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
