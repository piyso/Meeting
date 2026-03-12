import React from 'react'
import './ui.css'

import { motion, HTMLMotionProps } from 'framer-motion'

interface BadgeProps extends Omit<HTMLMotionProps<'span'>, 'children'> {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'outline'
  children: React.ReactNode
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant = 'default', className = '', children, ...props }, ref) => {
    return (
      <motion.span
        ref={ref}
        className={`ui-badge badge-${variant} ${className}`}
        whileHover={{
          y: -1,
          scale: 1.02,
          transition: { type: 'spring', stiffness: 350, damping: 28, mass: 0.8 },
        }}
        whileTap={{
          scale: 0.95,
          transition: { type: 'spring', stiffness: 350, damping: 28, mass: 0.8 },
        }}
        {...props}
      >
        {children}
      </motion.span>
    )
  }
)

Badge.displayName = 'Badge'
