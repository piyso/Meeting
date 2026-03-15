import React, { useState, useEffect, useRef } from 'react'
import { ChevronLeft, Square, Loader2, Mic, Monitor, Cloud, Info, Pause, Play } from 'lucide-react'
import { modKey } from '../../utils/platformShortcut'
import { IconButton } from '../ui/IconButton'
import { AudioIndicator } from '../meeting/AudioIndicator'
import { SyncStatusBadge } from '../ui/SyncStatusBadge'
import { useAppStore } from '../../store/appStore'
import { useShallow } from 'zustand/react/shallow'
import { useAudioStatus } from '../../hooks/queries/useAudioStatus'
import { useRecordingTimer } from '../../hooks/useRecordingTimer'
import type { ElectronAPI } from '../../../types/ipc'

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

interface DynamicIslandProps {
  recordingState: 'idle' | 'starting' | 'recording' | 'paused' | 'stopping' | 'processing'
  syncStatus: 'idle' | 'syncing' | 'error'
  onBack?: () => void
  onStopRecording?: () => void
  onPauseRecording?: () => void
}

const PROCESSING_STEPS = [
  'Transcribing...',
  'Extracting entities...',
  'Structuring notes...',
  'Updating graph...',
  'Finalizing...',
]

export const DynamicIsland: React.FC<DynamicIslandProps> = ({
  recordingState,
  syncStatus,
  onBack,
  onStopRecording,
  onPauseRecording,
}) => {
  const activeMeetingId = useAppStore(s => s.activeMeetingId)
  const { currentVolume: audioLevel } = useAudioStatus(activeMeetingId)

  const isRecording = recordingState === 'recording'
  const {
    lastTranscriptLine,
    activeView,
    audioMode,
    liveCoachTip,
    currentTier,
    quotaData,
    entityCount,
    noteCount,
  } = useAppStore(
    useShallow(s => ({
      lastTranscriptLine: s.lastTranscriptLine,
      activeView: s.activeView,
      audioMode: s.audioMode,
      liveCoachTip: s.liveCoachTip,
      currentTier: s.currentTier,
      quotaData: s.quotaData,
      entityCount: s.entityCount,
      noteCount: s.noteCount,
    }))
  )

  const { elapsedStr } = useRecordingTimer()

  // ── Hover Expansion (debounced to prevent rapid flips) ──
  const [isHovered, setIsHovered] = useState(false)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clean up debounce timers on unmount
  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    }
  }, [])

  const handleMouseEnter = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    hoverTimerRef.current = setTimeout(() => setIsHovered(true), 60)
  }
  const handleMouseLeave = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    hoverTimerRef.current = null
    setIsHovered(false)
  }

  // ── Hold-to-Stop ──
  const [isHolding, setIsHolding] = useState(false)
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Audio Warning ──
  const [audioWarning, setAudioWarning] = useState(false)
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (isRecording && audioLevel !== undefined) {
      if (audioLevel < 0.01) {
        if (!silenceTimerRef.current) {
          silenceTimerRef.current = setTimeout(() => setAudioWarning(true), 30000)
        }
      } else {
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
        silenceTimerRef.current = null
        setAudioWarning(false)
      }
    } else {
      setAudioWarning(false)
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    }
  }, [isRecording, audioLevel])

  // ── Processing Micro-states ──
  const [processingIdx, setProcessingIdx] = useState(0)

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null
    if (recordingState === 'processing') {
      setProcessingIdx(0)
      interval = setInterval(() => {
        setProcessingIdx(prev => Math.min(prev + 1, PROCESSING_STEPS.length - 1))
      }, 2000)
    }
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [recordingState])

  // Timer now handled by useRecordingTimer hook

  // ── Throttled Widget IPC ── (max 1 call per second for same-state, immediate for state changes)
  const lastWidgetUpdate = useRef(0)
  const lastBroadcastState = useRef<string>('')
  useEffect(() => {
    const now = Date.now()
    const stateChanged = lastBroadcastState.current !== recordingState
    // Allow immediate pass-through on recordingState changes (pause/resume/stop)
    // but throttle updates within the same state (timer ticks)
    if (!stateChanged && now - lastWidgetUpdate.current < 1000) return
    lastWidgetUpdate.current = now
    lastBroadcastState.current = recordingState

    if (recordingState !== 'idle') {
      window.electronAPI?.widget?.updateState({
        isRecording,
        isPaused: recordingState === 'paused',
        elapsedTime: elapsedStr,
        lastTranscriptLine:
          recordingState === 'processing'
            ? 'Processing transcript...'
            : recordingState === 'paused'
              ? 'Paused'
              : lastTranscriptLine || 'Listening...',
        audioMode,
        syncStatus,
        liveCoachTip,
        entityCount,
        noteCount,
      })
    } else {
      window.electronAPI?.widget?.updateState({
        isRecording: false,
        isPaused: false,
        elapsedTime: '00:00:00',
        lastTranscriptLine: '',
        audioMode: 'none',
        syncStatus: 'idle',
        liveCoachTip: null,
        entityCount: 0,
        noteCount: 0,
      })
    }
  }, [
    recordingState,
    isRecording,
    elapsedStr,
    lastTranscriptLine,
    audioMode,
    syncStatus,
    liveCoachTip,
    entityCount,
    noteCount,
  ])

  // Return formatted name for idle state
  const getViewName = () => {
    switch (activeView) {
      case 'meeting-list':
        return 'Home'
      case 'meeting-detail':
        return 'Recording'
      case 'knowledge-graph':
        return 'Knowledge Graph'
      case 'weekly-digest':
        return 'Digest'
      case 'ask-meetings':
        return 'Ask Meetings'
      case 'settings':
        return 'Settings'
      default:
        return 'BlueArkive'
    }
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    // Only primary click
    if (e.button !== 0) return
    setIsHolding(true)
    holdTimerRef.current = setTimeout(() => {
      onStopRecording?.()
      setIsHolding(false)
    }, 1500)
  }

  const handlePointerUp = () => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current)
    setIsHolding(false)
  }

  const getAudioModeIcon = () => {
    if (audioMode === 'system') return <Monitor size={12} className="ui-di-mode-icon" />
    if (audioMode === 'microphone') return <Mic size={12} className="ui-di-mode-icon" />
    if (audioMode === 'none')
      return <Info size={12} className="ui-di-mode-icon" color="var(--color-rose)" />
    return <Cloud size={12} className="ui-di-mode-icon" />
  }

  // Determine state class
  const morphStateClass = `ui-di-state-${recordingState}`
  const hoverClass =
    isHovered &&
    (recordingState === 'recording' || recordingState === 'paused' || recordingState === 'idle')
      ? 'ui-di-expanded'
      : ''

  const renderCenterContent = () => {
    if (recordingState === 'idle') {
      return (
        <div className="ui-dynamic-island-idle-content" role="status">
          <span className="ui-di-view-name">{getViewName()}</span>
          {/* Always rendered, visibility toggled via CSS — avoids React DOM churn */}
          <div
            className="ui-di-hover-panel"
            style={{
              opacity: isHovered ? 1 : 0,
              visibility: isHovered ? 'visible' : 'hidden',
              maxWidth: isHovered ? '300px' : '0px',
              transition:
                'opacity 200ms ease-out, max-width 300ms cubic-bezier(0.25, 1, 0.2, 1.15), visibility 200ms',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginLeft: isHovered ? '8px' : '0',
              paddingLeft: isHovered ? '8px' : '0',
              borderLeft: isHovered ? '1px solid rgba(255,255,255,0.06)' : '1px solid transparent',
              whiteSpace: 'nowrap',
            }}
          >
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.05)] text-[11px] text-[var(--color-text-secondary)] whitespace-nowrap">
              <span className="capitalize font-medium text-[var(--color-text-primary)]">
                {currentTier}
              </span>
              <span className="opacity-40">•</span>
              <span>
                {quotaData.used}/{quotaData.limit} {currentTier === 'pro' ? '∞' : '☁️'}
              </span>
            </div>
            <SyncStatusBadge />
            <div className="ui-di-shortcut-hint ml-1">
              <span className="ui-di-mod-key">{modKey}</span> <span>K</span>
            </div>
          </div>
          {/* Collapsed shortcut hint — shown when NOT hovered */}
          <div
            className="ui-di-shortcut-hint"
            style={{
              opacity: isHovered ? 0 : 1,
              visibility: isHovered ? 'hidden' : 'visible',
              maxWidth: isHovered ? '0px' : '100px',
              transition: 'opacity 150ms ease-out, max-width 200ms ease-out, visibility 150ms',
              overflow: 'hidden',
            }}
          >
            <span className="ui-di-mod-key">{modKey}</span> <span>K</span>
          </div>
        </div>
      )
    }

    if (recordingState === 'starting') {
      return (
        <div className="ui-dynamic-island-recording" role="status">
          <Loader2 size={14} className="animate-spin" style={{ color: 'var(--color-amber)' }} />
          <span className="ui-dynamic-island-rec-label" style={{ color: 'var(--color-amber)' }}>
            Connecting...
          </span>
        </div>
      )
    }

    if (recordingState === 'recording' || recordingState === 'paused') {
      const isPaused = recordingState === 'paused'
      return (
        <div className="ui-dynamic-island-recording" role="status">
          {getAudioModeIcon()}

          {liveCoachTip ? (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[rgba(139,92,246,0.15)] border border-[rgba(139,92,246,0.3)] text-[var(--color-violet)] animate-pulse shadow-[0_0_12px_rgba(139,92,246,0.2)]">
              <span className="text-[11px] font-medium leading-none">🧠 Coach Active</span>
            </span>
          ) : (
            <>
              {isPaused ? (
                <span className="text-[var(--color-amber)] text-[12px] whitespace-nowrap px-1 font-medium tracking-wide">
                  ⏸ Paused
                </span>
              ) : audioWarning ? (
                <span
                  className="text-[var(--color-amber)] text-[10px] animate-pulse whitespace-nowrap px-1"
                  title="No audio detected"
                >
                  ⚠️ No audio
                </span>
              ) : (
                <span className="ui-dynamic-island-rec-time">{elapsedStr}</span>
              )}
              {!isPaused && <AudioIndicator audioLevel={audioLevel || 0} isRecording={true} />}
            </>
          )}

          {isHovered && lastTranscriptLine && !liveCoachTip && (
            <div className="ui-di-transcript-preview flex items-center gap-2">
              <span className="truncate">{lastTranscriptLine}</span>
              <span className="opacity-50 text-[10px] flex-shrink-0 tracking-wider">
                {entityCount > 0 && `👤${entityCount} `}
                {noteCount > 0 && `📝${noteCount}`}
              </span>
            </div>
          )}
          {isHovered && liveCoachTip && (
            <div className="ui-di-transcript-preview text-[var(--color-violet)] font-medium whitespace-nowrap overflow-hidden text-ellipsis">
              ✨ {liveCoachTip}
            </div>
          )}
          <button
            onClick={e => {
              e.stopPropagation()
              onPauseRecording?.()
            }}
            className="ui-dynamic-island-pause-btn flex items-center justify-center p-1.5 rounded-full bg-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.15)] transition-colors"
            title={isPaused ? 'Resume (⌘+Shift+P)' : 'Pause (⌘+Shift+P)'}
            aria-label={isPaused ? 'Resume archiving' : 'Pause archiving'}
          >
            {isPaused ? (
              <Play size={10} fill="currentColor" className="text-[var(--color-text-secondary)]" />
            ) : (
              <Pause size={10} fill="currentColor" className="text-[var(--color-text-secondary)]" />
            )}
          </button>
          <button
            onClick={() => onStopRecording?.()}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            className={`ui-dynamic-island-stop-btn ${isHolding ? 'is-holding' : ''}`}
            aria-label="Stop archiving"
          >
            {isHolding ? (
              <svg className="ui-di-hold-ring" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" />
              </svg>
            ) : null}
            <Square size={12} fill="currentColor" className="ui-di-stop-icon" />
          </button>
        </div>
      )
    }

    if (recordingState === 'stopping') {
      return (
        <div className="ui-dynamic-island-recording" role="status">
          <Loader2 size={14} className="animate-spin" style={{ color: 'var(--color-teal)' }} />
          <span className="ui-dynamic-island-rec-label" style={{ color: 'var(--color-teal)' }}>
            Saving...
          </span>
        </div>
      )
    }

    if (recordingState === 'processing') {
      return (
        <div className="ui-dynamic-island-processing" role="status">
          <div className="ui-dynamic-island-proc-dot animate-pulse" />
          <span className="ui-dynamic-island-proc-label">{PROCESSING_STEPS[processingIdx]}</span>
        </div>
      )
    }

    return null
  }

  // Removed sync dot logic

  return (
    <div
      className={`ui-dynamic-island surface-glass-premium no-drag ${morphStateClass} ${hoverClass}`}
      role="banner"
      aria-label="Meeting status bar"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {onBack && (
        <div className="ui-dynamic-island-left no-drag">
          <IconButton icon={<ChevronLeft size={18} />} onClick={onBack} size="sm" />
        </div>
      )}

      <div className="ui-dynamic-island-center no-drag">{renderCenterContent()}</div>
    </div>
  )
}
