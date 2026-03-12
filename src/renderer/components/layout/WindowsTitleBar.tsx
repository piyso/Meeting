import { useState, useEffect, useCallback } from 'react'
import './WindowsTitleBar.css'

/**
 * Custom Windows title bar with minimize/maximize/close buttons.
 * Only rendered when platform === 'win32'.
 * Styled to match the Sovereign dark glass aesthetic.
 */
export function WindowsTitleBar() {
  const [isMaximized, setIsMaximized] = useState(false)

  // Check initial maximized state
  useEffect(() => {
    window.electronAPI.windowControls.isMaximized().then(setIsMaximized)
  }, [])

  // Listen for maximize/unmaximize events from main process
  useEffect(() => {
    const unsubMaximize = window.electronAPI.on.windowMaximized(() => setIsMaximized(true))
    const unsubUnmaximize = window.electronAPI.on.windowUnmaximized(() => setIsMaximized(false))
    return () => {
      unsubMaximize()
      unsubUnmaximize()
    }
  }, [])

  const handleMinimize = useCallback(() => {
    window.electronAPI.windowControls.minimize()
  }, [])

  const handleMaximize = useCallback(() => {
    window.electronAPI.windowControls.maximize()
  }, [])

  const handleClose = useCallback(() => {
    window.electronAPI.windowControls.close()
  }, [])

  return (
    <div className="windows-titlebar">
      <span className="windows-titlebar__title">BlueArkive</span>
      <div className="windows-titlebar__controls">
        {/* Minimize */}
        <button
          className="windows-titlebar__btn windows-titlebar__btn--minimize"
          onClick={handleMinimize}
          aria-label="Minimize"
          tabIndex={-1}
        >
          <svg viewBox="0 0 10 1" fill="currentColor">
            <rect width="10" height="1" />
          </svg>
        </button>

        {/* Maximize / Restore */}
        <button
          className="windows-titlebar__btn windows-titlebar__btn--maximize"
          onClick={handleMaximize}
          aria-label={isMaximized ? 'Restore' : 'Maximize'}
          tabIndex={-1}
        >
          {isMaximized ? (
            // Restore icon (two overlapping rectangles)
            <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
              <rect x="2" y="0" width="8" height="8" rx="0.5" />
              <rect
                x="0"
                y="2"
                width="8"
                height="8"
                rx="0.5"
                fill="var(--color-bg-primary, #1a1a1a)"
              />
              <rect x="0" y="2" width="8" height="8" rx="0.5" />
            </svg>
          ) : (
            // Maximize icon (single rectangle)
            <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
              <rect x="0.5" y="0.5" width="9" height="9" rx="0.5" />
            </svg>
          )}
        </button>

        {/* Close */}
        <button
          className="windows-titlebar__btn windows-titlebar__btn--close"
          onClick={handleClose}
          aria-label="Close"
          tabIndex={-1}
        >
          <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
            <line x1="0" y1="0" x2="10" y2="10" />
            <line x1="10" y1="0" x2="0" y2="10" />
          </svg>
        </button>
      </div>
    </div>
  )
}
