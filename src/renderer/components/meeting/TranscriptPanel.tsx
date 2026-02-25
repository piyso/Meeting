import React, { useRef, useState, useEffect } from 'react'
import { ArrowDown, Mic } from 'lucide-react'
import { TranscriptSegment, TranscriptSegmentProps } from './TranscriptSegment'
import { TranscriptSkeleton } from '../ui/Skeletons'
import { EmptyState } from '../ui/EmptyState'
import { useVirtualizer } from '@tanstack/react-virtual'

interface TranscriptPanelProps {
  segments: TranscriptSegmentProps[]
  isRecording: boolean
  isLoading?: boolean
}

export const TranscriptPanel: React.FC<TranscriptPanelProps> = ({ segments, isRecording, isLoading }) => {
  const parentRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  const rowVirtualizer = useVirtualizer({
    count: segments.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64, // Estimate height
    overscan: 10,
  })

  // Auto-scroll logic
  useEffect(() => {
    if (!autoScroll || !isRecording || segments.length === 0) return
    const el = parentRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [segments.length, autoScroll, isRecording])

  const handleScroll = () => {
    const el = parentRef.current
    if (!el) return
    // Check if user scrolled up
    const isAtBottom = Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop) < 10
    if (!isAtBottom && autoScroll) {
      setAutoScroll(false)
    } else if (isAtBottom && !autoScroll) {
      setAutoScroll(true)
    }
  }

  const jumpToLatest = () => {
    setAutoScroll(true)
    if (parentRef.current) {
      parentRef.current.scrollTop = parentRef.current.scrollHeight
    }
  }

  if (isLoading) {
    return (
      <div className="h-full w-full p-[var(--space-16)] overflow-y-auto hidden-scrollbar">
        <TranscriptSkeleton />
      </div>
    )
  }

  if (segments.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <EmptyState 
          icon={Mic} 
          title="Waiting for audio" 
          description={isRecording ? "Listening to the meeting..." : "Start recording to see live transcription."} 
        />
      </div>
    )
  }

  return (
    <div 
      className="relative h-full w-full"
      role="log"
      aria-live={autoScroll ? "polite" : "off"}
    >
      <div 
        ref={parentRef}
        className="h-full w-full overflow-y-auto px-[var(--space-16)] pb-24 scrollbar-webkit"
        onScroll={handleScroll}
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const segment = segments[virtualRow.index] as any
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <TranscriptSegment {...segment} />
              </div>
            )
          })}
        </div>
      </div>

      {!autoScroll && segments.length > 5 && (
        <button
          onClick={jumpToLatest}
          className="absolute bottom-[var(--space-16)] right-[var(--space-16)] surface-glass-premium shrink-0 rounded-full px-[var(--space-12)] py-[var(--space-8)] flex items-center gap-2 text-[var(--color-text-secondary)] hover:text-white transition-colors border border-[var(--color-border-subtle)] shadow-xl animate-slide-up"
        >
          <ArrowDown size={14} />
          <span className="text-[var(--text-xs)] font-medium">Jump to latest</span>
        </button>
      )}
    </div>
  )
}
