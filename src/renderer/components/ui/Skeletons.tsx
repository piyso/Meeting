import React from 'react'
import './ui.css'

export const MeetingCardSkeleton: React.FC = () => {
  return (
    <div className="ui-skeleton-meeting-card">
      <div className="skeleton ui-skeleton-meeting-title"></div>
      <div className="skeleton ui-skeleton-meeting-meta"></div>
    </div>
  )
}

export const TranscriptSkeleton: React.FC = () => {
  const widths = ['100%', '85%', '92%', '78%', '95%']
  return (
    <div className="ui-skeleton-transcript">
      {widths.map((w, i) => (
        <div key={i} className="ui-skeleton-transcript-row">
          <div className="skeleton ui-skeleton-transcript-dot"></div>
          <div className="skeleton ui-skeleton-transcript-text" style={{ width: w }}></div>
        </div>
      ))}
    </div>
  )
}

export const DigestSkeleton: React.FC = () => {
  return (
    <div className="ui-skeleton-digest">
      <div className="ui-skeleton-digest-section">
        <div className="skeleton ui-skeleton-digest-title"></div>
        <div className="skeleton ui-skeleton-digest-text" style={{ width: '90%' }}></div>
        <div className="skeleton ui-skeleton-digest-text" style={{ width: '70%' }}></div>
        <div className="skeleton ui-skeleton-digest-text" style={{ width: '85%' }}></div>
      </div>
      <div className="ui-skeleton-digest-section">
        <div className="ui-skeleton-digest-title"></div>
        <div style={{ display: 'flex', gap: 'var(--space-8)' }}>
          <div className="skeleton ui-skeleton-digest-action"></div>
          <div className="skeleton ui-skeleton-digest-text" style={{ width: '60%' }}></div>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-8)' }}>
          <div className="skeleton ui-skeleton-digest-action"></div>
          <div className="skeleton ui-skeleton-digest-text" style={{ width: '40%' }}></div>
        </div>
      </div>
    </div>
  )
}
