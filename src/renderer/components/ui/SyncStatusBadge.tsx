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
    window.electronAPI?.sync
      ?.getStatus()
      ?.then(res => {
        if (mounted && res.success && res.data) {
          setIsOnline(res.data.isOnline)
          setIsSyncing(res.data.isSyncing)
          setQueuedEvents(res.data.queuedEvents)
          setError(res.data.lastSyncError)
        }
      })
      .catch(() => {
        /* offline or unavailable */
      })

    const unsub = window.electronAPI?.on?.syncEvent?.(
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
        className="flex items-center gap-1.5 px-1 py-1 flex-shrink-0 text-[#8E8E93] text-[12px] font-medium select-none"
        title="Offline"
      >
        <CloudOff size={14} className="opacity-70" strokeWidth={2} />
        <span>Offline</span>
      </div>
    )
  }

  if (error) {
    return (
      <div
        className="flex items-center gap-1.5 px-2 py-1 object-contain flex-shrink-0 rounded-[6px] bg-[#3A1D1D] text-[#FF453A] text-[12px] font-medium select-none shadow-sm"
        title={error}
      >
        <AlertTriangle size={13} strokeWidth={2.5} />
        <span>Sync Error</span>
      </div>
    )
  }

  if (isSyncing || queuedEvents > 0) {
    return (
      <div
        className="flex items-center gap-1.5 px-2 flex-shrink-0 py-1 rounded-[6px] bg-[#1C1C1E] text-white text-[12px] font-medium select-none shadow-sm"
        title="Syncing via CRDT to cloud"
      >
        <RefreshCw size={13} className="animate-spin text-[#0A84FF]" strokeWidth={2.5} />
        <span>Syncing {queuedEvents || (progress?.current ? progress.current : 1)}...</span>
      </div>
    )
  }

  return (
    <div
      className="flex flex-shrink-0 items-center gap-1.5 px-1 py-1 text-[#8E8E93] text-[12px] font-medium select-none transition-opacity duration-300 hover:opacity-100 opacity-70"
      title="All systems synchronized"
    >
      <div className="w-[5px] h-[5px] rounded-full bg-[#34C759]"></div>
      <span>Synced to Cloud</span>
    </div>
  )
}
