import React, { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import './ui.css'

interface TooltipProps {
  content: React.ReactNode
  children: React.ReactElement
  position?: 'top' | 'bottom' | 'left' | 'right'
  delay?: number
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = 'top',
  delay = 300,
}) => {
  const [isVisible, setIsVisible] = useState(false)
  const timer = useRef<NodeJS.Timeout>()

  const onMouseEnter = () => {
    timer.current = setTimeout(() => setIsVisible(true), delay)
  }

  const onMouseLeave = () => {
    if (timer.current) clearTimeout(timer.current)
    setIsVisible(false)
  }

  return (
    <div className="ui-tooltip-container" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      {children}
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{
              opacity: 0,
              scale: 0.95,
              y: position === 'top' ? 4 : position === 'bottom' ? -4 : 0,
            }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{
              opacity: 0,
              scale: 0.95,
              y: position === 'top' ? 4 : position === 'bottom' ? -4 : 0,
            }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className={`ui-tooltip-content tooltip-${position}`}
          >
            {content}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
