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
  Palette,
} from 'lucide-react'

type ThemeName = 'monochrome' | 'ocean' | 'neon' | 'emerald'

const THEMES = {
  monochrome: {
    aurora:
      'radial-gradient(circle at 20% 20%, rgba(255, 255, 255, 0.05) 0%, transparent 55%), radial-gradient(circle at 80% 80%, rgba(255, 255, 255, 0.03) 0%, transparent 55%), radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.02) 0%, transparent 65%)',
    viz: 'rgba(255,255,255,0.95)',
    vizShadow: '0 0 10px rgba(255,255,255,0.5)',
    chipBg: 'bg-white/[0.04]',
    chipBorder: 'border-white/[0.08]',
    chipIcon: 'text-white/50',
    chipText: 'text-white/80',
    pickerBg: 'bg-white',
  },
  ocean: {
    aurora:
      'radial-gradient(circle at 20% 20%, rgba(59, 130, 246, 0.18) 0%, transparent 55%), radial-gradient(circle at 80% 80%, rgba(56, 189, 248, 0.15) 0%, transparent 55%), radial-gradient(circle at 50% 50%, rgba(96, 165, 250, 0.12) 0%, transparent 65%)',
    viz: '#38bdf8',
    vizShadow: '0 0 10px rgba(56, 189, 248, 0.6)',
    chipBg: 'bg-blue-500/10',
    chipBorder: 'border-blue-500/20',
    chipIcon: 'text-blue-400',
    chipText: 'text-blue-100',
    pickerBg: 'bg-sky-400',
  },
  neon: {
    aurora:
      'radial-gradient(circle at 20% 20%, rgba(167, 139, 250, 0.15) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(244, 63, 94, 0.12) 0%, transparent 50%), radial-gradient(circle at 50% 50%, rgba(56, 189, 248, 0.08) 0%, transparent 60%)',
    viz: '#a78bfa',
    vizShadow: '0 0 10px rgba(167, 139, 250, 0.6)',
    chipBg: 'bg-fuchsia-500/10',
    chipBorder: 'border-fuchsia-500/20',
    chipIcon: 'text-fuchsia-400',
    chipText: 'text-fuchsia-100',
    pickerBg: 'bg-fuchsia-400',
  },
  emerald: {
    aurora:
      'radial-gradient(circle at 20% 20%, rgba(16, 185, 129, 0.15) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(52, 211, 153, 0.12) 0%, transparent 50%), radial-gradient(circle at 50% 50%, rgba(110, 231, 183, 0.08) 0%, transparent 60%)',
    viz: '#34d399',
    vizShadow: '0 0 10px rgba(52, 211, 153, 0.6)',
    chipBg: 'bg-emerald-500/10',
    chipBorder: 'border-emerald-500/20',
    chipIcon: 'text-emerald-400',
    chipText: 'text-emerald-100',
    pickerBg: 'bg-emerald-400',
  },
}

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
  onStartCapture?: () => void
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
  onStartCapture,
}) => {
  const [isNoteExpanded, setIsNoteExpanded] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [isHovered, setIsHovered] = useState(false)
  const [theme, setTheme] = useState<ThemeName>('monochrome')
  const [showThemePicker, setShowThemePicker] = useState(false)

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

  // ── Subtle Recording Pulse (replaces distracting 5-bar visualizer) ──
  const RecordingPulse = () => {
    return (
      <div className="flex items-center justify-center w-3 h-3 ml-1">
        <motion.div
          className="w-2 h-2 rounded-full"
          style={{
            background: isPaused ? 'var(--color-amber)' : THEMES[theme].viz,
            boxShadow: !isPaused ? THEMES[theme].vizShadow : 'none',
          }}
          animate={{
            scale: isPaused ? 1 : [1, 1.35, 1],
            opacity: isPaused ? 0.6 : [0.6, 1, 0.6],
          }}
          transition={{
            duration: 3, // Slow, calm 3-second breathing cycle
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
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
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
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
              <RecordingPulse />
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
              {isPaused ? 'PAUSED' : isActive ? elapsedTime : 'SOVEREIGN'}
            </span>
          </div>

          {/* Right: Floating Control Dock */}
          <div className="flex items-center gap-[3px] bg-black/50 backdrop-blur-xl rounded-full p-[3px] border border-white/[0.08] shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]">
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

/* ══════════════════════════════════════════════
   Sub-components (tree-shaking friendly)
   ══════════════════════════════════════════════ */

/** Individual dock button — extracted for consistency and reduced JSX noise */
const DockButton: React.FC<{
  icon: React.ReactNode
  onClick: () => void
  title: string
  active?: boolean
  hoverColor?: 'violet' | 'rose' | 'emerald'
}> = ({ icon, onClick, title, active, hoverColor }) => {
  const hoverMap = {
    violet: 'hover:text-[var(--color-violet)] hover:bg-[var(--color-violet)]/15',
    rose: 'hover:text-[var(--color-rose)] hover:bg-[var(--color-rose)]/15',
    emerald: 'hover:text-[var(--color-emerald)] hover:bg-[var(--color-emerald)]/15',
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

/** Status chip — dynamically themed */
const Chip: React.FC<{ theme: ThemeName; label: string; icon: React.ReactNode }> = ({
  theme,
  label,
  icon,
}) => {
  const c = THEMES[theme]
  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={`flex items-center gap-1.5 ${c.chipBg} border ${c.chipBorder} px-2 py-[3px] rounded-full transition-colors duration-500`}
    >
      <span className={`${c.chipIcon} transition-colors duration-500`}>{icon}</span>
      <span
        className={`text-[9.5px] ${c.chipText} font-bold tracking-[0.08em] uppercase drop-shadow-sm transition-colors duration-500`}
      >
        {label}
      </span>
    </motion.div>
  )
}
