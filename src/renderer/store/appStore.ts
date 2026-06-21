import { create } from 'zustand'

export interface Toast {
  id: string
  type: 'info' | 'success' | 'warning' | 'error'
  title: string
  message?: string
  duration?: number // ms, default 5000
  undoAction?: () => void
  undoLabel?: string
}

interface AppState {
  // ── Global System State ──
  currentTier: string
  quotaData: { used: number; limit: number; remaining: number; exhausted: boolean }
  deviceInfo: { count: number }

  // ── UI State ──
  focusMode: boolean
  commandPaletteOpen: boolean
  globalContextOpen: boolean
  toasts: Toast[]

  // ── Actions ──
  setCurrentTier: (tier: string) => void
  setQuotaData: (data: {
    used: number
    limit: number
    remaining: number
    exhausted: boolean
  }) => void
  setDeviceInfo: (info: { count: number }) => void

  toggleFocusMode: () => void
  toggleCommandPalette: () => void
  toggleGlobalContext: () => void
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

const _toastTimers = new Map<string, NodeJS.Timeout>()

export const useAppStore = create<AppState>()(set => ({
  currentTier: 'free',
  quotaData: { used: 0, limit: 10, remaining: 10, exhausted: false },
  deviceInfo: { count: 1 },

  focusMode: false,
  commandPaletteOpen: false,
  globalContextOpen: false,
  toasts: [],

  setCurrentTier: tier => set({ currentTier: tier }),
  setQuotaData: quotaData => set({ quotaData }),
  setDeviceInfo: deviceInfo => set({ deviceInfo }),

  toggleFocusMode: () => set(s => ({ focusMode: !s.focusMode })),
  toggleCommandPalette: () => set(s => ({ commandPaletteOpen: !s.commandPaletteOpen })),
  toggleGlobalContext: () => set(s => ({ globalContextOpen: !s.globalContextOpen })),

  addToast: toast => {
    const id = crypto.randomUUID()
    const duration = toast.duration ?? 5000
    // P2-6 FIX: Cap toast count to prevent spam from rapid IPC errors
    set(s => {
      const toasts = [...s.toasts, { ...toast, id, duration }]
      // Keep only latest 5 toasts to prevent UI overflow
      return { toasts: toasts.slice(-5) }
    })
    // Auto-dismiss — track timer for cleanup in removeToast
    const timer = setTimeout(() => {
      useAppStore.getState().removeToast(id)
    }, duration)
    // Store timer for cleanup (P2-6: prevents orphaned timers)
    _toastTimers.set(id, timer)
  },

  removeToast: id => {
    // P2-6 FIX: Clear auto-dismiss timer to prevent double-dismiss
    const timer = _toastTimers.get(id)
    if (timer) {
      clearTimeout(timer)
      _toastTimers.delete(id)
    }
    set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }))
  },
}))
