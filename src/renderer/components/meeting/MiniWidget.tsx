import React, { useState } from 'react'
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
} from 'lucide-react'

interface MiniWidgetProps {
  isRecording: boolean
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
  onQuickNote: (text: string) => void
}

export const MiniWidget: React.FC<MiniWidgetProps> = ({
  isRecording,
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
  onQuickNote,
}) => {
  const [isNoteExpanded, setIsNoteExpanded] = useState(false)
  const [noteText, setNoteText] = useState('')

  const AudioIcon = audioMode === 'system' ? Monitor : audioMode === 'microphone' ? Mic : CloudOff
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

  // Ultra-premium spring animation spec for Framer Motion
  const springSpec = { type: 'spring', stiffness: 400, damping: 30 } as const

  return (
    <motion.div
      layout
      transition={springSpec}
      className="relative w-full max-w-[300px] rounded-[var(--radius-xl)] surface-glass-premium px-4 py-3 flex flex-col justify-center widget-draggable overflow-hidden shadow-[0_12px_40px_rgba(0,0,0,0.4)]"
      onClick={e => {
        if (!(e.target as HTMLElement).closest('button, input, form')) onRestore()
      }}
    >
      {/* Background Glow when Coach Tip is active */}
      <AnimatePresence>
        {liveCoachTip && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.15 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0 bg-[var(--color-violet)] blur-2xl pointer-events-none"
          />
        )}
      </AnimatePresence>

      {/* Row 1: Header (Status + Controls) */}
      <motion.div
        layout="position"
        className="flex items-center justify-between mb-2 relative z-10"
      >
        <div className="flex items-center gap-2">
          {isRecording ? (
            <div className="w-2 h-2 rounded-full bg-[var(--color-blue)] animate-pulse shadow-[0_0_8px_var(--color-blue)]" />
          ) : (
            <div className="w-2 h-2 rounded-full bg-[var(--color-emerald)]" />
          )}
          <span className="font-mono text-[13px] font-medium text-[var(--color-text-primary)]">
            {elapsedTime}
          </span>
          <div className="flex items-center gap-1.5 ml-1 opacity-50">
            {audioMode !== 'none' && <AudioIcon size={12} className="text-[var(--color-violet)]" />}
            {syncStatus !== 'idle' && (
              <SyncIcon
                size={12}
                className={
                  syncStatus === 'syncing'
                    ? 'animate-spin text-[var(--color-emerald)]'
                    : 'text-[var(--color-blue)]'
                }
              />
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {isRecording && (
            <>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={e => {
                  e.stopPropagation()
                  setIsNoteExpanded(!isNoteExpanded)
                }}
                className={`w-6 h-6 rounded-md flex items-center justify-center text-[var(--color-text-secondary)] transition-colors widget-nodrag ${
                  isNoteExpanded
                    ? 'bg-[var(--color-violet)] text-white'
                    : 'bg-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.1)] hover:text-white'
                }`}
                title="Add Quick Note"
              >
                <PenLine size={12} />
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={e => {
                  e.stopPropagation()
                  onBookmark()
                }}
                className="w-6 h-6 rounded-md bg-[rgba(255,255,255,0.06)] flex items-center justify-center text-[var(--color-text-secondary)] hover:text-white hover:bg-[var(--color-violet)] transition-colors widget-nodrag"
                title="Bookmark Moment (⌘+Shift+B)"
              >
                <BookmarkPlus size={12} />
              </motion.button>
            </>
          )}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={e => {
              e.stopPropagation()
              onRestore()
            }}
            className="w-6 h-6 rounded-md bg-[rgba(255,255,255,0.06)] flex items-center justify-center text-[var(--color-text-secondary)] hover:text-white hover:bg-[rgba(255,255,255,0.1)] transition-colors transform rotate-45 widget-nodrag"
            title="Expand to Full App"
          >
            <Maximize2 size={12} />
          </motion.button>
          {isRecording && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={e => {
                e.stopPropagation()
                onStop()
              }}
              className="w-6 h-6 rounded-md bg-[var(--color-blue)] flex items-center justify-center text-white hover:bg-white hover:text-black transition-colors widget-nodrag ml-0.5"
              title="Stop Archiving"
            >
              <Square size={10} fill="currentColor" />
            </motion.button>
          )}
        </div>
      </motion.div>

      {/* Row 2: Live AI Content */}
      <motion.div layout className="relative z-10 w-full overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false}>
          {isNoteExpanded ? (
            <motion.form
              key="quicknote"
              initial={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
              transition={springSpec}
              onSubmit={handleSubmitNote}
              className="flex flex-col gap-2 mt-2 p-1"
            >
              <input
                type="text"
                autoFocus
                className="w-full bg-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.1)] text-white text-xs px-3 py-2 rounded-md outline-none focus:border-[var(--color-violet)] placeholder:text-[var(--color-text-tertiary)] widget-nodrag transition-colors"
                placeholder="Jot down a quick thought..."
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                onClick={e => e.stopPropagation()}
                onKeyDown={e => e.stopPropagation()}
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  onClick={e => e.stopPropagation()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-violet)] text-white text-[10px] font-medium rounded hover:opacity-90 transition-opacity widget-nodrag disabled:opacity-50"
                  disabled={!noteText.trim()}
                >
                  <Send size={10} />
                  Save Note
                </button>
              </div>
            </motion.form>
          ) : liveCoachTip ? (
            <motion.div
              key="coachtip"
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={springSpec}
              className="flex items-start gap-2 bg-[rgba(139,92,246,0.15)] border border-[rgba(139,92,246,0.3)] rounded-lg p-2 mt-1 shadow-[0_0_12px_rgba(139,92,246,0.1)]"
            >
              <Sparkles
                size={14}
                className="text-[var(--color-violet)] mt-0.5 flex-shrink-0 animate-pulse"
              />
              <p className="text-[12px] text-[var(--color-violet-light)] leading-snug font-medium line-clamp-2">
                {liveCoachTip}
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="transcript"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={springSpec}
              className="text-[12px] text-[var(--color-text-secondary)] leading-snug line-clamp-2 mt-1 px-0.5 flex flex-col gap-1"
            >
              <div className="flex items-center gap-2">
                <span className="truncate">{lastTranscriptLine || 'Waiting for speech...'}</span>
              </div>
              <AnimatePresence>
                {(entityCount > 0 || noteCount > 0) && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex flex-wrap items-center gap-2 text-[10px] text-[var(--color-text-tertiary)] font-medium tracking-wide mt-0.5"
                  >
                    {entityCount > 0 && (
                      <motion.span
                        key={`entity-${entityCount}`}
                        initial={{ scale: 0.8 }}
                        animate={{ scale: 1 }}
                        className="flex items-center gap-1.5 border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.05)] px-1.5 py-0.5 rounded uppercase"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-teal)] animate-pulse shadow-[0_0_4px_var(--color-teal)]" />
                        {entityCount} Entities
                      </motion.span>
                    )}
                    {noteCount > 0 && (
                      <motion.span
                        key={`note-${noteCount}`}
                        initial={{ scale: 0.8 }}
                        animate={{ scale: 1 }}
                        className="flex items-center gap-1.5 border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.05)] px-1.5 py-0.5 rounded uppercase"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-amber)] animate-pulse shadow-[0_0_4px_var(--color-amber)]" />
                        {noteCount} Notes
                      </motion.span>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  )
}
