import { useEffect } from 'react'
import { useAppStore } from '../store/appStore'

export function useSyncEngine() {
  const { setSyncStatus, setIsOnline, isOnline } = useAppStore()

  useEffect(() => {
    // Poll sync status
    const interval = setInterval(async () => {
      if (!isOnline) {
        setSyncStatus('error')
        return
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
        }
      } catch (err) {
        setSyncStatus('error')
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [isOnline, setSyncStatus])

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => {
      setIsOnline(false)
      setSyncStatus('error')
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Initial check
    setIsOnline(navigator.onLine)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [setIsOnline, setSyncStatus])

  return null
}
