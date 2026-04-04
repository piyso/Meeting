import React from 'react'
import { motion } from 'framer-motion'

export interface ProgressBarProps {
  value: number // 0 to 100
  color?: 'violet' | 'emerald' | 'rose' | 'amber' | 'blue'
  size?: 'sm' | 'md' | 'lg'
  label?: string
  showValue?: boolean
  className?: string
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  color = 'violet',
  size = 'md',
  label,
  showValue = false,
  className = '',
}) => {
  const clampedValue = Math.min(100, Math.max(0, value))

  const sizeClasses = {
    sm: 'h-1.5',
    md: 'h-2.5',
    lg: 'h-4',
  }

  const bgColorClass = {
    violet: 'bg-violet shadow-[0_0_12px_rgba(167,139,250,0.5)]',
    emerald: 'bg-emerald shadow-[0_0_12px_rgba(52,211,153,0.5)]',
    rose: 'bg-rose shadow-[0_0_12px_rgba(251,113,133,0.5)]',
    amber: 'bg-amber shadow-[0_0_12px_rgba(251,191,36,0.5)]',
    blue: 'bg-blue shadow-[0_0_12px_rgba(59,130,246,0.5)]',
  }[color]

  return (
    <div className={`flex flex-col gap-2 w-full ${className}`}>
      {(label || showValue) && (
        <div className="flex items-center justify-between text-xs font-medium tracking-wide">
          {label && <span className="text-secondary uppercase">{label}</span>}
          {showValue && (
            <span className="text-primary tabular-nums">{Math.round(clampedValue)}%</span>
          )}
        </div>
      )}
      <div
        className={`w-full bg-glass border border-border-subtle rounded-full overflow-hidden ${sizeClasses[size]}`}
      >
        <motion.div
          className={`h-full rounded-full ${bgColorClass}`}
          initial={{ width: 0 }}
          animate={{ width: `${clampedValue}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
    </div>
  )
}
