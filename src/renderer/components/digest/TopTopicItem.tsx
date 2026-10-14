import React from 'react'
import { Hash } from 'lucide-react'

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
}) => {
  const percentage = Math.round(maxCount > 0 ? (count / maxCount) * 100 : 0)

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/[0.02] border-b border-white/[0.025] last:border-b-0 transition-colors">
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <div className="w-6 h-6 rounded-lg bg-white/[0.025] flex items-center justify-center text-zinc-400 shrink-0">
          <Hash size={12} />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-xs font-medium text-zinc-200 truncate">{topic}</span>
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
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-500"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <span className="text-[11px] font-mono text-zinc-400 bg-white/[0.03] px-2 py-0.5 rounded-md">
          {count} mention{count === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  )
}
