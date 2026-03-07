import React, { useState, useEffect, useRef } from 'react'
import { ChevronLeft, Square, Loader2, Mic, Monitor, Cloud, Command, Info } from 'lucide-react'
import { IconButton } from '../ui/IconButton'
import { AudioIndicator } from '../meeting/AudioIndicator'
import { SyncStatusBadge } from '../ui/SyncStatusBadge'
import { useAppStore } from '../../store/appStore'
import type { ElectronAPI } from '../../../types/ipc'

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

interface DynamicIslandProps {
  recordingState: 'idle' | 'starting' | 'recording' | 'stopping' | 'processing'
  syncStatus: 'idle' | 'syncing' | 'error'
  onBack?: () => void
  onStopRecording?: () => void
  audioLevel?: number
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
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
  audioLevel,
}) => {
  const isRecording = recordingState === 'recording'
  const recordingStartTime = useAppStore(s => s.recordingStartTime)
  const lastTranscriptLine = useAppStore(s => s.lastTranscriptLine)
  const activeView = useAppStore(s => s.activeView)
  const audioMode = useAppStore(s => s.audioMode)
  const liveCoachTip = useAppStore(s => s.liveCoachTip)
  const currentTier = useAppStore(s => s.currentTier)
  const quotaData = useAppStore(s => s.quotaData)
  const entityCount = useAppStore(s => s.entityCount)
  const noteCount = useAppStore(s => s.noteCount)

  const [elapsedStr, setElapsedStr] = useState('00:00:00')
  const rafRef = useRef<number | null>(null)

  // ── Hover Expansion ──
  const [isHovered, setIsHovered] = useState(false)

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

  useEffect(() => {
    if (isRecording && recordingStartTime) {
      const tick = () => {
        setElapsedStr(formatElapsed(Date.now() - recordingStartTime))
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current)
      }
    } else {
      setElapsedStr('00:00:00')
      return undefined
    }
  }, [isRecording, recordingStartTime])

  useEffect(() => {
    if (recordingState !== 'idle') {
      window.electronAPI.widget.updateState({
        isRecording,
        elapsedTime: elapsedStr,
        lastTranscriptLine:
          recordingState === 'processing'
            ? 'Processing transcript...'
            : lastTranscriptLine || 'Listening...',
        audioMode,
        syncStatus,
        liveCoachTip,
        entityCount,
        noteCount,
      })
    } else {
      window.electronAPI.widget.updateState({
        isRecording: false,
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
        return 'Weekly Digest'
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
    isHovered && (recordingState === 'recording' || recordingState === 'idle')
      ? 'ui-di-expanded'
      : ''

  const renderCenterContent = () => {
    if (recordingState === 'idle') {
      return (
        <div className="ui-dynamic-island-idle-content" role="status">
          <span className="ui-di-view-name">{getViewName()}</span>
          {isHovered ? (
            <div className="flex gap-2 items-center ml-2 animate-fade-in pl-2 border-l border-[rgba(255,255,255,0.06)]">
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
                <Command size={10} /> <span>K</span>
              </div>
            </div>
          ) : (
            <div className="ui-di-shortcut-hint">
              <Command size={10} /> <span>K</span>
            </div>
          )}
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

    if (recordingState === 'recording') {
      return (
        <div className="ui-dynamic-island-recording" role="status">
          {getAudioModeIcon()}

          {liveCoachTip ? (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[rgba(139,92,246,0.15)] border border-[rgba(139,92,246,0.3)] text-[var(--color-violet)] animate-pulse shadow-[0_0_12px_rgba(139,92,246,0.2)]">
              <span className="text-[11px] font-medium leading-none">🧠 Coach Active</span>
            </span>
          ) : (
            <>
              {audioWarning ? (
                <span
                  className="text-[var(--color-amber)] text-[10px] animate-pulse whitespace-nowrap px-1"
                  title="No audio detected"
                >
                  ⚠️ No audio
                </span>
              ) : (
                <span className="ui-dynamic-island-rec-time">{elapsedStr}</span>
              )}
              <AudioIndicator audioLevel={audioLevel || 0} isRecording={true} />
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
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            className={`ui-dynamic-island-stop-btn ${isHolding ? 'is-holding' : ''}`}
            aria-label="Hold to stop recording"
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
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
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
