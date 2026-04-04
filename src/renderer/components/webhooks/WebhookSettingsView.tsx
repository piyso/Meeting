import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Webhook, Trash2, Save, AlertCircle } from 'lucide-react'
import { Button } from '../ui/Button'
import { useWebhooks } from '../../hooks/queries/useWebhooks'

export const WebhookSettingsView: React.FC = () => {
  const { webhooks, saveWebhook, removeWebhook } = useWebhooks()

  const [isAdding, setIsAdding] = useState(false)
  const [newUrl, setNewUrl] = useState('')

  const availableEvents = [
    { id: 'meeting.started', label: 'Meeting Started' },
    { id: 'meeting.completed', label: 'Meeting Completed' },
    { id: 'transcript.ready', label: 'Transcript Ready' },
    { id: 'action_item.created', label: 'Action Item Created' },
    { id: 'action_item.completed', label: 'Action Item Completed' },
    { id: 'digest.generated', label: 'Digest Generated' },
    { id: 'sentiment.alert', label: 'Sentiment Alert' },
  ]

  const toggleWebhook = (id: string, currentStatus: number | undefined) => {
    // We just find it from raw state and invert
    const existing = webhooks.find((w: { id: string }) => w.id === id) as
      | { id: string; url: string; events: string; is_active: number }
      | undefined
    if (existing) {
      saveWebhook.mutate({
        id,
        url: existing.url,
        events: JSON.parse(existing.events || '["meeting.completed"]'),
        is_active: currentStatus === 1 ? 0 : 1,
      })
    }
  }

  const deleteWebhook = (id: string) => {
    removeWebhook.mutate(id)
  }

  const handleSave = () => {
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
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center surface-glass-premium p-4 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)]">
        <div>
          <h3 className="text-[var(--text-sm)] font-semibold text-[var(--color-text-primary)]">
            Webhook Endpoints
          </h3>
          <p className="text-[11px] text-[var(--color-text-tertiary)] mt-1">
            Manage POST endpoints for meeting events
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setIsAdding(true)}>
          Add Endpoint
        </Button>
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="p-5 border border-violet/30 bg-violet/5 rounded-2xl flex flex-col gap-4 overflow-hidden"
          >
            <h4 className="text-sm font-semibold text-white flex items-center gap-2">
              <Webhook size={16} className="text-violet" /> Configure New Endpoint
            </h4>
            <div className="flex gap-4">
              <input
                type="url"
                value={newUrl}
                onChange={e => setNewUrl(e.target.value)}
                placeholder="https://your-server.com/webhooks"
                className="flex-1 bg-black border border-border rounded-lg px-4 py-2 text-sm text-primary focus:outline-none focus:border-violet"
              />
              <Button variant="primary" icon={<Save size={16} />} onClick={handleSave}>
                Save
              </Button>
              <Button variant="secondary" onClick={() => setIsAdding(false)}>
                Cancel
              </Button>
            </div>
          </motion.div>
        )}

        {webhooks.map((webhook: { id: string; url: string; events: string; is_active: number }) => (
          <motion.div
            key={webhook.id}
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="p-5 border border-border-subtle bg-glass rounded-2xl flex flex-col gap-4 shadow-macos-sm group hover:border-border transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2 rounded-lg ${webhook.is_active === 1 ? 'bg-emerald/10 text-emerald' : 'bg-secondary/10 text-tertiary'}`}
                >
                  <Webhook size={16} />
                </div>
                <div>
                  <div className="text-sm font-mono text-primary font-medium truncate max-w-lg">
                    {webhook.url}
                  </div>
                  <div className="text-xs text-tertiary mt-1 flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${webhook.is_active === 1 ? 'bg-emerald shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-red-500'}`}
                    />
                    {webhook.is_active === 1 ? 'Active' : 'Paused'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => toggleWebhook(webhook.id, webhook.is_active)}
                  className="p-2 hover:bg-glass rounded-lg text-secondary hover:text-white transition-colors"
                >
                  {webhook.is_active === 1 ? 'Pause' : 'Activate'}
                </button>
                <button
                  onClick={() => deleteWebhook(webhook.id)}
                  className="p-2 hover:bg-rose/10 rounded-lg text-secondary hover:text-rose transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            <div className="bg-black/50 p-4 rounded-xl border border-border-inset">
              <h5 className="text-xs font-semibold text-secondary uppercase tracking-widest mb-3">
                Subscribed Events
              </h5>
              <div className="flex flex-wrap gap-2">
                {availableEvents.map(event => {
                  let parsed: string[] = []
                  try {
                    parsed = JSON.parse(webhook.events || '[]')
                  } catch {
                    // Ignore parse error
                  }
                  const isSubscribed = parsed.includes(event.id)
                  return (
                    <button
                      key={event.id}
                      className={`text-[11px] font-medium px-2.5 py-1 rounded-md border transition-colors ${
                        isSubscribed
                          ? 'bg-violet/10 border-violet/30 text-violet'
                          : 'bg-glass border-transparent text-tertiary hover:text-secondary'
                      }`}
                    >
                      {event.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {webhooks.length === 0 && !isAdding && (
        <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-border-subtle rounded-2xl bg-glass/30">
          <AlertCircle size={32} className="text-tertiary mb-4" />
          <p className="text-secondary font-medium">No active webhooks</p>
          <p className="text-tertiary text-xs max-w-sm mt-2">
            Connect to Zapier or your own infrastructure to automate workflows when meetings finish.
          </p>
        </div>
      )}
    </div>
  )
}
