import React, { useEffect, useState } from 'react'
import { CloudOff, RefreshCw, AlertTriangle } from 'lucide-react'
import type { SyncProgress } from '../../../types/ipc'

export const SyncStatusBadge: React.FC = () => {
  const [isOnline, setIsOnline] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [queuedEvents, setQueuedEvents] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<SyncProgress | null>(null)

  useEffect(() => {
    let mounted = true
    window.electronAPI.sync.getStatus().then(res => {
      if (mounted && res.success && res.data) {
        setIsOnline(res.data.isOnline)
        setIsSyncing(res.data.isSyncing)
        setQueuedEvents(res.data.queuedEvents)
        setError(res.data.lastSyncError)
      }
    })

    const unsub = window.electronAPI.on.syncEvent(
      (event: { type: string; progress?: SyncProgress; error?: { message: string } }) => {
        // update state based on event
        if (event.type === 'started') {
          setIsSyncing(true)
          setError(null)
        } else if (event.type === 'progress') {
          setIsSyncing(true)
          setProgress(event.progress || null)
        } else if (event.type === 'completed') {
          setIsSyncing(false)
          setProgress(null)
          setQueuedEvents(0)
        } else if (event.type === 'failed') {
          setIsSyncing(false)
          setError(event.error?.message || 'Sync failed')
        }
      }
    )

    return () => {
      mounted = false
      if (unsub) unsub()
    }
  }, [])

  if (!isOnline) {
    return (
      <div
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] text-[var(--color-text-tertiary)] text-[11px] font-medium select-none shadow-sm"
        title="Offline"
      >
        <CloudOff size={13} className="opacity-70" />
        <span>Offline</span>
      </div>
    )
  }

  if (error) {
    return (
      <div
        className="flex items-center gap-1.5 px-2.5 py-1 flex-shrink-0 rounded-full border border-[var(--color-rose)]/30 bg-[var(--color-rose)]/10 text-[var(--color-rose)] text-[11px] font-medium select-none shadow-sm"
        title={error}
      >
        <AlertTriangle size={13} />
        <span>Sync Error</span>
      </div>
    )
  }

  if (isSyncing || queuedEvents > 0) {
    return (
      <div
        className="flex items-center gap-1.5 px-2.5 flex-shrink-0 py-1 rounded-full border border-[var(--color-violet)]/30 bg-[var(--color-violet)]/10 text-[var(--color-violet)] text-[11px] font-medium select-none shadow-sm shadow-[var(--color-violet)]/5"
        title="Syncing via CRDT to cloud"
      >
        <RefreshCw size={13} className="animate-spin opacity-80" />
        <span>↑ {queuedEvents || (progress?.current ? progress.current : 1)} syncing</span>
      </div>
    )
  }

  return (
    <div
      className="flex flex-shrink-0 items-center gap-1.5 px-2.5 py-1 rounded-full border border-[var(--color-emerald)]/20 bg-[var(--color-emerald)]/5 text-[var(--color-emerald)] text-[11px] font-medium select-none shadow-sm"
      title="All systems synchronized"
    >
      <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-emerald)] shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
      <span>Synced</span>
    </div>
  )
}
