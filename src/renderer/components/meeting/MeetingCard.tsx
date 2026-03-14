import React from 'react'
import { Clock, Users, FileText, StickyNote } from 'lucide-react'
import './meeting.css'

interface MeetingCardProps {
  id: string
  title: string
  date: Date
  duration: number // seconds
  participantCount: number
  hasTranscript: boolean
  hasNotes: boolean
  onClick: (id: string) => void
  onContextMenu: (e: React.MouseEvent, id: string) => void
  index: number // For stagger animation delay
  isRenaming?: boolean
  onRenameSubmit?: (newTitle: string) => void
}

export const MeetingCard: React.FC<MeetingCardProps> = ({
  id,
  title,
  date,
  duration,
  participantCount,
  hasTranscript,
  hasNotes,
  onClick,
  onContextMenu,
  index,
  isRenaming = false,
  onRenameSubmit,
}) => {
  const durationMins = Math.round(duration / 60)
  const [inputValue, setInputValue] = React.useState(title)

  React.useEffect(() => {
    if (isRenaming) {
      setInputValue(title)
    }
  }, [isRenaming, title])

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    e.currentTarget.style.setProperty('--mouse-x', `${x}px`)
    e.currentTarget.style.setProperty('--mouse-y', `${y}px`)
  }

  // Format the date for display
  const formattedDate = date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })

  const formattedTime = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })

  // P14 fix: Show human-friendly duration; 0 or null → "< 1m" instead of misleading "0m"
  const durationDisplay =
    durationMins <= 0
      ? '< 1m'
      : durationMins >= 60
        ? `${Math.floor(durationMins / 60)}h ${durationMins % 60}m`
        : `${durationMins}m`

  return (
    <div
      className="ui-meeting-card stagger-child premium-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-root)]"
      style={{ animationDelay: `${Math.min(index * 40, 480)}ms` }}
      onClick={() => onClick(id)}
      onContextMenu={e => onContextMenu(e, id)}
      onMouseMove={handleMouseMove}
      role="button"
      tabIndex={0}
      aria-label={`${title}, ${durationDisplay}, ${participantCount} participants`}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick(id)
        }
      }}
    >
      {/* Title */}
      {isRenaming ? (
        <input
          autoFocus
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onBlur={() => onRenameSubmit?.(inputValue)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.stopPropagation()
              onRenameSubmit?.(inputValue)
            } else if (e.key === 'Escape') {
              e.stopPropagation()
              onRenameSubmit?.(title)
            }
          }}
          className="ui-meeting-card-title sovereign-glass-panel rounded-md px-1 py-0.5 -ml-1 w-[calc(100%+8px)] border border-[var(--color-violet)] outline-none shadow-[0_0_0_1px_var(--color-glow-violet)] bg-[rgba(10,10,12,0.8)]"
          onClick={e => e.stopPropagation()}
        />
      ) : (
        <h3 className="ui-meeting-card-title" title={title}>
          {title}
        </h3>
      )}

      {/* Date & Time */}
      <div className="ui-meeting-card-date">
        {formattedDate} · {formattedTime}
      </div>

      {/* Metadata Row */}
      <div className="ui-meeting-card-meta">
        <span>
          <Clock size={12} strokeWidth={2} />
          {durationDisplay}
        </span>
        <span>
          <Users size={12} strokeWidth={2} />
          {participantCount}
        </span>
        {hasTranscript && (
          <span className="ui-meeting-card-meta-badge">
            <FileText size={11} strokeWidth={2} />
            Transcribed
          </span>
        )}
        {hasNotes && (
          <span className="ui-meeting-card-meta-badge">
            <StickyNote size={11} strokeWidth={2} />
            Notes
          </span>
        )}
      </div>
    </div>
  )
}
