import { create } from 'zustand'

export interface ConnectivityState {
  isOnline: boolean
  syncStatus: 'idle' | 'syncing' | 'error'
  lastSyncTimestamp: number | null

  setIsOnline: (isOnline: boolean) => void
  setSyncStatus: (status: ConnectivityState['syncStatus']) => void
  setLastSyncTimestamp: (timestamp: number | null) => void
}

export const useConnectivityStore = create<ConnectivityState>()(set => ({
  isOnline: navigator.onLine,
  syncStatus: 'idle',
  lastSyncTimestamp: (() => {
    try {
      const stored = localStorage.getItem('bluearkive:lastSyncTimestamp')
      if (!stored) return null
      const parsed = parseInt(stored, 10)
      return Number.isNaN(parsed) ? null : parsed
    } catch {
      return null
    }
  })(),

  setIsOnline: isOnline => set({ isOnline }),
  setSyncStatus: syncStatus => set({ syncStatus }),
  setLastSyncTimestamp: timestamp => {
    try {
      if (timestamp) {
        localStorage.setItem('bluearkive:lastSyncTimestamp', timestamp.toString())
      } else {
        localStorage.removeItem('bluearkive:lastSyncTimestamp')
      }
    } catch {
      // ignore localStorage errors
    }
    set({ lastSyncTimestamp: timestamp })
  },
}))
