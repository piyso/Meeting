import React, { useState, useEffect } from 'react'
import { modKey } from '../../utils/platformShortcut'
import { motion, AnimatePresence, MotionValue } from 'framer-motion'
import {
  Square,
  Maximize2,
  Mic,
  Monitor,
  Cloud,
  CloudOff,
  RefreshCw,
  BookmarkPlus,
  Sparkles,
  PenLine,
  Send,
  Pause,
  Play,
  Activity,
  MicOff,
  Tag,
  StickyNote,
  Palette,
} from 'lucide-react'
import { ThemeName, THEMES } from './mini-widget/Theme'
import { DockButton } from './mini-widget/DockButton'
import { Chip } from './mini-widget/Chip'
import { RecordingPulse } from './mini-widget/RecordingPulse'
import { WidgetTimer } from './mini-widget/WidgetTimer'

interface MiniWidgetProps {
  isRecording: boolean
  isPaused?: boolean
  recordingStartTime?: number | null
  recordingTotalPausedMs?: number
  lastTranscriptLine: string
  audioMode?: 'system' | 'microphone' | 'none'
  syncStatus?: 'idle' | 'syncing' | 'error'
  liveCoachTip?: string | null
  entityCount?: number
  noteCount?: number
  onRestore: () => void
  onStop: () => void
  onBookmark: () => void
  onPauseToggle?: () => void
  onQuickNote: (text: string) => void
  onStartCapture?: () => void
  elapsedTime?: string
  audioRms?: MotionValue<number>
}

