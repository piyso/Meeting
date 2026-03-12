import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import '../ui/ui.css'

export type EntityType = 'PERSON' | 'DATE' | 'AMOUNT' | 'ACTION_ITEM'

interface SmartChipProps {
  type: EntityType
  label: string
  onClick?: () => void
}

export const SmartChip: React.FC<SmartChipProps> = ({ type, label, onClick }) => {
  const [isHovered, setIsHovered] = useState(false)

  const getIcon = () => {
    switch (type) {
      case 'PERSON':
        return '👤'
      case 'DATE':
        return '📅'
      case 'AMOUNT':
        return '💰'
      case 'ACTION_ITEM':
        return '⚡'
    }
  }

  const getTooltip = () => {
    switch (type) {
      case 'PERSON':
        return 'View contact'
      case 'DATE':
        return 'Add to calendar'
      case 'AMOUNT':
        return 'Track in financing'
      case 'ACTION_ITEM':
        return 'Assign task'
    }
  }

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <motion.button
        className={`ui-smart-chip chip-${type.toLowerCase()}`}
        whileHover={{
          y: -2,
          scale: 1.05,
          transition: { type: 'spring', stiffness: 350, damping: 28, mass: 0.8 },
        }}
        whileTap={{ scale: 0.95 }}
        onClick={e => {
          if (onClick) {
            e.stopPropagation()
            onClick()
          }
        }}
        disabled={!onClick}
      >
        <span className="chip-icon">{getIcon()}</span>
        <span className="chip-label">{label}</span>
      </motion.button>

      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 350, damping: 28, mass: 0.8 }}
            className="absolute z-50 bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 min-w-max px-3 py-1.5 rounded-md bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] backdrop-blur-md shadow-xl text-[var(--color-text-secondary)] text-[10px] font-medium tracking-wide font-sans pointer-events-none"
          >
            {getTooltip()}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
