import React, { useState, useEffect, useRef, useCallback } from 'react'
import './ui.css'

interface SplitPaneProps {
  top: React.ReactNode
  bottom: React.ReactNode
  defaultRatio?: number // 0 to 1
  minTopHeight?: number
  minBottomHeight?: number
  orientation?: 'horizontal' | 'vertical' // We only use vertical (top/bottom) currently per spec, but extensible
}

export const SplitPane: React.FC<SplitPaneProps> = ({
  top,
  bottom,
  defaultRatio = 0.6,
  minTopHeight = 150,
  minBottomHeight = 150,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const dragState = useRef({ isDragging: false, currentRatio: defaultRatio })
  const [ratio, setRatio] = useState(defaultRatio)

  // Load saved ratio on mount
  useEffect(() => {
    const saved = localStorage.getItem('bluearkive-split-ratio')
    if (saved) {
      const parsed = parseFloat(saved)
      if (!isNaN(parsed) && parsed > 0.1 && parsed < 0.9) {
        setRatio(parsed)
        dragState.current.currentRatio = parsed
      }
    }
  }, [])

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    dragState.current.isDragging = true
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
  }

  const handlePointerUp = useCallback(() => {
    if (dragState.current.isDragging) {
      dragState.current.isDragging = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      // Sync React state and save
      const finalRatio = dragState.current.currentRatio
      setRatio(finalRatio)
      localStorage.setItem('bluearkive-split-ratio', finalRatio.toString())
    }
  }, [])

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragState.current.isDragging || !containerRef.current) return

      const rect = containerRef.current.getBoundingClientRect()
      let newRatio = (e.clientY - rect.top) / rect.height

      const topPx = newRatio * rect.height
      const bottomPx = (1 - newRatio) * rect.height

      if (topPx < minTopHeight) {
        newRatio = minTopHeight / rect.height
      } else if (bottomPx < minBottomHeight) {
        newRatio = 1 - minBottomHeight / rect.height
      }

      dragState.current.currentRatio = newRatio

      // Direct DOM mutation for 60fps
      if (topRef.current && bottomRef.current) {
        topRef.current.style.height = `${newRatio * 100}%`
        bottomRef.current.style.height = `${(1 - newRatio) * 100}%`
      }
    },
    [minTopHeight, minBottomHeight]
  )

  useEffect(() => {
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointermove', handlePointerMove)
    return () => {
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointermove', handlePointerMove)
    }
  }, [handlePointerUp, handlePointerMove])

  // Flex basis for mathematical smoothness
  const topStyle = { flexBasis: `calc(${ratio * 100}% - 4px)` } // Account for half the 8px divider
  const bottomStyle = { flexBasis: `calc(${(1 - ratio) * 100}% - 4px)` }

  return (
    <div ref={containerRef} className="ui-split-container">
      <div ref={topRef} className="ui-split-pane top-pane" style={topStyle}>
        {top}
      </div>

      <div className="ui-split-divider" onPointerDown={handlePointerDown}>
        <div className="ui-split-handle" />
      </div>

      <div ref={bottomRef} className="ui-split-pane bottom-pane" style={bottomStyle}>
        {bottom}
      </div>
    </div>
  )
}
