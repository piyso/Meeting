/**
 * IPC Type Definitions
 *
 * Complete type definitions for all IPC communication between
 * main process and renderer process.
 */

import type {
  Meeting,
  UpdateMeetingInput,
  Transcript,
  Note,
  UpdateNoteInput,
  Entity,
  EntityType,
  TranscriptSearchResult,
  NoteSearchResult,
} from './database'

// ============================================================================
// Common Types
// ============================================================================

export interface IPCResponse<T = unknown> {
  success: boolean
  data?: T
  error?: IPCError
}

export interface IPCError {
  code: string
  message: string
  details?: string
  timestamp: number
}

export interface PaginationParams {
  limit?: number
  offset?: number
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  limit: number
  offset: number
  hasMore: boolean
}

// ============================================================================
// Meeting Operations
// ============================================================================

export interface StartMeetingParams {
  title?: string
  namespace?: string
}

export interface StartMeetingResponse {
  meeting: Meeting
  audioDevices: AudioDevice[]
}

export interface StopMeetingParams {
  meetingId: string
}

export interface GetMeetingParams {
  meetingId: string
}

export interface ListMeetingsParams extends PaginationParams {
  namespace?: string
  startDate?: number
  endDate?: number
  tags?: string[]
}

export interface UpdateMeetingParams {
  meetingId: string
  updates: UpdateMeetingInput
}

export interface DeleteMeetingParams {
  meetingId: string
}

export interface ExportMeetingParams {
  meetingId: string
  format?: 'json' | 'markdown' | 'pdf'
  includeAudio?: boolean
}

export interface ExportMeetingResponse {
  content: string
  format: string
  filename: string
  filePath?: string
  fileSize?: number
}

export interface MeetingOperations {
  onGlobalShortcutStart?: (callback: () => void) => () => void
}

// ============================================================================
// Note Operations
// ============================================================================

export interface CreateNoteParams {
  meetingId: string
  timestamp: number
  text: string
}

export interface UpdateNoteParams {
  noteId: string
  updates: UpdateNoteInput
}

export interface ExpandNoteParams {
  noteId?: string
  meetingId: string
  timestamp: number
  text: string
}

export interface ExpandNoteResponse {
  expandedText: string
  context: string
  tokensUsed: number
  inferenceTime: number
  sourceSegments?: string[]
  source?: 'local' | 'cloud'
}

export interface GetNotesParams {
  meetingId: string
}

export interface DeleteNoteParams {
  noteId: string
}

export interface BatchExpandNotesParams {
  meetingId: string
  noteIds: string[]
}

export interface BatchExpandNotesProgress {
  total: number
  completed: number
  current: string
  note: Note
}

// ============================================================================
// Transcript Operations
// ============================================================================

export interface GetTranscriptsParams {
  meetingId: string
  startTime?: number
  endTime?: number
}

export interface GetTranscriptContextParams {
  meetingId: string
  timestamp: number
  beforeSeconds: number
  afterSeconds: number
}

export interface GetTranscriptContextResponse {
  transcripts: Transcript[]
  contextText: string
  startTime: number
  endTime: number
}

export interface UpdateSpeakerNameParams {
  meetingId: string
  speakerId: string
  speakerName: string
}

// ============================================================================
// Entity Operations
// ============================================================================

export interface GetEntitiesParams {
  meetingId: string
  types?: EntityType[]
}

export interface GetEntitiesByTypeParams {
  type: EntityType
  limit?: number
}

export interface EntityAggregation {
  type: EntityType
  text: string
  count: number
  meetings: string[]
  firstSeen: number
  lastSeen: number
}

// ============================================================================
// Search Operations
// ============================================================================

export interface SearchParams {
  query: string
  namespace?: string
  limit?: number
  searchTranscripts?: boolean
  searchNotes?: boolean
}

export interface SearchResponse {
  transcripts: TranscriptSearchResult[]
  notes: NoteSearchResult[]
  totalResults: number
  queryTime: number
}

export interface SemanticSearchParams {
  query: string
  namespace?: string
  limit?: number
}

export interface SemanticSearchResult {
  meeting: Meeting
  relevance: number
  snippet: string
  entities: Entity[]
}

// ============================================================================
// Sync Operations
// ============================================================================

export interface SyncStatus {
  isOnline: boolean
  isSyncing: boolean
  queuedEvents: number
  lastSyncTime: number | null
  lastSyncError: string | null
}

export interface SyncProgress {
  phase: 'encrypting' | 'uploading' | 'downloading' | 'decrypting' | 'applying'
  current: number
  total: number
  message: string
}

