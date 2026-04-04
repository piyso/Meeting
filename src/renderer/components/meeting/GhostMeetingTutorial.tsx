import React, { useEffect, useState, useRef } from 'react'
import { modKey, modLabel } from '../../utils/platformShortcut'
import { motion, AnimatePresence } from 'framer-motion'
import { TranscriptPanel } from '../meeting/TranscriptPanel'
import { MiniWidget } from '../meeting/MiniWidget'
import { SplitPane } from '../ui/SplitPane'
import { Button } from '../ui/Button'
import { ArrowUp, BookMarked, PenLine, Tag } from 'lucide-react'
import { SilentPrompter } from '../meeting/SilentPrompter'
import { Tooltip } from '../ui/Tooltip'

interface TutorialSegment {
  id: string
  speakerName: string
  speakerColor: 'violet' | 'teal' | 'amber' | 'rose' | 'sky' | 'lime'
  timestamp: string
  text: string
  isLive: boolean
  isEdited: boolean
  isPinned: boolean
}

const RAW_SEGMENTS: TutorialSegment[] = [
  {
    id: 't1',
    speakerName: 'System',
    speakerColor: 'violet',
    timestamp: '00:00',
    text: "Welcome to BlueArkive! Let's tour your new superpower.",
    isLive: false,
    isEdited: false,
    isPinned: false,
  },
  {
    id: 't2',
    speakerName: 'System',
    speakerColor: 'violet',
    timestamp: '00:05',
    text: 'Transcripts stream perfectly in real-time right here.',
    isLive: false,
    isEdited: false,
    isPinned: false,
  },
  {
    id: 't3',
    speakerName: 'You',
    speakerColor: 'teal',
    timestamp: '00:12',
    text: 'And what happens if I miss something important while taking notes?',
    isLive: false,
    isEdited: false,
    isPinned: false,
  },
  {
    id: 't4',
    speakerName: 'System',
    speakerColor: 'violet',
    timestamp: '00:15',
    text: `Just use Magic Notes below. Type a few words, press ${modKey}+Enter, and the local AI instantly expands it using the transcript context.`,
    isLive: true,
    isEdited: false,
    isPinned: false,
  },
  {
    id: 't5',
    speakerName: 'System',
    speakerColor: 'violet',
    timestamp: '00:25',
    text: 'And when you minimize the app, the Dynamic Island takes over so Sovereign Memory travels with you anywhere.',
    isLive: true,
    isEdited: false,
    isPinned: true,
  },
]

// ----------------------------------------------------
// AI Cascade Typewriter Effect Component
// ----------------------------------------------------
const CascadeText: React.FC<{ text: string; delayOffset?: number }> = ({
  text,
  delayOffset = 0,
}) => {
  const chars = text.split('')
  return (
    <span style={{ display: 'inline' }}>
      {chars.map((char, index) => (
        <motion.span
          key={index}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.05, delay: delayOffset + index * 0.015 }}
        >
          {char}
        </motion.span>
      ))}
    </span>
  )
}

