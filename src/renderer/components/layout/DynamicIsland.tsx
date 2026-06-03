import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Square, Loader2, Mic, Monitor, Cloud, Info, Pause, Play, Sparkles } from 'lucide-react'
import { modKey } from '../../utils/platformShortcut'
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

// ── EXTRACTED FAST-UPDATING COMPONENTS ──

const IslandWidgetSync: React.FC<{
  recordingState: string
  syncStatus: string
  activeMeetingId: string | null
  isRecording: boolean
}> = ({ recordingState, syncStatus, activeMeetingId, isRecording }) => {
  const {
    lastTranscriptLine,
    audioMode,
    liveCoachTip,
    entityCount,
    noteCount,
    recordingStartTime,
    recordingTotalPausedMs,
  } = useAppStore(
    useShallow(s => ({
      lastTranscriptLine: s.lastTranscriptLine,
      audioMode: s.audioMode,
      liveCoachTip: s.liveCoachTip,
      entityCount: s.entityCount,
      noteCount: s.noteCount,
      recordingStartTime: s.recordingStartTime,
      recordingTotalPausedMs: s.recordingTotalPausedMs,
    }))
  )

  // Use a ref to hold latest state, preventing dependency-driven effect thrashing
  const stateRef = useRef({
    recordingState,
    syncStatus,
    activeMeetingId,
    isRecording,
    lastTranscriptLine,
    audioMode,
    liveCoachTip,
    entityCount,
    noteCount,
    recordingStartTime,
    recordingTotalPausedMs,
  })

  // Keep ref up to date
  useEffect(() => {
    stateRef.current = {
      recordingState,
      syncStatus,
      activeMeetingId,
      isRecording,
      lastTranscriptLine,
      audioMode,
      liveCoachTip,
      entityCount,
      noteCount,
      recordingStartTime,
      recordingTotalPausedMs,
    }
  }, [
    recordingState,
    syncStatus,
    activeMeetingId,
    isRecording,
    lastTranscriptLine,
    audioMode,
    liveCoachTip,
    entityCount,
    noteCount,
    recordingStartTime,
    recordingTotalPausedMs,
  ])

  // Single interval to handle IPC broadcasting
  useEffect(() => {
    const interval = setInterval(() => {
      const state = stateRef.current
      let currentElapsedStr = '00:00:00'

      if (state.recordingStartTime && state.recordingState !== 'idle') {
        const ms = Date.now() - state.recordingStartTime - state.recordingTotalPausedMs
        const totalSec = Math.max(0, Math.floor(ms / 1000))
        const h = Math.floor(totalSec / 3600)
        const m = Math.floor((totalSec % 3600) / 60)
        const s = totalSec % 60
        currentElapsedStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
      }

      if (state.recordingState !== 'idle') {
        window.electronAPI?.widget?.updateState({
          isRecording: state.isRecording,
          isPaused: state.recordingState === 'paused',
          elapsedTime: currentElapsedStr,
          recordingStartTime: state.recordingStartTime,
          recordingTotalPausedMs: state.recordingTotalPausedMs,
          meetingId: state.activeMeetingId,
          lastTranscriptLine:
            state.recordingState === 'processing'
              ? 'Processing transcript...'
              : state.recordingState === 'paused'
                ? 'Paused'
                : state.lastTranscriptLine || 'Listening...',
          audioMode: state.audioMode,
          syncStatus: state.syncStatus as 'idle' | 'syncing' | 'error',
          liveCoachTip: state.liveCoachTip,
          entityCount: state.entityCount,
          noteCount: state.noteCount,
        })
      } else {
        window.electronAPI?.widget?.updateState({
          isRecording: false,
          isPaused: false,
          elapsedTime: '00:00:00',
          recordingStartTime: null,
          recordingTotalPausedMs: 0,
          lastTranscriptLine: '',
          audioMode: 'none',
          syncStatus: 'idle',
          liveCoachTip: null,
          entityCount: 0,
          noteCount: 0,
        })
      }
    }, 500)

    return () => clearInterval(interval)
  }, [])

  return null
}

