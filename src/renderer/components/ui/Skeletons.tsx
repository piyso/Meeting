import React from 'react'
import './ui.css'

export const MeetingCardSkeleton: React.FC = () => {
  return (
    <div className="ui-meeting-card-skeleton border border-[var(--color-border-subtle)] p-[var(--space-16)] rounded-[var(--radius-lg)] space-y-[var(--space-12)]">
      <div className="skeleton h-5 w-3/4"></div>
      <div className="skeleton h-4 w-1/2"></div>
      <div className="flex justify-between items-end mt-4">
        <div className="flex gap-2">
          <div className="skeleton h-6 w-16 rounded-full"></div>
          <div className="skeleton h-6 w-16 rounded-full"></div>
        </div>
        <div className="skeleton h-4 w-12"></div>
      </div>
    </div>
  )
}

export const TranscriptSkeleton: React.FC = () => {
  return (
    <div className="space-y-[var(--space-16)] py-[var(--space-16)]">
      {[1, 2, 3, 4].map(key => (
        <div key={key} className="flex gap-[var(--space-8)]">
          <div className="skeleton h-2 w-2 rounded-full mt-2 shrink-0"></div>
          <div className="skeleton h-4 w-12 shrink-0"></div>
          <div className="space-y-2 flex-1">
            <div className="skeleton h-4 w-full"></div>
            {key % 2 === 0 && <div className="skeleton h-4 w-5/6"></div>}
            {key === 3 && <div className="skeleton h-4 w-3/4"></div>}
          </div>
        </div>
      ))}
    </div>
  )
}

export const DigestSkeleton: React.FC = () => {
  return (
    <div className="p-[var(--space-16)] space-y-[var(--space-24)]">
      <div className="space-y-[var(--space-8)]">
        <div className="skeleton h-5 w-1/4"></div>
        <div className="skeleton h-20 w-full"></div>
      </div>
      <div className="space-y-[var(--space-8)]">
        <div className="skeleton h-5 w-1/4"></div>
        <div className="skeleton h-6 w-3/4"></div>
        <div className="skeleton h-6 w-2/3"></div>
      </div>
    </div>
  )
}
