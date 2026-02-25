# Frontend API Reference - PiyAPI Notes

**For Frontend Developers**  
**Last Updated:** 2026-02-24

## Quick Start

All backend communication happens through `window.electronAPI`. This object is fully typed and available globally in your React components.

```typescript
// TypeScript knows all available methods
window.electronAPI.meeting.start({ title: 'My Meeting' })
window.electronAPI.meeting.list({ limit: 50 })
```

## Response Format

All API calls return a consistent response format:

```typescript
interface IPCResponse<T> {
  success: boolean
  data?: T
  error?: IPCError
}

interface IPCError {
  code: string // Machine-readable error code
  message: string // Human-readable message
  details?: string // Stack trace (development only)
  timestamp: number // When error occurred
}
```

### Example Usage

```typescript
const response = await window.electronAPI.meeting.start({
  title: 'Team Standup',
})

if (response.success) {
  // TypeScript knows response.data is StartMeetingResponse
  console.log('Meeting ID:', response.data.meeting.id)
  console.log('Audio devices:', response.data.audioDevices)
} else {
  // TypeScript knows response.error is IPCError
  console.error('Failed:', response.error.message)
  console.error('Code:', response.error.code)
}
```

## ✅ FUNCTIONAL APIs (Ready to Use)

### Meeting Operations

#### Start Meeting

```typescript
const response = await window.electronAPI.meeting.start({
  title?: string          // Optional, auto-generated if not provided
  namespace?: string      // Optional, defaults to 'default'
})

// Response
interface StartMeetingResponse {
  meeting: Meeting
  audioDevices: AudioDevice[]
}

interface Meeting {
  id: string
  title: string | null
  start_time: number      // Unix timestamp
  end_time: number | null
  duration: number | null
  participant_count: number | null
  tags: string | null     // JSON array
  namespace: string
  created_at: number
  synced_at: number
  performance_tier: string | null
}
```

#### Stop Meeting

```typescript
await window.electronAPI.meeting.stop({
  meetingId: string,
})
```

#### Get Meeting

```typescript
const response = await window.electronAPI.meeting.get({
  meetingId: string,
})

// response.data is Meeting
```

#### List Meetings (with Pagination)

```typescript
const response = await window.electronAPI.meeting.list({
  limit?: number          // Default: 50
  offset?: number         // Default: 0
  namespace?: string      // Filter by namespace
  startDate?: number      // Unix timestamp
  endDate?: number        // Unix timestamp
  tags?: string[]         // Filter by tags
})

// Response
interface PaginatedResponse<Meeting> {
  items: Meeting[]
  total: number
  limit: number
  offset: number
  hasMore: boolean
}
```

#### Update Meeting

```typescript
const response = await window.electronAPI.meeting.update({
  meetingId: string,
  updates: {
    title?: string
    end_time?: number
    duration?: number
    participant_count?: number
    tags?: string[]
    performance_tier?: string
  }
})

// response.data is updated Meeting
```

#### Delete Meeting

```typescript
await window.electronAPI.meeting.delete({
  meetingId: string,
})
```

### Platform Detection

```typescript
const platform = window.electronAPI.platform
// 'darwin' | 'win32' | 'linux'

// Use for platform-specific UI
if (platform === 'darwin') {
  // Show macOS-specific instructions
}
```

## 🚧 STUBBED APIs (Type-Safe, Not Yet Functional)

These APIs are fully typed and won't cause errors, but will return "not yet implemented" responses. You can build UI against them now.

### Note Operations

```typescript
// Create note
await window.electronAPI.note.create({
  meetingId: string
  timestamp: number
  text: string
})

// Update note
await window.electronAPI.note.update({
  noteId: string
  updates: {
    original_text?: string
    augmented_text?: string
    context?: string
    is_augmented?: boolean
  }
})

// Expand note (AI-powered)
const response = await window.electronAPI.note.expand({
  noteId: string
  meetingId: string
  timestamp: number
  text: string
})

// Response
interface ExpandNoteResponse {
  note: Note
  expandedText: string
  context: string
  tokensUsed: number
  inferenceTime: number
}

// Batch expand notes
await window.electronAPI.note.batchExpand({
  meetingId: string
  noteIds: string[]
})

// Get notes for meeting
const response = await window.electronAPI.note.get({
  meetingId: string
})

// Delete note
await window.electronAPI.note.delete({
  noteId: string
})
```

