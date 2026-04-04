/**
 * IPC Channel Registry — Single source of truth for all IPC channel names
 *
 * This module defines every IPC channel as a deeply-nested const object.
 * Import it in both main-process handlers and renderer-side code to ensure
 * channel names can never go out of sync due to typos.
 *
 * Usage:
 *   import { IPC_CHANNELS } from '../types/ipcChannels'
 *   ipcMain.handle(IPC_CHANNELS.note.create, async (_, params) => { ... })
 */

export const IPC_CHANNELS = {
  // ── Meeting ──
  meeting: {
    start: 'meeting:start',
    stop: 'meeting:stop',
    get: 'meeting:get',
    list: 'meeting:list',
    update: 'meeting:update',
    delete: 'meeting:delete',
    export: 'meeting:export',
  },

  // ── Note ──
  note: {
    create: 'note:create',
    get: 'note:get',
    update: 'note:update',
    delete: 'note:delete',
    expand: 'note:expand',
    batchExpand: 'note:batchExpand',
  },

  // ── Transcript ──
  transcript: {
    get: 'transcript:get',
    getContext: 'transcript:getContext',
    updateSpeaker: 'transcript:updateSpeaker',
  },

  // ── Entity ──
  entity: {
    get: 'entity:get',
    getByType: 'entity:getByType',
    extract: 'entity:extract',
  },

  // ── Search ──
  search: {
    query: 'search:query',
    semantic: 'search:semantic',
  },

  // ── Sync ──
  sync: {
    getStatus: 'sync:getStatus',
    trigger: 'sync:trigger',
    login: 'sync:login',
    logout: 'sync:logout',
    googleAuth: 'sync:googleAuth',
    resolveConflict: 'sync:resolveConflict',
  },

  // ── Audio ──
  audio: {
    listDevices: 'audio:listDevices',
    startCapture: 'audio:startCapture',
    stopCapture: 'audio:stopCapture',
    getStatus: 'audio:getStatus',
    preFlightTest: 'audio:preFlightTest',
    openSoundSettings: 'audio:openSoundSettings',
    getScreenRecordingPermission: 'audio:getScreenRecordingPermission',
    openScreenRecordingSettings: 'audio:openScreenRecordingSettings',
    startSystemAudioTest: 'audio:startSystemAudioTest',
    stopSystemAudioTest: 'audio:stopSystemAudioTest',
    getSystemAudioTestStatus: 'audio:getSystemAudioTestStatus',
    startMicrophoneTest: 'audio:startMicrophoneTest',
    stopMicrophoneTest: 'audio:stopMicrophoneTest',
    getMicrophoneTestStatus: 'audio:getMicrophoneTestStatus',
    exportDiagnostics: 'audio:exportDiagnostics',
    getDiagnosticsPath: 'audio:getDiagnosticsPath',
    getDiagnosticsStats: 'audio:getDiagnosticsStats',
    clearDiagnostics: 'audio:clearDiagnostics',
    openDiagnosticsFolder: 'audio:openDiagnosticsFolder',
    startCaptureWithFallback: 'audio:startCaptureWithFallback',
    handleCaptureFallback: 'audio:handleCaptureFallback',
  },

  // ── Intelligence ──
  intelligence: {
    getHardwareTier: 'intelligence:getHardwareTier',
    getEngineStatus: 'intelligence:getEngineStatus',
    checkOllama: 'intelligence:checkOllama',
    unloadModels: 'intelligence:unloadModels',
    meetingSuggestion: 'intelligence:meetingSuggestion',
    askMeetings: 'intelligence:askMeetings',
    streamToken: 'intelligence:streamToken',
  },

  // ── Model ──
  model: {
    detectHardwareTier: 'model:detectHardwareTier',
    isFirstLaunch: 'model:isFirstLaunch',
    areModelsDownloaded: 'model:areModelsDownloaded',
    downloadModelsForTier: 'model:downloadModelsForTier',
    downloadAll: 'model:downloadAll',
    verifyModel: 'model:verifyModel',
    deleteModel: 'model:deleteModel',
    getModelPaths: 'model:getModelPaths',
    getResourceUsage: 'model:getResourceUsage',
  },

  // ── Settings ──
  settings: {
    get: 'settings:get',
    getAll: 'settings:getAll',
    update: 'settings:update',
    reset: 'settings:reset',
  },

  // ── Auth ──
  auth: {
    login: 'auth:login',
    register: 'auth:register',
    logout: 'auth:logout',
    getCurrentUser: 'auth:getCurrentUser',
    isAuthenticated: 'auth:isAuthenticated',
    googleAuth: 'auth:googleAuth',
    refreshToken: 'auth:refreshToken',
    generateRecoveryKey: 'auth:generateRecoveryKey',
    recordActivity: 'auth:recordActivity',
    refreshProfile: 'auth:refreshProfile',
    activateLicense: 'auth:activateLicense',
    forgotPassword: 'auth:forgotPassword',
  },

  // ── Graph ──
  graph: {
    get: 'graph:get',
    getContradictions: 'graph:getContradictions',
    traverse: 'graph:traverse',
    search: 'graph:search',
    getStats: 'graph:getStats',
    contradictionPreview: 'graph:contradictionPreview',
  },

  // ── Digest ──
  digest: {
    generate: 'digest:generate',
    getLatest: 'digest:getLatest',
  },

  // ── Power ──
  power: {
    getStatus: 'power:getStatus',
  },

  // ── Window ──
  window: {
    restoreMain: 'window:restoreMain',
  },

  // ── Widget ──
  widget: {
    updateState: 'widget:updateState',
    triggerBookmark: 'widget:triggerBookmark',
    triggerPauseToggle: 'widget:triggerPauseToggle',
    submitQuickNote: 'widget:submitQuickNote',
  },

  // ── Shell ──
  shell: {
    openExternal: 'shell:openExternal',
  },

  // ── Device ──
  device: {
    list: 'device:list',
    getCurrent: 'device:getCurrent',
    register: 'device:register',
    deactivate: 'device:deactivate',
    rename: 'device:rename',
  },

  // ── Diagnostic ──
  diagnostic: {
    export: 'diagnostic:export',
    clear: 'diagnostic:clear',
    stats: 'diagnostic:stats',
    openFolder: 'diagnostic:openFolder',
    getSystemInfo: 'diagnostic:getSystemInfo',
  },

  // ── Quota ──
  quota: {
    check: 'quota:check',
  },

  // ── Billing ──
  billing: {
    getConfig: 'billing:getConfig',
    getStatus: 'billing:getStatus',
    openCheckout: 'billing:openCheckout',
  },

  // ── Audit ──
  audit: {
    query: 'audit:query',
    export: 'audit:export',
  },

  // ── Export (GDPR) ──
  export: {
    userData: 'export:userData',
    deleteAllData: 'export:deleteAllData',
  },

  // ── Highlight (Bookmarks) ──
  highlight: {
    create: 'highlight:create',
    list: 'highlight:list',
    delete: 'highlight:delete',
  },

  // ── PiyAPI Power Features ──
  piyapi: {
    feedback: 'piyapi:feedback',
    fuzzySearch: 'piyapi:fuzzySearch',
    deduplicate: 'piyapi:deduplicate',
    pinMemory: 'piyapi:pinMemory',
    getClusters: 'piyapi:getClusters',
    getContext: 'piyapi:getContext',
  },

  // ── Action Items ──
  actionItem: {
    list: 'actionItem:list',
    create: 'actionItem:create',
    update: 'actionItem:update',
    delete: 'actionItem:delete',
    extract: 'actionItem:extract',
    extractRealTime: 'actionItem:extractRealTime',
    getOverdue: 'actionItem:getOverdue',
    stats: 'actionItem:stats',
  },

  // ── Sentiment Analysis ──
  sentiment: {
    analyze: 'sentiment:analyze',
    getByMeeting: 'sentiment:getByMeeting',
    getMood: 'sentiment:getMood',
    getTimeline: 'sentiment:getTimeline',
  },

  // ── Calendar ──
  calendar: {
    sync: 'calendar:sync',
    list: 'calendar:list',
    link: 'calendar:link',
    autoLink: 'calendar:autoLink',
    getPreContext: 'calendar:getPreContext',
  },

  // ── Webhooks ──
  webhook: {
    list: 'webhook:list',
    create: 'webhook:create',
    update: 'webhook:update',
    delete: 'webhook:delete',
    test: 'webhook:test',
    getDeliveries: 'webhook:getDeliveries',
  },

  // ── Streaming Events (webContents.send channels, not ipcMain.handle) ──
  events: {
    transcriptChunk: 'event:transcriptChunk',
    batchExpandProgress: 'event:batchExpandProgress',
    modelDownloadProgress: 'model-download-progress',
    syncConflict: 'sync:conflict',
    sessionExpiring: 'session:expiring',
    sessionExpired: 'session:expired',
    widgetStateUpdated: 'widget:stateUpdated',
    audioFallback: 'audio:fallbackOccurred',
    bookmarkRequested: 'event:bookmarkRequested',
    quickNoteRequested: 'event:quickNoteRequested',
    pauseRequested: 'event:pauseRequested',
    actionItemDetected: 'event:actionItemDetected',
    sentimentUpdate: 'event:sentimentUpdate',
    calendarEventSoon: 'event:calendarEventSoon',
    webhookDelivery: 'event:webhookDelivery',
  },
} as const

// ── Helper types ──

/** Extracts all channel string values as a union type. */
type ChannelValues<T> = T extends string
  ? T
  : T extends Record<string, unknown>
    ? { [K in keyof T]: ChannelValues<T[K]> }[keyof T]
    : never

/** Union of every IPC channel name string. */
export type IpcChannel = ChannelValues<typeof IPC_CHANNELS>

/**
 * Collect all channel strings from the registry into a flat array.
 * Useful for cleanup in `cleanupIPC()`.
 */
export function getAllChannels(): IpcChannel[] {
  const channels: string[] = []
  for (const group of Object.values(IPC_CHANNELS)) {
    for (const channel of Object.values(group)) {
      channels.push(channel)
    }
  }
  return channels as IpcChannel[]
}
