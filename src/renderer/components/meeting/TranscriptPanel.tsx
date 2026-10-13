import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react'
import { ArrowDown, Mic, Search, ChevronUp, ChevronDown, X } from 'lucide-react'
import { TranscriptSegment, TranscriptSegmentProps } from './TranscriptSegment'
import { TranscriptSkeleton } from '../ui/Skeletons'
import { EmptyState } from '../ui/EmptyState'
import { useVirtualizer } from '@tanstack/react-virtual'
import { modKey } from '../../utils/platformShortcut'

interface TranscriptPanelProps {
  segments: TranscriptSegmentProps[]
  isRecording: boolean
  isLoading?: boolean
  /** Toggle a bookmark on a segment (star button). Omit to hide the button. */
  onPin?: (id: string) => void
}

export const TranscriptPanel: React.FC<TranscriptPanelProps> = ({
  segments,
  isRecording,
  isLoading,
  onPin,
}) => {
  const parentRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [activeMatchIndex, setActiveMatchIndex] = useState(0)

  const segmentsRef = useRef(segments)
  useEffect(() => {
    segmentsRef.current = segments
  }, [segments])

  // Compute matched indices based on search query
  const matchingIndices = useMemo(() => {
    if (!searchQuery.trim()) return []
    const q = searchQuery.toLowerCase()
    const matches: number[] = []
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      if (
        seg &&
        (seg.text.toLowerCase().includes(q) || seg.speakerName?.toLowerCase().includes(q))
      ) {
        matches.push(i)
      }
    }
    return matches
  }, [segments, searchQuery])

  // Reset active match index when query changes
  useEffect(() => {
    setActiveMatchIndex(0)
  }, [searchQuery])

  const rowVirtualizer = useVirtualizer({
    count: segments.length,
    getScrollElement: () => parentRef.current,
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

  // Bring the first match into view as the user types
  const firstMatchIndex = matchingIndices[0]
  useEffect(() => {
    if (!searchQuery.trim() || firstMatchIndex === undefined) return
    setAutoScroll(false)
    virtualizerRef.current?.scrollToIndex(firstMatchIndex, { align: 'center' })
  }, [searchQuery, firstMatchIndex])

  const scrollToMatch = useCallback(
    (indexInMatches: number) => {
      if (matchingIndices.length === 0) return
      const targetSegmentIndex = matchingIndices[indexInMatches]
      if (targetSegmentIndex !== undefined && virtualizerRef.current) {
        setAutoScroll(false)
        virtualizerRef.current.scrollToIndex(targetSegmentIndex, { align: 'center' })
      }
    },
    [matchingIndices]
  )

  const handleNextMatch = () => {
    if (matchingIndices.length === 0) return
    const next = (activeMatchIndex + 1) % matchingIndices.length
    setActiveMatchIndex(next)
    scrollToMatch(next)
  }

  const handlePrevMatch = () => {
    if (matchingIndices.length === 0) return
    const prev = (activeMatchIndex - 1 + matchingIndices.length) % matchingIndices.length
    setActiveMatchIndex(prev)
    scrollToMatch(prev)
  }

  // Keyboard shortcut Cmd+F / Ctrl+F
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setIsSearchOpen(true)
        setTimeout(() => searchInputRef.current?.focus(), 50)
      } else if (e.key === 'Escape' && isSearchOpen) {
        setIsSearchOpen(false)
        setSearchQuery('')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isSearchOpen])

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
    <div
      className="ui-transcript-panel relative"
      role="log"
      aria-live={autoScroll ? 'polite' : 'off'}
    >
      {/* Transcript Search Bar */}
      {isSearchOpen ? (
        <div className="absolute top-2 right-4 z-30 flex items-center gap-1.5 bg-[var(--color-bg-card,#18181b)] border border-white/10 rounded-lg shadow-xl px-2.5 py-1.5 backdrop-blur-md animate-slide-up">
          <Search size={13} className="text-[var(--color-text-tertiary)]" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search transcript..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (e.shiftKey) handlePrevMatch()
                else handleNextMatch()
              }
            }}
            aria-label="Search transcript"
            className="bg-transparent border-none text-xs text-white placeholder-white/40 outline-none w-36"
            autoFocus
          />
          {searchQuery && (
            <span className="text-[10px] text-[var(--color-text-tertiary)] tabular-nums px-1">
              {matchingIndices.length > 0
                ? `${activeMatchIndex + 1}/${matchingIndices.length}`
                : '0 matches'}
            </span>
          )}
          <button
            onClick={handlePrevMatch}
            disabled={matchingIndices.length === 0}
            className="p-1 hover:bg-white/10 rounded disabled:opacity-30 transition-colors text-[var(--color-text-secondary)]"
            title="Previous match (Shift+Enter)"
            aria-label="Previous match (Shift+Enter)"
          >
            <ChevronUp size={13} />
          </button>
          <button
            onClick={handleNextMatch}
            disabled={matchingIndices.length === 0}
            className="p-1 hover:bg-white/10 rounded disabled:opacity-30 transition-colors text-[var(--color-text-secondary)]"
            title="Next match (Enter)"
            aria-label="Next match (Enter)"
          >
            <ChevronDown size={13} />
          </button>
          <button
            onClick={() => {
              setIsSearchOpen(false)
              setSearchQuery('')
            }}
            className="p-1 hover:bg-white/10 rounded text-[var(--color-text-tertiary)] hover:text-white transition-colors ml-0.5"
            title="Close search (Esc)"
            aria-label="Close search (Esc)"
          >
            <X size={13} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => {
            setIsSearchOpen(true)
            setTimeout(() => searchInputRef.current?.focus(), 50)
          }}
          className="absolute top-2.5 right-4 z-20 p-1.5 rounded-md bg-white/5 hover:bg-white/10 text-[var(--color-text-tertiary)] hover:text-white border border-white/5 transition-all text-xs flex items-center gap-1.5 shadow-sm"
          title={`Search transcript (${modKey}+F)`}
          aria-label="Search transcript"
        >
          <Search size={12} />
          <span className="text-[10px] opacity-70">{modKey}+F</span>
        </button>
      )}

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
            const isSearchMatch =
              searchQuery.trim().length > 0 && matchingIndices.includes(virtualRow.index)
            const isActiveMatch = matchingIndices[activeMatchIndex] === virtualRow.index
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
                className={isActiveMatch ? 'ring-1 ring-[var(--color-violet)] rounded-md' : ''}
              >
                <TranscriptSegment
                  {...segment}
                  onPin={onPin}
                  isHighlighted={highlightedIds.has(segment.id) || isSearchMatch}
                />
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
