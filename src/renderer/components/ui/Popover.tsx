import React, { useState, useRef, useEffect, ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'

export interface PopoverProps {
  trigger: ReactNode
  content: ReactNode
  position?: 'top' | 'bottom' | 'left' | 'right'
  className?: string
}

export const Popover: React.FC<PopoverProps> = ({
  trigger,
  content,
  position = 'bottom',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef<HTMLDivElement>(null)
  const [coords, setCoords] = useState({ top: 0, left: 0 })

  const updateCoords = React.useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()

    // Very basic positioning logic. For production, consider @floating-ui/react.
    let top = rect.bottom + 8
    const left = rect.left + rect.width / 2

    if (position === 'top') {
      top = rect.top - 8
    }

    setCoords({ top, left })
  }, [position])

  useEffect(() => {
    if (isOpen) {
      updateCoords()
      window.addEventListener('resize', updateCoords)
      window.addEventListener('scroll', updateCoords, true)
    }
    return () => {
      window.removeEventListener('resize', updateCoords)
      window.removeEventListener('scroll', updateCoords, true)
    }
  }, [isOpen, updateCoords])

  // Close when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        // Find if they clicked in the portal
        const target = e.target as HTMLElement
        if (!target.closest('.ui-popover-content')) {
          setIsOpen(false)
        }
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClick)
    }
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen])

  return (
    <>
      <div ref={triggerRef} onClick={() => setIsOpen(!isOpen)} className="inline-block">
        {trigger}
      </div>

      {isOpen &&
        createPortal(
          <AnimatePresence>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)} // Overlay click closes it
            >
              <motion.div
                initial={{ opacity: 0, y: position === 'bottom' ? -4 : 4, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: position === 'bottom' ? -4 : 4, scale: 0.95 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className={`ui-popover-content fixed z-50 bg-panel backdrop-blur-xl border border-border-subtle shadow-macos-lg rounded-xl p-3 transform -translate-x-1/2 ${
                  position === 'top' ? '-translate-y-full' : ''
                } ${className}`}
                style={{
                  top: coords.top,
                  left: coords.left,
                }}
                onClick={e => e.stopPropagation()}
              >
                {content}
              </motion.div>
            </div>
          </AnimatePresence>,
          document.body
        )}
    </>
  )
}
