import React, { useRef, useEffect } from 'react'
import { ExternalLink, Quote, Clock } from 'lucide-react'
import { useNavigationStore } from '../../store/navigationStore'

export interface ReceiptAnchorData {
  meetingId: string
  meetingTitle: string
  speakerName?: string
  /** Position of the excerpt in the recording. Omitted when the source has none (cloud hits). */
  timestampMs?: number
  snippet: string
  relevance?: number
}

interface ReceiptAudioPopoverProps {
  data: ReceiptAnchorData
  rect: DOMRect
  onClose: () => void
}

const formatTimestamp = (ms: number) => {
  const totalSecs = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSecs / 3600)
  const mins = Math.floor((totalSecs % 3600) / 60)
  const secs = totalSecs % 60
  const ss = String(secs).padStart(2, '0')
  return hours > 0 ? `${hours}:${String(mins).padStart(2, '0')}:${ss}` : `${mins}:${ss}`
}

/**
 * Source excerpt for an AI answer citation: the transcript passage the answer
 * was grounded on, where it sits in the recording (when known), and a way to
 * open the meeting. Shows only what the search actually returned.
 */
export const ReceiptAudioPopover: React.FC<ReceiptAudioPopoverProps> = ({
  data,
  rect,
  onClose,
}) => {
  const navigate = useNavigationStore(s => s.navigate)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Click outside / Escape to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) onClose()
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  const openMeetingDetail = () => {
    onClose()
    if (data.meetingId) navigate('meeting-detail', data.meetingId)
  }

  // Position near the citation chip, flipping above it when there is no room below
  const POPOVER_WIDTH = 340
  const ESTIMATED_HEIGHT = 200
  const below = rect.bottom + 8
  const top =
    below + ESTIMATED_HEIGHT > window.innerHeight
      ? Math.max(10, rect.top - ESTIMATED_HEIGHT - 8)
      : below
  const left = Math.min(window.innerWidth - POPOVER_WIDTH - 20, Math.max(10, rect.left - 40))
  const relevancePct =
    typeof data.relevance === 'number'
      ? Math.round(Math.min(Math.max(data.relevance, 0), 1) * 100)
      : null

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label={`Source excerpt from ${data.meetingTitle || 'meeting'}`}
      style={{ top: `${top}px`, left: `${left}px`, width: POPOVER_WIDTH }}
      className="fixed z-50 bg-[rgba(15,15,22,0.92)] border border-white/15 rounded-3xl p-5 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] text-white animate-fade-in"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-violet-500/20 text-violet-300 flex items-center justify-center">
            <Quote size={13} />
          </div>
          <span className="text-xs font-semibold tracking-wide text-white">Source excerpt</span>
        </div>

        {data.meetingId && (
          <button
            onClick={openMeetingDetail}
            className="flex items-center gap-1 text-[11px] text-violet-400 hover:text-violet-300 font-medium transition-colors"
          >
            <span>Open meeting</span>
            <ExternalLink size={11} />
          </button>
        )}
      </div>

      {/* Meeting & position */}
      <div className="flex items-center justify-between gap-2 text-xs mb-2">
        <span className="font-semibold text-white/90 truncate">
          {data.meetingTitle || 'Meeting'}
        </span>
        {typeof data.timestampMs === 'number' && (
          <div
            className="flex shrink-0 items-center gap-1 font-mono text-[11px] text-white/50 bg-white/5 px-2 py-0.5 rounded-md"
            title="Position in the recording"
          >
            <Clock size={11} />
            <span>{formatTimestamp(data.timestampMs)}</span>
          </div>
        )}
      </div>

      {/* Transcript excerpt */}
      <div className="p-3 rounded-2xl bg-black/40 border border-white/5 text-xs text-white/80 leading-relaxed italic max-h-40 overflow-y-auto sovereign-scrollbar">
        {data.snippet ? `"${data.snippet}"` : 'No excerpt available for this source.'}
      </div>

      {relevancePct !== null && (
        <div className="mt-3 text-[10px] font-mono text-white/40">
          Relevance to your question: {relevancePct}%
        </div>
      )}
    </div>
  )
}