### Transcript Operations

```typescript
// Get transcripts for meeting
const response = await window.electronAPI.transcript.get({
  meetingId: string
  startTime?: number
  endTime?: number
})

// Get transcript context (for note expansion)
const response = await window.electronAPI.transcript.getContext({
  meetingId: string
  timestamp: number
  beforeSeconds: number  // e.g., 60
  afterSeconds: number   // e.g., 10
})

// Response
interface GetTranscriptContextResponse {
  transcripts: Transcript[]
  contextText: string
  startTime: number
  endTime: number
}

// Update speaker name
await window.electronAPI.transcript.updateSpeaker({
  meetingId: string
  speakerId: string
  speakerName: string
})
```

### Entity Operations

```typescript
// Get entities for meeting
const response = await window.electronAPI.entity.get({
  meetingId: string
  types?: EntityType[]  // Filter by type
})

type EntityType =
  | 'PERSON'
  | 'DATE'
  | 'AMOUNT'
  | 'TOPIC'
  | 'EMAIL'
  | 'PHONE'
  | 'ORGANIZATION'
  | 'LOCATION'
  | 'DOCUMENT'
  | 'URL'

// Get entities by type (across all meetings)
const response = await window.electronAPI.entity.getByType({
  type: EntityType
  limit?: number
})

// Response
interface EntityAggregation {
  type: EntityType
  text: string
  count: number
  meetings: string[]
  firstSeen: number
  lastSeen: number
}
```

### Search Operations

```typescript
// Full-text search
const response = await window.electronAPI.search.query({
  query: string
  namespace?: string
  limit?: number
  searchTranscripts?: boolean  // Default: true
  searchNotes?: boolean        // Default: true
})

// Response
interface SearchResponse {
  transcripts: TranscriptSearchResult[]
  notes: NoteSearchResult[]
  totalResults: number
  queryTime: number
}

// Semantic search (requires backend)
const response = await window.electronAPI.search.semantic({
  query: string
  namespace?: string
  limit?: number
})
```

### Audio Operations

```typescript
// List available audio devices
const response = await window.electronAPI.audio.listDevices()

// Response
interface AudioDevice {
  id: string
  label: string
  kind: 'system' | 'microphone'
  isDefault: boolean
  isAvailable: boolean
}

// Start audio capture
const response = await window.electronAPI.audio.startCapture({
  meetingId: string
  deviceId?: string
  fallbackToMicrophone?: boolean
})

// Stop audio capture
await window.electronAPI.audio.stopCapture({
  meetingId: string
})

// Get audio capture status
const response = await window.electronAPI.audio.getStatus()

// Response
interface AudioCaptureStatus {
  isCapturing: boolean
  deviceId: string | null
  deviceKind: 'system' | 'microphone' | null
  sampleRate: number
  channelCount: number
  bufferSize: number
}

// Run pre-flight audio test
const response = await window.electronAPI.audio.preFlightTest()

// Response
interface PreFlightTestResult {
  systemAudio: {
    available: boolean
    tested: boolean
    error?: string
  }
  microphone: {
    available: boolean
    tested: boolean
    error?: string
  }
  recommendation: 'system' | 'microphone' | 'cloud'
}
```

### Intelligence Operations