export const MiniWidget: React.FC<MiniWidgetProps> = ({
  isRecording,
  isPaused,
  recordingStartTime,
  recordingTotalPausedMs,
  lastTranscriptLine,
  audioMode = 'none',
  syncStatus = 'idle',
  elapsedTime,
  liveCoachTip,
  entityCount = 0,
  noteCount = 0,
  onRestore,
  onStop,
  onBookmark,
  onPauseToggle,
  onQuickNote,
  onStartCapture,
  audioRms,
}) => {
  const [isNoteExpanded, setIsNoteExpanded] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [isHovered, setIsHovered] = useState(false)
  const [theme, setTheme] = useState<ThemeName>(() => {
    try {
      const saved = localStorage.getItem('widgetTheme')
      if (saved && saved in THEMES) return saved as ThemeName
    } catch {
      // localStorage unavailable
    }
    return 'monochrome'
  })
  const [showThemePicker, setShowThemePicker] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem('widgetTheme', theme)
    } catch {
      // localStorage unavailable
    }
  }, [theme])

  const AudioIcon = audioMode === 'system' ? Monitor : audioMode === 'microphone' ? Mic : MicOff
  const SyncIcon = syncStatus === 'syncing' ? RefreshCw : syncStatus === 'error' ? CloudOff : Cloud

  const handleSubmitNote = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!noteText.trim()) {
      setIsNoteExpanded(false)
      return
    }
    onQuickNote(noteText.trim())
    setNoteText('')
    setIsNoteExpanded(false)
  }

  // Ultra-fluid Apple-esque physics for layout transitions
  const spring = { type: 'spring' as const, stiffness: 400, damping: 30, mass: 1 }
  const isActive = isRecording || isPaused

  let widgetState: 'orb' | 'pill' | 'panel' = 'pill'
  if (isNoteExpanded || liveCoachTip || lastTranscriptLine) {
    widgetState = 'panel'
  } else if (!isHovered && isActive) {
    // If active and not hovered, shrink to a compact orb to save space
    widgetState = 'orb'
  }

  // Predefined widths for the 3 morph states
  const widthClass =
    widgetState === 'orb'
      ? 'w-max min-w-[80px]'
      : widgetState === 'pill'
        ? 'w-max min-w-[260px]'
        : 'w-[360px]'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={spring}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`
        relative ${widthClass} rounded-[32px]
        widget-surface-premium p-[4px] ml-auto
        flex flex-col widget-draggable overflow-hidden cursor-default antialiased
        ${isRecording && !isPaused ? 'widget-glow-border ring-1 ring-white/10' : 'ring-1 ring-white/5'}
      `}
      style={{
        boxShadow:
          isRecording && !isPaused
            ? '0 16px 32px -8px rgba(0,0,0,0.6), 0 0 20px -5px rgba(255,255,255,0.15), inset 0 1px 1px rgba(255,255,255,0.15)'
            : '0 16px 32px -8px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,255,255,0.12)',
      }}
    >
      {/* Noise Texture */}
      <div className="absolute inset-0 rounded-[inherit] pointer-events-none with-noise" />

      {/* Aurora Background (recording only) */}
      <motion.div
        animate={{ opacity: isRecording && !isPaused ? 1 : 0 }}
        transition={{ duration: 1.5 }}
        className="absolute -inset-[100%] pointer-events-none rounded-[inherit] mix-blend-screen"
        style={{
          background: THEMES[theme].aurora,
          backgroundSize: '250% 250%',
          animation: 'widget-aurora 20s ease-in-out infinite',
        }}
      />

      {/* ═══ Content Stack ═══ */}
      <div className="relative z-10 flex flex-col gap-1">
        {/* ── Header: Status + Control Dock ── */}
        <div className="flex items-center justify-between px-3.5 py-2">
          {/* Left: Visualizer + Timer */}
          <div className="flex items-center gap-3">
            {isActive ? (
              <RecordingPulse isPaused={!!isPaused} theme={theme} audioRms={audioRms} />
            ) : (
              <div className="w-2 h-2 rounded-full bg-white/40 shadow-[0_0_10px_rgba(255,255,255,0.2)] ml-1" />
            )}
            <span
              className={`font-mono text-[13px] font-semibold tracking-wider ${
                isPaused ? 'text-white/50' : isActive ? 'text-white/90' : 'text-white/40'
              }`}
              style={{
                fontVariantNumeric: 'tabular-nums',
                textShadow: isRecording && !isPaused ? 'none' : '0 1px 3px rgba(0,0,0,0.8)',
              }}
            >
              {isPaused ? (
                'PAUSED'
              ) : isActive ? (
                elapsedTime ? (
                  elapsedTime
                ) : (
                  <WidgetTimer
                    recordingStartTime={recordingStartTime}
                    recordingTotalPausedMs={recordingTotalPausedMs}
                  />
                )
              ) : (
                'SOVEREIGN'
              )}
            </span>
          </div>

          {/* Right: Floating Control Dock */}
          <AnimatePresence>
            {widgetState !== 'orb' && (
              <motion.div
                initial={{ opacity: 0, width: 0, scale: 0.8 }}
                animate={{ opacity: 1, width: 'auto', scale: 1 }}
                exit={{ opacity: 0, width: 0, scale: 0.8 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-[3px] bg-black/50 backdrop-blur-xl rounded-full p-[3px] border border-white/[0.08] shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)] ml-2"
              >
                {isActive ? (
                  <>
                    <DockButton
                      icon={<PenLine size={12} strokeWidth={2.5} />}
                      active={isNoteExpanded}
                      onClick={() => setIsNoteExpanded(!isNoteExpanded)}
                      title="Quick Note"
                    />
                    <DockButton
                      icon={<BookmarkPlus size={12} strokeWidth={2.5} />}
                      onClick={onBookmark}
                      title={`Bookmark (${modKey}+Shift+B)`}
                      hoverColor="violet"
                    />
                    <DockButton
                      icon={
                        isPaused ? (
                          <Play size={11} fill="currentColor" />
                        ) : (
                          <Pause size={11} fill="currentColor" />
                        )
                      }
                      onClick={() => onPauseToggle?.()}
                      title={isPaused ? `Resume (${modKey}+Shift+P)` : `Pause (${modKey}+Shift+P)`}
                    />
                    <DockButton
                      icon={<Square size={10} fill="currentColor" />}
                      onClick={onStop}
                      title="Stop Archiving"
                      hoverColor="rose"
                    />
                    <div className="w-[1px] h-3.5 bg-white/[0.12] mx-[2px] rounded-full" />
                    <DockButton
                      icon={<Maximize2 size={12} strokeWidth={2.5} />}
                      onClick={onRestore}
                      title="Open Sovereign App"
                      hoverColor="emerald"
                    />
                    <div className="w-[1px] h-3.5 bg-white/[0.12] mx-[2px] rounded-full" />
                  </>
                ) : (
                  <>
                    <DockButton
                      icon={<div className="w-2.5 h-2.5 bg-rose-500 rounded-full" />}
                      onClick={() => onStartCapture?.()}
                      title={`Start Recording (${modKey}+Shift+Space)`}
                      hoverColor="rose"
                    />
                    <div className="w-[1px] h-3.5 bg-white/[0.12] mx-[2px] rounded-full" />
                    <DockButton
                      icon={<Maximize2 size={12} strokeWidth={2.5} />}
                      onClick={onRestore}
                      title="Open Sovereign App"
                      hoverColor="emerald"
                    />
                    <div className="w-[1px] h-3.5 bg-white/[0.12] mx-[2px] rounded-full" />
                  </>
                )}

                {showThemePicker && (
                  <motion.div
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    className="flex items-center gap-[3px] pr-1 overflow-hidden"
                  >
                    {(Object.keys(THEMES) as ThemeName[]).map(t => (
                      <button
                        key={t}
                        onClick={e => {
                          e.stopPropagation()
                          setTheme(t)
                          setShowThemePicker(false)
                        }}
                        className={`w-[14px] h-[14px] rounded-full ${THEMES[t].pickerBg} widget-nodrag outline-none transition-all hover:scale-125 ${theme === t ? 'ring-2 ring-white/50 ring-offset-1 ring-offset-black' : 'opacity-40 hover:opacity-100'}`}
                        title={`Theme: ${t}`}
                      />
                    ))}
                    <div className="w-[1px] h-3.5 bg-white/[0.12] mx-[2px] rounded-full" />
                  </motion.div>
                )}
                <DockButton
                  icon={<Palette size={12} strokeWidth={2.5} />}
                  onClick={() => setShowThemePicker(!showThemePicker)}
                  title="Change Theme"
                  active={showThemePicker}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Dynamic Content Area ── */}
        <AnimatePresence mode="popLayout" initial={false}>
          {isNoteExpanded ? (
            <motion.form
              key="quicknote"
              layout
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={spring}
              onSubmit={handleSubmitNote}
              className="px-1 pb-1"
            >
              <div className="relative">
                <input
                  type="text"
                  placeholder="Type a quick note..."
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  className="w-full bg-white/[0.06] border border-white/10 text-[13px] text-white placeholder-white/30 rounded-full pl-3 pr-[32px] py-[5.5px] outline-none focus:border-white/20 focus:bg-white/10 transition-colors shadow-inner"
                  autoFocus
                  onClick={e => e.stopPropagation()}
                  onKeyDown={e => {
                    e.stopPropagation()
                    if (e.key === 'Escape') {
                      setIsNoteExpanded(false)
                    } else if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSubmitNote(e)
                    }
                  }}
                />
                <button
                  type="submit"
                  onClick={e => e.stopPropagation()}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-[28px] h-[28px] flex items-center justify-center bg-white text-black rounded-full hover:bg-[var(--color-violet)] hover:text-white hover:shadow-[0_0_20px_rgba(167,139,250,0.6)] transition-all duration-300 widget-nodrag disabled:opacity-30 disabled:bg-white/20 disabled:text-white"
                  disabled={!noteText.trim()}
                >
                  <Send size={11} strokeWidth={2.5} className="ml-[1px]" />
                </button>
              </div>
            </motion.form>
          ) : liveCoachTip || lastTranscriptLine ? (
            <motion.div
              key="content"
              layout
              initial={{ opacity: 0, scale: 0.96, height: 0 }}
              animate={{ opacity: 1, scale: 1, height: 'auto' }}
              exit={{ opacity: 0, scale: 0.96, height: 0 }}
              transition={spring}
              className="px-1 pb-1 overflow-hidden"
            >
              <div className="relative bg-white/5 rounded-[22px] p-3.5 border border-white/10 transition-colors duration-500 shadow-[inset_0_1px_3px_rgba(0,0,0,0.3)] overflow-hidden backdrop-blur-md">
                {/* Coach tip internal glow */}
                {liveCoachTip && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.6 }}
                    className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-white/5 pointer-events-none"
                  />
                )}

                <div className="relative z-10">
                  {liveCoachTip ? (
                    /* ── AI Insight View ── */
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-1.5">
                        <Sparkles
                          size={11}
                          className="text-violet-400 animate-pulse drop-shadow-[0_0_6px_rgba(167,139,250,0.6)]"
                        />
                        <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-violet-100">
                          AI Insight
                        </span>
                      </div>
                      <motion.p
                        layout="position"
                        className={`text-[13px] font-medium leading-[1.45] tracking-tight ${isHovered ? '' : 'line-clamp-3'}`}
                        style={{
                          backgroundImage:
                            'linear-gradient(to right, #fff 20%, #e9d5ff 50%, #fff 80%)',
                          backgroundSize: '200% auto',
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                          textShadow: '0 2px 10px rgba(167,139,250,0.4)',
                        }}
                        animate={{ backgroundPosition: ['200% center', '-200% center'] }}
                        transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                      >
                        {liveCoachTip}
                      </motion.p>
                    </div>
                  ) : (
                    /* ── Live Transcript View ── */
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 opacity-45">
                          <Activity size={10} className="animate-pulse" />
                          <span className="text-[9.5px] uppercase tracking-[0.12em] font-semibold text-[var(--color-text-secondary)]">
                            Live Transcript
                          </span>
                        </div>
                        <div className="flex items-center gap-2 opacity-40">
                          {audioMode !== 'none' && <AudioIcon size={10} />}
                          {syncStatus !== 'idle' && (
                            <SyncIcon
                              size={10}
                              className={
                                syncStatus === 'syncing' ? 'animate-spin text-white/60' : ''
                              }
                            />
                          )}
                        </div>
                      </div>
                      <motion.p
                        layout="position"
                        className={`text-[13px] text-white/95 font-medium leading-relaxed whitespace-normal break-words transition-colors duration-300 ${isHovered ? '' : 'line-clamp-2'}`}
                        style={{ textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}
                      >
                        {lastTranscriptLine}
                      </motion.p>
                    </div>
                  )}

                  {/* ── Entity / Note Chips ── */}
                  <AnimatePresence>
                    {(entityCount > 0 || noteCount > 0) && (
                      <motion.div
                        initial={{ opacity: 0, height: 0, marginTop: 0 }}
                        animate={{ opacity: 1, height: 'auto', marginTop: 10 }}
                        exit={{ opacity: 0, height: 0, marginTop: 0 }}
                        className="flex flex-wrap items-center gap-2"
                      >
                        {entityCount > 0 && (
                          <Chip
                            theme={theme}
                            label={`${entityCount} Entities`}
                            icon={<Tag size={10} />}
                          />
                        )}
                        {noteCount > 0 && (
                          <Chip
                            theme={theme}
                            label={`${noteCount} Notes`}
                            icon={<StickyNote size={10} />}
                          />
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
