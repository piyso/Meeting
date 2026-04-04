/**
 * Preload Script - Context Bridge
 *
 * This file creates a secure bridge between the main process and renderer process.
 * It exposes a strictly typed API via window.electronAPI that the frontend can use.
 *
 * SECURITY: The renderer process has NO direct access to Node.js or Electron APIs.
 * All communication must go through this controlled interface.
 */

import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type { ElectronAPI } from '../src/types/ipc'

// Helper to create unsubscribe function for event listeners
const createEventListener = <T>(channel: string) => {
  return (callback: (data: T) => void): (() => void) => {
    const subscription = (_event: IpcRendererEvent, data: T) => callback(data)
    ipcRenderer.on(channel, subscription)

    // Return unsubscribe function
    return () => {
      ipcRenderer.removeListener(channel, subscription)
    }
  }
}

// Expose the ElectronAPI to the renderer process
const electronAPI: ElectronAPI = {
  // Platform information
  platform: process.platform,

  // ============================================================================
  // Meeting Operations
  // ============================================================================
  meeting: {
    start: params => ipcRenderer.invoke('meeting:start', params),
    stop: params => ipcRenderer.invoke('meeting:stop', params),
    get: params => ipcRenderer.invoke('meeting:get', params),
    list: params => ipcRenderer.invoke('meeting:list', params),
    update: params => ipcRenderer.invoke('meeting:update', params),
    delete: params => ipcRenderer.invoke('meeting:delete', params),
    export: params => ipcRenderer.invoke('meeting:export', params),
    onGlobalShortcutStart: createEventListener('global-shortcut:start-recording'),
  },

  // ============================================================================
  // Note Operations
  // ============================================================================
  note: {
    create: params => ipcRenderer.invoke('note:create', params),
    update: params => ipcRenderer.invoke('note:update', params),
    expand: params => ipcRenderer.invoke('note:expand', params),
    batchExpand: params => ipcRenderer.invoke('note:batchExpand', params),
    get: params => ipcRenderer.invoke('note:get', params),
    delete: params => ipcRenderer.invoke('note:delete', params),
  },

  // ============================================================================
  // Transcript Operations
  // ============================================================================
  transcript: {
    get: params => ipcRenderer.invoke('transcript:get', params),
    getContext: params => ipcRenderer.invoke('transcript:getContext', params),
    updateSpeaker: params => ipcRenderer.invoke('transcript:updateSpeaker', params),
  },

  // ============================================================================
  // Entity Operations
  // ============================================================================
  entity: {
    get: params => ipcRenderer.invoke('entity:get', params),
    getByType: params => ipcRenderer.invoke('entity:getByType', params),
    extract: params => ipcRenderer.invoke('entity:extract', params),
  },

  // ============================================================================
  // Search Operations
  // ============================================================================
  search: {
    query: params => ipcRenderer.invoke('search:query', params),
    semantic: params => ipcRenderer.invoke('search:semantic', params),
  },

  // ============================================================================
  // Sync Operations
  // ============================================================================
  sync: {
    getStatus: () => ipcRenderer.invoke('sync:getStatus'),
    trigger: params => ipcRenderer.invoke('sync:trigger', params),
    login: params => ipcRenderer.invoke('sync:login', params),
    logout: () => ipcRenderer.invoke('sync:logout'),
    googleAuth: () => ipcRenderer.invoke('sync:googleAuth'),
    onConflict: createEventListener('sync:conflict'),
    resolveConflict: (params: { noteId: string; strategy: string; mergedContent?: string }) =>
      ipcRenderer.invoke('sync:resolveConflict', params),
  },

  // ============================================================================
  // Audio Operations
  // ============================================================================
  audio: {
    listDevices: () => ipcRenderer.invoke('audio:listDevices'),
    startCapture: params => ipcRenderer.invoke('audio:startCapture', params),
    stopCapture: params => ipcRenderer.invoke('audio:stopCapture', params),
    getStatus: () => ipcRenderer.invoke('audio:getStatus'),
    preFlightTest: () => ipcRenderer.invoke('audio:preFlightTest'),
    openSoundSettings: () => ipcRenderer.invoke('audio:openSoundSettings'),
    getScreenRecordingPermission: () => ipcRenderer.invoke('audio:getScreenRecordingPermission'),
    openScreenRecordingSettings: () => ipcRenderer.invoke('audio:openScreenRecordingSettings'),
    startSystemAudioTest: () => ipcRenderer.invoke('audio:startSystemAudioTest'),
    stopSystemAudioTest: () => ipcRenderer.invoke('audio:stopSystemAudioTest'),
    getSystemAudioTestStatus: () => ipcRenderer.invoke('audio:getSystemAudioTestStatus'),
    startMicrophoneTest: () => ipcRenderer.invoke('audio:startMicrophoneTest'),
    stopMicrophoneTest: () => ipcRenderer.invoke('audio:stopMicrophoneTest'),
    getMicrophoneTestStatus: () => ipcRenderer.invoke('audio:getMicrophoneTestStatus'),
    // Task 12.6: Diagnostic logging
    exportDiagnostics: () => ipcRenderer.invoke('audio:exportDiagnostics'),
    getDiagnosticsPath: () => ipcRenderer.invoke('audio:getDiagnosticsPath'),
    getDiagnosticsStats: () => ipcRenderer.invoke('audio:getDiagnosticsStats'),
    clearDiagnostics: () => ipcRenderer.invoke('audio:clearDiagnostics'),
    openDiagnosticsFolder: () => ipcRenderer.invoke('audio:openDiagnosticsFolder'),

    // Task 13.2: Fallback chain
    startCaptureWithFallback: (params: {
      meetingId: string
      preferredSource?: 'system' | 'microphone' | 'cloud'
    }) => ipcRenderer.invoke('audio:startCaptureWithFallback', params),
    handleCaptureFallback: (params: {
      meetingId: string
      currentSource: 'system' | 'microphone'
    }) => ipcRenderer.invoke('audio:handleCaptureFallback', params),
    onFallbackOccurred: (
      callback: (fallbackInfo: {
        from: 'system' | 'microphone' | 'cloud'
        to: 'microphone' | 'cloud' | 'error'
        reason: string
        requiresUserAction: boolean
        guidance?: {
          title: string
          steps: string[]
          link?: string
        }
      }) => void
    ) => {
      const subscription = (
        _event: IpcRendererEvent,
        fallbackInfo: {
          from: 'system' | 'microphone' | 'cloud'
          to: 'microphone' | 'cloud' | 'error'
          reason: string
          requiresUserAction: boolean
          guidance?: { title: string; steps: string[]; link?: string }
        }
      ) => callback(fallbackInfo)
      ipcRenderer.on('audio:fallbackOccurred', subscription)
      return () => ipcRenderer.removeListener('audio:fallbackOccurred', subscription)
    },

    // Pause/Resume capture
    pauseCapture: () => ipcRenderer.invoke('audio:pauseCapture'),
    resumeCapture: () => ipcRenderer.invoke('audio:resumeCapture'),
  },

  // ============================================================================
  // Intelligence Operations
  // ============================================================================
  intelligence: {
    getHardwareTier: () => ipcRenderer.invoke('intelligence:getHardwareTier'),
    getEngineStatus: () => ipcRenderer.invoke('intelligence:getEngineStatus'),
    checkOllama: params => ipcRenderer.invoke('intelligence:checkOllama', params),
    unloadModels: () => ipcRenderer.invoke('intelligence:unloadModels'),
    meetingSuggestion: params => ipcRenderer.invoke('intelligence:meetingSuggestion', params),
    askMeetings: params => ipcRenderer.invoke('intelligence:askMeetings', params),
  },

  // ============================================================================
  // Model Operations
  // ============================================================================
  model: {
    detectHardwareTier: () => ipcRenderer.invoke('model:detectHardwareTier'),
    isFirstLaunch: () => ipcRenderer.invoke('model:isFirstLaunch'),
    areModelsDownloaded: (modelType: string) =>
      ipcRenderer.invoke('model:areModelsDownloaded', modelType),
    downloadModelsForTier: (tierInfo: unknown) =>
      ipcRenderer.invoke('model:downloadModelsForTier', tierInfo),
    verifyModel: (modelType: string) => ipcRenderer.invoke('model:verifyModel', modelType),
    deleteModel: (modelType: string) => ipcRenderer.invoke('model:deleteModel', modelType),
    getModelPaths: (modelType: string) => ipcRenderer.invoke('model:getModelPaths', modelType),
    downloadAll: () => ipcRenderer.invoke('model:downloadAll'),
    getResourceUsage: () => ipcRenderer.invoke('model:getResourceUsage'),
    onDownloadProgress: (
      callback: (progress: {
        modelName: string
        percent: number
        downloadedMB: number
        totalMB: number
        status: 'downloading' | 'verifying' | 'complete' | 'error'
        error?: string
      }) => void
    ) => {
      const subscription = (
        _event: IpcRendererEvent,
        progress: {
          modelName: string
          percent: number
          downloadedMB: number
          totalMB: number
          status: 'downloading' | 'verifying' | 'complete' | 'error'
          error?: string
        }
      ) => callback(progress)
      ipcRenderer.on('model-download-progress', subscription)
      return () => ipcRenderer.removeListener('model-download-progress', subscription)
    },
  },

  // ============================================================================
  // Settings Operations
  // ============================================================================
  settings: {
    getAll: () => ipcRenderer.invoke('settings:getAll'),
    get: params => ipcRenderer.invoke('settings:get', params),
    update: params => ipcRenderer.invoke('settings:update', params),
    reset: () => ipcRenderer.invoke('settings:reset'),
  },

  // ============================================================================
  // Knowledge Graph Operations
  // ============================================================================
  graph: {
    get: params => ipcRenderer.invoke('graph:get', params),
    getContradictions: params => ipcRenderer.invoke('graph:getContradictions', params),
    traverse: params => ipcRenderer.invoke('graph:traverse', params),
    search: params => ipcRenderer.invoke('graph:search', params),
    getStats: () => ipcRenderer.invoke('graph:getStats'),
    contradictionPreview: params => ipcRenderer.invoke('graph:contradictionPreview', params),
  },

  // ============================================================================
  // Highlight (Bookmark) Operations
  // ============================================================================
  highlight: {
    create: (params: {
      meetingId: string
      startTime: number
      endTime: number
      label?: string
      color?: string
    }) => ipcRenderer.invoke('highlight:create', params),
    list: (meetingId: string) => ipcRenderer.invoke('highlight:list', meetingId),
    delete: (id: string) => ipcRenderer.invoke('highlight:delete', id),
  },

  // ============================================================================
  // Weekly Digest Operations
  // ============================================================================
  digest: {
    generate: params => ipcRenderer.invoke('digest:generate', params),
    getLatest: (params?: { periodType?: string }) => ipcRenderer.invoke('digest:getLatest', params),
  },

  // ============================================================================
  // Shell Operations
  // ============================================================================
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  },

  // ============================================================================
  // Export & GDPR Operations
  // ============================================================================
  export: {
    userData: (params?: { format?: string }) => ipcRenderer.invoke('export:userData', params),
    deleteAllData: () => ipcRenderer.invoke('export:deleteAllData'),
  },

  // ============================================================================
  // Window Operations
  // ============================================================================
  window: {
    restoreMain: () => ipcRenderer.invoke('window:restoreMain'),
  },

  // ============================================================================
  // Widget Operations
  // ============================================================================
  widget: {
    updateState: (state: {
      isRecording: boolean
      isPaused?: boolean
      elapsedTime?: string // Legacy compat — widget now computes locally
      lastTranscriptLine: string
      audioMode?: 'system' | 'microphone' | 'none'
      syncStatus?: 'idle' | 'syncing' | 'error'
      suggestionText?: string
      liveCoachTip?: string | null
      entityCount?: number
      noteCount?: number
      // Phase 1: Timer IPC elimination — send raw timestamps instead of formatted string
      recordingStartTime?: number | null
      recordingPausedAt?: number | null
      recordingTotalPausedMs?: number
      // Phase 1: Type-safe meetingId (removes unsafe `as` cast in WidgetApp)
      meetingId?: string
      // Phase 3: VAD silence feedback
      silenceDetected?: boolean
    }) => ipcRenderer.invoke('widget:updateState', state),
    triggerBookmark: () => ipcRenderer.invoke('widget:triggerBookmark'),
    triggerPauseToggle: () => ipcRenderer.invoke('widget:triggerPauseToggle'),
    submitQuickNote: (note: string) => ipcRenderer.invoke('widget:submitQuickNote', note),
  },

  // ============================================================================
  // Window Controls (Windows Title Bar)
  // ============================================================================
  windowControls: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () =>
      ipcRenderer.invoke('window:isMaximized').then((r: { data: boolean }) => r.data),
  },

  // Issue 13: Desktop capturer sources for WASAPI system audio on Windows
  desktopCapturerSources: () => ipcRenderer.invoke('desktop-capturer-sources'),

  // ============================================================================
  // Event Listeners (Streaming)
  // ============================================================================
  on: {
    transcriptChunk: createEventListener('event:transcriptChunk'),
    llmToken: createEventListener('event:llmToken'),
    syncEvent: createEventListener('event:syncEvent'),
    audioEvent: createEventListener('event:audioEvent'),
    batchExpandProgress: createEventListener('event:batchExpandProgress'),
    widgetStateUpdated: createEventListener('widget:stateUpdated'),
    error: createEventListener('event:error'),
    'intelligence:streamToken': createEventListener('intelligence:streamToken'),
    showIntelligenceWall: createEventListener('show-intelligence-wall'),
    bookmarkRequested: createEventListener('event:bookmarkRequested'),
    quickNoteRequested: createEventListener('event:quickNoteRequested'),
    pauseRequested: createEventListener('event:pauseRequested'),
    actionItemDetected: createEventListener('event:actionItemDetected'),
    sentimentUpdate: createEventListener('event:sentimentUpdate'),
    calendarEventSoon: createEventListener('event:calendarEventSoon'),
    deepLink: createEventListener<string>('deep-link'),
    windowMaximized: createEventListener<void>('window:maximized'),
    windowUnmaximized: createEventListener<void>('window:unmaximized'),
  },

  // ============================================================================
  // IPC Renderer (for audio capture module)
  // ============================================================================
  ipcRenderer: {
    send: (channel: string, data: unknown) => {
      // SECURITY: Only allow specific channels — prevents XSS/extension abuse
      const ALLOWED_SEND_CHANNELS = ['audio:chunk', 'audio:fallbackUsed']
      if (ALLOWED_SEND_CHANNELS.includes(channel)) {
        ipcRenderer.send(channel, data)
      } else {
        console.warn(`[Preload] Blocked send to unauthorized channel: ${channel}`)
      }
    },
    on: (channel: string, callback: (event: unknown, data: unknown) => void) => {
      // SECURITY: Only allow listening on specific channels
      const ALLOWED_LISTEN_CHANNELS = [
        'audio:startCapture',
        'audio:startMicrophoneCapture',
        'audio:stopCapture',
        'audio:fallbackNotification',
      ]
      if (!ALLOWED_LISTEN_CHANNELS.includes(channel)) {
        console.warn(`[Preload] Blocked listener on unauthorized channel: ${channel}`)
        return () => {} // Return no-op unsubscribe
      }
      const subscription = (event: IpcRendererEvent, data: unknown) => callback(event, data)
      ipcRenderer.on(channel, subscription)
      return () => ipcRenderer.removeListener(channel, subscription)
    },
  },

  // ============================================================================
  // Power Management
  // ============================================================================
  power: {
    getStatus: () => ipcRenderer.invoke('power:getStatus'),
  },

  // ============================================================================
  // Auth Operations
  // ============================================================================
  auth: {
    login: (params: { email: string; password: string }) =>
      ipcRenderer.invoke('auth:login', params),
    register: (params: { email: string; password: string }) =>
      ipcRenderer.invoke('auth:register', params),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getCurrentUser: () => ipcRenderer.invoke('auth:getCurrentUser'),
    isAuthenticated: () => ipcRenderer.invoke('auth:isAuthenticated'),
    googleAuth: () => ipcRenderer.invoke('auth:googleAuth'),
    refreshToken: () => ipcRenderer.invoke('auth:refreshToken'),
    generateRecoveryKey: () => ipcRenderer.invoke('auth:generateRecoveryKey'),
    onSessionExpired: createEventListener('session:expired'),
    onSessionExpiring: createEventListener('session:expiring'),
    onOAuthSuccess: createEventListener('auth:oauthSuccess'),
    onOAuthError: createEventListener('auth:oauthError'),
    recordActivity: () => ipcRenderer.invoke('auth:recordActivity'),
    refreshProfile: () => ipcRenderer.invoke('auth:refreshProfile'),
    activateLicense: (params: { key: string }) =>
      ipcRenderer.invoke('auth:activateLicense', params),
    forgotPassword: (params: { email: string }) =>
      ipcRenderer.invoke('auth:forgotPassword', params),
  },

  // ============================================================================
  // Device Management
  // ============================================================================
  device: {
    list: (params?: { userId?: string; activeOnly?: boolean }) =>
      ipcRenderer.invoke('device:list', params),
    getCurrent: () => ipcRenderer.invoke('device:getCurrent'),
    register: (params: { userId: string; customName?: string; planTier?: string }) =>
      ipcRenderer.invoke('device:register', params),
    deactivate: (params: { deviceId: string; userId: string }) =>
      ipcRenderer.invoke('device:deactivate', params),
    rename: (params: { deviceId: string; userId: string; newName: string }) =>
      ipcRenderer.invoke('device:rename', params),
  },

  // ============================================================================
  // Diagnostics
  // ============================================================================
  diagnostic: {
    export: () => ipcRenderer.invoke('diagnostic:export'),
    clear: () => ipcRenderer.invoke('diagnostic:clear'),
    stats: () => ipcRenderer.invoke('diagnostic:stats'),
    openFolder: () => ipcRenderer.invoke('diagnostic:openFolder'),
    getSystemInfo: () => ipcRenderer.invoke('diagnostic:getSystemInfo'),
    rebuildFts: () => ipcRenderer.invoke('diagnostic:rebuildFts'),
    healthCheck: () => ipcRenderer.invoke('health:check'),
  },

  // ============================================================================
  // Quota & Billing
  // ============================================================================
  quota: {
    check: () => ipcRenderer.invoke('quota:check'),
  },

  // ============================================================================
  // Audit Logs
  // ============================================================================
  audit: {
    query: (params: { limit?: number; offset?: number; startDate?: string; endDate?: string }) =>
      ipcRenderer.invoke('audit:query', params),
    export: () => ipcRenderer.invoke('audit:export'),
  },

  // ============================================================================
  // Billing
  // ============================================================================
  billing: {
    getConfig: () => ipcRenderer.invoke('billing:getConfig'),
    getStatus: () => ipcRenderer.invoke('billing:getStatus'),
    openCheckout: (params: { targetTier?: string }) =>
      ipcRenderer.invoke('billing:openCheckout', params),
  },

  // ============================================================================
  // PiyAPI Power Features
  // ============================================================================
  piyapi: {
    feedback: (params: { memoryIds: string[]; type: 'positive' | 'negative' }) =>
      ipcRenderer.invoke('piyapi:feedback', params),
    fuzzySearch: (params: { query: string; namespace?: string; limit?: number }) =>
      ipcRenderer.invoke('piyapi:fuzzySearch', params),
    deduplicate: (params?: { namespace?: string; dryRun?: boolean }) =>
      ipcRenderer.invoke('piyapi:deduplicate', params),
    pinMemory: (params: { memoryId: string; unpin?: boolean }) =>
      ipcRenderer.invoke('piyapi:pinMemory', params),
    getClusters: (params?: { namespace?: string }) =>
      ipcRenderer.invoke('piyapi:getClusters', params),
    getContext: (params: {
      query: string
      namespace?: string
      tokenBudget?: number
      timeRange?: { start: number; end: number }
    }) => ipcRenderer.invoke('piyapi:getContext', params),
  },

  // ============================================================================
  // Action Item Operations
  // ============================================================================
  actionItem: {
    list: (params: { meetingId?: string; status?: string }) =>
      ipcRenderer.invoke('actionItem:list', params),
    create: (params: unknown) => ipcRenderer.invoke('actionItem:create', params),
    update: (params: unknown) => ipcRenderer.invoke('actionItem:update', params),
    delete: (params: { id: string }) => ipcRenderer.invoke('actionItem:delete', params),
    extract: (params: { meetingId: string }) => ipcRenderer.invoke('actionItem:extract', params),
    getOverdue: () => ipcRenderer.invoke('actionItem:getOverdue'),
    stats: () => ipcRenderer.invoke('actionItem:stats'),
  },

  // ============================================================================
  // Sentiment Analysis Operations
  // ============================================================================
  sentiment: {
    analyze: (params: { meetingId: string }) => ipcRenderer.invoke('sentiment:analyze', params),
    getByMeeting: (params: { meetingId: string }) =>
      ipcRenderer.invoke('sentiment:getByMeeting', params),
    getMood: (params: { meetingId: string }) => ipcRenderer.invoke('sentiment:getMood', params),
    getTimeline: (params: { meetingId: string }) =>
      ipcRenderer.invoke('sentiment:getTimeline', params),
  },

  // ============================================================================
  // Calendar Operations
  // ============================================================================
  calendar: {
    sync: (params: { provider: string }) => ipcRenderer.invoke('calendar:sync', params),
    list: (params: { start: number; end: number }) => ipcRenderer.invoke('calendar:list', params),
    link: (params: { eventId: string; meetingId: string }) =>
      ipcRenderer.invoke('calendar:link', params),
    autoLink: (params: { meetingId: string }) => ipcRenderer.invoke('calendar:autoLink', params),
    getPreContext: (params: { eventId: string }) =>
      ipcRenderer.invoke('calendar:getPreContext', params),
  },

  // ============================================================================
  // Webhook Operations
  // ============================================================================
  webhook: {
    list: () => ipcRenderer.invoke('webhook:list'),
    create: (params: unknown) => ipcRenderer.invoke('webhook:create', params),
    update: (params: unknown) => ipcRenderer.invoke('webhook:update', params),
    delete: (params: { id: string }) => ipcRenderer.invoke('webhook:delete', params),
    test: (params: { id: string }) => ipcRenderer.invoke('webhook:test', params),
    getDeliveries: (params: { webhookId: string; limit?: number }) =>
      ipcRenderer.invoke('webhook:getDeliveries', params),
  },
}

// Expose the API to the renderer process.
// When USE_MOCK_DATA is set in the environment, skip contextBridge so the
// renderer's mock layer can freely assign window.electronAPI.
if (process.env.USE_MOCK_DATA === 'true') {
  // Mock mode is dev-only — no contextBridge needed (mock layer provides API)
} else {
  contextBridge.exposeInMainWorld('electronAPI', electronAPI)
}

// Type declaration for TypeScript
declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export type { ElectronAPI }
