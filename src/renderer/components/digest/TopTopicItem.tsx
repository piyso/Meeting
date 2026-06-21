import React from 'react'

interface TopTopicItemProps {
  topic: string
  count: number
  meetingTitles?: string[]
  maxCount: number
}

export const TopTopicItem: React.FC<TopTopicItemProps> = ({
  topic,
  count,
  meetingTitles,
  maxCount,
}) => (
  <div className="ui-digest-topic-item">
    <div className="ui-digest-topic-item-info">
      <div className="ui-digest-topic-item-name">{topic}</div>
      {meetingTitles && meetingTitles.length > 0 && (
        <div className="ui-digest-topic-item-meetings">
          {meetingTitles.slice(0, 2).join(', ')}
          {meetingTitles.length > 2 ? ` +${meetingTitles.length - 2}` : ''}
        </div>
      )}
    </div>
    <div className="ui-digest-topic-bar-container">
      <div className="ui-digest-topic-bar">
        <div
          className="ui-digest-topic-bar-fill"
          style={{ width: `${maxCount > 0 ? (count / maxCount) * 100 : 0}%` }}
        />
      </div>
    </div>
    <span className="ui-digest-topic-count">{count}</span>
  </div>
)
