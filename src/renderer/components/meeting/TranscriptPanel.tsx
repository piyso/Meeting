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

export const TranscriptPanel: React.FC<TranscriptPanelProps> = ({
  segments,
  isRecording,
  isLoading,
}) => {
  const parentRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set())

  const segmentsRef = useRef(segments)
  useEffect(() => {
    segmentsRef.current = segments
  }, [segments])

  const rowVirtualizer = useVirtualizer({
    count: segments.length,
    getScrollElement: () => parentRef.current,
    // Dynamic estimate based on content length — reduces scroll jumping vs fixed 64px
    estimateSize: index => {
      const seg = segments[index]
      const charCount = seg?.text?.length || 0
      return Math.max(64, 40 + Math.ceil(charCount / 60) * 24)
    },
    overscan: 10,
  })

  const virtualizerRef = useRef(rowVirtualizer)
  useEffect(() => {
    virtualizerRef.current = rowVirtualizer
  }, [rowVirtualizer])

  useEffect(() => {
    const handleHighlight = (e: CustomEvent<{ segments: string[] }>) => {
      const ids = e.detail?.segments || []
      setHighlightedIds(new Set(ids))

      if (ids.length > 0) {
        setAutoScroll(false)
        // Find the index of the first highlighted segment
        const firstIndex = segmentsRef.current.findIndex(s => ids.includes(s.id))
        if (firstIndex !== -1 && virtualizerRef.current) {
          // Add a slight delay to allow React state to settle before scrolling
          setTimeout(() => {
            virtualizerRef.current.scrollToIndex(firstIndex, { align: 'center' })
          }, 50)
        }
      } else {
        // Clearing highlight
        if (segmentsRef.current.length > 0) {
          setAutoScroll(true)
        }
      }
    }

    window.addEventListener('highlight-source-segments', handleHighlight as EventListener)
    return () => {
      window.removeEventListener('highlight-source-segments', handleHighlight as EventListener)
    }
  }, [])

  // Auto-scroll logic — use virtualizer's scrollToIndex for correct behavior with dynamic heights
  useEffect(() => {
    if (!autoScroll || !isRecording || segments.length === 0) return
    rowVirtualizer.scrollToIndex(segments.length - 1, { align: 'end' })
  }, [segments.length, autoScroll, isRecording, rowVirtualizer])

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
    if (segments.length > 0) {
      rowVirtualizer.scrollToIndex(segments.length - 1, { align: 'end' })
    }
  }

  if (isLoading) {
    return (
      <div className="ui-transcript-scroll loading hidden-scrollbar">
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
          description={
            isRecording
              ? 'Listening to the meeting...'
              : 'Start recording to see live transcription.'
          }
        />
      </div>
    )
  }

  return (
    <div className="ui-transcript-panel" role="log" aria-live={autoScroll ? 'polite' : 'off'}>
      <div
        ref={parentRef}
        className="ui-transcript-scroll sovereign-scrollbar"
        onScroll={handleScroll}
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map(virtualRow => {
            const segment = segments[virtualRow.index] as TranscriptSegmentProps
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
                <TranscriptSegment {...segment} isHighlighted={highlightedIds.has(segment.id)} />
              </div>
            )
          })}
        </div>
      </div>

      {!autoScroll && segments.length > 5 && (
        <button
          onClick={jumpToLatest}
          className="ui-transcript-jump-btn animate-slide-up sovereign-glass premium-hover"
        >
          <ArrowDown size={14} />
          <span className="ui-transcript-jump-text">Jump to latest</span>
        </button>
      )}
    </div>
  )
}
