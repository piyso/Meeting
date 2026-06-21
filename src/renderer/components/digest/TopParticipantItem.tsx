import React from 'react'

interface TopParticipantItemProps {
  name: string
  count: number
  isLast: boolean
  meetingTitles?: string[]
  maxCount: number
}

export const TopParticipantItem: React.FC<TopParticipantItemProps> = ({
  name,
  count,
  isLast,
  meetingTitles,
  maxCount,
}) => (
  <div className={`ui-digest-participant-item${isLast ? ' is-last' : ''}`}>
    <div className="ui-digest-participant-info">
      <span className="ui-digest-participant-name">{name}</span>
      {meetingTitles && meetingTitles.length > 0 && (
        <span className="ui-digest-participant-meetings">
          {meetingTitles.slice(0, 2).join(', ')}
          {meetingTitles.length > 2 ? ` +${meetingTitles.length - 2}` : ''}
        </span>
      )}
    </div>
    <div className="ui-digest-participant-bar-container">
      <div className="ui-digest-participant-bar">
        <div
          className="ui-digest-participant-bar-fill"
          style={{ width: `${maxCount > 0 ? (count / maxCount) * 100 : 0}%` }}
        />
      </div>
    </div>
    <span className="ui-digest-participant-count">{count} mtgs</span>
  </div>
)
