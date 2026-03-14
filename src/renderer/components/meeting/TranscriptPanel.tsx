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

  const rowVirtualizer = useVirtualizer({
    count: segments.length,
    getScrollElement: () => parentRef.current,
    // Dynamic estimate based on content length — reduces scroll jumping vs fixed 64px
    estimateSize: index => {
      const seg = segments[index]
      const textLen = seg?.text?.length ?? 0
      if (textLen < 80) return 48
      if (textLen < 200) return 72
      return 96
    },
    overscan: 10,
  })

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
        className="ui-transcript-scroll scrollbar-webkit sovereign-scrollbar"
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
                <TranscriptSegment {...segment} />
              </div>
            )
          })}
        </div>
      </div>

      {!autoScroll && segments.length > 5 && (
        <button onClick={jumpToLatest} className="ui-transcript-jump-btn animate-slide-up">
          <ArrowDown size={14} />
          <span className="ui-transcript-jump-text">Jump to latest</span>
        </button>
      )}
    </div>
  )
}
