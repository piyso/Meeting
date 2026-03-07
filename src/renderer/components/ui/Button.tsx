import React from 'react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  icon?: React.ReactNode
  loading?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      icon,
      loading,
      className = '',
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const variantClass = variant ? `ui-btn-${variant}` : ''
    const sizeClass = size ? `ui-btn-${size}` : ''

    // Loading overlay handled in span directly

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`ui-btn ${variantClass} ${sizeClass} premium-hover ${className}`}
        aria-label={props['aria-label'] || (typeof children === 'string' ? children : undefined)}
        {...props}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-4)',
            opacity: loading ? 0 : 1,
            transition: 'opacity 0.2s',
          }}
        >
          {icon && <span style={{ flexShrink: 0 }}>{icon}</span>}
          {children}
        </span>
        {loading && (
          <span
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg
              className="ui-btn-loading-spinner"
              style={{ width: '16px', height: '16px', color: 'currentColor' }}
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
          </span>
        )}
      </button>
    )
  }
)

Button.displayName = 'Button'
