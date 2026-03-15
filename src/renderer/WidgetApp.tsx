import React, { useEffect, useReducer } from 'react'
import { createRoot } from 'react-dom/client'
import { MiniWidget } from './components/meeting/MiniWidget'
import './index.css'
import type { ElectronAPI } from '../types/ipc'
import { usePowerMode } from './hooks/usePowerMode'

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

import { motion } from 'framer-motion'

// #21: Consolidated widget state into single useReducer (was 10 separate useState calls)
interface WidgetState {
  isRecording: boolean
  isPaused: boolean
  elapsedTime: string
  lastTranscriptLine: string
  audioMode: 'system' | 'microphone' | 'none'
  syncStatus: 'idle' | 'syncing' | 'error'
  liveCoachTip: string | null
  entityCount: number
  noteCount: number
  activeMeetingId: string | null
}

const initialState: WidgetState = {
  isRecording: false,
  isPaused: false,
  elapsedTime: '00:00:00',
  lastTranscriptLine: '',
  audioMode: 'none',
  syncStatus: 'idle',
  liveCoachTip: null,
  entityCount: 0,
  noteCount: 0,
  activeMeetingId: null,
}

type WidgetAction = { type: 'UPDATE'; payload: Partial<WidgetState> }

function widgetReducer(state: WidgetState, action: WidgetAction): WidgetState {
  switch (action.type) {
    case 'UPDATE':
      return { ...state, ...action.payload }
    default:
      return state
  }
}

export const WidgetApp: React.FC = () => {
  const [state, dispatch] = useReducer(widgetReducer, initialState)
  // #24: Wire usePowerMode — disables spring animation when on battery
  const { isPowerSaveMode } = usePowerMode()

  useEffect(() => {
    const unsubscribe = window.electronAPI?.on?.widgetStateUpdated?.(incoming => {
      const updates: Partial<WidgetState> = {
        isRecording: incoming.isRecording,
        isPaused: !!incoming.isPaused,
        elapsedTime: incoming.elapsedTime,
        lastTranscriptLine: incoming.lastTranscriptLine,
      }
      if (incoming.audioMode) updates.audioMode = incoming.audioMode
      if (incoming.syncStatus) updates.syncStatus = incoming.syncStatus
      updates.liveCoachTip = incoming.liveCoachTip || null
      updates.entityCount = incoming.entityCount || 0
      updates.noteCount = incoming.noteCount || 0
      // Track real meetingId from main process
      const meetingId = (incoming as { meetingId?: string }).meetingId
      if (meetingId) updates.activeMeetingId = meetingId

      dispatch({ type: 'UPDATE', payload: updates })
    })

    return () => {
      unsubscribe?.()
    }
  }, [])

  const handleRestore = () => {
    window.electronAPI?.window?.restoreMain()
  }

  const handleStop = () => {
    window.electronAPI?.audio?.stopCapture({ meetingId: state.activeMeetingId || 'current' })
  }

  const handleBookmark = () => {
    window.electronAPI?.widget?.triggerBookmark()
  }

  const handleQuickNote = (text: string) => {
    window.electronAPI?.widget?.submitQuickNote(text)
  }

  const handlePauseToggle = () => {
    window.electronAPI?.widget?.triggerPauseToggle()
  }

  // #24: When on battery, use instant transition instead of spring physics
  const animationProps = isPowerSaveMode
    ? { type: 'tween' as const, duration: 0.15 }
    : { type: 'spring' as const, stiffness: 350, damping: 25, mass: 1.2, bounce: 0.4 }

  return (
    <div className="w-screen h-screen bg-transparent flex items-start justify-center pt-8 p-4 widget-draggable overflow-hidden text-[var(--color-text-primary)]">
      <motion.div
        initial={{ y: -100, opacity: 0, scale: 0.85, filter: 'blur(10px)' }}
        animate={{ y: 0, opacity: 1, scale: 1, filter: 'blur(0px)' }}
        transition={animationProps}
        className="relative pointer-events-auto"
      >
        <MiniWidget
          isRecording={state.isRecording}
          isPaused={state.isPaused}
          elapsedTime={state.elapsedTime}
          lastTranscriptLine={state.lastTranscriptLine}
          audioMode={state.audioMode}
          syncStatus={state.syncStatus}
          liveCoachTip={state.liveCoachTip}
          entityCount={state.entityCount}
          noteCount={state.noteCount}
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
