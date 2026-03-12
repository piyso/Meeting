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

// Simulated NotePane matching the exact CSS structure of NoteEditor.tsx
const TutorialNotePane: React.FC<{
  step: number
  isExpanded: boolean
  onExpand: () => void
}> = ({ step, isExpanded, onExpand }) => {
  const [content, setContent] = useState('John mentioned the new API limits.')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const aiResponse =
    ' The new rate is 1000 req/min starting Q3, requiring all legacy endpoints to be migrated by August 1st.'
  const chars = aiResponse.split('')

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !isExpanded) {
      e.preventDefault()
      onExpand()
    }
  }

  return (
    <div className="ui-note-editor-panel relative">
      {/* Pointer 2 solidly anchored above the Notebook pane */}
      <AnimatePresence>
        {step === 3 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', stiffness: 350, damping: 28, mass: 0.8 }}
            className="absolute bottom-full mb-6 left-1/2 -translate-x-1/2 flex flex-col items-center bg-[rgba(167,139,250,0.1)] border border-[var(--color-violet)]/40 rounded-2xl p-6 shadow-[0_0_50px_rgba(167,139,250,0.15)] backdrop-blur-xl w-max z-[100]"
          >
            <span className="text-lg font-bold text-white tracking-tight">
              Instantly Expand Your Notes
            </span>
            <span className="text-[14px] text-[var(--color-text-secondary)] mt-2 mb-5 max-w-[300px] leading-relaxed tracking-wide text-center">
              Type a brief thought below, then press{' '}
              <kbd className="bg-black/40 px-1.5 py-0.5 rounded-md text-white border border-white/20 shadow-sm font-sans mx-0.5">
                ⌘
              </kbd>{' '}
              +{' '}
              <kbd className="bg-black/40 px-1.5 py-0.5 rounded-md text-white border border-white/20 shadow-sm font-sans mx-0.5">
                Enter
              </kbd>{' '}
              to magically compile it using full meeting context.
            </span>
            <ArrowUp
              size={28}
              className="text-[var(--color-violet)] animate-bounce drop-shadow-[0_0_12px_rgba(167,139,250,0.6)] rotate-180"
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="ui-note-editor-scroll scrollbar-webkit">
        <div className="ui-note-editor-content p-[calc(var(--space-24)*0.75)] sm:p-[var(--space-24)] text-[var(--text-base)] text-[var(--color-text-primary)]">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={e => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Start typing your notes... (${modLabel}+Enter to expand via AI)`}
            className="w-full h-24 bg-transparent resize-none outline-none placeholder-[var(--color-text-tertiary)] font-body"
            disabled={isExpanded}
          />

          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              transition={{ type: 'spring', stiffness: 350, damping: 28, mass: 0.8 }}
              className="ai-expansion mt-4 pl-4 border-l-2 border-[var(--color-violet)] bg-[var(--color-violet)]/10 p-4 rounded-r-xl overflow-hidden shadow-sm"
            >
              <strong className="text-[var(--color-violet)] flex items-center gap-2 mb-2 font-semibold">
                <span className="text-lg">✨</span> AI Expansion
              </strong>
              <div className="text-[var(--text-sm)] opacity-95 inline leading-relaxed tracking-wide">
                {chars.map((char, i) => (
                  <motion.span
                    key={i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                  >
                    {char}
                  </motion.span>
                ))}
              </div>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: chars.length * 0.02 + 0.3 }}
                className="mt-3 pt-3 border-t border-[var(--color-violet)]/20 text-[var(--text-xs)] text-[var(--color-violet)] opacity-70 font-medium tracking-wider"
              >
                <a href="#anchor" className="hover:underline cursor-none pointer-events-none">
                  VIEW SOURCE CONTEXT
                </a>
              </motion.div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}

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

interface GhostMeetingTutorialProps {
  onComplete: () => void
}

export const GhostMeetingTutorial: React.FC<GhostMeetingTutorialProps> = ({ onComplete }) => {
  const [segments, setSegments] = useState<TutorialSegment[]>([])
  const [step, setStep] = useState(0)
  const [isNoteExpanded, setIsNoteExpanded] = useState(false)
  const [demoElapsedTime, setDemoElapsedTime] = useState('00:00')

  useEffect(() => {
    const rawSegments: TutorialSegment[] = [
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

    let curr = 0
    const interval = setInterval(() => {
      if (curr < rawSegments.length) {
        setSegments(rawSegments.slice(0, curr + 1))
        setStep(curr)
        setDemoElapsedTime(`00:${(curr * 5).toString().padStart(2, '0')}`)
        curr++
      } else {
        clearInterval(interval)
      }
    }, 4500)

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="w-full h-full relative overflow-hidden flex justify-center">
      {/* 1:1 REPLICA OF MeetingDetailView.tsx BACKGROUND APP LAYER */}
      <motion.div
        className="absolute inset-x-0 top-0 bottom-[100px] flex justify-center pt-[var(--space-24)] px-[calc(var(--space-24)*2)]"
        animate={{
          scale: step >= 4 ? 0.95 : 1,
          opacity: step >= 4 ? 0.35 : 1,
          filter: step >= 4 ? 'blur(6px)' : 'blur(0px)',
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 24, mass: 0.8 }}
      >
        <div
          className="w-full max-w-6xl h-full flex flex-col gap-[var(--space-16)] ui-view-meeting-detail"
          style={{ padding: 0 }}
        >
          {/* Header Replica */}
          <div className="flex items-center px-[var(--space-12)] pt-[var(--space-12)]">
            <input
              className="bg-transparent border-none text-[22px] font-semibold text-[var(--color-text-primary)] outline-none w-full tracking-tight"
              value="Ghost Meeting Setup"
              disabled
            />
            <button
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                color: 'var(--color-text-secondary)',
                border: '1px solid var(--color-border-subtle)',
                padding: '8px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: 'auto',
              }}
            >
              <Tag size={18} />
            </button>
          </div>

          {/* Authentic Silent Prompter Block Replica - with Tutorial Pointer 1 permanently grafted to it */}
          <div className="relative z-50 inline-block mt-[var(--space-8)] ml-[72px]">
            <Tooltip
              content="Live AI Coach: Automatically suggests questions and actions during your meeting"
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
                            ? 'Ask John to clarify API limits starting Q3'
                            : 'Summarizing meeting context…'
                  }
                  onDismiss={() => {
                    // No-op: prevent auto-dismiss during tutorial so Pointer 1 always has a visible target
                  }}
                />
              </div>
            </Tooltip>

            {/* Pointer 1 natively locked to the Prompter */}
            <AnimatePresence>
              {step === 1 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 10, x: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10, x: -10 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.8 }}
                  className="absolute top-[100%] left-0 mt-4 flex flex-col items-start bg-[rgba(167,139,250,0.1)] border border-[var(--color-violet)]/40 rounded-2xl p-6 shadow-[0_0_50px_rgba(167,139,250,0.15)] backdrop-blur-xl w-full max-w-[400px]"
                >
                  <div className="flex items-start gap-4">
                    <ArrowUp
                      size={28}
                      className="text-[var(--color-violet)] animate-bounce drop-shadow-[0_0_12px_rgba(167,139,250,0.6)] mt-1"
                    />
                    <div className="flex flex-col">
                      <span className="text-lg font-bold text-white tracking-tight">
                        Live Transcripts & AI Coach
                      </span>
                      <span className="text-[14px] text-[var(--color-text-secondary)] mt-2 leading-relaxed">
                        Watch the transcript flow in real-time. Notice your AI Coach quietly
                        whispering helpful suggestions up exactly where the arrow points.
                      </span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="ui-view-meeting-detail-columns h-full pb-[var(--space-32)] relative">
            <div className={`ui-view-meeting-detail-main full h-full relative`}>
              {/* The Sovereign Glass Panel containing the SplitPane */}
              <div
                className="ui-view-meeting-detail-panel sovereign-glass-panel border border-[var(--color-border-subtle)] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] transition-all duration-1000 h-full bg-[var(--color-bg-panel)] rounded-2xl relative mt-0"
                style={{ overflow: 'visible' }}
              >
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
          <div className="absolute top-[120px] flex justify-center w-full z-40">
            <motion.div
              initial={{ y: -100, opacity: 0, scale: 0.85, filter: 'blur(10px)' }}
              animate={{ y: 0, opacity: 1, scale: 1, filter: 'blur(0px)' }}
              transition={{
                type: 'spring',
                stiffness: 350,
                damping: 25,
                mass: 1.2,
                bounce: 0.4,
              }}
              className="relative pointer-events-auto flex flex-col items-center gap-6"
            >
              <div className="shadow-[0_50px_100px_-20px_rgba(0,0,0,0.9)] rounded-[var(--radius-xl)]">
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
                transition={{ type: 'spring', stiffness: 350, damping: 28, mass: 0.8, delay: 0.1 }}
                className="flex flex-col items-center select-none w-full max-w-[420px]"
              >
                <ArrowUp
                  size={28}
                  className="text-[var(--color-violet)] animate-bounce mb-4 drop-shadow-[0_0_16px_rgba(167,139,250,0.8)]"
                />
                <div className="bg-[rgba(167,139,250,0.1)] border border-[var(--color-violet)]/40 rounded-3xl p-8 shadow-[0_20px_60px_rgba(167,139,250,0.2)] backdrop-blur-2xl flex flex-col items-center justify-center text-center">
                  <span className="text-xl font-bold text-white tracking-tight mb-3">
                    The Dynamic Island
                  </span>
                  <span className="text-[14px] text-[var(--color-text-secondary)] leading-relaxed px-2">
                    Minimize BlueArkive and it seamlessly transforms into a global widget. Never
                    lose context no matter what application you are working in.
                  </span>

                  <div className="flex gap-12 mt-6 pt-6 border-t border-[var(--color-violet)]/10 w-[80%] justify-center text-[11px] font-bold tracking-widest text-[var(--color-violet)]">
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

      {/* TUTORIAL INSTRUCTION OVERLAYS */}
      <div className="absolute inset-0 pointer-events-none z-50">
        <div className="absolute top-[var(--space-32)] left-[var(--space-32)] flex gap-4 animate-fade-in">
          <Button
            variant="secondary"
            size="md"
            onClick={onComplete}
            className="pointer-events-auto shadow-2xl bg-black/40 border-white/10 hover:bg-black/60 backdrop-blur-md"
          >
            Skip Tutorial
          </Button>
        </div>
      </div>

      {/* Bottom Completion Bar */}
      <div className="absolute inset-x-0 bottom-[var(--space-32)] flex justify-center pointer-events-none z-[60]">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: step >= 1 ? 1 : 0, y: step >= 1 ? 0 : 30 }}
          transition={{ type: 'spring', stiffness: 300, damping: 24, mass: 0.8 }}
        >
          <Button
            variant="primary"
            size="lg"
            onClick={onComplete}
            className={`pointer-events-auto transition-all shadow-[0_10px_40px_rgba(0,0,0,0.5)] h-14 px-10 text-[15px] font-semibold tracking-wide rounded-full ${step >= 4 ? 'bg-white text-slate-950 hover:bg-slate-200 scale-105' : 'bg-white/10 text-slate-300 hover:bg-white/20 border border-white/10 backdrop-blur-md'}`}
          >
            {step >= 4 ? 'Enter the Matrix →' : 'Finish Tutorial'}
          </Button>
        </motion.div>
      </div>
    </div>
  )
}
