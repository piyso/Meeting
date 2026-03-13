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

import { motion } from 'framer-motion'

export const WidgetApp: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [elapsedTime, setElapsedTime] = useState('00:00:00')
  const [lastTranscriptLine, setLastTranscriptLine] = useState('')
  const [audioMode, setAudioMode] = useState<'system' | 'microphone' | 'none'>('none')
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle')
  const [liveCoachTip, setLiveCoachTip] = useState<string | null>(null)
  const [entityCount, setEntityCount] = useState(0)
  const [noteCount, setNoteCount] = useState(0)
  const [activeMeetingId, setActiveMeetingId] = useState<string | null>(null)

  useEffect(() => {
    const unsubscribe = window.electronAPI.on.widgetStateUpdated(state => {
      setIsRecording(state.isRecording)
      setIsPaused(!!state.isPaused)
      setElapsedTime(state.elapsedTime)
      setLastTranscriptLine(state.lastTranscriptLine)
      if (state.audioMode) setAudioMode(state.audioMode)
      if (state.syncStatus) setSyncStatus(state.syncStatus)
      setLiveCoachTip(state.liveCoachTip || null)
      setEntityCount(state.entityCount || 0)
      setNoteCount(state.noteCount || 0)
      // I21 fix: Track real meetingId from main process state
      if ((state as { meetingId?: string }).meetingId) {
        setActiveMeetingId((state as { meetingId?: string }).meetingId ?? null)
      }
    })

    return () => {
      unsubscribe()
    }
  }, [])

  const handleRestore = () => {
    window.electronAPI.window.restoreMain()
  }

  const handleStop = () => {
    // I21 fix: Use the activeMeetingId from the state pushed by main process
    // rather than hardcoded 'current'. The main process pushes meetingId
    // via widgetStateUpdated, so we track it in local state.
    window.electronAPI.audio.stopCapture({ meetingId: activeMeetingId || 'current' })
  }

  const handleBookmark = () => {
    window.electronAPI.widget.triggerBookmark()
  }

  const handleQuickNote = (text: string) => {
    window.electronAPI.widget.submitQuickNote(text)
  }

  const handlePauseToggle = () => {
    window.electronAPI.widget.triggerPauseToggle()
  }

  return (
    <div className="w-screen h-screen bg-transparent flex items-start justify-center pt-8 p-4 widget-draggable overflow-hidden text-[var(--color-text-primary)]">
      <motion.div
        initial={{ y: -100, opacity: 0, scale: 0.85, filter: 'blur(10px)' }}
        animate={{ y: 0, opacity: 1, scale: 1, filter: 'blur(0px)' }}
        transition={{
          type: 'spring',
          stiffness: 350,
          damping: 25,
          mass: 1.2,
          bounce: 0.4,
        }}
        className="relative pointer-events-auto"
      >
        <MiniWidget
          isRecording={isRecording}
          isPaused={isPaused}
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
          onPauseToggle={handlePauseToggle}
        />
      </motion.div>
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
