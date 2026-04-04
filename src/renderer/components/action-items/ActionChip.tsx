import React from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2, Circle, Clock, Play } from 'lucide-react'

export interface ActionChipProps {
  id: string
  title: string
  status: 'pending' | 'in_progress' | 'completed'
  assignee?: string
  dueDate?: Date
  isAgent?: boolean
  onClick?: () => void
  onToggleStatus?: () => void
}

export const ActionChip: React.FC<ActionChipProps> = ({
  title,
  status,
  assignee,
  dueDate,
  isAgent,
  onClick,
  onToggleStatus,
}) => {
  const isCompleted = status === 'completed'

  return (
    <motion.button
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`relative w-full text-left p-3 rounded-xl border transition-all grid grid-cols-[auto_1fr_auto] gap-3 items-start group ${
        isCompleted
          ? 'bg-glass/30 border-border opacity-70 hover:opacity-100'
          : 'bg-glass border-border-subtle hover:border-emerald/30 shadow-macos-sm'
      }`}
    >
      <div
        onClick={e => {
          e.stopPropagation()
          onToggleStatus?.()
        }}
        className="mt-0.5 cursor-pointer"
      >
        {isCompleted ? (
          <CheckCircle2 size={16} className="text-emerald" />
        ) : status === 'in_progress' ? (
          <Clock size={16} className="text-amber animate-pulse" />
        ) : (
          <Circle
            size={16}
            className="text-secondary group-hover:text-emerald/70 transition-colors"
          />
        )}
      </div>

      <div className="flex flex-col gap-1 overflow-hidden">
        <span
          className={`text-[13px] font-medium truncate ${isCompleted ? 'text-tertiary line-through' : 'text-primary'}`}
        >
          {title}
        </span>

        {(assignee || dueDate || isAgent) && (
          <div className="flex items-center gap-2 mt-1">
            {assignee && (
              <span className="text-[10px] font-semibold tracking-wide text-blue px-1.5 py-0.5 bg-blue/10 rounded-md">
                {assignee}
              </span>
            )}
            {isAgent && (
              <span className="text-[10px] font-semibold tracking-wide text-violet px-1.5 py-0.5 bg-violet/10 rounded-md flex items-center gap-1">
                <Play size={8} className="fill-current" /> Auto-Execute
              </span>
            )}
            {dueDate && (
              <span className="text-[10px] font-medium text-tertiary">
                Due {dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
        )}
      </div>
    </motion.button>
  )
}