const IslandExpandedContent: React.FC<{ hasTranscript: boolean; hasCoachTip: boolean }> = ({
  hasTranscript,
  hasCoachTip,
}) => {
  const { lastTranscriptLine, liveCoachTip, entityCount, noteCount } = useAppStore(
    useShallow(s => ({
      lastTranscriptLine: s.lastTranscriptLine,
      liveCoachTip: s.liveCoachTip,
      entityCount: s.entityCount,
      noteCount: s.noteCount,
    }))
  )

  return (
    <>
      {/* Neural Stem */}
      {hasTranscript && hasCoachTip && (
        <div className="flex flex-col items-center mr-3 mt-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-text-tertiary)]" />
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: '100%' }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="w-px bg-gradient-to-b from-[var(--color-text-tertiary)] to-[var(--color-violet)] flex-1 my-1 ui-di-neural-stem"
          />
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.2, delay: 0.4 }}
            className="w-1.5 h-1.5 rounded-full bg-[var(--color-violet)] shadow-[0_0_8px_rgba(139,92,246,0.8)]"
          />
        </div>
      )}

      <div className="flex flex-col gap-3 flex-1 pb-1">
        {hasTranscript && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-1.5 items-start w-full"
          >
            <span className="text-[10px] uppercase tracking-widest text-[var(--color-text-tertiary)] font-semibold flex items-center gap-1.5">
              <Mic size={10} /> Transcript
            </span>
            <div className="ui-di-transcript-preview text-[13px] leading-relaxed min-h-[40px] overflow-hidden">
              <div className="line-clamp-2">
                {(() => {
                  if (!lastTranscriptLine)
                    return <span className="text-white/70">Listening...</span>
                  const match = lastTranscriptLine.match(/^([^:]+):\s*(.*)$/)
                  if (match) {
                    return (
                      <>
                        <span className="text-white font-medium mr-1.5">{match[1]}:</span>
                        <span className="text-white/70">{match[2]}</span>
                      </>
                    )
                  }
                  return <span className="text-white/70">{lastTranscriptLine}</span>
                })()}
              </div>
            </div>
            {(entityCount > 0 || noteCount > 0) && (
              <div className="flex gap-2 mt-0.5">
                {entityCount > 0 && (
                  <span className="bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-full px-2 py-0.5 text-[9px] font-medium tracking-wider text-white/80">
                    👤 {entityCount} ENTITIES
                  </span>
                )}
                {noteCount > 0 && (
                  <span className="bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-full px-2 py-0.5 text-[9px] font-medium tracking-wider text-white/80">
                    📝 {noteCount} NOTES
                  </span>
                )}
              </div>
            )}
          </motion.div>
        )}

        {hasCoachTip && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
            className="flex flex-col gap-1 items-start w-full backdrop-blur-2xl bg-[rgba(139,92,246,0.04)] border border-[rgba(139,92,246,0.2)] rounded-2xl p-3.5 relative overflow-hidden group shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]"
          >
            {/* Shimmer effect */}
            <div className="absolute inset-0 w-full h-full">
              <div className="absolute inset-0 w-1/2 h-full bg-gradient-to-r from-transparent via-[rgba(139,92,246,0.1)] to-transparent ui-di-shimmer-border" />
            </div>

            <span className="text-[10px] uppercase tracking-widest font-semibold flex items-center gap-1.5 relative z-10">
              <Sparkles size={11} className="text-[var(--color-violet)]" />
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-fuchsia-300">
                AI Coach
              </span>
            </span>
            <div className="text-[13px] leading-relaxed text-[var(--color-violet-light)] mt-0.5 relative z-10">
              ✨ {liveCoachTip}
            </div>
          </motion.div>
        )}
      </div>
    </>
  )
}

