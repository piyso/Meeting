import React, { useState, useRef } from 'react'
import './ui.css'

interface TooltipProps {
  content: React.ReactNode
  children: React.ReactElement
  position?: 'top' | 'bottom' | 'left' | 'right'
  delay?: number
}

export const Tooltip: React.FC<TooltipProps> = ({ content, children, position = 'top', delay = 300 }) => {
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
      {isVisible && (
        <div className={`ui-tooltip-content tooltip-${position} stagger-child`}>
          {content}
        </div>
      )}
    </div>
  )
}
