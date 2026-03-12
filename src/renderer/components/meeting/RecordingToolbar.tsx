import React, { useState, useEffect, useCallback } from 'react'
import { Square, Pause, Play, Mic, Monitor, Circle, BookmarkPlus } from 'lucide-react'
import { useAppStore } from '../../store/appStore'

interface RecordingToolbarProps {
  onStop: () => void
  onPause?: () => void
  onResume?: () => void
  onBookmark?: () => void
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

export const RecordingToolbar: React.FC<RecordingToolbarProps> = ({
  onStop,
  onPause,
  onResume,
  onBookmark,
}) => {
  const recordingState = useAppStore(s => s.recordingState)
  const recordingStartTime = useAppStore(s => s.recordingStartTime)
  const recordingPausedAt = useAppStore(s => s.recordingPausedAt)
  const recordingTotalPausedMs = useAppStore(s => s.recordingTotalPausedMs)
  const audioMode = useAppStore(s => s.audioMode)

  const [elapsed, setElapsed] = useState(0)
  const isPaused = recordingState === 'paused'

  // Live timer
  useEffect(() => {
    if ((recordingState !== 'recording' && recordingState !== 'paused') || !recordingStartTime)
      return
    if (isPaused && recordingPausedAt) {
      // Freeze timer entirely
      setElapsed(recordingPausedAt - recordingStartTime - recordingTotalPausedMs)
      return
    }

    const interval = setInterval(() => {
      setElapsed(Date.now() - recordingStartTime - recordingTotalPausedMs)
    }, 1000)

    return () => clearInterval(interval)
  }, [recordingState, recordingStartTime, isPaused, recordingPausedAt, recordingTotalPausedMs])

  const handlePauseToggle = useCallback(() => {
    if (isPaused) {
      onResume?.()
    } else {
      onPause?.()
    }
  }, [isPaused, onPause, onResume])

  const isActive =
    recordingState === 'recording' || recordingState === 'starting' || recordingState === 'paused'
  if (!isActive) return null

  const isConnecting = recordingState === 'starting'
  const showMode = audioMode === 'system' || audioMode === 'microphone'

  return (
    <div className="recording-toolbar" role="toolbar" aria-label="Recording controls">
      {/* ── Left zone: status info ── */}
      <div className="recording-toolbar-info">
        <Circle
          size={8}
          fill="currentColor"
          className={`recording-toolbar-dot ${isPaused ? 'text-[var(--color-amber)]' : 'text-[#FF3B30]'} ${isPaused ? '' : 'animate-pulse'}`}
        />
        <span className="recording-toolbar-status">
          {isConnecting ? 'Connecting…' : isPaused ? 'Paused' : 'Recording'}
        </span>
        <span className="recording-toolbar-timer">
          {isConnecting ? '--:--' : formatElapsed(elapsed)}
        </span>
        {showMode && (
          <span className="recording-toolbar-mode">
            {audioMode === 'system' ? (
              <>
                <Monitor size={11} /> System
              </>
            ) : (
              <>
                <Mic size={11} /> Mic
              </>
            )}
          </span>
        )}
      </div>

      {/* ── Thin separator ── */}
      <div className="recording-toolbar-divider" />

      {/* ── Right zone: actions ── */}
      <div className="recording-toolbar-actions">
        <button
          onClick={onBookmark}
          className="recording-toolbar-btn"
          title="Bookmark Moment (⌘+Shift+B)"
          aria-label="Bookmark Moment"
          disabled={isConnecting}
        >
          <BookmarkPlus size={14} />
        </button>

        <button
          onClick={handlePauseToggle}
          className="recording-toolbar-btn recording-toolbar-btn-pause"
          title={isPaused ? 'Resume recording (⌘+Shift+P)' : 'Pause recording (⌘+Shift+P)'}
          aria-label={isPaused ? 'Resume recording' : 'Pause recording'}
          disabled={isConnecting}
        >
          {isPaused ? <Play size={14} /> : <Pause size={14} />}
          <span>{isPaused ? 'Resume' : 'Pause'}</span>
        </button>

        <button
          onClick={onStop}
          className="recording-toolbar-btn recording-toolbar-btn-stop"
          title="Stop recording"
          aria-label="Stop recording"
          disabled={isConnecting}
        >
          <Square size={12} fill="currentColor" />
          <span>Stop</span>
        </button>
      </div>
    </div>
  )
}
