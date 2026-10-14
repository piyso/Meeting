import React from 'react'

interface TopParticipantItemProps {
  name: string
  count: number
  isLast: boolean
  meetingTitles?: string[]
  maxCount: number
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] || ''
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] || '' : ''
  return (first + last).toUpperCase() || 'P'
}

export const TopParticipantItem: React.FC<TopParticipantItemProps> = ({
  name,
  count,
  isLast,
  meetingTitles,
  maxCount,
}) => {
  const percentage = Math.round(maxCount > 0 ? (count / maxCount) * 100 : 0)

  return (
    <div
      className={`flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors ${
        !isLast ? 'border-b border-white/[0.025]' : ''
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <div className="w-7 h-7 rounded-full bg-violet-500/10 text-violet-300 font-semibold text-[10.5px] flex items-center justify-center shrink-0">
          {getInitials(name)}
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-xs font-medium text-zinc-200 truncate">{name}</span>
          {meetingTitles && meetingTitles.length > 0 && (
            <span className="text-[11px] text-zinc-500 truncate max-w-[220px]">
              {meetingTitles.slice(0, 2).join(', ')}
              {meetingTitles.length > 2 ? ` +${meetingTitles.length - 2}` : ''}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <div className="w-16 h-1.5 rounded-full bg-white/[0.04] overflow-hidden hidden sm:block">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-500"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <span className="text-[11px] font-mono text-zinc-400 bg-white/[0.03] px-2 py-0.5 rounded-md">
          {count} mtg{count === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  )
}