export interface TriggerSyncParams {
  force?: boolean
}

export interface LoginParams {
  email: string
  password: string
}

export interface LoginResponse {
  userId: string
  email: string
  tier: 'free' | 'starter' | 'pro' | 'team' | 'enterprise'
  devices: Device[]
}

export interface Device {
  id: string
  name: string
  platform: string
  lastSync: number
  isCurrentDevice: boolean
}

// ============================================================================
// Audio Operations
// ============================================================================

export interface AudioDevice {
  id: string
  label: string
  kind: 'system' | 'microphone'
  isDefault: boolean
  isAvailable: boolean
  deviceType?: 'built-in' | 'external-monitor' | 'bluetooth' | 'usb' | 'unknown'
  connectionType?: 'hdmi' | 'displayport' | 'bluetooth' | 'usb' | 'internal' | 'unknown'
}

export interface StartAudioCaptureParams {
  meetingId: string
  deviceId?: string
  fallbackToMicrophone?: boolean
}

export interface StopAudioCaptureParams {
  meetingId: string
}

export interface AudioChunk {
  data: Float32Array
  timestamp: number
  sampleRate: number
}

export interface AudioCaptureStatus {
  isCapturing: boolean
  meetingId: string | null
  deviceId: string | null
  deviceKind?: 'system' | 'microphone' | null
  sampleRate?: number
  channelCount?: number
  bufferSize?: number
  duration: number
  chunksReceived: number
}

export interface AudioLevelUpdate {
  meetingId: string
  level: number // 0-1
  hasVoice: boolean
  timestamp: number
}

export interface PreFlightTestResult {
  systemAudio: {
    available: boolean
    tested: boolean
    error?: string
    guidance?: StereoMixGuidance
  }
  microphone: {
    available: boolean
    tested: boolean
    error?: string
  }
  recommendation: 'system' | 'microphone' | 'cloud'
}

export interface StereoMixGuidance {
  title: string
  steps: string[]
  settingsLink?: string
  videoTutorialUrl?: string
  fallbackOptions?: Array<{
    type: 'microphone' | 'cloud'
    description: string
  }>
}

// Task 13.2: Fallback chain types
export interface FallbackChainParams {
  meetingId: string
  preferredSource?: 'system' | 'microphone' | 'cloud'
}

export interface FallbackChainResult {
  success: boolean
  source: 'system' | 'microphone' | 'cloud' | null
  message: string
  requiresUserAction: boolean
  guidance?: {
    title: string
    steps: string[]
    link?: string
  }
}

export interface FallbackInfo {
  from: 'system' | 'microphone' | 'cloud'
  to: 'microphone' | 'cloud' | 'error'
  reason: string
  requiresUserAction: boolean
  guidance?: {
    title: string
    steps: string[]
    link?: string
  }
}

export interface CaptureFallbackParams {
  meetingId: string
  currentSource: 'system' | 'microphone'
}

export interface CaptureFallbackResult {
  success: boolean
  newSource: 'microphone' | 'cloud' | null
  message: string
}

export interface ScreenRecordingGuidance {
  title: string
  steps: string[]
  link?: string
}

// ============================================================================
// Intelligence Operations
// ============================================================================

export interface HardwareTierInfo {
  tier: 'low' | 'mid' | 'high'
  totalRAM: number
  availableRAM: number
  asrEngine: 'whisper-turbo' | 'moonshine-base'
  llmModel: 'qwen2.5:3b' | 'qwen2.5:1.5b'
  llmMaxTokens: number
  totalRAMBudget: string
  canRunConcurrent: boolean
}

export interface ModelStatus {
  name: string
  isLoaded: boolean
  ramUsage: number
  lastUsed: number | null
  autoUnloadIn: number | null
}

export interface InferenceEngineStatus {
  engine: 'local' | 'mlx'
  tokensPerSecond: number
  models: ModelStatus[]
}

export interface CheckOllamaParams {
  /** @deprecated Ollama replaced by node-llama-cpp. Kept for backward compat. */
  autoInstall?: boolean
}

export interface CheckOllamaResponse {
  /** @deprecated Field names kept for renderer compat but now backed by node-llama-cpp */
  isInstalled: boolean
  isRunning: boolean
  version: string | null
  models: string[]
  downloadUrl?: string
}

export interface MeetingSuggestionParams {
  meetingId: string
  recentContext: string
  promptMode?: 'title' | 'question' | 'action' | 'decision'
}

