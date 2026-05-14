import React, { useState } from 'react'
import { modKey } from '../../utils/platformShortcut'
import { motion, AnimatePresence } from 'framer-motion'
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
} from 'lucide-react'

interface MiniWidgetProps {
  isRecording: boolean
  isPaused?: boolean
  elapsedTime: string
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
}

export const MiniWidget: React.FC<MiniWidgetProps> = ({
  isRecording,
  isPaused,
  elapsedTime,
  lastTranscriptLine,
  audioMode = 'none',
  syncStatus = 'idle',
  liveCoachTip,
  entityCount = 0,
  noteCount = 0,
  onRestore,
  onStop,
  onBookmark,
  onPauseToggle,
  onQuickNote,
}) => {
  const [isNoteExpanded, setIsNoteExpanded] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [isHovered, setIsHovered] = useState(false)

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
  const spring = { type: 'spring' as const, stiffness: 350, damping: 32, mass: 1.1 }
  const isActive = isRecording || isPaused

  // ── 5-bar Audio Visualizer (GPU-composited via scaleY) ──
  const AudioVisualizer = () => {
    // Perfect [min, max, min] keyframes for a flawless infinite loop
    const waveforms = [
      [0.3, 0.7, 0.3],
      [0.4, 0.9, 0.4],
      [0.5, 1.1, 0.5], // Center bar (most active)
      [0.4, 0.8, 0.4],
      [0.3, 0.6, 0.3],
    ]

    return (
      <div className="flex items-center gap-[2px] h-[12px] ml-1">
        {[0, 1, 2, 3, 4].map(i => (
          <motion.div
            key={i}
            className="w-[2.5px] h-full rounded-full"
            style={{
              background: isPaused ? 'var(--color-amber)' : 'rgba(255,255,255,0.95)',
              boxShadow: !isPaused ? '0 0 10px rgba(255,255,255,0.5)' : 'none',
              transformOrigin: 'center',
            }}
            animate={{
              scaleY: isPaused ? 0.2 : waveforms[i],
            }}
            transition={{
              duration: 1.0, // Fixed duration for perfect sync
              repeat: Infinity,
              delay: i * 0.15, // Staggered delay creates the "wave" effect
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>
    )
  }

  return (
    <motion.div
      layout
      transition={spring}
      className={`
        relative ${isNoteExpanded || liveCoachTip || lastTranscriptLine ? 'w-[360px]' : 'w-max'} rounded-[32px]
        surface-glass-premium p-[4px] ml-auto
        flex flex-col widget-draggable overflow-hidden cursor-default
        ${isRecording && !isPaused ? 'widget-glow-border' : ''}
      `}
      style={{
        boxShadow:
          isRecording && !isPaused
            ? '0 24px 80px -16px rgba(0,0,0,0.6), 0 0 60px -20px rgba(255,255,255,0.15), inset 0 1px 1px rgba(255,255,255,0.15)'
            : '0 24px 80px -16px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,255,255,0.12)',
      }}
      onClick={e => {
        if (!(e.target as HTMLElement).closest('button, input, form')) onRestore()
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Noise Texture */}
      <div className="absolute inset-0 rounded-[inherit] pointer-events-none with-noise" />

      {/* Aurora Background (recording only) */}
      <motion.div
        animate={{ opacity: isRecording && !isPaused ? 1 : 0 }}
        transition={{ duration: 1.5 }}
        className="absolute inset-0 widget-aurora pointer-events-none rounded-[inherit]"
      />

      {/* ═══ Content Stack ═══ */}
      <div className="relative z-10 flex flex-col gap-1">
        {/* ── Header: Status + Control Dock ── */}
        <div className="flex items-center justify-between px-3.5 py-2">
          {/* Left: Visualizer + Timer */}
          <div className="flex items-center gap-3">
            {isActive ? (
              <AudioVisualizer />
            ) : (
              <div className="w-2 h-2 rounded-full bg-white/80 shadow-[0_0_10px_rgba(255,255,255,0.6)]" />
            )}
            <span
              className={`font-mono text-[13px] font-semibold tracking-wider ${
                isPaused ? 'text-white/50' : 'text-white/90'
              }`}
              style={{
                fontVariantNumeric: 'tabular-nums',
                textShadow: isRecording && !isPaused ? 'none' : '0 1px 3px rgba(0,0,0,0.8)',
              }}
            >
              {isPaused ? 'PAUSED' : elapsedTime}
            </span>
          </div>

          {/* Right: Floating Control Dock */}
          <div className="flex items-center gap-[3px] bg-black/50 backdrop-blur-xl rounded-full p-[3px] border border-white/[0.08] shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]">
            {isActive && (
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
              </>
            )}
            <DockButton
              icon={<Maximize2 size={12} strokeWidth={2.5} />}
              onClick={onRestore}
              title="Expand to Full App"
            />
          </div>
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
                  autoFocus
                  className="w-full bg-black/50 border border-white/[0.1] text-white text-[13px] pl-4 pr-11 py-2.5 rounded-[20px] outline-none focus:border-[var(--color-violet)]/40 focus:shadow-[0_0_0_2px_rgba(167,139,250,0.15)] placeholder:text-white/40 widget-nodrag transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] backdrop-blur-md"
                  placeholder="Jot down a quick thought..."
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  onClick={e => e.stopPropagation()}
                  onKeyDown={e => e.stopPropagation()}
                />
                <button
                  type="submit"
                  onClick={e => e.stopPropagation()}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center bg-white text-black rounded-full hover:bg-white/90 hover:shadow-[0_0_16px_rgba(255,255,255,0.3)] transition-all duration-300 widget-nodrag disabled:opacity-30 disabled:bg-white/20 disabled:text-white"
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
              <div className="relative bg-black/20 rounded-[22px] p-3.5 border border-white/[0.06] transition-colors duration-500 shadow-[inset_0_1px_3px_rgba(0,0,0,0.3)] overflow-hidden backdrop-blur-md">
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
                          className="text-white/80 animate-pulse drop-shadow-[0_0_6px_rgba(255,255,255,0.4)]"
                        />
                        <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-white/80">
                          AI Insight
                        </span>
                      </div>
                      <motion.p
                        layout="position"
                        className={`text-[13px] text-[#f0ecff] font-medium leading-[1.45] tracking-tight transition-colors duration-300 ${isHovered ? '' : 'line-clamp-3'}`}
                        style={{ textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}
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
                        {entityCount > 0 && <Chip color="teal" label={`${entityCount} Entities`} icon={<Tag size={10} />} />}
                        {noteCount > 0 && <Chip color="amber" label={`${noteCount} Notes`} icon={<StickyNote size={10} />} />}
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

/* ══════════════════════════════════════════════
   Sub-components (tree-shaking friendly)
   ══════════════════════════════════════════════ */

/** Individual dock button — extracted for consistency and reduced JSX noise */
const DockButton: React.FC<{
  icon: React.ReactNode
  onClick: () => void
  title: string
  active?: boolean
  hoverColor?: 'violet' | 'rose'
}> = ({ icon, onClick, title, active, hoverColor }) => {
  const hoverMap = {
    violet: 'hover:text-[var(--color-violet)] hover:bg-[var(--color-violet)]/15',
    rose: 'hover:text-[var(--color-rose)] hover:bg-[var(--color-rose)]/15',
  }
  const hoverClass = hoverColor ? hoverMap[hoverColor] : 'hover:text-white hover:bg-white/10'

  return (
    <motion.button
      whileHover={{ scale: 1.12 }}
      whileTap={{ scale: 0.88 }}
      onClick={e => {
        e.stopPropagation()
        onClick()
      }}
      className={`w-[26px] h-[26px] rounded-full flex items-center justify-center transition-all duration-200 widget-nodrag outline-none ${
        active
          ? 'bg-[var(--color-violet)] text-white shadow-[0_0_14px_rgba(167,139,250,0.5)]'
          : `text-white/55 ${hoverClass}`
      }`}
      title={title}
    >
      {icon}
    </motion.button>
  )
}

/** Status chip — extracted for DRY rendering */
const Chip: React.FC<{ color: 'teal' | 'amber'; label: string; icon: React.ReactNode }> = ({ color, label, icon }) => {
  const colors = {
    teal: {
      bg: 'bg-[var(--color-teal)]/10',
      border: 'border-[var(--color-teal)]/20',
      iconColor: 'text-[var(--color-teal)] drop-shadow-[0_0_6px_var(--color-teal)]',
      text: 'text-[var(--color-teal)]',
    },
    amber: {
      bg: 'bg-[var(--color-amber)]/10',
      border: 'border-[var(--color-amber)]/20',
      iconColor: 'text-[var(--color-amber)] drop-shadow-[0_0_6px_var(--color-amber)]',
      text: 'text-[var(--color-amber)]',
    },
  }
  const c = colors[color]

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={`flex items-center gap-1.5 ${c.bg} border ${c.border} px-2 py-[3px] rounded-full`}
    >
      <span className={c.iconColor}>{icon}</span>
      <span className={`text-[9.5px] ${c.text} font-bold tracking-[0.08em] uppercase`}>{label}</span>
    </motion.div>
  )
}