// ----------------------------------------------------
// Isolated Tutorial NoteEditor Component
// ----------------------------------------------------
const TutorialNotePane: React.FC<{
  step: number
  isExpanded: boolean
  onExpand: () => void
}> = ({ step, isExpanded, onExpand }) => {
  const [content, setContent] = useState('John mentioned the new API limits.')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const aiResponse =
    ' The new rate is 1000 req/min starting Q3, requiring all legacy endpoints to be migrated by August 1st.'

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !isExpanded) {
      e.preventDefault()
      onExpand()
    }
  }

  useEffect(() => {
    if (step === 3 && !isExpanded) {
      textareaRef.current?.focus()
    }
  }, [step, isExpanded])

  return (
    <div className="ui-note-editor-panel relative h-full w-full">
      <div className="ui-note-editor-scroll sovereign-scrollbar">
        <div className="ui-note-editor-content p-[calc(var(--space-24)*0.75)] sm:p-[var(--space-24)] text-[var(--text-base)] text-[var(--color-text-primary)]">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={e => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Start typing your notes... (${modLabel}+Enter to expand via AI)`}
            className={`w-full h-24 bg-transparent resize-none outline-none font-body transition-all duration-300 ${
              isExpanded
                ? 'text-slate-500 cursor-not-allowed opacity-50'
                : 'placeholder-[var(--color-text-tertiary)]'
            }`}
            disabled={isExpanded}
          />

          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              transition={{ type: 'spring', stiffness: 350, damping: 28, mass: 0.8 }}
              className="ai-expansion mt-4 pl-4 border-l-2 border-[var(--color-violet)] bg-[var(--color-violet)]/10 p-5 rounded-xl overflow-hidden shadow-sm"
            >
              <strong className="text-[var(--color-violet)] flex items-center gap-2 mb-2 font-semibold">
                <span className="text-lg">✨</span> AI Expansion
              </strong>
              <div className="text-[var(--text-sm)] opacity-95 inline leading-relaxed tracking-wide text-gray-100">
                <CascadeText text={aiResponse} delayOffset={0.2} />
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}

// ----------------------------------------------------
// Main Tutorial Component (w/ State Machine)
// ----------------------------------------------------
export const GhostMeetingTutorial: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [segments, setSegments] = useState<TutorialSegment[]>([])
  const [step, setStep] = useState(0)
  const [isNoteExpanded, setIsNoteExpanded] = useState(false)
  const [demoElapsedTime, setDemoElapsedTime] = useState('00:00')

  // Interactive State Machine
  useEffect(() => {
    const updateDemoState = (s: number) => {
      setSegments(RAW_SEGMENTS.slice(0, s + 1))
      setDemoElapsedTime(`00:${(s * 5).toString().padStart(2, '0')}`)
    }

    if (step === 0) {
      updateDemoState(0)
      const t = setTimeout(() => setStep(1), 3000)
      return () => clearTimeout(t)
    } else if (step === 1) {
      updateDemoState(1)
      const t = setTimeout(() => setStep(2), 6000)
      return () => clearTimeout(t)
    } else if (step === 2) {
      updateDemoState(2)
      const t = setTimeout(() => setStep(3), 6000)
      return () => clearTimeout(t)
    } else if (step === 3) {
      updateDemoState(3)
      // Paused. Waiting for `isNoteExpanded` user action.
    } else if (step === 4) {
      updateDemoState(4)
      // Final stage.
    }
    return undefined
  }, [step])

  // Trigger advance when Note is expanded
  useEffect(() => {
    if (step === 3 && isNoteExpanded) {
      const t = setTimeout(() => setStep(4), 5000) // 5 seconds to read the typing AI response before island takeover
      return () => clearTimeout(t)
    }
    return undefined
  }, [step, isNoteExpanded])

  return (
    <div className="w-full h-full relative overflow-hidden flex justify-center bg-black/50">
      {/* Skip Button seamlessly integrated */}
      <AnimatePresence>
        {step < 4 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, filter: 'blur(5px)' }}
            className="absolute top-[var(--space-32)] left-[var(--space-32)] z-[60]"
          >
            <Button
              variant="secondary"
              size="md"
              onClick={onComplete}
              className="shadow-2xl bg-black/40 border-white/10 hover:bg-black/60 backdrop-blur-md font-medium tracking-wide"
            >
              Skip Tutorial
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 1:1 REPLICA OF MeetingDetailView.tsx BACKGROUND LAYER */}
      <motion.div
        className="absolute inset-x-0 top-0 bottom-[var(--space-32)] flex justify-center pt-[var(--space-20)] px-[clamp(var(--space-12),3vw,var(--space-32))]"
        animate={{
          scale: step >= 4 ? 0.95 : 1,
          opacity: step >= 4 ? 0.35 : 1,
          filter: step >= 4 ? 'blur(8px)' : 'blur(0px)',
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 24, mass: 0.8 }}
      >
        <div
          className="w-full max-w-6xl h-full flex flex-col gap-[var(--space-12)] ui-view-meeting-detail relative"
          style={{ padding: 0 }}
        >
          {/* Header Replica */}
          <div className="flex items-center px-[var(--space-24)] pt-[var(--space-16)] pb-[var(--space-8)]">
            <input
              className="bg-transparent border-none text-[22px] font-semibold text-[var(--color-text-primary)] outline-none w-full tracking-tight"
              value="Ghost Meeting Setup"
              disabled
            />
            <button className="ml-auto flex items-center justify-center p-2 rounded-lg bg-white/5 border border-white/10 text-[var(--color-text-secondary)]">
              <Tag size={18} />
            </button>
          </div>

          {/* Authentic Silent Prompter Block Replica positioned robustly */}
          <div className="absolute top-[var(--space-20)] w-full flex justify-center z-50 pointer-events-none">
            <div className="relative pointer-events-auto flex flex-col items-center">
              <Tooltip
                content="Live AI Coach: Automatically suggests questions and actions"
                position="bottom"
                delay={300}
              >
                <div>
                  <SilentPrompter
                    suggestion={
                      step === 0
                        ? 'Initializing your meeting…'
                        : step === 1
                          ? 'Waiting for conversation…'
                          : step === 2
                            ? 'Analyzing transcript context…'
                            : step === 3
                              ? 'Ask John to clarify API limits'
                              : 'Summarizing connection graph…'
                    }
                    onDismiss={() => {}}
                  />
                </div>
              </Tooltip>

              <AnimatePresence>
                {(step === 1 || step === 2) && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    transition={{ type: 'spring', stiffness: 350, damping: 28, mass: 0.8 }}
                    className="absolute top-[100%] mt-6 flex flex-col items-center bg-[rgba(167,139,250,0.15)] border border-[var(--color-violet)]/40 rounded-2xl p-5 shadow-[0_0_50px_rgba(167,139,250,0.2)] backdrop-blur-xl w-[calc(100vw-var(--space-64))] max-w-[340px]"
                  >
                    <ArrowUp
                      size={24}
                      className="text-[var(--color-violet)] animate-bounce drop-shadow-[0_0_12px_rgba(167,139,250,0.6)] mb-3"
                    />
                    <div className="flex flex-col text-center">
                      <span className="text-[16px] font-bold text-white tracking-tight">
                        Live Transcripts & AI Coach
                      </span>
                      <span className="text-[13px] text-[var(--color-text-secondary)] mt-1.5 leading-relaxed">
                        Watch the transcript flow in real-time. The AI Coach quietly whispers
                        helpful suggestions during the call above.
                      </span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="ui-view-meeting-detail-columns h-full pb-[var(--space-32)] relative">
            <div className={`ui-view-meeting-detail-main full h-full relative`}>
              {/* Pointer 2 solidly anchored at the Panel Level avoiding SplitPane clipping */}
              <AnimatePresence>
                {step === 3 && !isNoteExpanded && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    transition={{ type: 'spring', stiffness: 350, damping: 28, mass: 0.8 }}
                    className="absolute z-[100] left-1/2 -translate-x-1/2 bottom-[45%] flex flex-col items-center bg-[rgba(167,139,250,0.15)] border border-[var(--color-violet)]/30 rounded-2xl p-6 shadow-[0_0_50px_rgba(167,139,250,0.2)] backdrop-blur-xl w-[calc(100vw-var(--space-32))] max-w-[360px]"
                  >
                    <span className="text-lg font-bold text-white tracking-tight mb-2">
                      Instantly Expand Your Notes
                    </span>
                    <span className="text-[14px] text-[var(--color-text-secondary)] leading-relaxed tracking-wide text-center">
                      Type a brief thought in the pane below, then press{' '}
                      <kbd className="bg-black/40 px-1.5 py-0.5 rounded-md text-white border border-white/20 shadow-sm font-sans mx-0.5">
                        {modLabel}
                      </kbd>{' '}
                      +{' '}
                      <kbd className="bg-black/40 px-1.5 py-0.5 rounded-md text-white border border-white/20 shadow-sm font-sans mx-0.5">
                        Enter
                      </kbd>{' '}
                      to selectively compile it using transcript context.
                    </span>
                    <ArrowUp
                      size={28}
                      className="text-[var(--color-violet)] animate-bounce drop-shadow-[0_0_12px_rgba(167,139,250,0.6)] mt-6 rotate-[180deg]"
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* The Sovereign Glass Panel containing the SplitPane */}
              <div className="ui-view-meeting-detail-panel sovereign-glass-panel border border-[var(--color-border-subtle)] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] transition-all duration-1000 h-full bg-[var(--color-bg-panel)] rounded-2xl relative mt-0 overflow-hidden">
                <SplitPane
                  defaultRatio={0.55}
                  minTopHeight={200}
                  top={<TranscriptPanel segments={segments} isRecording={true} isLoading={false} />}
                  bottom={
                    <TutorialNotePane
                      step={step}
                      isExpanded={isNoteExpanded}
                      onExpand={() => setIsNoteExpanded(true)}
                    />
                  }
                />
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* FLOATING DYNAMIC ISLAND (Phase 3 Overlay) */}
      <AnimatePresence>
        {step >= 4 && (
          <div className="absolute top-[80px] sm:top-[120px] flex justify-center w-full z-[80] px-4 pointer-events-none">
            <motion.div
              initial={{ y: -100, opacity: 0, scale: 0.85, filter: 'blur(10px)' }}
              animate={{ y: 0, opacity: 1, scale: 1, filter: 'blur(0px)' }}
              transition={{
                type: 'spring',
                stiffness: 350,
                damping: 25,
                mass: 1.2,
                bounce: 0.4, // Used valid spring property combo
              }}
              className="relative pointer-events-auto flex flex-col items-center gap-6"
            >
              <div className="shadow-[0_50px_100px_-20px_rgba(0,0,0,0.9)] rounded-[var(--radius-xl)] w-full max-w-[320px]">
                <MiniWidget
                  isRecording={true}
                  elapsedTime={demoElapsedTime}
                  lastTranscriptLine={segments[segments.length - 1]?.text || 'Initializing...'}
                  audioMode="system"
                  syncStatus="idle"
                  liveCoachTip="Summarizing meeting context..."
                  entityCount={3}
                  noteCount={1}
                  onRestore={() => {}}
                  onStop={() => {}}
                  onBookmark={() => {}}
                  onQuickNote={() => {}}
                />
              </div>

              {/* Locked-in Pointer 3 Instruction */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 350, damping: 28, mass: 0.8, delay: 0.2 }}
                className="flex flex-col items-center select-none w-full max-w-[420px]"
              >
                <ArrowUp
                  size={28}
                  className="text-[var(--color-violet)] animate-bounce mb-4 drop-shadow-[0_0_16px_rgba(167,139,250,0.8)]"
                />
                <div className="bg-[rgba(167,139,250,0.15)] border border-[var(--color-violet)]/40 rounded-3xl p-6 sm:p-8 shadow-[0_20px_60px_rgba(167,139,250,0.2)] backdrop-blur-2xl flex flex-col items-center justify-center text-center">
                  <span className="text-xl font-bold text-white tracking-tight mb-3">
                    The Dynamic Island
                  </span>
                  <span className="text-[14px] text-[var(--color-text-secondary)] leading-relaxed px-2">
                    Minimize BlueArkive and it seamlessly transforms into a global widget. Never
                    lose context no matter what application you are working in.
                  </span>

                  <div className="flex gap-8 sm:gap-12 mt-6 pt-6 border-t border-[var(--color-violet)]/20 w-[90%] justify-center text-[10px] sm:text-[11px] font-bold tracking-widest text-[var(--color-violet)] items-center">
                    <div className="flex flex-col items-center gap-2 hover:text-white transition-colors cursor-crosshair">
                      <PenLine size={20} /> QUICK NOTES
                    </div>
                    <div className="flex flex-col items-center gap-2 hover:text-white transition-colors cursor-crosshair">
                      <BookMarked size={20} /> BOOKMARKS
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Progress Dots Indicator */}
      <div className="absolute bottom-6 sm:bottom-8 left-1/2 -translate-x-1/2 flex gap-3 z-[70] pointer-events-none">
        {[0, 1, 2, 3, 4].map(idx => (
          <div
            key={idx}
            className={`w-2 h-2 rounded-full transition-all duration-500 ${
              idx === step
                ? 'bg-[var(--color-violet)] scale-125 shadow-[0_0_10px_var(--color-violet)]'
                : idx < step
                  ? 'bg-[var(--color-violet)] opacity-40'
                  : 'bg-white/10'
            }`}
          />
        ))}
      </div>

      {/* Bottom Completion Bar */}
      <div className="absolute inset-x-0 bottom-[var(--space-32)] flex justify-center pointer-events-none z-[90]">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: step >= 1 ? 1 : 0, y: step >= 1 ? 0 : 30 }}
          transition={{ type: 'spring', stiffness: 300, damping: 24, mass: 0.8 }}
        >
          <Button
            variant="primary"
            size="lg"
            onClick={onComplete}
            className={`pointer-events-auto transition-all shadow-[0_10px_40px_rgba(0,0,0,0.5)] h-14 px-10 text-[15px] font-semibold tracking-wide rounded-full ${
              step >= 4
                ? 'bg-white text-slate-950 hover:bg-slate-200 scale-105'
                : 'bg-white/10 text-slate-300 hover:bg-white/20 border border-white/10 backdrop-blur-md'
            }`}
          >
            {step >= 4 ? 'Enter the Matrix →' : 'Finish Tutorial'}
          </Button>
        </motion.div>
      </div>
    </div>
  )
}