export interface MeetingSuggestionResponse {
  suggestion: string
  mode?: string
}

// ============================================================================
// Settings Operations
// ============================================================================

export interface AppSettings {
  // Audio
  preferredAudioDevice: string | null
  audioFallbackEnabled: boolean
  vadThreshold: number

  // Transcription
  hardwareTier: 'low' | 'mid' | 'high' | null
  forceWhisperTurbo: boolean
  useCloudTranscription: boolean
  cloudTranscriptionUsage: number // hours used this month

  // Intelligence
  llmEngine: 'local' | 'mlx'
  llmIdleTimeout: number // seconds
  maxTokensPerExpansion: number

  // Storage
  keepAudioFiles: boolean
  maxDiskUsage: number // GB
  autoDeleteOldMeetings: boolean
  autoDeleteAfterDays: number

  // Sync
  syncEnabled: boolean
  syncInterval: number // seconds
  encryptionEnabled: boolean

  // UI
  theme: 'light' | 'dark' | 'system'
  language: 'en'
  showSmartChips: boolean
  autoExpandNotes: boolean

  // Privacy
  phiDetectionEnabled: boolean
  maskPHIBeforeSync: boolean
  auditLoggingEnabled: boolean

  // Lifecycle
  onboarding_completed: boolean
}

export interface UpdateSettingsParams {
  key: string
  value: unknown
}

export interface GetSettingParams {
  key: keyof AppSettings | string
}

// ============================================================================
// Event Streaming Types
// ============================================================================

export interface TranscriptChunk {
  meetingId: string
  transcriptId: string
  text: string
  startTime: number
  endTime: number
  confidence: number
  speakerId: string | null
  isFinal: boolean
}

export interface LLMToken {
  noteId: string
  token: string
  isComplete: boolean
  totalTokens: number
  inferenceTime: number
}

export interface SyncEvent {
  type: 'started' | 'progress' | 'completed' | 'failed'
  progress?: SyncProgress
  error?: IPCError
}

export interface AudioEvent {
  type: 'started' | 'stopped' | 'level' | 'error'
  meetingId: string
  level?: AudioLevelUpdate
  error?: IPCError
}

export interface ErrorEvent {
  code: string
  message: string
  details?: string
  timestamp: number
  context?: Record<string, unknown>
}

// ============================================================================
// Knowledge Graph Types
// ============================================================================

export interface GraphNode {
  id: string
  type: 'meeting' | 'person' | 'topic' | 'decision' | 'action' | 'action_item'
  label: string
  metadata: Record<string, unknown>
  createdAt: number
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  type:
    | 'follows'
    | 'references'
    | 'contradicts'
    | 'supersedes'
    | 'supports'
    | 'questions'
    | 'implements'
    | 'parent'
  weight: number
  metadata: Record<string, unknown>
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface GetGraphParams {
  namespace?: string
  meetingIds?: string[]
  maxHops?: number
  includeTypes?: GraphNode['type'][]
}

export interface Contradiction {
  id: string
  type: 'contradicts' | 'supersedes'
  meeting1: { id: string; title: string } | null
  meeting2: { id: string; title: string } | null
  statement1: string
  statement2: string
  confidence: number
  detectedAt: number
}

export interface GetContradictionsParams {
  namespace?: string
  startDate?: number
  endDate?: number
}

// ============================================================================
// Weekly Digest Types
// ============================================================================

export interface WeeklyDigest {
  id: string
  startDate: number
  endDate: number
  generatedAt: number

  summary: {
    totalMeetings: number
    totalHours: number
    uniqueParticipants: number
    aiSummary?: string
  }

  keyDecisions: Array<{
    text: string
    meetingId: string
    meetingTitle?: string
    meetingDate?: number
    sourceContext?: string
    timestamp: number
    confidence: number
  }>

  actionItems: {
    open: number
    completed: number
    overdue: number
    items: Array<{
      text: string
      meetingId: string
      meetingTitle?: string
      meetingDate?: number
      sourceContext?: string
      assignee: string | null
      dueDate: number | null
      status: 'open' | 'completed' | 'overdue'
    }>
  }

  contradictions: Contradiction[]

  entityAggregation: {
    topPeople: Array<{ name: string; meetingCount: number; meetingTitles?: string[] }>
    topTopics: Array<{ topic: string; mentionCount: number; meetingTitles?: string[] }>
  }
}

export interface GenerateDigestParams {
  meetingId?: string
  startDate?: number
  endDate?: number
  namespace?: string
  periodType?: 'daily' | 'weekly' | 'monthly'
  userId?: string
}

// ============================================================================
// Electron API Interface (exposed to renderer)
// ============================================================================

export interface ElectronAPI {
  // Platform info
  platform: string

