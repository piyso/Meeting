import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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

// ── ATOMIC COMPONENTS FOR HIGH FREQUENCY UPDATES ──
// By extracting these, we prevent the entire DynamicIsland layout from re-rendering
// 1-3 times a second simply because the clock ticked or the audio volume changed.

const IslandTimer: React.FC = () => {
  const { elapsedStr } = useRecordingTimer()
  return <span className="ui-dynamic-island-rec-time">{elapsedStr}</span>
}

const IslandAudioMeter: React.FC<{ activeMeetingId: string | null; isRecording: boolean }> = ({
  activeMeetingId,
  isRecording,
}) => {
  const { currentVolume: audioLevel } = useAudioStatus(activeMeetingId)
  return <AudioIndicator audioLevel={audioLevel || 0} isRecording={isRecording} />
}

export const DynamicIsland: React.FC<DynamicIslandProps> = ({
  recordingState,
  syncStatus,
  onBack,
  onStopRecording,
  onPauseRecording,
}) => {
  const activeMeetingId = useAppStore(s => s.activeMeetingId)
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
    focusMode,
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
      focusMode: s.focusMode,
    }))
  )

  // ── Hover Expansion (Debounced Grace Period) ──
  const [isHovered, setIsHovered] = useState(false)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    // 300ms grace period prevents the island from instantly jittering closed
    // if the mouse accidentally slips off a 1px boundary layer.
    hoverTimerRef.current = setTimeout(() => setIsHovered(false), 300)
  }

  // ── Hold-to-Stop ──
  const [isHolding, setIsHolding] = useState(false)
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handlePointerDown = (e: React.PointerEvent) => {
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

  // IPC Widget sync needs the elapsed string, unfortunately this breaks pure atomic isolation
  // if we read `useRecordingTimer()` at the top level. We can fetch it statelessly for sync
  // or accept that IPC sync needs it. To truly isolate, we let IPC sync handle its own timer,
  // but for now, we will simply not strictly bind it in rendering if possible.
  // We'll calculate a mock elapsedStr for the IPC based on startTime to avoid subscribing.
  const recordingStartTime = useAppStore(s => s.recordingStartTime)
  const recordingTotalPausedMs = useAppStore(s => s.recordingTotalPausedMs)

  const lastWidgetUpdate = useRef(0)
  const lastBroadcastState = useRef<string>('')

  useEffect(() => {
    const now = Date.now()
    const stateChanged = lastBroadcastState.current !== recordingState
    if (!stateChanged && now - lastWidgetUpdate.current < 1000) return
    lastWidgetUpdate.current = now
    lastBroadcastState.current = recordingState

    // Pseudo-calculate elapsedStr for widget without forcing React re-render
    let currentElapsedStr = '00:00:00'
    if (recordingStartTime && recordingState !== 'idle') {
      const ms = Date.now() - recordingStartTime - recordingTotalPausedMs
      const totalSec = Math.floor(ms / 1000)
      const h = Math.floor(totalSec / 3600)
      const m = Math.floor((totalSec % 3600) / 60)
      const s = totalSec % 60
      currentElapsedStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    }

    if (recordingState !== 'idle') {
      window.electronAPI?.widget?.updateState({
        isRecording,
        isPaused: recordingState === 'paused',
        elapsedTime: currentElapsedStr,
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
    }
  }, [
    recordingState,
    isRecording,
    lastTranscriptLine,
    audioMode,
    syncStatus,
    liveCoachTip,
    entityCount,
    noteCount,
    recordingStartTime,
    recordingTotalPausedMs,
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

  const getAudioModeIcon = () => {
    if (audioMode === 'system') return <Monitor size={12} className="ui-di-mode-icon" />
    if (audioMode === 'microphone') return <Mic size={12} className="ui-di-mode-icon" />
    if (audioMode === 'none')
      return <Info size={12} className="ui-di-mode-icon" color="var(--color-rose)" />
    return <Cloud size={12} className="ui-di-mode-icon" />
  }

  const morphStateClass = `ui-di-state-${recordingState}`
  // hoverClass (ui-di-expanded) removed — it snapped padding instantly while
  // FM tried to smooth-animate, causing a 1-frame stutter. Content expansion
  // is now handled naturally by children width changes + FM layout animation.

  const renderCenterContent = () => {
    if (recordingState === 'idle') {
      return (
        <motion.div layout className="ui-dynamic-island-idle-content" role="status">
          <motion.span layout="position" className="ui-di-view-name">
            {getViewName()}
          </motion.span>
          <AnimatePresence>
            {isHovered && (
              <motion.div
                layout
                initial={{ opacity: 0, width: 0, scale: 0.95 }}
                animate={{ opacity: 1, width: 'auto', scale: 1 }}
                exit={{ opacity: 0, width: 0, scale: 0.95 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="overflow-hidden flex items-center gap-2 whitespace-nowrap ml-2 pl-2 border-l border-[rgba(255,255,255,0.06)]"
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
                <div className="ui-di-shortcut-hint ml-1 pointer-events-none">
                  <span className="ui-di-mod-key">{modKey}</span> <span>K</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {!isHovered && (
            <motion.div layout="position" className="ui-di-shortcut-hint pointer-events-none">
              <span className="ui-di-mod-key">{modKey}</span> <span>K</span>
            </motion.div>
          )}
        </motion.div>
      )
    }

    if (recordingState === 'starting') {
      return (
        <motion.div layout className="ui-dynamic-island-recording" role="status">
          <Loader2 size={14} className="animate-spin" style={{ color: 'var(--color-amber)' }} />
          <motion.span
            layout="position"
            className="ui-dynamic-island-rec-label"
            style={{ color: 'var(--color-amber)' }}
          >
            Connecting...
          </motion.span>
        </motion.div>
      )
    }

    if (recordingState === 'recording' || recordingState === 'paused') {
      const isPaused = recordingState === 'paused'
      return (
        <motion.div layout className="ui-dynamic-island-recording" role="status">
          <motion.div layout="position" className="flex items-center place-content-center">
            {getAudioModeIcon()}
          </motion.div>

          <motion.div layout="position" className="flex items-center gap-1">
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
                ) : (
                  <IslandTimer />
                )}
                {!isPaused && (
                  <IslandAudioMeter activeMeetingId={activeMeetingId} isRecording={true} />
                )}
              </>
            )}
          </motion.div>

          <AnimatePresence>
            {isHovered && lastTranscriptLine && !liveCoachTip && (
              <motion.div
                layout
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{
                  duration: 0.25,
                  type: 'spring',
                  bounce: 0,
                  stiffness: 300,
                  damping: 25,
                }}
                className="overflow-hidden flex items-center gap-2"
              >
                <div className="ui-di-transcript-preview flex items-center gap-2">
                  <span className="truncate">{lastTranscriptLine}</span>
                  <span className="opacity-50 text-[10px] flex-shrink-0 tracking-wider">
                    {entityCount > 0 && `👤${entityCount} `}
                    {noteCount > 0 && `📝${noteCount}`}
                  </span>
                </div>
              </motion.div>
            )}
            {isHovered && liveCoachTip && (
              <motion.div
                layout
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                className="overflow-hidden"
              >
                <div className="ui-di-transcript-preview text-[var(--color-violet)] font-medium whitespace-nowrap overflow-hidden text-ellipsis">
                  ✨ {liveCoachTip}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div layout="position" className="flex items-center gap-2">
            <button
              onClick={e => {
                e.stopPropagation()
                onPauseRecording?.()
              }}
              className="ui-dynamic-island-pause-btn flex items-center justify-center p-1.5 rounded-full bg-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.15)] transition-colors pointer-events-auto"
              title={isPaused ? 'Resume (⌘+Shift+P)' : 'Pause (⌘+Shift+P)'}
            >
              {isPaused ? (
                <Play
                  size={10}
                  fill="currentColor"
                  className="text-[var(--color-text-secondary)] pointer-events-none"
                />
              ) : (
                <Pause
                  size={10}
                  fill="currentColor"
                  className="text-[var(--color-text-secondary)] pointer-events-none"
                />
              )}
            </button>
            <button
              onClick={() => onStopRecording?.()}
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              className={`ui-dynamic-island-stop-btn ${isHolding ? 'is-holding' : ''} pointer-events-auto`}
            >
              {isHolding ? (
                <svg className="ui-di-hold-ring pointer-events-none" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" />
                </svg>
              ) : null}
              <Square
                size={12}
                fill="currentColor"
                className="ui-di-stop-icon pointer-events-none"
              />
            </button>
          </motion.div>
        </motion.div>
      )
    }

    if (recordingState === 'stopping') {
      return (
        <motion.div layout className="ui-dynamic-island-recording" role="status">
          <Loader2 size={14} className="animate-spin" style={{ color: 'var(--color-teal)' }} />
          <span className="ui-dynamic-island-rec-label" style={{ color: 'var(--color-teal)' }}>
            Saving...
          </span>
        </motion.div>
      )
    }

    if (recordingState === 'processing') {
      return (
        <motion.div layout className="ui-dynamic-island-processing" role="status">
          <div className="ui-dynamic-island-proc-dot animate-pulse pointer-events-none" />
          <motion.span
            layout="position"
            className="ui-dynamic-island-proc-label pointer-events-none"
          >
            {PROCESSING_STEPS[processingIdx]}
          </motion.span>
        </motion.div>
      )
    }

    return null
  }

  return (
    <motion.div
      layout
      style={{
        x: 0,
        y: 0,
      }} /* Tell FM that rest position = no offset (centering via CSS margin-inline:auto) */
      transition={{ type: 'spring', bounce: 0.15, stiffness: 400, damping: 30 }}
      className={`ui-dynamic-island surface-glass-premium no-drag ${morphStateClass}${focusMode ? ' focus-mode-active' : ''}`}
      role="banner"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {onBack && (
        <motion.div layout="position" className="ui-dynamic-island-left no-drag">
          <IconButton
            icon={<ChevronLeft size={18} className="pointer-events-none" />}
            onClick={onBack}
            size="sm"
          />
        </motion.div>
      )}

      <motion.div layout className="ui-dynamic-island-center no-drag">
        {renderCenterContent()}
      </motion.div>
    </motion.div>
  )
}