```typescript
// Get hardware tier info
const response = await window.electronAPI.intelligence.getHardwareTier()

// Response
interface HardwareTierInfo {
  tier: 'low' | 'mid' | 'high'
  totalRAM: number
  availableRAM: number
  asrEngine: 'whisper-turbo' | 'moonshine-base'
  llmModel: 'qwen2.5:3b' | 'qwen2.5:1.5b'
  llmMaxTokens: number
  totalRAMBudget: string
  canRunConcurrent: boolean
}

// Get inference engine status
const response = await window.electronAPI.intelligence.getEngineStatus()

// Response
interface InferenceEngineStatus {
  engine: 'mlx' | 'ollama'
  tokensPerSecond: number
  models: ModelStatus[]
}

// Check Ollama installation
const response = await window.electronAPI.intelligence.checkOllama({
  autoInstall?: boolean
})

// Unload models (free RAM)
await window.electronAPI.intelligence.unloadModels()
```

### Sync Operations

```typescript
// Get sync status
const response = await window.electronAPI.sync.getStatus()

// Response
interface SyncStatus {
  isOnline: boolean
  isSyncing: boolean
  queuedEvents: number
  lastSyncTime: number | null
  lastSyncError: string | null
}

// Trigger sync
await window.electronAPI.sync.trigger({
  force?: boolean
})

// Login
const response = await window.electronAPI.sync.login({
  email: string
  password: string
})

// Response
interface LoginResponse {
  userId: string
  email: string
  tier: 'free' | 'starter' | 'pro' | 'team' | 'enterprise'
  devices: Device[]
}

// Logout
await window.electronAPI.sync.logout()
```

### Settings Operations

```typescript
// Get all settings
const response = await window.electronAPI.settings.getAll()

// Response
interface AppSettings {
  // Audio
  preferredAudioDevice: string | null
  audioFallbackEnabled: boolean
  vadThreshold: number

  // Transcription
  hardwareTier: 'low' | 'mid' | 'high' | null
  forceWhisperTurbo: boolean
  useCloudTranscription: boolean
  cloudTranscriptionUsage: number

  // Intelligence
  llmEngine: 'mlx' | 'ollama'
  llmIdleTimeout: number
  maxTokensPerExpansion: number

  // Storage
  keepAudioFiles: boolean
  maxDiskUsage: number
  autoDeleteOldMeetings: boolean
  autoDeleteAfterDays: number

  // Sync
  syncEnabled: boolean
  syncInterval: number
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
}

// Get single setting
const response = await window.electronAPI.settings.get({
  key: keyof AppSettings
})

// Update settings
const response = await window.electronAPI.settings.update({
  settings: Partial<AppSettings>
})

// Reset to defaults
const response = await window.electronAPI.settings.reset()
```

## 🔄 EVENT STREAMING (Real-Time Updates)

All event subscriptions return an unsubscribe function. Always call it when component unmounts.

### Transcript Chunks (Real-Time Transcription)

```typescript
const unsubscribe = window.electronAPI.on.transcriptChunk(chunk => {
  console.log('New transcript:', chunk)
})

interface TranscriptChunk {
  meetingId: string
  transcriptId: string
  text: string
  startTime: number
  endTime: number
  confidence: number
  speakerId: string | null
  isFinal: boolean
}

// Cleanup
unsubscribe()
```

### LLM Tokens (Real-Time Note Expansion)

```typescript
const unsubscribe = window.electronAPI.on.llmToken(token => {
  console.log('LLM token:', token)
})

interface LLMToken {
  noteId: string
  token: string
  isComplete: boolean
  totalTokens: number
  inferenceTime: number
}

// Cleanup
unsubscribe()
```

### Sync Events

```typescript
const unsubscribe = window.electronAPI.on.syncEvent(event => {
  console.log('Sync event:', event)
})

interface SyncEvent {
  type: 'started' | 'progress' | 'completed' | 'failed'
  progress?: SyncProgress
  error?: IPCError
}

// Cleanup
unsubscribe()
```

### Audio Events

```typescript
const unsubscribe = window.electronAPI.on.audioEvent(event => {
  console.log('Audio event:', event)
})

interface AudioEvent {
  type: 'started' | 'stopped' | 'level' | 'error'
  meetingId: string
  level?: AudioLevelUpdate
  error?: IPCError
}

// Cleanup
unsubscribe()
```

### Batch Expand Progress

