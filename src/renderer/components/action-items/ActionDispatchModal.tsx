import React, { useState } from 'react'
import type { ActionItem } from '../../../types/features'
import { Button } from '../ui/Button'
import { Send, CheckCircle2, Sparkles, CheckSquare, Square } from 'lucide-react'
import { useAppStore } from '../../store/appStore'

interface ActionDispatchModalProps {
  items: ActionItem[]
  meetingTitle?: string
  isOpen: boolean
  onClose: () => void
  onDispatched?: () => void
}

export const ActionDispatchModal: React.FC<ActionDispatchModalProps> = ({
  items,
  meetingTitle,
  isOpen,
  onClose,
  onDispatched,
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(items.map(i => i.id)))
  const [target, setTarget] = useState<'linear' | 'jira' | 'github' | 'webhook'>('linear')
  const [isDispatching, setIsDispatching] = useState(false)
  const [successResult, setSuccessResult] = useState<string | null>(null)

  if (!isOpen) return null

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(items.map(i => i.id)))
    }
  }

  const handleDispatch = async () => {
    const selectedItems = items.filter(i => selectedIds.has(i.id))
    if (selectedItems.length === 0) return

    setIsDispatching(true)
    setSuccessResult(null)

    try {
      const res = await (
        window.electronAPI?.actionItem as unknown as {
          dispatch?: (
            params: unknown
          ) => Promise<{ success: boolean; data?: { dispatchedCount: number } }>
        }
      )?.dispatch?.({
        items: selectedItems,
        target,
      })

      if (res?.success) {
        setSuccessResult(
          `Dispatched ${selectedItems.length} action item${selectedItems.length === 1 ? '' : 's'} to ${target.toUpperCase()}`
        )
        useAppStore.getState().addToast({
          type: 'success',
          title: 'Action Items Dispatched',
          message: `Successfully pushed ${selectedItems.length} items to ${target.toUpperCase()}.`,
          duration: 3000,
        })
        setTimeout(() => {
          onDispatched?.()
          onClose()
        }, 1500)
      } else {
        useAppStore.getState().addToast({
          type: 'error',
          title: 'Dispatch Failed',
          message: 'Could not push action items.',
          duration: 3000,
        })
      }
    } catch {
      useAppStore.getState().addToast({
        type: 'error',
        title: 'Dispatch Failed',
        message: 'Could not communicate with dispatch engine.',
        duration: 3000,
      })
    } finally {
      setIsDispatching(false)
    }
  }

  const selectedCount = selectedIds.size

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-xl bg-[rgba(18,18,26,0.95)] border border-white/15 rounded-3xl p-6 backdrop-blur-2xl shadow-2xl text-white flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-violet-500/20 text-violet-400 flex items-center justify-center">
              <Send size={16} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white tracking-wide">
                Dispatch Action Items
              </h3>
              <p className="text-xs text-white/50">{meetingTitle || 'Meeting Action Items'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full hover:bg-white/10 text-white/40 hover:text-white flex items-center justify-center text-xs transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Target Platform Selector */}
        <div>
          <label className="text-[11px] uppercase font-mono tracking-wider text-white/40 block mb-2">
            Target Destination
          </label>
          <div className="grid grid-cols-4 gap-2">
            {(['linear', 'jira', 'github', 'webhook'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTarget(t)}
                className={`py-2.5 px-3 rounded-2xl border text-xs font-semibold uppercase tracking-wider transition-all flex flex-col items-center gap-1.5 ${
                  target === t
                    ? 'bg-violet-600/30 border-violet-400 text-white shadow-lg shadow-violet-500/20 ring-1 ring-violet-400/50'
                    : 'bg-white/[0.02] border-white/10 text-white/60 hover:text-white hover:bg-white/[0.05]'
                }`}
              >
                <span>{t === 'github' ? 'GitHub' : t}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Action Items Selection List */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[11px] uppercase font-mono tracking-wider text-white/40">
              Select Items to Export ({selectedCount}/{items.length})
            </label>
            <button
              onClick={toggleSelectAll}
              className="text-xs text-violet-400 hover:text-violet-300 font-medium"
            >
              {selectedCount === items.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>

          <div className="max-h-56 overflow-y-auto space-y-2 pr-1 sovereign-scrollbar">
            {items.map(item => {
              const isSelected = selectedIds.has(item.id)
              return (
                <div
                  key={item.id}
                  onClick={() => toggleSelect(item.id)}
                  className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 ${
                    isSelected
                      ? 'bg-violet-500/10 border-violet-500/30'
                      : 'bg-white/[0.02] border-white/5 opacity-60 hover:opacity-100'
                  }`}
                >
                  <div className="mt-0.5 text-violet-400">
                    {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white leading-snug">{item.text}</p>
                    <div className="flex items-center gap-2 mt-1.5 text-[10px] text-white/40">
                      {item.assignee && <span className="text-emerald-400">@{item.assignee}</span>}
                      {item.priority && (
                        <span className="uppercase font-mono">{item.priority} priority</span>
                      )}
                      {item.deadline && (
                        <span>Due {new Date(item.deadline * 1000).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Success Banner */}
        {successResult && (
          <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 animate-fade-in">
            <CheckCircle2 size={15} />
            <span>{successResult}</span>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-white/10">
          <div className="flex items-center gap-1.5 text-xs text-white/40">
            <Sparkles size={13} className="text-violet-400" />
            <span>Provenance citations attached</span>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onClose} disabled={isDispatching}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleDispatch}
              disabled={isDispatching || selectedCount === 0}
              className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500"
            >
              {isDispatching
                ? 'Dispatching...'
                : `Dispatch ${selectedCount} Item${selectedCount === 1 ? '' : 's'}`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
