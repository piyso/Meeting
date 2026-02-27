import { create } from 'zustand'

export interface Toast {
  id: string
  type: 'info' | 'success' | 'warning' | 'error'
  title: string
  message?: string
  duration?: number // ms, default 5000
}

interface AppState {
  // ── Navigation ──
  activeView: 'meeting-list' | 'meeting-detail' | 'settings' | 'onboarding'
  selectedMeetingId: string | null
  isAuthenticated: boolean

  // ── Recording ──
  recordingState: 'idle' | 'starting' | 'recording' | 'stopping' | 'processing'
  activeMeetingId: string | null
  audioMode: 'system' | 'microphone' | 'none'

  // ── Connectivity ──
  isOnline: boolean
  syncStatus: 'idle' | 'syncing' | 'error'
  lastSyncTimestamp: number | null

  // ── UI State ──
  focusMode: boolean
  commandPaletteOpen: boolean
  globalContextOpen: boolean
  toasts: Toast[]

  // ── Actions ──
  navigate: (view: AppState['activeView'], meetingId?: string) => void
  setRecordingState: (state: AppState['recordingState'], mode?: AppState['audioMode']) => void
  toggleFocusMode: () => void
  toggleCommandPalette: () => void
  toggleGlobalContext: () => void
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
  setIsOnline: (isOnline: boolean) => void
  setSyncStatus: (status: AppState['syncStatus']) => void
  setLastSyncTimestamp: (timestamp: number | null) => void
}

export const useAppStore = create<AppState>()(set => ({
  // Navigation
  activeView: 'meeting-list',
  selectedMeetingId: null,
  isAuthenticated: false,

  // Recording
  recordingState: 'idle',
  activeMeetingId: null,
  audioMode: 'none',

  // Connectivity
  isOnline: navigator.onLine,
  syncStatus: 'idle',
  lastSyncTimestamp: (() => {
    const stored = localStorage.getItem('piynotes:lastSyncTimestamp')
    return stored ? parseInt(stored, 10) : null
  })(),

  // UI State
  focusMode: false,
  commandPaletteOpen: false,
  globalContextOpen: false,
  toasts: [],

  // Actions
  navigate: (view, meetingId) => set({ activeView: view, selectedMeetingId: meetingId ?? null }),

  setRecordingState: (recordingState, audioMode) =>
    set(s => ({ recordingState, audioMode: audioMode ?? s.audioMode })),

  toggleFocusMode: () => set(s => ({ focusMode: !s.focusMode })),

  toggleCommandPalette: () => set(s => ({ commandPaletteOpen: !s.commandPaletteOpen })),

  toggleGlobalContext: () => set(s => ({ globalContextOpen: !s.globalContextOpen })),

  addToast: toast =>
    set(s => ({
      toasts: [...s.toasts, { ...toast, id: crypto.randomUUID() }],
    })),

  removeToast: id => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),

  setIsOnline: isOnline => set({ isOnline }),
  setSyncStatus: syncStatus => set({ syncStatus }),
  setLastSyncTimestamp: timestamp => {
    if (timestamp) {
      localStorage.setItem('piynotes:lastSyncTimestamp', timestamp.toString())
    }
    set({ lastSyncTimestamp: timestamp })
  },
}))