  // Meeting operations
  meeting: {
    start: (params: StartMeetingParams) => Promise<IPCResponse<StartMeetingResponse>>
    stop: (params: StopMeetingParams) => Promise<IPCResponse<void>>
    get: (params: GetMeetingParams) => Promise<IPCResponse<Meeting>>
    list: (params: ListMeetingsParams) => Promise<IPCResponse<PaginatedResponse<Meeting>>>
    update: (params: UpdateMeetingParams) => Promise<IPCResponse<Meeting>>
    delete: (params: DeleteMeetingParams) => Promise<IPCResponse<void>>
    export: (params: ExportMeetingParams) => Promise<IPCResponse<ExportMeetingResponse>>
    onGlobalShortcutStart?: (callback: () => void) => () => void
  }

  // Note operations
  note: {
    create: (params: CreateNoteParams) => Promise<IPCResponse<Note>>
    update: (params: UpdateNoteParams) => Promise<IPCResponse<Note>>
    expand: (params: ExpandNoteParams) => Promise<IPCResponse<ExpandNoteResponse>>
    batchExpand: (params: BatchExpandNotesParams) => Promise<IPCResponse<void>>
    get: (params: GetNotesParams) => Promise<IPCResponse<Note[]>>
    delete: (params: DeleteNoteParams) => Promise<IPCResponse<void>>
  }

  // Transcript operations
  transcript: {
    get: (params: GetTranscriptsParams) => Promise<IPCResponse<Transcript[]>>
    getContext: (
      params: GetTranscriptContextParams
    ) => Promise<IPCResponse<GetTranscriptContextResponse>>
    updateSpeaker: (params: UpdateSpeakerNameParams) => Promise<IPCResponse<void>>
  }

  // Entity operations
  entity: {
    get: (params: GetEntitiesParams) => Promise<IPCResponse<Entity[]>>
    getByType: (params: GetEntitiesByTypeParams) => Promise<IPCResponse<EntityAggregation[]>>
    extract: (params: { text: string }) => Promise<
      IPCResponse<
        Array<{
          text: string
          type: string
          confidence: number
          startOffset: number
          endOffset: number
        }>
      >
    >
  }

  // Search operations
  search: {
    query: (params: SearchParams) => Promise<IPCResponse<SearchResponse>>
    semantic: (params: SemanticSearchParams) => Promise<IPCResponse<SemanticSearchResult[]>>
  }

  // Sync operations
  sync: {
    getStatus: () => Promise<IPCResponse<SyncStatus>>
    trigger: (params: TriggerSyncParams) => Promise<IPCResponse<void>>
    login: (params: LoginParams) => Promise<IPCResponse<LoginResponse>>
    logout: () => Promise<IPCResponse<void>>
    googleAuth: () => Promise<IPCResponse<{ status: string; message: string }>>
    onConflict?: (
      callback: (data: {
        noteId: string
        localVersion: string
        remoteVersion: string
        autoResolved: boolean
      }) => void
    ) => () => void
    resolveConflict?: (params: {
      noteId: string
      strategy: string
      mergedContent?: string
      localVersion?: string
      remoteVersion?: string
    }) => Promise<IPCResponse<void>>
  }

