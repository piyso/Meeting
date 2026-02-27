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
}) => {
  const durationMins = Math.round(duration / 60)

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
      <h3 className="ui-meeting-card-title" title={title}>
        {title}
      </h3>
      <div className="ui-meeting-card-meta">
        {durationMins} min · {participantCount} people
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
