import React, { useEffect, useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { TranscriptPanel } from '../meeting/TranscriptPanel'
import { SplitPane } from '../ui/SplitPane'
import { Button } from '../ui/Button'
import { ArrowUp } from 'lucide-react'

const typeWriterAnimation = {
  hidden: { opacity: 0 },
  visible: (i: number) => ({
    opacity: 1,
    transition: {
      delay: i * 0.04, // 40ms per char
    },
  }),
}

const TutorialNotePane: React.FC<{
  isExpanded: boolean
  onExpand: () => void
}> = ({ isExpanded, onExpand }) => {
  const [content, setContent] = useState('John mentioned the new API limits.')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const aiResponse =
    ' The new rate is 1000 req/min starting Q3, requiring all legacy endpoints to be migrated by August 1st.'
  const chars = aiResponse.split('')

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.metaKey && !isExpanded) {
      e.preventDefault()
      onExpand()
    }
  }

  return (
    <motion.div
      className="w-full h-full p-[var(--space-16)] font-body text-[var(--text-sm)] relative flex flex-col transition-all duration-500"
      animate={{
        boxShadow: isExpanded
          ? 'inset 0 0 0 1px var(--color-glow-violet), 0 0 16px rgba(167, 139, 250, 0.15)'
          : 'none',
        backgroundColor: isExpanded ? 'var(--color-bg-panel)' : 'transparent',
      }}
    >
      <textarea
        ref={textareaRef}
        value={content}
        onChange={e => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Start typing your notes here… Press ⌘+Enter to expand with AI."
        className="w-full h-full bg-transparent resize-none outline-none text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)]"
        disabled={isExpanded}
      />

      {isExpanded && (
        <div className="absolute top-[var(--space-16)] left-[var(--space-16)] pointer-events-none whitespace-pre-wrap">
          <span className="opacity-0">{content}</span>
          <motion.span
            className="animate-iridescent-text"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            {chars.map((char, i) => (
              <motion.span
                key={i}
                custom={i}
                variants={typeWriterAnimation}
                initial="hidden"
                animate="visible"
              >
                {char}
              </motion.span>
            ))}
          </motion.span>
        </div>
      )}
    </motion.div>
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

  useEffect(() => {
    const rawSegments: TutorialSegment[] = [
      {
        id: 't1',
        speakerName: 'System',
        speakerColor: 'violet',
        timestamp: '00:00',
        text: "Welcome to BlueArkive! Let's take a quick tour.",
        isLive: false,
        isEdited: false,
        isPinned: false,
      },
      {
        id: 't2',
        speakerName: 'System',
        speakerColor: 'violet',
        timestamp: '00:05',
        text: 'Your meeting transcripts will appear up here in real time.',
        isLive: false,
        isEdited: false,
        isPinned: false,
      },
      {
        id: 't3',
        speakerName: 'You',
        speakerColor: 'teal',
        timestamp: '00:12',
        text: 'And I can take notes down below without losing my place?',
        isLive: false,
        isEdited: false,
        isPinned: false,
      },
      {
        id: 't4',
        speakerName: 'System',
        speakerColor: 'violet',
        timestamp: '00:15',
        text: 'Exactly. The transcript auto-scrolls independently.',
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
        curr++
      } else {
        clearInterval(interval)
      }
    }, 2500)

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="w-full h-full relative bg-[var(--color-bg-root)] overflow-hidden">
      <div className="absolute inset-0 p-[var(--space-24)]">
        <div className="w-full h-full surface-glass-premium rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] overflow-hidden blur-[1px]">
          <SplitPane
            defaultRatio={0.5}
            top={<TranscriptPanel segments={segments} isRecording={true} />}
            bottom={
              <TutorialNotePane
                isExpanded={isNoteExpanded}
                onExpand={() => setIsNoteExpanded(true)}
              />
            }
          />
        </div>
      </div>

      {/* Tutorial Overlays */}
      <div className="absolute inset-0 pointer-events-none z-50">
        <div className="absolute top-[var(--space-32)] left-[var(--space-32)] flex gap-4 animate-fade-in">
          <Button
            variant="secondary"
            size="md"
            onClick={onComplete}
            className="pointer-events-auto shadow-xl"
          >
            Skip Tutorial
          </Button>
        </div>

        {step >= 1 && (
          <div className="absolute top-[30%] left-1/2 -translate-x-1/2 flex flex-col items-center animate-slide-up bg-[rgba(167,139,250,0.15)] border border-[var(--color-violet)] rounded-[var(--radius-md)] p-[var(--space-12)] shadow-[0_0_24px_rgba(167,139,250,0.2)]">
            <span className="text-[var(--text-sm)] font-medium text-[var(--color-text-primary)]">
              Transcripts stream live here
            </span>
            <ArrowUp size={24} className="mt-2 text-[var(--color-violet)] animate-bounce" />
          </div>
        )}

        {step >= 3 && (
          <div className="absolute bottom-[20%] left-1/2 -translate-x-1/2 flex flex-col items-center animate-slide-up bg-[rgba(167,139,250,0.15)] border border-[var(--color-violet)] rounded-[var(--radius-md)] p-[var(--space-12)] shadow-[0_0_24px_rgba(167,139,250,0.2)]">
            <span className="text-[var(--text-sm)] font-medium text-[var(--color-text-primary)]">
              Take notes below and press Cmd+Enter
            </span>
            <span className="text-[var(--text-xs)] text-[var(--color-text-tertiary)] mb-2">
              to expand your notes with AI
            </span>
            <ArrowDown size={24} className="text-[var(--color-violet)] animate-bounce" />
          </div>
        )}
      </div>
    </div>
  )
}

function ArrowDown(props: React.ComponentProps<typeof ArrowUp>) {
  return <ArrowUp {...props} style={{ transform: 'rotate(180deg)', ...props.style }} />
}