  // Audio operations
  audio: {
    listDevices: () => Promise<IPCResponse<AudioDevice[]>>
    startCapture: (params: StartAudioCaptureParams) => Promise<IPCResponse<AudioCaptureStatus>>
    stopCapture: (params: StopAudioCaptureParams) => Promise<IPCResponse<void>>
    pauseCapture: () => Promise<IPCResponse<void>>
    resumeCapture: () => Promise<IPCResponse<void>>
    getStatus: () => Promise<IPCResponse<AudioCaptureStatus>>
    preFlightTest: () => Promise<IPCResponse<PreFlightTestResult>>
    openSoundSettings: () => Promise<IPCResponse<void>>
    getScreenRecordingPermission: () => Promise<
      IPCResponse<{
        status: string
        message: string
        guidance?: ScreenRecordingGuidance
      }>
    >
    openScreenRecordingSettings: () => Promise<IPCResponse<void>>
    startSystemAudioTest: () => Promise<
      IPCResponse<{
        success: boolean
        message: string
        requiresUserAction: boolean
      }>
    >
    stopSystemAudioTest: () => Promise<
      IPCResponse<{
        success: boolean
        audioDetected: boolean
        maxLevel: number
        duration: number
        message: string
      }>
    >
    getSystemAudioTestStatus: () => Promise<
      IPCResponse<{
        isActive: boolean
        audioDetected: boolean
        maxLevel: number
        duration: number
      } | null>
    >
    startMicrophoneTest: () => Promise<
      IPCResponse<{
        success: boolean
        message: string
        requiresUserAction: boolean
      }>
    >
    stopMicrophoneTest: () => Promise<
      IPCResponse<{
        success: boolean
        audioDetected: boolean
        maxLevel: number
        duration: number
        message: string
      }>
    >
    getMicrophoneTestStatus: () => Promise<
      IPCResponse<{
        isActive: boolean
        audioDetected: boolean
        maxLevel: number
        duration: number
      } | null>
    >
    // Task 12.6: Diagnostic logging
    exportDiagnostics: () => Promise<IPCResponse<string>>
    getDiagnosticsPath: () => Promise<IPCResponse<string>>
    getDiagnosticsStats: () => Promise<
      IPCResponse<{
        totalFiles: number
        totalSize: string
        oldestLog: string | null
        newestLog: string | null
      }>
    >
    clearDiagnostics: () => Promise<IPCResponse<void>>
    openDiagnosticsFolder: () => Promise<IPCResponse<void>>
    onFallbackOccurred: (callback: (info: FallbackInfo) => void) => () => void
    startCaptureWithFallback: (
      params: FallbackChainParams
    ) => Promise<IPCResponse<FallbackChainResult>>
    handleCaptureFallback: (
      params: CaptureFallbackParams
    ) => Promise<IPCResponse<CaptureFallbackResult>>
  }

  // Shell operations
  shell: {
    openExternal: (url: string) => Promise<IPCResponse<void>>
  }

  // Intelligence operations
  intelligence: {
    getHardwareTier: () => Promise<IPCResponse<HardwareTierInfo>>
    getEngineStatus: () => Promise<IPCResponse<InferenceEngineStatus>>
    checkOllama: (params: CheckOllamaParams) => Promise<IPCResponse<CheckOllamaResponse>>
    unloadModels: () => Promise<IPCResponse<void>>
    meetingSuggestion: (
      params: MeetingSuggestionParams
    ) => Promise<IPCResponse<MeetingSuggestionResponse>>
    askMeetings: (params: {
      question: string
      context: string
    }) => Promise<IPCResponse<{ answer: string }>>
  }

  // Model operations
  model: {
    detectHardwareTier: () => Promise<IPCResponse<HardwareTierInfo>>
    isFirstLaunch: () => Promise<IPCResponse<boolean>>
    areModelsDownloaded: (modelType: string) => Promise<IPCResponse<boolean>>
    downloadModelsForTier: (tierInfo: HardwareTierInfo) => Promise<IPCResponse<void>>
    downloadAll: () => Promise<IPCResponse<void>>
    getResourceUsage: () => Promise<IPCResponse<unknown>>
    verifyModel: (modelType: string) => Promise<IPCResponse<boolean>>
    deleteModel: (modelType: string) => Promise<IPCResponse<void>>
    getModelPaths: (modelType: string) => Promise<IPCResponse<string[]>>
    onDownloadProgress: (
      callback: (data: {
        modelName: string
        percent: number
        downloadedMB: number
        totalMB: number
        status: 'downloading' | 'verifying' | 'complete' | 'error'
        error?: string
      }) => void
    ) => () => void
  }

  // Settings operations
  settings: {
    getAll: () => Promise<IPCResponse<AppSettings>>
    get: (params: GetSettingParams) => Promise<IPCResponse<unknown>>
    update: (params: UpdateSettingsParams) => Promise<IPCResponse<AppSettings>>
    reset: () => Promise<IPCResponse<AppSettings>>
  }

  // Knowledge graph operations
  graph: {
    get: (params: GetGraphParams) => Promise<IPCResponse<GraphData>>
    getContradictions: (params: GetContradictionsParams) => Promise<IPCResponse<Contradiction[]>>
    traverse: (params: {
      nodeId: string
      maxDepth?: number
      namespace?: string
    }) => Promise<IPCResponse<GraphData>>
    search: (params: {
      query: string
      limit?: number
      namespace?: string
    }) => Promise<IPCResponse<{ results: GraphNode[] }>>
    getStats: () => Promise<
      IPCResponse<{ totalNodes: number; totalEdges: number; clusters: number }>
    >
    contradictionPreview: (params: { namespace?: string }) => Promise<
      IPCResponse<{
        count: number
        available: boolean
        requiresPro?: boolean
        preview?: string | null
      }>
    >
  }

