import React from 'react'
import { motion } from 'framer-motion'
import { Check } from 'lucide-react'

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label?: React.ReactNode
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ checked, onCheckedChange, label, className = '', disabled, ...props }, ref) => {
    return (
      <label
        className={`inline-flex items-center gap-3 cursor-pointer select-none group ${
          disabled ? 'opacity-50 cursor-not-allowed' : ''
        } ${className}`}
      >
        <div className="relative flex items-center justify-center">
          <input
            type="checkbox"
            className="sr-only"
            checked={checked}
            onChange={e => !disabled && onCheckedChange(e.target.checked)}
            disabled={disabled}
            ref={ref}
            {...props}
          />
          <motion.div
            className={`w-5 h-5 rounded-[6px] border flex items-center justify-center transition-colors duration-200 ${
              checked
                ? 'bg-emerald border-emerald shadow-[0_0_12px_rgba(52,211,153,0.3)]'
                : 'bg-glass border-border-subtle group-hover:border-border'
            }`}
            animate={{
              scale: checked ? [1, 0.8, 1.1, 1] : 1,
            }}
            transition={{ duration: 0.3 }}
          >
            <motion.div
              initial={false}
              animate={{ opacity: checked ? 1 : 0, scale: checked ? 1 : 0.5 }}
              transition={{ duration: 0.2 }}
            >
              <Check size={14} strokeWidth={3} className="text-panel" />
            </motion.div>
          </motion.div>
          {/* Focus Ring */}
          <div className="absolute inset-0 rounded-[6px] ring-2 ring-violet ring-offset-2 ring-offset-base opacity-0 group-focus-within:opacity-100 transition-opacity pointer-events-none" />
        </div>
        {label && (
          <span
            className={`text-sm transition-colors duration-200 ${
              checked ? 'text-secondary line-through' : 'text-primary'
            }`}
          >
            {label}
          </span>
        )}
      </label>
    )
  }
)

Checkbox.displayName = 'Checkbox'
