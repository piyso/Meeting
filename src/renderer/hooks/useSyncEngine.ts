import { useEffect, useRef } from 'react'
import { useAppStore } from '../store/appStore'

export function useSyncEngine() {
  // Use individual selectors to avoid re-renders from unrelated store changes
  const setSyncStatus = useAppStore(s => s.setSyncStatus)
  const setIsOnline = useAppStore(s => s.setIsOnline)
  const setLastSyncTimestamp = useAppStore(s => s.setLastSyncTimestamp)

  // Use a ref for isOnline to avoid the effect re-firing when it changes
  const isOnlineRef = useRef(useAppStore.getState().isOnline)

  // Keep the ref in sync without triggering effects
  useEffect(() => {
    const unsub = useAppStore.subscribe(state => {
      isOnlineRef.current = state.isOnline
    })
    return unsub
  }, [])

  // Poll sync status — stable deps, no re-fire loop
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!isOnlineRef.current || document.visibilityState === 'hidden') {
        return // Offline or backgrounded — skip entirely
      }

      try {
        const res = await window.electronAPI.sync.getStatus()
        if (res.success && res.data) {
          if (res.data.isSyncing) {
            setSyncStatus('syncing')
          } else if (res.data.lastSyncError) {
            setSyncStatus('error')
          } else {
            setSyncStatus('idle')
          }
          if (res.data.lastSyncTime) {
            setLastSyncTimestamp(res.data.lastSyncTime)
          }
        } else {
          setSyncStatus('idle')
        }
      } catch {
        setSyncStatus('idle')
      }
    }, 15_000) // 15s — responsive enough for status indicators without IPC spam

    return () => clearInterval(interval)
  }, [setSyncStatus, setLastSyncTimestamp])

  // Online/offline listeners — fire once on mount
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => {
      setIsOnline(false)
      setSyncStatus('idle') // Offline is normal for local-first, not an error
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Initial check (only on mount)
    setIsOnline(navigator.onLine)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [setIsOnline, setSyncStatus])

  return null
}
