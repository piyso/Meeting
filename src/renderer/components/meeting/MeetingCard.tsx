import React from 'react'
import { Badge } from '../ui/Badge'
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

  const handleMouseEnter = () => {
    // Phase 2: Prefetch meeting details for instant local load
    window.dispatchEvent(new CustomEvent('prefetch-meeting', { detail: { id } }))
  }

  return (
    <div
      className="ui-meeting-card stagger-child premium-hover"
      style={{ animationDelay: `${Math.min(index * 40, 480)}ms` }}
      onClick={() => onClick(id)}
      onContextMenu={e => onContextMenu(e, id)}
      onMouseEnter={handleMouseEnter}
      role="button"
      tabIndex={0}
      aria-label={`${title}, ${durationMins} minutes, ${participantCount} participants`}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick(id)
        }
      }}
    >
      {isRenaming ? (
        <input
          autoFocus
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onBlur={() => onRenameSubmit?.(inputValue)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              onRenameSubmit?.(inputValue)
            } else if (e.key === 'Escape') {
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
      <div className="ui-meeting-card-meta">
        <span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          {durationMins}m
        </span>
        <span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
          {participantCount}
        </span>
      </div>
      <div className="ui-meeting-card-badges">
        {hasTranscript && (
          <Badge variant="default" className="ui-meeting-card-badge-transcribed">
            Transcribed
          </Badge>
        )}
        {hasNotes && (
          <Badge variant="default" className="ui-meeting-card-badge-notes">
            Notes
          </Badge>
        )}
      </div>
    </div>
  )
}
