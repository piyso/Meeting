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

export const ActionItemSkeleton: React.FC = () => {
  return (
    <div className="flex items-start gap-3 p-4 rounded-[var(--radius-lg)] bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] w-full">
      <div className="w-5 h-5 rounded-[4px] skeleton mt-0.5 flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 skeleton rounded" style={{ width: '80%' }} />
        <div className="h-4 skeleton rounded" style={{ width: '40%' }} />
      </div>
    </div>
  )
}

export const MetricSkeleton: React.FC = () => {
  return (
    <div className="flex flex-col gap-2 p-4 rounded-[var(--radius-lg)] bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] flex-1 min-w-[140px]">
      <div className="h-3 skeleton rounded" style={{ width: '40%' }} />
      <div className="h-8 skeleton rounded mt-1" style={{ width: '60%' }} />
    </div>
  )
}
