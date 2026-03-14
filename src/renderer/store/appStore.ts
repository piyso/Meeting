import { create } from 'zustand'

export interface Toast {
  id: string
  type: 'info' | 'success' | 'warning' | 'error'
  title: string
  message?: string
  duration?: number // ms, default 5000
}

interface AppState {
  // ── Global System State ──
  currentTier: string
  quotaData: { used: number; limit: number; remaining: number; exhausted: boolean }
  deviceInfo: { count: number }
  aiEngineStatus: 'idle' | 'loading' | 'loaded' | 'unloading'

  // ── Navigation ──
  activeView:
    | 'meeting-list'
    | 'meeting-detail'
    | 'settings'
    | 'onboarding'
    | 'knowledge-graph'
    | 'weekly-digest'
    | 'ask-meetings'
    | 'pricing'
  selectedMeetingId: string | null

  // ── Recording ──
  recordingState: 'idle' | 'starting' | 'recording' | 'paused' | 'stopping' | 'processing'
  activeMeetingId: string | null
  audioMode: 'system' | 'microphone' | 'none'
  recordingStartTime: number | null
  recordingPausedAt: number | null
  recordingTotalPausedMs: number
  lastTranscriptLine: string | null
  liveCoachTip: string | null
  entityCount: number
  noteCount: number
  processingStep: string

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
  setCurrentTier: (tier: string) => void
  setQuotaData: (data: {
    used: number
    limit: number
    remaining: number
    exhausted: boolean
  }) => void
  setDeviceInfo: (info: { count: number }) => void
  setAIEngineStatus: (status: AppState['aiEngineStatus']) => void

  navigate: (view: AppState['activeView'], meetingId?: string) => void
  setRecordingState: (state: AppState['recordingState'], mode?: AppState['audioMode']) => void
  setRecordingStartTime: (time: number | null) => void
  setRecordingPausedAt: (time: number | null) => void
  setRecordingTotalPausedMs: (ms: number) => void
  setLastTranscriptLine: (line: string | null) => void
  setLiveCoachTip: (tip: string | null) => void
  setEntityCount: (count: number) => void
  setNoteCount: (count: number) => void
  setProcessingStep: (step: string) => void
  toggleFocusMode: () => void
  toggleCommandPalette: () => void
  toggleGlobalContext: () => void
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
  setIsOnline: (isOnline: boolean) => void
  setSyncStatus: (status: AppState['syncStatus']) => void
  setActiveMeetingId: (id: string | null) => void
  setLastSyncTimestamp: (timestamp: number | null) => void
}

export const useAppStore = create<AppState>()(set => ({
  // Global System State
  currentTier: 'free',
  quotaData: { used: 0, limit: 10, remaining: 10, exhausted: false },
  deviceInfo: { count: 0 },
  aiEngineStatus: 'idle',

  // Navigation
  activeView: 'meeting-list',
  selectedMeetingId: null,

  // Recording
  recordingState: 'idle',
  activeMeetingId: null,
  audioMode: 'none',
  recordingStartTime: null,
  recordingPausedAt: null,
  recordingTotalPausedMs: 0,
  lastTranscriptLine: null,
  liveCoachTip: null,
  entityCount: 0,
  noteCount: 0,
  processingStep: '',

  // Connectivity
  isOnline: navigator.onLine,
  syncStatus: 'idle',
  lastSyncTimestamp: (() => {
    const stored = localStorage.getItem('bluearkive:lastSyncTimestamp')
    if (!stored) return null
    const parsed = parseInt(stored, 10)
    return Number.isNaN(parsed) ? null : parsed // NaN guard — corrupt localStorage value
  })(),

  // UI State
  focusMode: false,
  commandPaletteOpen: false,
  globalContextOpen: false,
  toasts: [],

  // Actions
  setCurrentTier: tier => set({ currentTier: tier }),
  setActiveMeetingId: activeMeetingId => set({ activeMeetingId }),
  setQuotaData: quotaData => set({ quotaData }),
  setDeviceInfo: deviceInfo => set({ deviceInfo }),
  setAIEngineStatus: aiEngineStatus => set({ aiEngineStatus }),

  navigate: (view, meetingId) =>
    set(s => ({
      activeView: view,
      // Only overwrite selectedMeetingId when explicitly provided.
      // This preserves it for back-navigation to meeting-detail.
      selectedMeetingId: meetingId !== undefined ? meetingId : s.selectedMeetingId,
    })),

  setRecordingState: (recordingState, audioMode) =>
    set(s => ({
      recordingState,
      audioMode: audioMode ?? s.audioMode,
      // Auto-clear start time when returning to idle
      recordingStartTime: recordingState === 'idle' ? null : s.recordingStartTime,
      recordingPausedAt: recordingState === 'idle' ? null : s.recordingPausedAt,
      recordingTotalPausedMs: recordingState === 'idle' ? 0 : s.recordingTotalPausedMs,
      lastTranscriptLine: recordingState === 'idle' ? null : s.lastTranscriptLine,
      liveCoachTip: recordingState === 'idle' ? null : s.liveCoachTip,
      entityCount: recordingState === 'idle' ? 0 : s.entityCount,
      noteCount: recordingState === 'idle' ? 0 : s.noteCount,
      processingStep: recordingState === 'idle' ? '' : s.processingStep,
    })),

  setRecordingStartTime: recordingStartTime => set({ recordingStartTime }),
  setRecordingPausedAt: recordingPausedAt => set({ recordingPausedAt }),
  setRecordingTotalPausedMs: recordingTotalPausedMs => set({ recordingTotalPausedMs }),
  setLastTranscriptLine: lastTranscriptLine => set({ lastTranscriptLine }),
  setLiveCoachTip: liveCoachTip => set({ liveCoachTip }),
  setEntityCount: entityCount => set({ entityCount }),
  setNoteCount: noteCount => set({ noteCount }),
  setProcessingStep: processingStep => set({ processingStep }),

  toggleFocusMode: () => set(s => ({ focusMode: !s.focusMode })),

  toggleCommandPalette: () => set(s => ({ commandPaletteOpen: !s.commandPaletteOpen })),

  toggleGlobalContext: () => set(s => ({ globalContextOpen: !s.globalContextOpen })),

  addToast: toast => {
    const id = crypto.randomUUID()
    const duration = toast.duration ?? 5000
    set(s => ({ toasts: [...s.toasts, { ...toast, id, duration }] }))
    // Auto-dismiss — outside setter to avoid side effects in reducer
    setTimeout(() => {
      useAppStore.getState().removeToast(id)
    }, duration)
  },

  removeToast: id => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),

  setIsOnline: isOnline => set({ isOnline }),
  setSyncStatus: syncStatus => set({ syncStatus }),
  setLastSyncTimestamp: timestamp => {
    if (timestamp) {
      localStorage.setItem('bluearkive:lastSyncTimestamp', timestamp.toString())
    } else {
      localStorage.removeItem('bluearkive:lastSyncTimestamp')
    }
    set({ lastSyncTimestamp: timestamp })
  },
}))