  // Weekly digest operations
  digest: {
    generate: (params: GenerateDigestParams) => Promise<IPCResponse<WeeklyDigest>>
    getLatest: (params?: { periodType?: string }) => Promise<IPCResponse<WeeklyDigest | null>>
  }

  // Export & GDPR operations
  export: {
    userData: (params?: {
      format?: string
    }) => Promise<IPCResponse<{ content: string; format: string }>>
    deleteAllData: () => Promise<
      IPCResponse<{ localDeleted: boolean; cloudDeleted: boolean; message: string }>
    >
  }

  // Window operations
  window: {
    restoreMain: () => Promise<IPCResponse<void>>
  }

  // Widget operations
  widget: {
    updateState: (state: {
      isRecording: boolean
      isPaused?: boolean
      elapsedTime: string
      lastTranscriptLine: string
      audioMode?: 'system' | 'microphone' | 'none'
      syncStatus?: 'idle' | 'syncing' | 'error'
      suggestionText?: string
      liveCoachTip?: string | null
      entityCount?: number
      noteCount?: number
    }) => Promise<IPCResponse<void>>
    triggerBookmark: () => Promise<IPCResponse<void>>
    submitQuickNote: (note: string) => Promise<IPCResponse<void>>
    triggerPauseToggle: () => Promise<IPCResponse<void>>
  }

  // Highlight (bookmark) operations
  highlight: {
    create: (params: {
      meetingId: string
      startTime: number
      endTime: number
      label?: string
      color?: string
    }) => Promise<
      IPCResponse<{
        id: string
        meeting_id: string
        start_time: number
        end_time: number
        label: string | null
        color: string
        created_at: number
      }>
    >
    list: (meetingId: string) => Promise<
      IPCResponse<
        Array<{
          id: string
          meeting_id: string
          start_time: number
          end_time: number
          label: string | null
          color: string
          created_at: number
        }>
      >
    >
    delete: (id: string) => Promise<IPCResponse<{ deleted: boolean }>>
  }

  // Action Item operations
  actionItem: {
    list: (params: {
      meetingId?: string
      status?: string
    }) => Promise<IPCResponse<import('./features').ActionItem[]>>
    create: (
      params: import('./features').CreateActionItemInput
    ) => Promise<IPCResponse<import('./features').ActionItem>>
    update: (params: {
      id: string
      updates: import('./features').UpdateActionItemInput
    }) => Promise<IPCResponse<import('./features').ActionItem>>
    delete: (params: { id: string }) => Promise<IPCResponse<void>>
    extract: (params: {
      meetingId: string
    }) => Promise<IPCResponse<import('./features').ActionItem[]>>
    extractRealTime: (params: {
      text: string
      meetingId: string
    }) => Promise<IPCResponse<unknown[]>>
    getOverdue: () => Promise<IPCResponse<import('./features').ActionItem[]>>
    stats: () => Promise<IPCResponse<{ open: number; completed: number; overdue: number }>>
  }

  // Sentiment Analysis operations
  sentiment: {
    analyze: (params: {
      meetingId: string
    }) => Promise<IPCResponse<import('./features').SentimentScore[]>>
    getByMeeting: (params: {
      meetingId: string
    }) => Promise<IPCResponse<import('./features').SentimentScore[]>>
    getMood: (params: {
      meetingId: string
    }) => Promise<IPCResponse<import('./features').MeetingMood | null>>
    getTimeline: (params: {
      meetingId: string
    }) => Promise<IPCResponse<import('./features').SentimentScore[]>>
  }

  // Calendar operations
  calendar: {
    sync: (params: { provider: 'google' | 'apple' }) => Promise<IPCResponse<{ synced: number }>>
    list: (params: {
      start: number
      end: number
    }) => Promise<IPCResponse<import('./features').CalendarEvent[]>>
    link: (params: { eventId: string; meetingId: string }) => Promise<IPCResponse<void>>
    autoLink: (params: {
      meetingId: string
    }) => Promise<IPCResponse<import('./features').CalendarEvent | null>>
    getPreContext: (params: { eventId: string }) => Promise<IPCResponse<{ context: string }>>
  }

