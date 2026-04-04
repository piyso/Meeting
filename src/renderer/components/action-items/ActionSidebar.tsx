import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Loader2, Bot, Layers } from 'lucide-react'
import { ActionChip, ActionChipProps } from './ActionChip'
import { EmptyState } from '../ui/EmptyState'
import { useActionItems } from '../../hooks/queries/useActionItems'

export const ActionSidebar: React.FC = () => {
  const { actionItems: rawActions, isLoading, updateStatus } = useActionItems()

  // Map backend raw actions to frontend props
  const actions: ActionChipProps[] = rawActions.map(
    (a: {
      id: string
      text: string
      status: string
      assignee: string | null
      deadline: number | null
    }) => ({
      id: a.id,
      title: a.text,
      status:
        a.status === 'completed'
          ? ('completed' as const)
          : a.status === 'overdue'
            ? ('in_progress' as const)
            : ('pending' as const),
      assignee: a.assignee ?? undefined,
      dueDate: a.deadline ? new Date(a.deadline * 1000) : undefined,
      isAgent: false,
    })
  )
  const toggleStatus = (id: string) => {
    const action = actions.find(a => a.id === id)
    if (!action) return
    const nextStatus = action.status === 'completed' ? 'open' : 'completed'
    updateStatus.mutate({ actionId: id, status: nextStatus })
  }

  return (
    <div className="flex flex-col w-[320px] h-full border-l border-border-subtle bg-transparent">
      {/* Header */}
      <div className="flex flex-col p-5 border-b border-border/50 gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-primary font-semibold">
            <Layers size={16} className="text-violet" />
            <span>Action Items</span>
          </div>
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-glass text-secondary">
            {actions.filter(a => a.status !== 'completed').length} Open
          </span>
        </div>

        <button
          disabled={true}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-[rgba(167,139,250,0.1)] border border-[rgba(167,139,250,0.2)] text-violet text-xs font-semibold hover:bg-[rgba(167,139,250,0.15)] transition-colors disabled:opacity-50"
        >
          <Sparkles size={14} />
          NLP Auto-Extraction Active
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 sovereign-scrollbar flex flex-col gap-3">
        {isLoading ? (
          <div className="flex justify-center p-4">
            <Loader2 size={24} className="animate-spin text-tertiary" />
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {actions.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="mt-10"
              >
                <EmptyState
                  icon={Bot}
                  title="All caught up!"
                  description="No outstanding action items detected. You're in the clear."
                />
              </motion.div>
            ) : (
              actions.map(action => (
                <motion.div
                  key={action.id}
                  initial={{ opacity: 0, height: 0, scale: 0.9 }}
                  animate={{ opacity: 1, height: 'auto', scale: 1 }}
                  exit={{ opacity: 0, height: 0, scale: 0.9 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                >
                  <ActionChip {...action} onToggleStatus={() => toggleStatus(action.id)} />
                </motion.div>
              ))
            )}
          </AnimatePresence>
        )}

        {/* Inline Agent UI Example */}
        {actions.some(a => a.status === 'in_progress' && a.isAgent) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-4 rounded-xl border border-violet/20 bg-gradient-to-b from-violet/5 to-transparent flex flex-col gap-3"
          >
            <div className="flex items-center gap-2 text-xs font-semibold text-violet">
              <Bot size={14} /> Agent Workspace Active
            </div>
            <div className="text-[11px] font-mono text-tertiary whitespace-pre-wrap bg-glass p-2 rounded-lg">
              {'>'} Fetching transcript buffer...{'\n'}
              {'>'} Analyzing latency spikes...{'\n'}
              {'>'} Generating report...
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
