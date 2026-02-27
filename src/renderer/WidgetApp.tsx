import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MiniWidget } from './components/meeting/MiniWidget'
import './index.css'
import type { ElectronAPI } from '../types/ipc'

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

// The WidgetApp is a completely separate React tree specifically for the transparent floating window.
export const WidgetApp: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false)
  const [elapsedTime, setElapsedTime] = useState('00:00:00')
  const [lastTranscriptLine, setLastTranscriptLine] = useState('')

  useEffect(() => {
    // Listen for state updates broadcasted from the Main Process
    const unsubscribe = window.electronAPI.on.widgetStateUpdated(state => {
      setIsRecording(state.isRecording)
      setElapsedTime(state.elapsedTime)
      setLastTranscriptLine(state.lastTranscriptLine)
    })

    return () => {
      unsubscribe()
    }
  }, [])

  const handleRestore = () => {
    window.electronAPI.window.restoreMain()
  }

  const handleStop = () => {
    window.electronAPI.audio.stopCapture({ meetingId: 'current' }) // Assuming backend handles empty or 'current' id mapping when resolving active meetings gracefully, or we'll need to pass meetingId in state.
  }

  return (
    <div className="w-screen h-screen bg-transparent flex items-center justify-center widget-draggable overflow-hidden text-[var(--color-text-primary)]">
      {/* 
        This wrapper is crucial for the Grammarly-style floating feel.
        We apply the premium glass surface to the widget bounds, leaving the rest of the window 100% transparent.
      */}
      <div className="surface-glass-premium rounded-[var(--radius-lg)] border border-[rgba(255,255,255,0.1)] shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden">
        <MiniWidget
          isRecording={isRecording}
          elapsedTime={elapsedTime}
          lastTranscriptLine={lastTranscriptLine}
          onRestore={handleRestore}
          onStop={handleStop}
        />
      </div>
    </div>
  )
}

const container = document.getElementById('root')
if (container) {
  const root = createRoot(container)
  root.render(
    <React.StrictMode>
      <WidgetApp />
    </React.StrictMode>
  )
}