  // Webhook operations
  webhook: {
    list: () => Promise<IPCResponse<import('./features').Webhook[]>>
    create: (params: {
      url: string
      events: string[]
      description?: string
    }) => Promise<IPCResponse<import('./features').Webhook>>
    update: (params: {
      id: string
      updates: import('./features').UpdateWebhookInput
    }) => Promise<IPCResponse<import('./features').Webhook>>
    delete: (params: { id: string }) => Promise<IPCResponse<void>>
    test: (params: { id: string }) => Promise<IPCResponse<{ success: boolean; status?: number }>>
    getDeliveries: (params: {
      webhookId: string
      limit?: number
    }) => Promise<IPCResponse<import('./features').WebhookDelivery[]>>
  }

  // Window controls (Windows title bar)
  windowControls: {
    minimize: () => Promise<IPCResponse>
    maximize: () => Promise<IPCResponse>
    close: () => Promise<IPCResponse>
    isMaximized: () => Promise<boolean>
  }

  // Issue 13: Desktop capturer sources for WASAPI system audio
  desktopCapturerSources: () => Promise<Array<{ id: string; name: string }>>

  // Event listeners (streaming)
  on: {
    transcriptChunk: (callback: (chunk: TranscriptChunk) => void) => () => void
    llmToken: (callback: (token: LLMToken) => void) => () => void
    syncEvent: (callback: (event: SyncEvent) => void) => () => void
    audioEvent: (callback: (event: AudioEvent) => void) => () => void
    batchExpandProgress: (callback: (progress: BatchExpandNotesProgress) => void) => () => void
    widgetStateUpdated: (
      callback: (state: {
        isRecording: boolean
        isPaused?: boolean
        elapsedTime: string
        lastTranscriptLine: string
        audioMode?: 'system' | 'microphone' | 'none'
        syncStatus?: 'idle' | 'syncing' | 'error'
        suggestionText?: string
        liveCoachTip?: string | null
        entityCount?: number
        noteCount?: number
      }) => void
    ) => () => void
    error: (callback: (error: ErrorEvent) => void) => () => void
    'intelligence:streamToken': (
      callback: (data: { token: string; fullText: string }) => void
    ) => () => void
    showIntelligenceWall: (callback: (data: { used: number; limit: number }) => void) => () => void
    bookmarkRequested: (callback: () => void) => () => void
    pauseRequested: (callback: () => void) => () => void
    quickNoteRequested: (callback: (text: string) => void) => () => void
    actionItemDetected: (
      callback: (data: import('./features').ActionItemDetectedEvent) => void
    ) => () => void
    sentimentUpdate: (
      callback: (data: import('./features').SentimentUpdateEvent) => void
    ) => () => void
    calendarEventSoon: (
      callback: (data: import('./features').CalendarEventSoonEvent) => void
    ) => () => void
    deepLink: (callback: (url: string) => void) => () => void
    windowMaximized: (callback: () => void) => () => void
    windowUnmaximized: (callback: () => void) => () => void
  }

  // IPC Renderer (for audio capture module)
  ipcRenderer: {
    send: (channel: string, data?: unknown) => void
    on: (channel: string, callback: (event: unknown, data: unknown) => void) => () => void
  }

  // Power management
  power: {
    getStatus: () => Promise<IPCResponse<{ isOnBattery: boolean }>>
  }

  // Auth operations
  auth: {
    login: (params: {
      email: string
      password: string
    }) => Promise<
      IPCResponse<{ user: { id: string; email: string; tier: string }; expiresIn: number }>
    >
    register: (params: {
      email: string
      password: string
    }) => Promise<
      IPCResponse<{ user: { id: string; email: string; tier: string }; expiresIn: number }>
    >
    logout: () => Promise<IPCResponse<void>>
    getCurrentUser: () => Promise<IPCResponse<{ id: string; email: string; tier: string } | null>>
    isAuthenticated: () => Promise<IPCResponse<{ authenticated: boolean }>>
    googleAuth: () => Promise<IPCResponse<void>>
    refreshToken: () => Promise<IPCResponse<{ refreshed: boolean }>>
    generateRecoveryKey: () => Promise<IPCResponse<{ phrase: string[] }>>
    onSessionExpired?: (
      callback: (data: { reason: string; timeoutMs: number }) => void
    ) => () => void
    onSessionExpiring?: (
      callback: (data: { remainingMs: number; timeoutMs: number }) => void
    ) => () => void
    onOAuthSuccess?: (
      callback: (data: {
        tokens: { accessToken: string; refreshToken: string; expiresIn: number }
        user: { id: string; email: string; tier: string }
      }) => void
    ) => () => void
    onOAuthError?: (callback: (data: { error: string }) => void) => () => void
    recordActivity: () => Promise<IPCResponse<void>>
    refreshProfile: () => Promise<IPCResponse<{ id: string; email: string; tier: string } | null>>
    activateLicense: (params: {
      key: string
    }) => Promise<IPCResponse<{ id: string; email: string; tier: string } | null>>
    forgotPassword: (params: { email: string }) => Promise<IPCResponse<void>>
  }

