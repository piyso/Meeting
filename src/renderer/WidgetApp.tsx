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
  recordingStartTime?: number | null
  recordingTotalPausedMs?: number
  handoffState: 'expanded' | 'orb' | 'hidden'
}

const initialState: WidgetState = {
  isRecording: true,
  isPaused: false,
  elapsedTime: '01:24:03',
  lastTranscriptLine:
    'So if we integrate the new API with the existing auth layer, we should be able to bypass the latency issue.',
  audioMode: 'microphone',
  syncStatus: 'syncing',
  liveCoachTip: 'Action Item detected: "Schedule a follow-up meeting with the engineering team."',
  entityCount: 12,
  noteCount: 3,
  activeMeetingId: 'mock-123',
  recordingStartTime: Date.now() - 5043000,
  recordingTotalPausedMs: 0,
  handoffState: 'hidden',
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
      // W7 fix: Use nullish check (!= null) instead of truthiness check.
      // The old `if (incoming.audioMode)` treated the valid value 'none' as falsy,
      // so audioMode would never reset to 'none' once set to 'system' or 'microphone'.
      if (incoming.audioMode != null) updates.audioMode = incoming.audioMode
      if (incoming.syncStatus != null) updates.syncStatus = incoming.syncStatus
      updates.liveCoachTip = incoming.liveCoachTip || null
      updates.entityCount = incoming.entityCount || 0
      updates.noteCount = incoming.noteCount || 0
      // W6 fix: meetingId is now typed — no unsafe cast needed
      if (incoming.meetingId) updates.activeMeetingId = incoming.meetingId

      // W16 fix: Store the raw timestamps so the widget can compute elapsed time locally.
      // This stops reliance on a 1000ms IPC heartbeat which is vulnerable to main-thread freezes.
      if (incoming.recordingStartTime !== undefined) {
        updates.recordingStartTime = incoming.recordingStartTime
      }
      if (incoming.recordingTotalPausedMs !== undefined) {
        updates.recordingTotalPausedMs = incoming.recordingTotalPausedMs
      }

      dispatch({ type: 'UPDATE', payload: updates })
    })

    const unsubscribeHandoff = window.electronAPI?.on?.spatialHandoff?.(
      (data: { state: 'expanded' | 'orb' | 'hidden' }) => {
        dispatch({ type: 'UPDATE', payload: { handoffState: data.state } })
      }
    )

    return () => {
      unsubscribe?.()
      unsubscribeHandoff?.()
    }
  }, [])

  // W16 fix: Local high-precision timer computation
  // Decouples the widget UI from the main process IPC loop
  useEffect(() => {
    if (!state.isRecording || state.isPaused || !state.recordingStartTime) {
      return
    }

    const interval = setInterval(() => {
      if (!state.recordingStartTime) return
      const ms = Date.now() - state.recordingStartTime - (state.recordingTotalPausedMs || 0)
      const totalSec = Math.max(0, Math.floor(ms / 1000))
      const h = Math.floor(totalSec / 3600)
      const m = Math.floor((totalSec % 3600) / 60)
      const s = totalSec % 60
      const currentElapsedStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`

      dispatch({ type: 'UPDATE', payload: { elapsedTime: currentElapsedStr } })
    }, 1000)

    return () => clearInterval(interval)
  }, [state.isRecording, state.isPaused, state.recordingStartTime, state.recordingTotalPausedMs])

  const handleRestore = () => {
    window.electronAPI?.window?.restoreMain()
  }

  const handleStop = () => {
    if (!state.activeMeetingId) {
      // W9 fix: If activeMeetingId hasn't been received yet (race condition —
      // widget shown before first meetingId-bearing state broadcast), fall back
      // to restoring the main window so the user can stop from there.
      // Without this, the Stop button was completely dead.
      console.warn('Widget stop: no activeMeetingId, restoring main window')
      window.electronAPI?.window?.restoreMain()
      return
    }
    window.electronAPI?.audio?.stopCapture({ meetingId: state.activeMeetingId })
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

  const handleStartCapture = () => {
    window.electronAPI?.widget?.triggerStartCapture?.()
  }

  // #24: When on battery, use instant transition instead of spring physics
  const animationProps = isPowerSaveMode
    ? { type: 'tween' as const, duration: 0.15 }
    : { type: 'spring' as const, stiffness: 350, damping: 25, mass: 1.2, bounce: 0.4 }

  const isHidden = state.handoffState === 'hidden'

  return (
    <div className="w-screen h-screen bg-transparent flex flex-col justify-start items-end p-6 widget-draggable overflow-hidden text-[var(--color-text-primary)]">
      <motion.div
        initial={{ y: -50, opacity: 0, scale: 0.85, filter: 'blur(10px)' }}
        animate={{
          y: isHidden ? 20 : 0,
          opacity: isHidden ? 0 : 1,
          scale: isHidden ? 0.85 : 1,
          filter: isHidden ? 'blur(10px)' : 'blur(0px)',
        }}
        transition={animationProps}
        className={`relative w-full flex justify-end ${isHidden ? 'pointer-events-none' : 'pointer-events-auto'}`}
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
          onStartCapture={handleStartCapture}
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
