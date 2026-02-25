import React from 'react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  icon?: React.ReactNode
  loading?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', icon, loading, className = '', children, disabled, ...props }, ref) => {
    // Determine base classes
    const sizeClasses = {
      sm: 'h-[var(--h-sm)] px-[var(--space-8)] text-[var(--text-xs)]',
      md: 'h-[var(--h-md)] px-[var(--space-12)] text-[var(--text-sm)]',
      lg: 'h-[var(--h-lg)] px-[var(--space-16)] text-[var(--text-base)]',
    }

    const variantClasses = {
      primary: 'bg-[var(--color-violet)] text-[#FFFFFF] shadow-sm',
      secondary: 'bg-[var(--color-bg-glass)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)]',
      ghost: 'bg-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-glass-hover)]',
      danger: 'bg-transparent text-[var(--color-rose)] hover:bg-[rgba(251,113,133,0.1)]',
    }

    const baseClasses = `
      inline-flex items-center justify-center font-body font-medium rounded-[var(--radius-sm)]
      transition-all duration-300 ease-[var(--ease-fluid)] premium-hover
      disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none
    `.trim()

    // Loading overlay
    const contentOpacity = loading ? 'opacity-0' : 'opacity-100'

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className} relative`}
        style={
          {
            // Inject Tailwind arbitrary values manually since we aren't using Tailwind here yet,
            // or simply use native inline styles mapping to our CSS custom properties if preferred.
            // Since we aren't using Tailwind, let's write raw CSS mapped classes:
          }
        }
        {...props}
      >
        <span className={`inline-flex items-center gap-[var(--space-4)] ${contentOpacity}`}>
          {icon && <span className="flex-shrink-0">{icon}</span>}
          {children}
        </span>
        {loading && (
          <span className="absolute inset-0 flex items-center justify-center animate-pulse">
            <svg
              className="w-4 h-4 text-current animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
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