  // Device management
  device: {
    list: (params?: { userId?: string; activeOnly?: boolean }) => Promise<IPCResponse<unknown[]>>
    getCurrent: () => Promise<
      IPCResponse<{
        deviceId: string
        deviceName: string
        platform: string
        hostname: string
        appVersion: string
      }>
    >
    register: (params: { userId: string; customName?: string; planTier?: string }) => Promise<
      IPCResponse<{
        success: boolean
        isNewDevice: boolean
        limitReached: boolean
        currentDeviceCount: number
        maxDevices: number
        message?: string
      }>
    >
    deactivate: (params: {
      deviceId: string
      userId: string
    }) => Promise<IPCResponse<{ deactivated: boolean }>>
    rename: (params: {
      deviceId: string
      userId: string
      newName: string
    }) => Promise<IPCResponse<{ renamed: boolean }>>
  }

  // Diagnostics
  diagnostic: {
    export: () => Promise<IPCResponse<{ path: string }>>
    clear: () => Promise<IPCResponse<void>>
    stats: () => Promise<
      IPCResponse<{
        totalFiles: number
        totalSize: string
        oldestLog: string | null
        newestLog: string | null
      }>
    >
    openFolder: () => Promise<IPCResponse<void>>
    getSystemInfo: () => Promise<IPCResponse<Record<string, string | number>>>
    rebuildFts: () => Promise<IPCResponse<{ transcripts: boolean; notes: boolean }>>
    healthCheck: () => Promise<
      IPCResponse<{
        results: Array<{
          system: string
          status: 'ok' | 'warn' | 'error'
          message: string
          fix?: string
        }>
        systemInfo: Record<string, string>
      }>
    >
  }

  // Billing
  billing: {
    getConfig: () => Promise<
      IPCResponse<{
        billingUrl: string
        functionsUrl: string
        appName: string
        tiers: Array<{
          id: string
          name: string
          price: string
          priceINR?: string
          period: string
          yearlyPrice?: string
          yearlyPriceINR?: string
          features: string[]
        }>
      }>
    >
    getStatus: () => Promise<
      IPCResponse<{
        status: string
        tier: string
      }>
    >
    openCheckout: (params: { targetTier?: string }) => Promise<IPCResponse<void>>
  }

  // Quota
  quota: {
    check: () => Promise<
      IPCResponse<{
        used: number
        limit: number
        remaining: number
        resetsAt: string
        exhausted: boolean
        tier: string
      }>
    >
  }

  // Audit
  audit: {
    query: (params: {
      limit?: number
      offset?: number
      startDate?: string
      endDate?: string
    }) => Promise<
      IPCResponse<{
        items: Array<{
          id?: string
          timestamp: string
          operation: string
          table: string
          recordId?: string
          ipAddress?: string
          userAgent?: string
        }>
        total: number
      }>
    >
    export: () => Promise<IPCResponse<{ content: string; filename: string }>>
  }

  // PiyAPI Power Features
  piyapi: {
    feedback: (params: {
      memoryIds: string[]
      type: 'positive' | 'negative'
    }) => Promise<IPCResponse<{ acknowledged: boolean }>>
    fuzzySearch: (params: {
      query: string
      namespace?: string
      limit?: number
    }) => Promise<IPCResponse<unknown[]>>
    deduplicate: (params?: {
      namespace?: string
      dryRun?: boolean
    }) => Promise<IPCResponse<{ duplicates: number; merged: number } | null>>
    pinMemory: (params: {
      memoryId: string
      unpin?: boolean
    }) => Promise<IPCResponse<{ memoryId: string; pinned: boolean }>>
    getClusters: (params?: {
      namespace?: string
    }) => Promise<IPCResponse<{ totalNodes: number; totalEdges: number; clusters: number }>>
    getContext: (params: {
      query: string
      namespace?: string
      tokenBudget?: number
      timeRange?: { start: number; end: number }
    }) => Promise<
      IPCResponse<{
        context: string
        tokens_used: number
        segments: Array<{ content: string; timestamp: number; meeting_id: string }>
      } | null>
    >
  }
}
