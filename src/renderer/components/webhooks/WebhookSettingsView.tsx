import React, { useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Webhook, Trash2, Save, AlertCircle, Settings2, Slack } from 'lucide-react'
import { Button } from '../ui/Button'
import { Toggle } from '../ui/Toggle'
import { IconButton } from '../ui/IconButton'
import { useWebhooks } from '../../hooks/queries/useWebhooks'

const AVAILABLE_EVENTS = [
  { id: 'meeting.started', label: 'Meeting Started' },
  { id: 'meeting.completed', label: 'Meeting Completed' },
  { id: 'transcript.ready', label: 'Transcript Ready' },
  { id: 'action_item.created', label: 'Action Item Created' },
  { id: 'action_item.completed', label: 'Action Item Completed' },
  { id: 'digest.generated', label: 'Digest Generated' },
  { id: 'sentiment.alert', label: 'Sentiment Alert' },
]

export const WebhookSettingsView: React.FC = () => {
  const { webhooks, saveWebhook, removeWebhook } = useWebhooks()

  const [isAdding, setIsAdding] = useState(false)
  const [newUrl, setNewUrl] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // OPTIMIZATION: Parse events and flags once when webhooks change
  // Prevents O(N*M) JSON.parse operations during every render loop
  const parsedWebhooks = useMemo(() => {
    return (webhooks || []).map((w: { id: string; url: string; events: string; is_active: number }) => {
      let parsedEvents: string[] = []
      try {
        parsedEvents = JSON.parse(w.events || '[]')
      } catch {
        // ignore
      }
      return {
        ...w,
        parsedEvents,
        isSlack: w.url.includes('slack.com')
      }
    })
  }, [webhooks])

  const toggleWebhook = useCallback((id: string, currentStatus: number | undefined) => {
    const existing = parsedWebhooks.find((w) => w.id === id)
    if (existing) {
      saveWebhook.mutate({
        id,
        url: existing.url,
        events: existing.parsedEvents.length ? existing.parsedEvents : ['meeting.completed'],
        is_active: currentStatus === 1 ? 0 : 1,
      })
    }
  }, [parsedWebhooks, saveWebhook])

  const deleteWebhook = useCallback((id: string) => {
    removeWebhook.mutate(id)
  }, [removeWebhook])

  const handleSave = useCallback(() => {
    if (!newUrl) return
    saveWebhook.mutate(
      {
        url: newUrl,
        events: ['meeting.completed'],
      },
      {
        onSuccess: () => {
          setIsAdding(false)
          setNewUrl('')
        },
      }
    )
  }, [newUrl, saveWebhook])

  return (
    <div className="flex flex-col gap-8">
      <div>
        <div className="flex justify-between items-center pl-4 pr-2 mb-3">
          <div>
            <h4 className="text-[11px] uppercase tracking-widest text-[var(--color-text-tertiary)] font-bold">
              Webhook Endpoints
            </h4>
            <p className="text-[11px] text-[var(--color-text-quaternary)] mt-0.5">
              Manage POST endpoints for meeting events
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={() => setIsAdding(true)}>
            Add Endpoint
          </Button>
        </div>

        <div className="surface-glass-premium border border-[var(--color-border-subtle)] rounded-3xl p-2 shadow-sm">
          <div className="flex flex-col gap-2">

      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="p-6 border border-[var(--color-border-subtle)] bg-white/[0.02] rounded-[var(--radius-xl)] flex flex-col gap-4 overflow-hidden shadow-sm"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-[13px] font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
                <div className="p-1.5 bg-[var(--color-accent-primary)]/10 rounded-lg">
                  <Webhook size={16} className="text-[var(--color-accent-primary)]" />
                </div>
                Configure New Endpoint
              </h4>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => setIsAdding(false)}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" icon={<Save size={14} />} onClick={handleSave}>
                  Save
                </Button>
              </div>
            </div>
            
            <div className="bg-black/40 border border-[var(--color-border-subtle)] rounded-xl p-1 flex items-center shadow-inner focus-within:border-[var(--color-accent-primary)] focus-within:ring-1 focus-within:ring-[var(--color-accent-primary)] transition-all">
              <input
                type="url"
                value={newUrl}
                onChange={e => setNewUrl(e.target.value)}
                placeholder="https://your-server.com/api/webhooks/meeting"
                className="flex-1 bg-transparent px-4 py-2.5 text-[13px] text-[var(--color-text-primary)] focus:outline-none placeholder:text-[var(--color-text-quaternary)] font-mono"
                autoFocus
              />
            </div>
          </motion.div>
        )}

        {parsedWebhooks.map((webhook) => (
          <motion.div
            key={webhook.id}
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="px-6 py-5 border border-[var(--color-border-subtle)] bg-white/[0.01] hover:bg-white/[0.03] rounded-[var(--radius-xl)] flex flex-col gap-5 group transition-all duration-300 shadow-sm"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0 flex-1">
                <div
                  className={`flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-[var(--radius-lg)] shadow-inner transition-colors duration-300 ${
                    webhook.is_active === 1
                      ? webhook.isSlack
                        ? 'bg-[#E01E5A]/10 text-[#E01E5A] border border-[#E01E5A]/20'
                        : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-[var(--color-surface-tertiary)] text-[var(--color-text-tertiary)] border border-[var(--color-border-subtle)]'
                  }`}
                >
                  {webhook.isSlack ? <Slack size={18} /> : <Webhook size={18} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-mono text-[var(--color-text-primary)] font-medium truncate">
                    {webhook.url}
                  </div>
                  <div className="text-[11px] text-[var(--color-text-tertiary)] mt-1 flex items-center gap-1.5 font-medium uppercase tracking-wider whitespace-nowrap">
                    <span className="text-[var(--color-accent-primary)] font-bold">{webhook.parsedEvents.length}</span>
                    <span>Event{webhook.parsedEvents.length !== 1 ? 's' : ''} Configured</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="flex items-center gap-2.5 bg-black/20 border border-[var(--color-border-subtle)] pl-3 pr-1.5 py-1.5 rounded-xl shadow-inner">
                  <span className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-widest w-[45px] text-center">
                    {webhook.is_active === 1 ? 'On' : 'Off'}
                  </span>
                  <Toggle
                    checked={webhook.is_active === 1}
                    onChange={() => toggleWebhook(webhook.id, webhook.is_active)}
                  />
                </div>
                
                <div className="w-[1px] h-6 bg-[var(--color-border-subtle)] mx-1" />
                
                <div className="flex items-center gap-1">
                  <IconButton
                    icon={<Settings2 size={16} className={expandedId === webhook.id ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-tertiary)]'} />}
                    onClick={() => setExpandedId(expandedId === webhook.id ? null : webhook.id)}
                    tooltip="Configure Events"
                  />
                  <IconButton
                    icon={<Trash2 size={16} className="text-red-400/80 hover:text-red-400" />}
                    onClick={() => deleteWebhook(webhook.id)}
                    tooltip="Delete Webhook"
                  />
                </div>
              </div>
            </div>

            <AnimatePresence>
              {expandedId === webhook.id && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-4 flex flex-col gap-3">
                    <h5 className="text-[11px] font-bold text-[var(--color-text-tertiary)] uppercase tracking-widest pl-2">
                      Subscribed Events
                    </h5>
                    <div className="bg-white/[0.02] rounded-[var(--radius-xl)] border border-[var(--color-border-subtle)] divide-y divide-[var(--color-border-subtle)] overflow-hidden shadow-inner">
                      {AVAILABLE_EVENTS.map(event => {
                        const isSubscribed = webhook.parsedEvents.includes(event.id)
                        
                        return (
                          <div 
                            key={event.id}
                            className="flex items-center justify-between px-5 py-3.5 hover:bg-white/[0.02] transition-colors cursor-pointer"
                            onClick={() => {
                              const newEvents = isSubscribed
                                ? webhook.parsedEvents.filter(id => id !== event.id)
                                : [...webhook.parsedEvents, event.id]
                              saveWebhook.mutate({
                                id: webhook.id,
                                url: webhook.url,
                                events: newEvents,
                                is_active: webhook.is_active,
                              })
                            }}
                          >
                            <span className="text-[13px] font-medium text-[var(--color-text-primary)] select-none">
                              {event.label}
                            </span>
                            <Toggle
                              checked={isSubscribed}
                              onChange={() => {}} // Handled by parent div
                            />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
          </AnimatePresence>

          {parsedWebhooks.length === 0 && !isAdding && (
            <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-[var(--color-border-subtle)] rounded-2xl bg-white/[0.01]">
              <AlertCircle size={32} className="text-[var(--color-text-tertiary)] mb-4" />
              <p className="text-[var(--color-text-secondary)] font-medium">No active webhooks</p>
              <p className="text-[var(--color-text-tertiary)] text-xs max-w-sm mt-2">
                Connect to Zapier or your own infrastructure to automate workflows when meetings finish.
              </p>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  )
}
