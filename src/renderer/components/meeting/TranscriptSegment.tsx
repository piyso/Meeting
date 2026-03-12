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
  ({ id, speakerName, speakerColor, timestamp, text, isPinned, isEdited, isLive, onPin }) => {
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
        className={`flex gap-[var(--space-12)] py-[var(--space-8)] min-h-[36px] group transition-colors px-2 -mx-2 rounded ${
          isPinned
            ? 'bg-[var(--color-bg-panel)] border border-[var(--color-amber)]'
            : 'hover:bg-[rgba(255,255,255,0.02)] border border-transparent'
        }`}
      >
        <div className="flex items-start gap-[var(--space-8)] w-[min(140px,25%)] shrink-0 mt-[2px]">
          <div
            className="w-2 h-2 rounded-full mt-[6px] shrink-0"
            style={{ backgroundColor: colorHex }}
          />
          <div className="flex flex-col">
            <span
              className="text-[var(--text-xs)] font-medium leading-tight"
              style={{ color: colorHex }}
            >
              {speakerName}
            </span>
            <span className="font-mono text-[10px] text-[var(--color-text-tertiary)] flex items-center gap-1">
              {timestamp}
              {isEdited && (
                <Badge
                  variant="outline"
                  className="scale-[0.8] origin-left border-none bg-[var(--color-bg-glass)] px-1"
                >
                  Edited
                </Badge>
              )}
            </span>
          </div>
        </div>

        <div className="flex-1 text-[var(--text-base)] text-[var(--color-text-primary)] leading-relaxed">
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
      prev.isPinned === next.isPinned
    )
  }
)

TranscriptSegment.displayName = 'TranscriptSegment'
