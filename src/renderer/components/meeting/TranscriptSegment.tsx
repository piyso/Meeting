import { memo } from 'react'
import { Badge } from '../ui/Badge'
import { Star } from 'lucide-react'
import './meeting.css'

export interface TranscriptSegmentProps {
  id: string
  speakerName: string
  speakerColor: 'violet' | 'teal' | 'amber' | 'rose' | 'sky' | 'lime'
  timestamp: string // "[00:12]"
  text: string
  isPinned: boolean
  isEdited: boolean
  isLive: boolean // currently streaming
  isHighlighted?: boolean
  entities?: Array<{
    type: 'PERSON' | 'DATE' | 'AMOUNT' | 'ACTION_ITEM'
    text: string
    start: number
    end: number
  }>
  onPin?: (id: string) => void
  onEdit?: (id: string, newText: string) => void
}

const COLOR_MAP = {
  violet: '#A78BFA',
  teal: '#2DD4BF',
  amber: '#FBBF24',
  rose: '#FB7185',
  sky: '#38BDF8',
  lime: '#A3E635',
}

export const TranscriptSegment = memo<TranscriptSegmentProps>(
  ({
    id,
    speakerName,
    speakerColor,
    timestamp,
    text,
    isPinned,
    isEdited,
    isLive,
    isHighlighted,
    onPin,
  }) => {
    const colorHex = COLOR_MAP[speakerColor]

    // Mock entity replacement for Phase 1 visual shell
    // In a real implementation this would slice the text by index
    const renderText = () => (
      <span className="ui-segment-text">
        {text}
        {isLive && <span className="ui-live-cursor">▌</span>}
      </span>
    )

    return (
      <div
        className={`flex gap-3 py-2.5 min-h-[44px] group transition-all duration-300 px-3 -mx-3 rounded-[16px] ${
          isHighlighted
            ? 'surface-glass-premium bg-[rgba(255,255,255,0.08)] shadow-[0_8px_30px_rgba(0,0,0,0.12),inset_0_1px_1px_rgba(255,255,255,0.1)] border border-[rgba(255,255,255,0.1)] scale-[1.01] z-10 relative'
            : isPinned
              ? 'bg-[rgba(255,255,255,0.04)] border border-[var(--color-amber)] shadow-[0_4px_20px_rgba(251,191,36,0.1)]'
              : 'hover:bg-[rgba(255,255,255,0.03)] border border-transparent'
        }`}
      >
        <div className="flex items-start gap-3 w-[min(140px,25%)] shrink-0 mt-[2px]">
          <div
            className="w-2 h-2 rounded-full mt-[6px] shrink-0 shadow-[0_0_8px_currentColor]"
            style={{ backgroundColor: colorHex, color: colorHex }}
          />
          <div className="flex flex-col gap-0.5">
            <span
              className="text-[var(--text-sm)] font-medium leading-none tracking-tight"
              style={{ color: colorHex }}
            >
              {speakerName}
            </span>
            <span className="font-mono text-[11px] text-[var(--color-text-tertiary)] tracking-wide flex items-center gap-1">
              {timestamp}
              {isEdited && (
                <Badge
                  variant="outline"
                  className="scale-[0.8] origin-left border-none bg-[var(--color-bg-glass)] px-1 text-[var(--color-text-tertiary)]"
                >
                  Edited
                </Badge>
              )}
            </span>
          </div>
        </div>

        <div className="flex-1 text-[var(--text-base)] text-[var(--color-text-primary)] leading-relaxed tracking-tight">
          {renderText()}
        </div>

        <div className="w-8 shrink-0 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onPin?.(id)}
            className={`ui-icon-btn p-1 hover:bg-[var(--color-bg-glass)] ${isPinned ? 'opacity-100 text-[var(--color-amber)]' : 'text-[var(--color-text-tertiary)]'}`}
          >
            <Star size={14} fill={isPinned ? 'currentColor' : 'none'} />
          </button>
        </div>
      </div>
    )
  },
  (prev, next) => {
    // Shallow compare id, isLive, and text (for live updates)
    return (
      prev.id === next.id &&
      prev.isLive === next.isLive &&
      prev.text === next.text &&
      prev.isPinned === next.isPinned &&
      prev.isHighlighted === next.isHighlighted
    )
  }
)

TranscriptSegment.displayName = 'TranscriptSegment'
