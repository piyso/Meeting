import React from 'react'
import './ui.css'

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'outline'
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant = 'default', className = '', children, ...props }, ref) => {
    return (
      <span ref={ref} className={`ui-badge badge-${variant} ${className}`} {...props}>
        {children}
      </span>
    )
  }
)

Badge.displayName = 'Badge'
