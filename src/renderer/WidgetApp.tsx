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
  const [audioMode, setAudioMode] = useState<'system' | 'microphone' | 'none'>('none')
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle')
  const [liveCoachTip, setLiveCoachTip] = useState<string | null>(null)
  const [entityCount, setEntityCount] = useState(0)
  const [noteCount, setNoteCount] = useState(0)

  useEffect(() => {
    const unsubscribe = window.electronAPI.on.widgetStateUpdated(state => {
      setIsRecording(state.isRecording)
      setElapsedTime(state.elapsedTime)
      setLastTranscriptLine(state.lastTranscriptLine)
      if (state.audioMode) setAudioMode(state.audioMode)
      if (state.syncStatus) setSyncStatus(state.syncStatus)
      setLiveCoachTip(state.liveCoachTip || null)
      setEntityCount(state.entityCount || 0)
      setNoteCount(state.noteCount || 0)
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

  const handleBookmark = () => {
    // We send a generic event to the main window to trigger bookmark globally
    window.electronAPI.widget.triggerBookmark()
  }

  const handleQuickNote = (text: string) => {
    window.electronAPI.widget.submitQuickNote(text)
  }

  return (
    <div className="w-screen h-screen bg-transparent flex items-end justify-end p-4 widget-draggable overflow-hidden text-[var(--color-text-primary)]">
      <MiniWidget
        isRecording={isRecording}
        elapsedTime={elapsedTime}
        lastTranscriptLine={lastTranscriptLine}
        audioMode={audioMode}
        syncStatus={syncStatus}
        liveCoachTip={liveCoachTip}
        entityCount={entityCount}
        noteCount={noteCount}
        onRestore={handleRestore}
        onStop={handleStop}
        onBookmark={handleBookmark}
        onQuickNote={handleQuickNote}
      />
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