```typescript
const unsubscribe = window.electronAPI.on.batchExpandProgress(progress => {
  console.log('Progress:', progress)
})

interface BatchExpandNotesProgress {
  total: number
  completed: number
  current: string
  note: Note
}

// Cleanup
unsubscribe()
```

### Error Events

```typescript
const unsubscribe = window.electronAPI.on.error(error => {
  console.error('Error:', error)
})

interface ErrorEvent {
  code: string
  message: string
  details?: string
  timestamp: number
  context?: Record<string, unknown>
}

// Cleanup
unsubscribe()
```

## 🎨 React Hook Examples

### useMeetings Hook

```typescript
import { useState, useEffect } from 'react'

function useMeetings(limit = 50, offset = 0) {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchMeetings() {
      setLoading(true)
      const response = await window.electronAPI.meeting.list({
        limit,
        offset,
      })

      if (response.success) {
        setMeetings(response.data.items)
        setTotal(response.data.total)
        setError(null)
      } else {
        setError(response.error.message)
      }
      setLoading(false)
    }

    fetchMeetings()
  }, [limit, offset])

  return { meetings, total, loading, error }
}
```

### useTranscriptStream Hook

```typescript
import { useState, useEffect } from 'react'

function useTranscriptStream(meetingId: string) {
  const [chunks, setChunks] = useState<TranscriptChunk[]>([])

  useEffect(() => {
    const unsubscribe = window.electronAPI.on.transcriptChunk(chunk => {
      if (chunk.meetingId === meetingId) {
        setChunks(prev => [...prev, chunk])
      }
    })

    return () => unsubscribe()
  }, [meetingId])

  return chunks
}
```

### useLLMStream Hook

```typescript
import { useState, useEffect } from 'react'

function useLLMStream(noteId: string) {
  const [text, setText] = useState('')
  const [isComplete, setIsComplete] = useState(false)

  useEffect(() => {
    const unsubscribe = window.electronAPI.on.llmToken(token => {
      if (token.noteId === noteId) {
        setText(prev => prev + token.token)
        setIsComplete(token.isComplete)
      }
    })

    return () => unsubscribe()
  }, [noteId])

  return { text, isComplete }
}
```

## 🚨 Error Handling Best Practices

### Always Check Success

```typescript
const response = await window.electronAPI.meeting.start(params)

if (!response.success) {
  // Handle error
  console.error(response.error.message)
  toast.error(response.error.message)
  return
}

// Proceed with success case
const meeting = response.data.meeting
```

### Common Error Codes

- `MEETING_START_FAILED` - Failed to start meeting
- `MEETING_NOT_FOUND` - Meeting doesn't exist
- `MEETING_STOP_FAILED` - Failed to stop meeting
- `MEETING_UPDATE_FAILED` - Failed to update meeting
- `MEETING_DELETE_FAILED` - Failed to delete meeting
- `*_NOT_IMPLEMENTED` - Feature not yet implemented

### Error Display Component

```typescript
function ErrorDisplay({ error }: { error: IPCError }) {
  return (
    <div className="error">
      <h3>Error: {error.code}</h3>
      <p>{error.message}</p>
      {process.env.NODE_ENV === 'development' && error.details && (
        <pre>{error.details}</pre>
      )}
    </div>
  )
}
```

## 📝 TypeScript Tips

### Import Types

```typescript
import type { Meeting, Note, Transcript, Entity } from '../types/database'

import type { IPCResponse, StartMeetingParams, ListMeetingsParams } from '../types/ipc'
```

### Type Guards

```typescript
function isMeeting(obj: unknown): obj is Meeting {
  return typeof obj === 'object' && obj !== null && 'id' in obj && 'start_time' in obj
}
```

## 🎯 Summary

- ✅ **Meeting operations** are fully functional
- ✅ **All APIs are type-safe** with full TypeScript support
- ✅ **Event streaming** is ready for real-time updates
- 🚧 **Other operations** are stubbed and ready for implementation
- 📚 **Complete documentation** available in `src/main/README.md`

Start building your UI now with meeting management, and other features will become available as the backend is implemented!