export const DynamicIsland: React.FC<DynamicIslandProps> = ({
  recordingState,
  syncStatus,
  onStopRecording,
  onPauseRecording,
}) => {
  const activeMeetingId = useAppStore(s => s.activeMeetingId)
  const isRecording = recordingState === 'recording'

  const { activeView, audioMode, currentTier, quotaData, focusMode, hasTranscript, hasCoachTip } =
    useAppStore(
      useShallow(s => ({
        activeView: s.activeView,
        audioMode: s.audioMode,
        currentTier: s.currentTier,
        quotaData: s.quotaData,
        focusMode: s.focusMode,
        hasTranscript: !!s.lastTranscriptLine,
        hasCoachTip: !!s.liveCoachTip,
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
    // 500ms grace period prevents the island from instantly jittering closed
    // if the mouse accidentally slips off a 1px boundary layer.
    hoverTimerRef.current = setTimeout(() => setIsHovered(false), 500)
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

  // Cleanup hold timer on unmount — prevents double-stop if state transitions
  // (e.g. via keyboard shortcut) while user is mid-hold
  useEffect(() => {
    return () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current)
    }
  }, [])

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
      case 'pricing':
        return 'Upgrade'
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
        <motion.div
          key="idle"
          layout
          className="ui-dynamic-island-idle-content"
          role="status"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2 }}
        >
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
        <motion.div
          key="starting"
          layout
          className="ui-dynamic-island-recording"
          role="status"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2 }}
        >
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
        <motion.div
          key="active"
          layout="position"
          className="flex flex-col items-center relative"
          role="status"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            layout="position"
            className="ui-dynamic-island-recording mx-auto relative z-10"
          >
            <motion.div layout="position" className="flex items-center place-content-center">
              {getAudioModeIcon()}
            </motion.div>

            <motion.div layout="position" className="flex items-center gap-1">
              <AnimatePresence mode="wait">
                {hasCoachTip ? (
                  <motion.span
                    key="coach-active"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[rgba(139,92,246,0.15)] border border-[rgba(139,92,246,0.3)] text-[var(--color-violet)] shadow-[0_0_12px_rgba(139,92,246,0.2)]"
                  >
                    <span className="text-[11px] font-medium leading-none">🧠 Coach Active</span>
                  </motion.span>
                ) : (
                  <motion.div
                    layout="position"
                    key="timer-meter"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="flex items-center gap-1"
                  >
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
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            <motion.div layout="position" className="flex items-center gap-2">
              <button
                onClick={e => {
                  e.stopPropagation()
                  onPauseRecording?.()
                }}
                className="ui-dynamic-island-pause-btn flex items-center justify-center p-1.5 rounded-full bg-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.15)] transition-colors pointer-events-auto"
                title={isPaused ? `Resume (${modKey}+Shift+P)` : `Pause (${modKey}+Shift+P)`}
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
                // P1-17 FIX: If a system dialog interrupts the long-press
                // (e.g., notification popup), pointerUp never fires — the hold
                // ring animation gets stuck. pointerCancel handles this case.
                onPointerCancel={handlePointerUp}
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

          <AnimatePresence mode="popLayout">
            {isHovered && (hasTranscript || hasCoachTip) && (
              <motion.div
                layout="position"
                initial={{ opacity: 0, filter: 'blur(4px)' }}
                animate={{ opacity: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, filter: 'blur(4px)' }}
                transition={{ duration: 0.2 }}
                className="flex shrink-0 pointer-events-auto mt-2 px-4 pb-2 overflow-hidden"
                style={{ width: '100%', maxWidth: 'min(440px, calc(100vw - 48px))' }}
              >
                <IslandExpandedContent hasTranscript={hasTranscript} hasCoachTip={hasCoachTip} />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )
    }

    if (recordingState === 'stopping') {
      return (
        <motion.div
          key="stopping"
          layout="position"
          className="ui-dynamic-island-recording"
          role="status"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2 }}
        >
          <Loader2 size={14} className="animate-spin" style={{ color: 'var(--color-teal)' }} />
          <span className="ui-dynamic-island-rec-label" style={{ color: 'var(--color-teal)' }}>
            Saving...
          </span>
        </motion.div>
      )
    }

    if (recordingState === 'processing') {
      return (
        <motion.div
          key="processing"
          layout="position"
          className="ui-dynamic-island-processing"
          role="status"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2 }}
        >
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
      transition={{ type: 'spring', bounce: 0.15, stiffness: 500, damping: 30 }}
      className={`ui-dynamic-island surface-glass-premium no-drag ${morphStateClass}${focusMode ? ' focus-mode-active' : ''} ${isHovered && hasCoachTip ? 'ui-di-glow-ambient' : ''}`}
      role="banner"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <IslandWidgetSync
        recordingState={recordingState}
        syncStatus={syncStatus}
        activeMeetingId={activeMeetingId}
        isRecording={isRecording}
      />

      <div className="ui-dynamic-island-center no-drag">
        <AnimatePresence mode="popLayout" initial={false}>
          {renderCenterContent()}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
