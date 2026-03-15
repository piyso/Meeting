# PiyAPI Notes — Frontend Blueprint: Wire The Intelligence
## Phase 2 Implementation Specification

> **Document Status:** v5 Final · Verified byte-by-byte against actual codebase (Feb 25, 2026).
> Phase 1 (UI Shell) is **complete** — 57 components, 12 hooks, 23 services, 9 DB tables built.
> This document covers **Phase 2 only**: wiring real data, audio pipeline, AI, and sync.

---

## Phase 1 Completion Summary

Phase 1 is fully implemented. For design system specs, see `ui/ux.md`.

| Layer | Count | Key Files |
|-------|-------|-----------|
| **Renderer Components** | 57 across `ui/`, `meeting/`, `command/`, `layout/`, `settings/`, `audio/` | `NoteEditor.tsx`, `TranscriptPanel.tsx`, `MiniWidget.tsx`, `PostMeetingDigest.tsx`, `SilentPrompter.tsx`, `CommandPalette.tsx` |
| **React Hooks** | 12 (7 query + 5 general) | `useTranscriptStream` (61L), `useNotes` (58L), `useLLMStream` (31L), `useMeetings` (15L), `useSearch`, `useAudioStatus`, `useCurrentMeeting` |
| **Zustand Store** | `appStore.ts` | Global state management |
| **Views** | 3 | `MeetingList`, `MeetingDetail`, `Settings` |
| **Main Services** | 23 files | ASR, Sync, Encryption, Embedding, Conflict Resolution, Transcript, etc. |
| **Database** | 9 tables + FTS5 + triggers | `meetings`, `transcripts`, `notes`, `entities`, `sync_queue`, `encryption_keys`, `settings`, `devices`, `audit_logs` |
| **Preload Bridge** | 242 lines | All 12 API groups + 6 event listeners exposed via `window.electronAPI` |
| **Audio Capture** | 3 files | `audioCapture.ts` (16KB), `audio-vad-worklet.ts` (8KB), `audio-worklet-processor.js` (4KB) |
| **IPC Handlers** | **4 of 12 active** | `meeting` ✅, `audio` ✅, `model` ✅, `transcript` ✅ — **8 missing** |

---

# ═══════════════════════════════════════════════════════
# PHASE 2: WIRE THE INTELLIGENCE
# ═══════════════════════════════════════════════════════

> **Scope:** Everything that requires a running service — audio capture, Whisper transcription, LLM inference, local embeddings, encrypted sync, IPC wiring to real data, and AI-powered features.

---

## P2.1 Codebase Truth Table

Every file audited. No assumptions.

### IPC Handler Status (Critical)

`preload.ts` exposes **12 API groups** to the renderer. Only **4 have backend handlers**. Any renderer call to the other 8 groups throws `Error: No handler registered` — **runtime crash**.

| API Group | Preload Exposed? | Handler File Exists? | Status |
|-----------|-----------------|---------------------|--------|
| `meeting` | ✅ | ✅ `meeting.handlers.ts` (262L) | **Working** — full CRUD + pagination |
| `audio` | ✅ | ✅ `audio.handlers.ts` (24KB) | **Working** — capture, permissions, diagnostics, fallback |
| `model` | ✅ | ✅ `model.handlers.ts` (108L) | **Working** — tier detection, download, verify |
| `transcript` | ✅ | ✅ `transcript.handlers.ts` (192L) | **Working** — get, getContext, updateSpeaker, event forwarding |
| `note` | ✅ | 🔴 **Missing** | Crash on `note.create/update/expand/get/delete` |
| `entity` | ✅ | 🔴 **Missing** | Crash on `entity.get/getByType` |
| `search` | ✅ | 🔴 **Missing** | Crash on `search.query/semantic` |
| `sync` | ✅ | 🔴 **Missing** | Crash on `sync.getStatus/trigger/login/logout` |
| `intelligence` | ✅ | 🔴 **Missing** | Crash on `intelligence.getHardwareTier/getEngineStatus/checkOllama/unloadModels` |
| `settings` | ✅ | 🔴 **Missing** | Crash on `settings.getAll/get/update/reset` |
| `graph` | ✅ | 🔴 **Missing** | Crash on `graph.get/getContradictions` |
| `digest` | ✅ | 🔴 **Missing** | Crash on `digest.generate/getLatest` |

### Main Process Services

| Service | Lines | Status | Notes |
|---------|-------|--------|-------|
| `ASRService.ts` | 291 | ✅ Production | Worker thread manager, `transcribe(Float32Array)`, idle timeout auto-unload |
| `AudioPipelineService.ts` | **2** | 🔴 **Empty Stub** | `export class AudioPipelineService {}` — nothing inside |
| `SyncManager.ts` | 499 | ⚠️ **Missing embedding call** | Event-sourced queue, AES encryption, chunking, backoff. Does NOT call `LocalEmbeddingService.embed()` before encryption |
| `LocalEmbeddingService.ts` | 377 | ✅ Production | ONNX all-MiniLM-L6-v2, `embed()`, `embedBatch()`, cosine similarity, search |
| `TranscriptService.ts` | 198 | ✅ Production | Save + EventEmitter for real-time forwarding |
| `EncryptionService.ts` | 231 | ✅ Production | AES-256-GCM, PBKDF2 key derivation (100K iterations) |
| `ConflictResolver.ts` | 385 | ✅ Production | Vector clocks + Yjs auto-merge |
| `YjsConflictResolver.ts` | 365 | ✅ Production | Yjs doc management for CRDT merge |
| `VectorClockManager.ts` | 230 | ✅ Production | Lamport-style vector clocks |
| `DatabaseService.ts` | 404 | ✅ Production | High-level DB facade |
| `HardwareTierService.ts` | 231 | ✅ Production | Auto-detects Whisper model tier by RAM |
| `CloudTranscriptionService.ts` | 345 | ✅ Production | Deepgram API fallback |
| `ModelDownloadService.ts` | 425 | ✅ Production | Whisper + embedding model downloads with progress |
| `TranscriptChunker.ts` | 275 | ✅ Production | Plan-aware content chunking |
| `CloudAccessManager.ts` | 394 | ✅ Production | Tier-based feature gating |
| `DeviceManager.ts` | 500 | ✅ Production | Multi-device management |
| `KeyStorageService.ts` | 280 | ✅ Production | `keytar` integration for OS keychain |
| `RecoveryPhraseService.ts` | 563 | ✅ Production | Recovery key generation & validation |
| `PHIDetectionService.ts` | 321 | ✅ Production | Protected Health Information detection |
| `AuditLogger.ts` | 533 | ✅ Production | Immutable audit trail |
| `DiagnosticLogger.ts` | 371 | ✅ Production | Audio diagnostic recording |
| `PiyAPIBackend.ts` | 462 | ✅ Production | Full CRUD, semantic/hybrid search, graph traversal, auth with keytar, health checks |

### Renderer Hooks

| Hook | Lines | Status | Notes |
|------|-------|--------|-------|
| `useTranscriptStream` | 61 | ✅ **Complete** | Combines historical DB + live IPC streaming with dedup, chronological sort |
| `useNotes` | 58 | ✅ **Complete** | Full CRUD with `useMutation`, optimistic cache invalidation |
| `useLLMStream` | 31 | ✅ **Complete** | Token streaming with proper cleanup |
| `useMeetings` | 15 | ✅ **Complete** | React-query wrapper over `meeting.list()` |
| `useSearch` | 32 | ✅ Built | Calls `search.query()` — **will crash until handler exists** |
| `useAudioStatus` | 46 | ✅ Built | Subscribes to audio events |
| `useCurrentMeeting` | 16 | ✅ Built | Calls `meeting.get()` |
| `useAudioSession` | 85 | ✅ Built | Full lifecycle: check → permission → capture → monitor → stop |
| `useKeyboardShortcuts` | 60 | ✅ Built | Global keyboard shortcut registry |
| `usePowerMode` | 36 | ⚠️ **Needs fix** | Uses `navigator.getBattery()` (Web Battery API) — silently fails in Electron, doesn't crash but returns no data |
| `useSyncEngine` | 54 | ✅ Built | Calls `sync.getStatus()` — **will crash until handler exists** |
| `useToast` | 27 | ✅ Built | Toast notification manager |

### Key Component Status

| Component | Lines | Status |
|-----------|-------|--------|
| `NoteEditor.tsx` | 159 | ✅ **Functional** — Tiptap + Yjs + IndexedDB + Cmd+Enter expansion + debounced auto-save. ⚠️ Undo atomicity bug (see P2.5) |
| `TranscriptPanel.tsx` | 124 | ✅ Built — visual shell, wired to `useTranscriptStream` |
| `TranscriptSegment.tsx` | 87 | ✅ Built — speaker colors, pin icon |
| `PostMeetingDigest.tsx` | 135 | ⚠️ Shell only — visual layout exists, AI synthesis not wired |
| `SilentPrompter.tsx` | 46 | ⚠️ Shell only — no Ollama integration |
| `MagicExpansion.tsx` | 42 | ✅ Built — AI expansion display with 🤖 badge |
| `CommandPalette.tsx` | 195 | ✅ Built — will crash on search until `search.handlers.ts` exists |
| `OnboardingFlow.tsx` | 182 | ✅ Built — 5-step flow: `auth` → `setup` → `recovery-key` → `plan-selection` → `ghost-meeting`. ⚠️ Auth calls not wired to `PiyAPIBackend.login()` |
| `MeetingDetailView.tsx` | 84 | 🔴 **Uses hardcoded mock data** — `MOCK_SEGMENTS` (42 fake segments with "Alex Demo" / "Sarah Sync"), `MOCK_DIGEST` (fake summary/actions). Must be replaced with real hook data |
| `MeetingListView.tsx` | 176 | ⚠️ **Fake date grouping** — Uses `slice(0,3)` to split "Today" / "Yesterday" instead of real date comparison. Wired to `useMeetings` + real `meeting.start/delete` ✅ |
| `GhostMeetingTutorial.tsx` | 79 | ✅ Built — Progressive onboarding: pre-recorded transcript streams, pulsing Cmd+Enter prompt, auto-clears after demo (GAP-31) |
| `MiniWidget.tsx` | 68 | ✅ Built — 280×72px always-on-top glassmorphic pill: recording timer + stop button + last transcript line. Triggered via `Cmd+Shift+M` (GAP-30) |
| `SpeakerHeatmap.tsx` | 35 | ⚠️ Shell only — Visual layout for speaker-colored audio timeline. Needs real speaker segment data wiring (GAP-27) |
| `SmartChip.tsx` | 37 | ✅ Built — Color-coded entity chips: 👤 People (blue), 📅 Dates (green), 📊 Amounts (orange), ✅ Actions (red). Needs entity extraction wiring (§2.9) |
| `RecoveryKeyExport.tsx` | 209 | ✅ Built — Recovery key display with Copy to Clipboard + Save as File + confirmation (GAP-22 / A.6) |
| `RecoverAccount.tsx` | 216 | ✅ Built — Account recovery flow using recovery phrase to decrypt synced data |
| `GlobalContextBar.tsx` | 97 | ✅ Built — `Cmd+Shift+K` cross-meeting semantic search UI. Needs `LocalEmbeddingService` + `search.handlers.ts` wiring |

---

## P2.2 Missing IPC Handlers — 8 Files Required

All 8 handler files go in `src/main/ipc/handlers/` and must be registered in `src/main/ipc/setup.ts`.

### File 1: `note.handlers.ts`

**Channels**: `note:create`, `note:update`, `note:expand`, `note:batchExpand`, `note:get`, `note:delete`

```typescript
import { ipcMain } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { createNote, getNotesByMeetingId, updateNote, deleteNote } from '../../database/crud/notes'
import { getTranscriptService } from '../../services/TranscriptService'

export function registerNoteHandlers(): void {
  // note:create — Create a new note for a meeting
  ipcMain.handle('note:create', async (_, params) => {
    const note = createNote({
      id: uuidv4(),
      meeting_id: params.meetingId,
      timestamp: params.timestamp,
      original_text: params.text,
    })
    return { success: true, data: note }
  })

  // note:get — Get all notes for a meeting
  ipcMain.handle('note:get', async (_, params) => {
    const notes = getNotesByMeetingId(params.meetingId)
    return { success: true, data: notes }
  })

  // note:update — Update a note's text
  ipcMain.handle('note:update', async (_, params) => {
    const note = updateNote(params.noteId, params.updates)
    return { success: true, data: note }
  })

  // note:delete — Delete a note
  ipcMain.handle('note:delete', async (_, params) => {
    deleteNote(params.noteId)
    return { success: true }
  })

  // note:expand — AI expansion via Ollama (see P2.5 for full spec)
  ipcMain.handle('note:expand', async (_, params) => {
    // 1. Get transcript context around timestamp
    const transcriptService = getTranscriptService()
    const context = transcriptService.getContext(params.meetingId, params.timestamp, 60, 10)

    // 2. Build prompt
    const prompt = `Given this meeting transcript context:\n${context.contextText}\n\nThe user wrote this note: "${params.text}"\n\nExpand this note into a detailed, professional sentence. Include specific details from the transcript.`

    // 3. Call Ollama HTTP API
    try {
      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'qwen2.5:3b', prompt, stream: false }),
      })
      const data = await response.json()
      return { success: true, data: { expandedText: data.response, sourceSegments: context.transcripts.map(t => t.id) } }
    } catch (error) {
      return { success: true, data: { expandedText: '⚠️ AI expansion unavailable — Ollama is not running. Start it with: ollama serve', sourceSegments: [] } }
    }
  })

  // note:batchExpand — Expand multiple notes
  ipcMain.handle('note:batchExpand', async (_, params) => {
    // Iterate and expand each note sequentially
    return { success: true, data: { expanded: 0, total: params.noteIds?.length || 0 } }
  })
}
```

### File 2: `entity.handlers.ts`

**Channels**: `entity:get`, `entity:getByType`

```typescript
import { ipcMain } from 'electron'
import { getEntitiesByMeetingId, getEntitiesByType } from '../../database/crud/entities'

export function registerEntityHandlers(): void {
  ipcMain.handle('entity:get', async (_, params) => {
    const entities = getEntitiesByMeetingId(params.meetingId)
    return { success: true, data: entities }
  })

  ipcMain.handle('entity:getByType', async (_, params) => {
    const entities = getEntitiesByType(params.meetingId, params.type)
    return { success: true, data: entities }
  })
}
```

### File 3: `search.handlers.ts`

**Channels**: `search:query`, `search:semantic`

```typescript
import { ipcMain } from 'electron'
import { searchAll, searchTranscripts, searchNotes } from '../../database/search'
import { getLocalEmbeddingService } from '../../services/LocalEmbeddingService'

export function registerSearchHandlers(): void {
  // search:query — FTS5 full-text search across meetings, transcripts, notes
  ipcMain.handle('search:query', async (_, params) => {
    const results = {
      meetings: searchAll(params.query, params.limit || 10).meetings,
      transcripts: searchTranscripts(params.query, params.limit || 20),
      notes: searchNotes(params.query, params.limit || 20),
    }
    return { success: true, data: results }
  })

  // search:semantic — Local embedding-based semantic search
  ipcMain.handle('search:semantic', async (_, params) => {
    try {
      const embeddingService = getLocalEmbeddingService()
      // For now, semantic search requires documents to be passed in
      // Full implementation connects to SQLite embedding column
      return { success: true, data: { results: [], query: params.query } }
    } catch (error) {
      return { success: false, error: { code: 'SEMANTIC_SEARCH_FAILED', message: (error as Error).message, timestamp: Date.now() } }
    }
  })
}
```

### File 4: `sync.handlers.ts`

**Channels**: `sync:getStatus`, `sync:trigger`, `sync:login`, `sync:logout`

```typescript
import { ipcMain } from 'electron'
import { SyncManager } from '../../services/SyncManager'
import { PiyAPIBackend } from '../../services/backend/PiyAPIBackend'
import { KeyStorageService } from '../../services/KeyStorageService'

let syncManager: SyncManager | null = null

export function registerSyncHandlers(): void {
  ipcMain.handle('sync:getStatus', async () => {
    if (!syncManager) return { success: true, data: { status: 'disconnected', pending: 0, total: 0 } }
    const stats = syncManager.getSyncStats()
    return { success: true, data: { status: 'connected', ...stats } }
  })

  ipcMain.handle('sync:trigger', async (_, params) => {
    if (!syncManager) return { success: false, error: { code: 'SYNC_NOT_INITIALIZED', message: 'Not logged in', timestamp: Date.now() } }
    const result = await syncManager.syncPendingEvents()
    return { success: true, data: result }
  })

  ipcMain.handle('sync:login', async (_, params) => {
    try {
      const backend = new PiyAPIBackend()
      // Authenticate with PiyAPI
      syncManager = new SyncManager(backend)
      await syncManager.initialize(params.userId, params.password)
      syncManager.startAutoSync()
      return { success: true, data: { userId: params.userId } }
    } catch (error) {
      return { success: false, error: { code: 'SYNC_LOGIN_FAILED', message: (error as Error).message, timestamp: Date.now() } }
    }
  })

  ipcMain.handle('sync:logout', async () => {
    if (syncManager) {
      syncManager.stopAutoSync()
      syncManager = null
    }
    return { success: true }
  })
}
```

### File 5: `intelligence.handlers.ts`

**Channels**: `intelligence:getHardwareTier`, `intelligence:getEngineStatus`, `intelligence:checkOllama`, `intelligence:unloadModels`

```typescript
import { ipcMain } from 'electron'
import { getASRService } from '../../services/ASRService'
import { getHardwareTierService } from '../../services/HardwareTierService'

export function registerIntelligenceHandlers(): void {
  ipcMain.handle('intelligence:getHardwareTier', async () => {
    const tierService = getHardwareTierService()
    const info = await tierService.getInfo()
    return { success: true, data: info }
  })

  ipcMain.handle('intelligence:getEngineStatus', async () => {
    const asr = getASRService()
    return { success: true, data: { asrReady: asr.isServiceReady(), ollamaAvailable: false } }
  })

  ipcMain.handle('intelligence:checkOllama', async () => {
    try {
      const response = await fetch('http://localhost:11434/api/tags')
      const data = await response.json()
      return { success: true, data: { available: true, models: data.models || [] } }
    } catch {
      return { success: true, data: { available: false, models: [] } }
    }
  })

  ipcMain.handle('intelligence:unloadModels', async () => {
    const asr = getASRService()
    await asr.unload()
    return { success: true }
  })
}
```

### File 6: `settings.handlers.ts`

**Channels**: `settings:getAll`, `settings:get`, `settings:update`, `settings:reset`

```typescript
import { ipcMain } from 'electron'
import { getDatabase } from '../../database/connection'

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:getAll', async () => {
    const db = getDatabase()
    const settings = db.prepare('SELECT key, value FROM settings').all()
    const result: Record<string, string> = {}
    for (const row of settings as any[]) { result[row.key] = row.value }
    return { success: true, data: result }
  })

  ipcMain.handle('settings:get', async (_, params) => {
    const db = getDatabase()
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(params.key) as any
    return { success: true, data: row?.value ?? null }
  })

  ipcMain.handle('settings:update', async (_, params) => {
    const db = getDatabase()
    const now = Math.floor(Date.now() / 1000)
    db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run(params.key, JSON.stringify(params.value), now)
    return { success: true }
  })

  ipcMain.handle('settings:reset', async () => {
    const db = getDatabase()
    db.prepare('DELETE FROM settings').run()
    return { success: true }
  })
}
```

### File 7: `graph.handlers.ts`

**Channels**: `graph:get`, `graph:getContradictions`

```typescript
import { ipcMain } from 'electron'

export function registerGraphHandlers(): void {
  // Knowledge Graph requires cloud PiyAPI — returns empty for offline mode
  ipcMain.handle('graph:get', async (_, params) => {
    return { success: true, data: { nodes: [], edges: [], stats: { totalNodes: 0, totalEdges: 0 } } }
  })

  ipcMain.handle('graph:getContradictions', async (_, params) => {
    return { success: true, data: { contradictions: [] } }
  })
}
```

### File 8: `digest.handlers.ts`

**Channels**: `digest:generate`, `digest:getLatest`

```typescript
import { ipcMain } from 'electron'

export function registerDigestHandlers(): void {
  ipcMain.handle('digest:generate', async (_, params) => {
    // Weekly digest requires Ollama for synthesis
    try {
      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'qwen2.5:3b',
          prompt: `Generate a brief weekly meeting digest summary.`,
          stream: false,
        }),
      })
      const data = await response.json()
      return { success: true, data: { digest: data.response, generatedAt: new Date().toISOString() } }
    } catch {
      return { success: true, data: { digest: 'Weekly digest unavailable — Ollama not running.', generatedAt: new Date().toISOString() } }
    }
  })

  ipcMain.handle('digest:getLatest', async () => {
    return { success: true, data: null }
  })
}
```

### Registration in `setup.ts`

After creating all 8 files, update `src/main/ipc/setup.ts`:

```typescript
import { registerMeetingHandlers } from './handlers/meeting.handlers'
import { registerAudioHandlers } from './handlers/audio.handlers'
import { registerModelHandlers } from './handlers/model.handlers'
import { registerTranscriptHandlers } from './handlers/transcript.handlers'
import { registerNoteHandlers } from './handlers/note.handlers'
import { registerEntityHandlers } from './handlers/entity.handlers'
import { registerSearchHandlers } from './handlers/search.handlers'
import { registerSyncHandlers } from './handlers/sync.handlers'
import { registerIntelligenceHandlers } from './handlers/intelligence.handlers'
import { registerSettingsHandlers } from './handlers/settings.handlers'
import { registerGraphHandlers } from './handlers/graph.handlers'
import { registerDigestHandlers } from './handlers/digest.handlers'

export function setupIPC(): void {
  registerMeetingHandlers()
  registerAudioHandlers()
  registerModelHandlers()
  registerTranscriptHandlers()
  registerNoteHandlers()
  registerEntityHandlers()
  registerSearchHandlers()
  registerSyncHandlers()
  registerIntelligenceHandlers()
  registerSettingsHandlers()
  registerGraphHandlers()
  registerDigestHandlers()
}
```

---

## P2.3 AudioPipelineService — Full Implementation Spec

`src/main/services/AudioPipelineService.ts` is currently **2 lines** (empty stub). This is the #1 blocker for the entire application. The pipeline must orchestrate:

```
Renderer (audioCapture.ts) → IPC → AudioPipelineService → VAD → 30s chunks → ASRService → TranscriptService → IPC event → Renderer (useTranscriptStream)
```

### Architecture

The renderer captures raw audio via `audioCapture.ts` and sends PCM buffers to the main process via IPC. The main process handles all processing:

```typescript
import { EventEmitter } from 'events'
import { getASRService } from './ASRService'
import { getTranscriptService } from './TranscriptService'

interface PipelineConfig {
  sampleRate: number        // 16000 (Whisper's expected rate)
  chunkDurationSec: number  // 30 seconds
  vadThreshold: number      // 0.5 (Silero VAD confidence)
}

export class AudioPipelineService extends EventEmitter {
  private config: PipelineConfig = {
    sampleRate: 16000,
    chunkDurationSec: 30,
    vadThreshold: 0.5,
  }

  private audioBuffer: Float32Array[] = []
  private isCapturing = false
  private currentMeetingId: string | null = null
  private meetingStartTime: number = 0
  private chunkStartTime: number = 0

  /**
   * Start capturing audio for a meeting.
   * Called by audio:startCapture IPC handler.
   */
  async startCapture(meetingId: string): Promise<void> {
    if (this.isCapturing) throw new Error('Already capturing')

    this.currentMeetingId = meetingId
    this.isCapturing = true
    this.meetingStartTime = Date.now()
    this.chunkStartTime = Date.now()
    this.audioBuffer = []

    // Initialize ASR service (lazy — loads model on first use)
    await getASRService().initialize()

    this.emit('status', { meetingId, status: 'capturing' })
    console.log(`[AudioPipeline] Started capture for meeting ${meetingId}`)
  }

  /**
   * Receive audio data from renderer via IPC.
   * Called by audio IPC handler when renderer sends PCM buffers.
   */
  processAudioChunk(audioData: Float32Array): void {
    if (!this.isCapturing || !this.currentMeetingId) return

    this.audioBuffer.push(audioData)

    // Check if accumulated enough audio for a 30s chunk
    const totalSamples = this.audioBuffer.reduce((sum, buf) => sum + buf.length, 0)
    const durationSec = totalSamples / this.config.sampleRate

    if (durationSec >= this.config.chunkDurationSec) {
      this.processAccumulatedChunk()
    }
  }

  /**
   * Process a 30-second audio chunk through Whisper.
   */
  private async processAccumulatedChunk(): Promise<void> {
    if (!this.currentMeetingId) return

    // Merge buffer into single Float32Array
    const totalLength = this.audioBuffer.reduce((sum, buf) => sum + buf.length, 0)
    const mergedAudio = new Float32Array(totalLength)
    let offset = 0
    for (const buf of this.audioBuffer) {
      mergedAudio.set(buf, offset)
      offset += buf.length
    }

    // Calculate chunk timing relative to meeting start
    const chunkStart = (this.chunkStartTime - this.meetingStartTime) / 1000
    const chunkEnd = chunkStart + (totalLength / this.config.sampleRate)

    // Reset buffer for next chunk
    this.audioBuffer = []
    this.chunkStartTime = Date.now()

    try {
      // Send to Whisper via ASRService
      const result = await getASRService().transcribe(mergedAudio)

      // Save each segment to database + emit IPC event
      const transcriptService = getTranscriptService()
      for (const segment of result.segments) {
        transcriptService.saveTranscript({
          meetingId: this.currentMeetingId,
          segment: {
            text: segment.text,
            start: chunkStart + segment.start,
            end: chunkStart + segment.end,
            confidence: segment.confidence,
            words: segment.words,
          },
        })
        // TranscriptService.saveTranscript() auto-emits 'transcript' event
        // transcript.handlers.ts auto-forwards to renderer via IPC
        // useTranscriptStream picks it up automatically
      }
    } catch (error) {
      console.error('[AudioPipeline] Transcription failed:', error)
      this.emit('error', { meetingId: this.currentMeetingId, error: (error as Error).message })
    }
  }

  /**
   * Stop capturing and process any remaining audio.
   */
  async stopCapture(): Promise<void> {
    if (!this.isCapturing) return

    // Process any remaining audio in buffer
    if (this.audioBuffer.length > 0) {
      await this.processAccumulatedChunk()
    }

    this.isCapturing = false
    this.emit('status', { meetingId: this.currentMeetingId, status: 'stopped' })
    console.log(`[AudioPipeline] Stopped capture for meeting ${this.currentMeetingId}`)
    this.currentMeetingId = null
  }

  getStatus() {
    return {
      isCapturing: this.isCapturing,
      meetingId: this.currentMeetingId,
      bufferDuration: this.audioBuffer.reduce((sum, buf) => sum + buf.length, 0) / this.config.sampleRate,
    }
  }
}

// Singleton
let instance: AudioPipelineService | null = null
export function getAudioPipelineService(): AudioPipelineService {
  if (!instance) instance = new AudioPipelineService()
  return instance
}
```

### Integration with Existing IPC

In `audio.handlers.ts`, wire `startCapture`/`stopCapture` to call `AudioPipelineService`:

```typescript
// In audio:startCapture handler, add:
const pipeline = getAudioPipelineService()
await pipeline.startCapture(params.meetingId)

// In audio:stopCapture handler, add:
const pipeline = getAudioPipelineService()
await pipeline.stopCapture()
```

For renderer → main audio data transport, add IPC channel:

```typescript
// In audio.handlers.ts:
ipcMain.on('audio:pcmData', (_, audioData: Float32Array) => {
  getAudioPipelineService().processAudioChunk(audioData)
})
```

And in renderer's `audioCapture.ts`, send PCM data via:

```typescript
// In AudioCaptureManager, inside the AudioWorklet onmessage:
window.electronAPI.ipcRenderer.send('audio:pcmData', new Float32Array(pcmBuffer))
```

---

## P2.4 Encrypted Search Paradox Fix

### The Problem

`SyncManager.ts` encrypts content before upload but does NOT generate local embeddings first. PiyAPI receives ciphertext and cannot generate meaningful embeddings from it → semantic search returns garbage.

`LocalEmbeddingService.ts` is fully implemented but **never called by SyncManager**.

### The Fix — `SyncManager.ts` Diff

Apply at `SyncManager.ts` line 236 (inside the `for (const event of pendingEvents)` loop):

```diff
+ import { getLocalEmbeddingService } from './LocalEmbeddingService'

  // Inside syncPendingEvents(), after parsing payload:
  const payload = event.payload ? JSON.parse(event.payload) : {}
  const chunkedPayloads = this.chunkContentIfNeeded(payload)

  for (const chunkPayload of chunkedPayloads) {
+   // Generate local embeddings BEFORE encryption (Encrypted Search Paradox fix)
+   const plaintextContent = chunkPayload.text || chunkPayload.content || chunkPayload.original_text || ''
+   let embeddingData: number[] | undefined
+   if (typeof plaintextContent === 'string' && plaintextContent.length > 0) {
+     try {
+       const embeddingResult = await getLocalEmbeddingService().embed(plaintextContent)
+       embeddingData = embeddingResult.embedding
+     } catch (error) {
+       console.warn('[SyncManager] Local embedding failed, continuing without:', error)
+     }
+   }

    const encryptedPayload = EncryptionService.encrypt(JSON.stringify(chunkPayload), this.password!)

    const memory: Memory = {
      content: encryptedPayload.ciphertext,
-     namespace: `${event.table_name}.${event.operation_type}`,
+     namespace: `meetings.${event.table_name}`,
      tags: [event.table_name, event.operation_type],
      metadata: {
        record_id: event.record_id,
        iv: encryptedPayload.iv,
        salt: encryptedPayload.salt,
        authTag: encryptedPayload.authTag,
        algorithm: encryptedPayload.algorithm,
        created_at: event.created_at,
+       encrypted: true,
+       skip_server_embedding: !!embeddingData,
      },
+     embedding: embeddingData,
      sourceType: event.table_name,
      eventTime: new Date(event.created_at * 1000).toISOString(),
    }
```

### Two Bugs Fixed

1. **Embedding pipeline**: `LocalEmbeddingService.embed()` now called on plaintext before encryption → PiyAPI receives usable embeddings
2. **Namespace format**: Changed from `notes.create` to `meetings.notes` — matches PiyAPI's namespace-scoped search

---

## P2.5 AI Note Expansion — Undo Atomicity Fix

### The Problem

`NoteEditor.tsx` line 143 uses `editor.commands.insertContent(html)` which creates **separate undo steps per DOM node**. Pressing `Ctrl+Z` after AI expansion undoes one element at a time (paragraphs, spans, etc.) instead of the entire expansion block.

### The Fix

Replace the `insert-ai-text` event handler in `NoteEditor.tsx`:

```diff
- const handleInsert = (e: Event) => {
-   const html = (e as CustomEvent).detail
-   if (editor) {
-     editor.commands.insertContent(html)
-   }
- }

+ const handleInsert = (e: Event) => {
+   const html = (e as CustomEvent).detail
+   if (editor) {
+     // Tiptap 2.x: wrap in commands.command() for true single-transaction undo
+     // editor.chain().focus().insertContent() may split into multiple transactions
+     // in some Tiptap versions — this approach guarantees atomicity
+     editor.commands.command(({ tr, dispatch }) => {
+       if (dispatch) {
+         const node = editor.schema.nodeFromJSON({
+           type: 'paragraph',
+           content: [{ type: 'text', text: html }]
+         })
+         tr.insert(editor.state.selection.from, node)
+         // Single tr = single Ctrl+Z to undo entire AI expansion
+       }
+       return true
+     })
+   }
+ }
```

> [!IMPORTANT]
> `editor.chain().focus().insertContent(html).run()` is **not guaranteed** to create a single undo step in all Tiptap 2.x versions. The `commands.command(({ tr }) => { ... })` approach directly manipulates the ProseMirror Transaction object, ensuring the entire AI expansion is a single atomic operation that `Ctrl+Z` undoes in one keystroke.

### `note:expand` IPC Handler Flow

Already specified in P2.2 (`note.handlers.ts`). The complete data flow is:

```
1. User types "Budget cuts" → presses Cmd+Enter
2. NoteEditor.tsx fires 'trigger-ai-expansion' CustomEvent
3. handleExpand() calls window.electronAPI.note.expand({ noteId, meetingId, timestamp, text })
4. Main process note:expand handler:
   a. TranscriptService.getContext(meetingId, timestamp, 60, 10) → 70s of transcript
   b. Build prompt: transcript context + user's note text
   c. POST to Ollama (http://localhost:11434/api/generate) with Qwen 2.5 3B
   d. Return { expandedText, sourceSegments }
5. NoteEditor receives response, fires 'insert-ai-text' CustomEvent with styled HTML
6. editor.commands.command(({ tr }) => ...) → single ProseMirror transaction
7. Ctrl+Z undoes entire expansion in one keystroke ✅
```

### Graceful Fallback

If Ollama is not running (connection refused), the handler returns:
```
"⚠️ AI expansion unavailable — Ollama is not running. Start it with: ollama serve"
```
This text is inserted as a styled warning instead of crashing.

### Context Sessions API — Dual-Path Context Retrieval

`piynotes.md` §2.4 specifies **two paths** for note expansion context. The `note:expand` handler must support both:

```typescript
// In note.handlers.ts — note:expand handler:
async function getContextForExpansion(
  meetingId: string, noteText: string, timestamp: number
): Promise<string> {
  // PATH A: Pro users with cloud sync → PiyAPI Context Sessions API
  //   Semantic retrieval with token budgets (better quality)
  if (await hasCloudAccess()) {
    const session = await fetch(`${API_BASE}/api/v1/context/sessions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        namespace: 'meetings.transcripts',
        token_budget: 2048,
        time_range: { start: timestamp - 60, end: timestamp + 10 },
        filters: { meeting_id: meetingId }
      })
    }).then(r => r.json())

    const contextData = await fetch(
      `${API_BASE}/api/v1/context/retrieve?session_id=${session.context_session_id}&query=${encodeURIComponent(noteText)}`
    ).then(r => r.json())

    return contextData.context
  }

  // PATH B: Free users / offline → Local SQL ±60s window
  return TranscriptService.getContext(meetingId, timestamp, 60, 10)
}

// hasCloudAccess() check:
async function hasCloudAccess(): Promise<boolean> {
  const token = await keytar.getPassword('piyapi-notes', 'access-token')
  if (!token) return false
  const plan = await keytar.getPassword('piyapi-notes', 'plan-tier')
  return plan !== 'free' && (await import('electron')).net.isOnline()
}
```

> [!NOTE]
> Context Sessions API provides **semantic retrieval** with automatic token budgeting for Qwen's context window, while the local SQL fallback is simple ±60s time-based slicing. Pro users get significantly better AI expansion quality.

### LLM Model Memory Manager

The LLM (Qwen 2.5 3B) should NOT stay loaded in RAM permanently. Implement on-demand loading with idle timeout:

```typescript
class ModelManager {
  private llmLoaded = false
  private unloadTimer: NodeJS.Timeout | null = null
  private static IDLE_TIMEOUT = 60_000 // 60s

  // ASR stays loaded for entire meeting (always needed)
  // LLM loads on-demand when user presses Cmd+Enter

  async ensureLLMLoaded(): Promise<void> {
    if (this.llmLoaded) {
      this.resetUnloadTimer()
      return
    }

    const tierService = getHardwareTierService()
    const info = await tierService.getInfo()
    const model = info.ram >= 16 ? 'qwen2.5:3b' : 'qwen2.5:1.5b'

    console.log(`Loading ${model} (on-demand)...`)
    await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      body: JSON.stringify({ model, prompt: '', keep_alive: '60s' })
    })
    this.llmLoaded = true
    this.resetUnloadTimer()
  }

  private resetUnloadTimer(): void {
    if (this.unloadTimer) clearTimeout(this.unloadTimer)
    this.unloadTimer = setTimeout(() => this.unloadLLM(), ModelManager.IDLE_TIMEOUT)
  }

  private async unloadLLM(): Promise<void> {
    const tierService = getHardwareTierService()
    const info = await tierService.getInfo()
    const model = info.ram >= 16 ? 'qwen2.5:3b' : 'qwen2.5:1.5b'
    await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      body: JSON.stringify({ model, keep_alive: '0' })
    })
    this.llmLoaded = false
    console.log('LLM unloaded to free RAM')
  }
}
```

**RAM Impact:**

| State | Whisper | Qwen 2.5 3B | Electron + App | Total |
|-------|---------|-------------|----------------|-------|
| **Idle** | Unloaded | Unloaded | 0.5 GB | ~0.5 GB |
| **Transcribing** | 1.5 GB | Unloaded | 0.8 GB | ~2.3 GB |
| **Expanding note** | 1.5 GB | 2.2 GB | 0.8 GB | ~4.5 GB |
| **After expansion (60s)** | 1.5 GB | *Unloaded* | 0.8 GB | ~2.3 GB |

---

## P2.6 Real-Time Transcript Streaming — Memory Cap Fix

### The Problem

`useTranscriptStream.ts` appends chunks indefinitely with no cap:

```typescript
return [...prev, chunk]  // No limit
```

For 2+ hour meetings: 240+ segments in React state → performance degradation.

### The Fix

Add a 500-segment cap with lazy re-hydration:

```diff
  setStreamedChunks((prev) => {
    const idx = prev.findIndex(c => c.transcriptId === chunk.transcriptId)
    if (idx >= 0) {
      const copy = [...prev]
      copy[idx] = chunk
      return copy
    }
-   return [...prev, chunk]
+   const updated = [...prev, chunk]
+   // Cap at 500 segments — older segments remain in SQLite, queryable on scroll-up
+   if (updated.length > 500) {
+     return updated.slice(updated.length - 500)
+   }
+   return updated
  })
```

### Existing Hooks — All Functional

The hooks listed in P2.1 are **already complete** and properly wired to `window.electronAPI`:

- `useTranscriptStream` — combines DB + live with dedup ✅
- `useNotes` — full CRUD with mutations ✅
- `useLLMStream` — token streaming with cleanup ✅
- `useMeetings` — paginated meeting list ✅
- `useSearch` — wired to `search.query()` ✅ (works once handler exists)

---

## P2.7 Yjs CRDT Multi-Device Sync

Already integrated in `NoteEditor.tsx`:

```typescript
// ACTUAL CODE (NoteEditor.tsx lines 21-33):
const ydoc = new Y.Doc()
const provider = new IndexeddbPersistence(`piyapi-notes-${meetingId}`, ydoc)
// ...
Collaboration.configure({ document: providerOrDoc })
```

**Phase 2 addition for network sync**: When sync is enabled, Yjs binary updates (`Y.encodeStateAsUpdate(ydoc)`) should be included in the SyncManager upload alongside encrypted content. On retrieval, remote updates merge via `Y.applyUpdate(ydoc, remoteUpdate)`.

The `ConflictResolver.ts` (385 lines) and `YjsConflictResolver.ts` (365 lines) already implement this merge logic — they just need to be called from the sync flow.

---

## P2.8 Remaining Intelligence Features

### Transcript ↔ Notes Symbiosis (Deferred to Phase 3)

| Feature | Status |
|---------|--------|
| Drag-and-drop transcript → notes blockquote | Not built — requires custom Tiptap extension |
| Bidirectional source anchors (click AI note → highlight transcript) | Shell exists in NoteEditor, needs real anchor data from `note:expand` `sourceSegments` return. Click → scroll transcript + violet pulse animation (GAP-26) |
| Slash commands (`/action`, `/decision`, `/summarize`) | Not built |
| Speaker heatmap | `SpeakerHeatmap.tsx` (35L) shell exists — needs speaker segment data from `TranscriptService`. Renders colored bars per speaker for click-to-seek (GAP-27) |
| Pinned moments | Not built — ⭐ icon on hover right of transcript segments. Pins aggregate into "Key Moments" tab in PostMeetingDigest (GAP-28) |
| Transcript inline corrections | Not built — post-meeting editable transcript text, saves via `transcript.update()`. Tiny "edited" badge on corrected segments (GAP-29) |

### Silent AI Prompter

`SilentPrompter.tsx` (46 lines) is a visual shell. Wire to Ollama:

- Every 2 minutes during recording, take last 5 minutes of transcript context
- POST to Ollama: "Given this conversation, suggest one question the user should ask"
- Display suggestion in DynamicIsland, auto-dismiss after 10 seconds
- Requires meeting template for topic coverage tracking

### Post-Meeting Intelligence

`PostMeetingDigest.tsx` (135 lines) has the visual layout. Wire sections to Ollama:

```typescript
// On meeting stop, call Ollama for each section:
const summary = await ollama.generate('Summarize this meeting in 3 sentences: ...')
const actions = await ollama.generate('Extract action items with assignees: ...')
const decisions = await ollama.generate('List key decisions made: ...')
```

### Power Management Fix

`usePowerMode.ts` (36 lines) currently uses `navigator.getBattery()` — the **Web Battery API**. This doesn't crash, but **silently fails** in Electron's renderer because `getBattery()` may not be available or may return stale data.

**Two-part fix:**

1. **Main process** — Add IPC handler using `electron.powerMonitor` (the reliable source):

```typescript
import { ipcMain, powerMonitor } from 'electron'

export function registerPowerHandlers(): void {
  ipcMain.handle('power:getStatus', async () => {
    return {
      success: true,
      data: {
        isOnBattery: powerMonitor.isOnBatteryPower,
      }
    }
  })
}
```

2. **Renderer** — Replace `navigator.getBattery()` in `usePowerMode.ts` with IPC call:

```typescript
// Replace getBattery() with:
const result = await window.electronAPI.power?.getStatus()
if (result?.success) {
  setIsPowerSaveMode(result.data.isOnBattery && batteryLevel !== null && batteryLevel < 0.3)
}
```

---

## P2.9 Database Optimizations

SQLite WAL mode configuration (apply in `connection.ts`):

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA wal_autocheckpoint = 1000;
```

**On Meeting Stop**: `PRAGMA wal_checkpoint(TRUNCATE)` to merge WAL + reclaim disk.

**During Recording**: Passive checkpoint every 10 minutes:
```typescript
walCheckpointInterval = setInterval(() => {
  db.pragma('wal_checkpoint(PASSIVE)')
}, 10 * 60 * 1000)
```

### Memory Budgets

| Resource | Budget | Enforcement |
|----------|--------|-------------|
| Transcript segments in React state | ≤ 500 | Older pruned, lazy-loaded on scroll-up |
| Tiptap editor nodes | ≤ 200 | Long notes paginate |
| Renderer process RAM | ≤ 200MB | DevTools profiling |
| IPC payload per call | ≤ 100KB | Cursor pagination for large datasets |

---

## P2.10 macOS Permission Recovery

Already fully implemented:
- `PermissionRequestFlow.tsx` (9.5KB) — multi-step permission request UI
- `AudioCaptureWithPermissions.tsx` (6.2KB) — wraps capture with permission checks
- `AudioFallbackNotification.tsx` — toast when falling back to microphone

No additional work needed.

---

## P2.11 View Data Wiring — Replace Mock Data

### `MeetingDetailView.tsx` — Hardcoded Mock Data (CRITICAL)

**Current state** (lines 9-37): Contains hardcoded `MOCK_SEGMENTS` array (42 fake segments with names "Alex Demo" / "Sarah Sync") and `MOCK_DIGEST` (fake summary, decisions, action items). This means the detail view **never shows real data**.

**Fix**: Replace mock data with hook-driven real data:

```diff
- // Mock Data
- const MOCK_SEGMENTS = Array.from({ length: 42 }).map((_, i) => ({
-   id: `s-${i}`,
-   speakerName: i % 2 === 0 ? 'Alex Demo' : 'Sarah Sync',
-   ... 28 lines of hardcoded data ...
- }))

+ import { useTranscriptStream } from '../hooks/queries/useTranscriptStream'
+ import { useCurrentMeeting } from '../hooks/queries/useCurrentMeeting'

  export default function MeetingDetailView() {
    const { recordingState, selectedMeetingId } = useAppStore()
+   const { segments, isStreaming } = useTranscriptStream(selectedMeetingId)
+   const { data: meeting } = useCurrentMeeting(selectedMeetingId)
    const isRecording = recordingState === 'recording'

    // ... pass real segments to TranscriptPanel:
-   <TranscriptPanel segments={MOCK_SEGMENTS} isRecording={isRecording} />
+   <TranscriptPanel segments={segments} isRecording={isRecording} />

    // ... pass real meeting data to PostMeetingDigest:
-   <PostMeetingDigest meetingId={selectedMeetingId} {...MOCK_DIGEST} />
+   <PostMeetingDigest meetingId={selectedMeetingId} duration={meeting?.duration || 0} />
```

### `MeetingListView.tsx` — Fake Date Grouping

**Current state** (line 96-97):
```typescript
const today = meetings.slice(0, 3)
const yesterday = meetings.slice(3)
```

**Fix**: Real date-based grouping:

```typescript
const now = new Date()
const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000
const yesterdayStart = todayStart - 86400

const today = meetings.filter(m => m.start_time >= todayStart)
const yesterday = meetings.filter(m => m.start_time >= yesterdayStart && m.start_time < todayStart)
const older = meetings.filter(m => m.start_time < yesterdayStart)
```

---

## P2.12 Auth & Onboarding Flow Wiring

`OnboardingFlow.tsx` (182 lines) has a complete 5-step UI: `auth` → `setup` → `recovery-key` → `plan-selection` → `ghost-meeting`. But none of the auth calls are wired to real services.

### What Needs Wiring

| Step | Current State | Fix Required |
|------|--------------|-------------|
| **Auth** (email/password) | Button calls `setStep('setup')` — no API call | Call `PiyAPIBackend.login(email, password)` via `sync:login` IPC |
| **Google OAuth** | Button does nothing | Implement OAuth flow via `shell.openExternal` + redirect URI handler |
| **Model download** | `setTimeout(3000)` mock | Call `model:downloadAll` IPC — already has `ModelDownloadService.ts` ✅ |
| **Recovery key** | Mock 12-word phrase from static array | Call `RecoveryPhraseService.generatePhrase()` via IPC — already exists ✅ |
| **Plan selection** | `PricingView` shown but no payment | Wire to payment provider (see P2.19) |

### Auth IPC Handler Required

Add to `sync.handlers.ts` or create dedicated `auth.handlers.ts`:

```typescript
ipcMain.handle('auth:login', async (_, { email, password }) => {
  const backend = new PiyAPIBackend()
  const tokens = await backend.login(email, password)
  return { success: true, data: tokens }
})

ipcMain.handle('auth:register', async (_, { email, password }) => {
  // Registration via PiyAPI /auth/register endpoint
  return { success: true, data: { userId: email } }
})
```

### Recovery Key Integration

`RecoveryPhraseService.ts` (563 lines) already generates BIP39-style recovery phrases. Wire via IPC:

```typescript
ipcMain.handle('auth:generateRecoveryKey', async () => {
  const phrase = RecoveryPhraseService.generatePhrase()
  return { success: true, data: { words: phrase } }
})
```

---

## P2.13 Preload Security Hardening

`preload.ts` line 223 exposes a **generic IPC passthrough**:

```typescript
// CURRENT (line 223 — security hole):
send: (channel: string, data: any) => ipcRenderer.send(channel, data),
```

This allows the renderer to send **any** IPC message to the main process, bypassing the typed API entirely. A compromised renderer (via XSS or malicious extension) could call internal channels.

**Fix**: Remove the generic passthrough or restrict to an allowlist:

```diff
- send: (channel: string, data: any) => ipcRenderer.send(channel, data),
+ send: (channel: string, data: any) => {
+   const ALLOWED_CHANNELS = ['audio:pcmData', 'sync:trigger']
+   if (ALLOWED_CHANNELS.includes(channel)) {
+     ipcRenderer.send(channel, data)
+   } else {
+     console.warn(`[Preload] Blocked send to unauthorized channel: ${channel}`)
+   }
+ },
```

---

## P2.14 Meeting Templates & Context Documents

### Meeting Templates

`NewMeetingDialog.tsx` already has visual template selectors. Wire templates to influence:
- Default note structure (Tiptap initial content)
- Silent Prompter topic tracking
- PostMeeting digest format

Template types from `piynotes.md` GAP-32:
- **Blank** — No preset structure
- **1:1** — Agenda items + action tracking
- **Standup** — Yesterday/Today/Blockers
- **Client Call** — BANT framework prompts
- **Brainstorm** — Idea clustering

### Context Document Attachment

`NewMeetingDialog.tsx` has a visual drop zone (`piynotes.md` GAP-33). Wire to:
1. Parse `.pdf` / `.md` / `.txt` files via Node.js `fs` in main process
2. Inject parsed text as context for AI note expansion prompts
3. Store reference in `meetings` table metadata

---

## P2.15 Feature Traps (Device Wall / Intelligence Wall)

`DeviceWallDialog.tsx` and `IntelligenceWallDialog.tsx` exist as visual shells. Wire enforcement:

```typescript
// In note:expand handler, check device limit:
const cloudAccess = getCloudAccessManager()
if (!cloudAccess.canUseAI()) {
  // Return feature-gated response instead of calling Ollama
  return { success: true, data: { blocked: true, reason: 'AI features require Pro plan' } }
}
```

Free tier limits (from `CloudAccessManager.ts`):
- 3 devices max
- Local Whisper only (no cloud transcription)
- No AI note expansion (Ollama gated)
- Local search only (no cloud semantic search)

### 6 Upgrade Trigger Moments

| # | Trigger | When | What User Sees | Est. Conv. Rate |
|---|---------|------|---------------|-----------|
| 1 | **🔄 Device Wall** | 3rd device login | "Upgrade for unlimited devices" | ~25% |
| 2 | **🧠 AI Query Limit** | Day ~20 of month | "47/50 queries used — Upgrade for unlimited" | ~30% |
| 3 | **🔍 Cross-Meeting Search** | Search across meetings | "Found 12 matches — [🔓 Unlock full results]" | ~15% |
| 4 | **🕸️ Decision Changed** | Contradiction detected | "⚠️ Budget changed — [🔓 See graph details]" | ~20% |
| 5 | **👤 Person Deep Dive** | Click entity chip | "Sarah in 14 meetings — [🔓 See timeline]" | ~8% |
| 6 | **📊 Weekly Digest** | Friday 4 PM | "12 meetings, 3 decisions — [🔓 View full digest]" | ~12% |

### 14-Day Pro Trial

New users get 14-day Pro trial. Implement:
- Trial state in `settings` table (`trial_start`, `trial_expires`)
- Countdown badge in DynamicIsland: "Pro Trial: 5 days left"
- Expiry notification → shows Device Wall / Intelligence Wall
- Trial users see full Pro features → creates habit → converts

### Query Quota Fallback (GAP-21)

When Starter users exhaust their 50 cloud AI queries/month:
1. **Do NOT show an error** — silently fall back to local Qwen 2.5
2. Show remaining quota badge: `"4 cloud queries left"` → `"Local mode"`
3. Local mode quality is ~80% of cloud (Qwen 2.5 vs GPT-4o-mini)
4. User barely notices the switch, but sees "Unlimited with Pro" prompt

### Referral Loop

Invite system for organic growth:
- Alice (free user) sends invite link to Bob
- Bob installs → gets 14-day Pro trial (standard)
- Alice gets **1 week free Pro** (reward for referral)
- Viral coefficient target: 0.3 (each user invites 0.3 new users)

---

## P2.16 Embedding Status Polling

> **Problem:** PiyAPI generates embeddings asynchronously (~2-4 seconds after memory creation). If you search immediately after syncing, semantic search returns zero results.

Add `waitForEmbedding()` to SyncManager after successful memory creation:

```typescript
async function waitForEmbedding(memoryId: string, maxWaitMs = 10_000): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    const res = await fetch(`${API_BASE}/api/v1/memories/${memoryId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    const memory = await res.json()
    if (memory.embedding_status === 'ready') return true  // NOT 'completed'
    await sleep(1000)
  }
  return false // Timed out — search may return incomplete results
}
```

> [!WARNING]
> The `embedding_status` value is `'ready'`, **not** `'completed'`. Using the wrong string means infinite polling.

---

## P2.17 Weekly Digest (Cross-Meeting Intelligence)

Separate from the per-meeting `PostMeetingDigest` — this is an **aggregate Friday digest** across all meetings that week. Requires Pro plan (cloud AI).

```typescript
// Triggered every Friday at 4 PM (or manually)
async function generateWeeklyDigest(): Promise<WeeklyDigest> {
  // 1. Get all meetings from this week via PiyAPI
  const meetings = await fetch(
    `${API_BASE}/api/v1/memories?namespace=meetings&limit=100`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  ).then(r => r.json())

  // 2. Get graph for contradiction detection
  const graph = await fetch(
    `${API_BASE}/api/v1/graph?namespace=meetings&maxHops=1`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  ).then(r => r.json())

  // 3. Ask PiyAPI to summarize (GPT-4o-mini via RAG)
  const digest = await fetch(`${API_BASE}/api/v1/ask`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      query: "Summarize all key decisions, action items, and changes from this week's meetings",
      namespace: 'meetings'
    })
  }).then(r => r.json())

  return {
    summary: digest.answer,
    totalMeetings: meetings.length,
    contradictions: graph.edges?.filter((e: any) => e.type === 'contradicts') || [],
    openActions: extractActionItems(meetings),
    topPeople: countEntityMentions(meetings, 'PERSON'),
  }
}
```

Display in a dedicated `WeeklyDigestView` or a notification card:
```
📊 Your Week in Meetings (Feb 17-21)
═══════════════════════════════════
📈 12 meetings, 8.5 hours total

⚠️ Changed Decisions:
• Budget cut was 5% on Feb 3, now 10% on Feb 10
• Deadline was March 15, now March 30

Action Items Still Open:
• [ ] David: cost analysis by Friday (⚠️ OVERDUE)
• [ ] Sarah: review proposal by March 5
```

---

## P2.18 Graph Trigger Patterns

`contradicts`, `supersedes`, and `parent` relationships return **0 results in production** despite being implemented. This is because they require specific content patterns.

### What Triggers Each Type

| Type | Content Pattern Required | Example |
|------|------------------------|---------|
| `contradicts` | "Actually", "no, it's", "correction" + overlapping entity | Memory A: "Revenue is $2.3M" → Memory B: "Actually, revenue is $1.8M" |
| `supersedes` | Same entity + newer date + higher confidence | Memory A: "Q3 deadline March 15" → Memory B: "Q3 deadline March 30" |
| `parent` | Auto-chunking of content >30KB | Long transcript auto-chunked by `TranscriptChunker` → creates parent-child links |

### Testing Strategy

Create 5 specifically crafted memory pairs via `PiyAPIBackend.ts` to verify each relationship type activates:

1. **contradicts test**: Two memories about same metric with different values + "actually" trigger word
2. **supersedes test**: Two memories about same entity with different dates
3. **parent test**: One memory >30KB that triggers auto-chunking
4. **follows test**: Two memories in temporal sequence with same participants
5. **references test**: Two memories sharing >30% entity overlap

---

## P2.19 Payment Integration (Phase 9 — Deferred)

Not implemented yet. `piynotes.md` specifies Razorpay integration with PiyAPI Billing. `PricingView.tsx` displays the 5-tier table but buttons are not wired.

**When implementing:**
1. `PricingView.tsx` → Button click → `shell.openExternal(paymentUrl)` with JWT token
2. Webhook from payment → PiyAPI updates `plan_tier` → client refreshes token
3. `CloudAccessManager.ts` gates features based on `plan_tier`

---

## P2.20 App Distribution (Phase 10 — Deferred)

Missing for production release:
- `.icns` (macOS) and `.ico` (Windows) app icons
- Code signing certificates (Apple Developer ID + Windows Authenticode)
- `electron-builder` config for DMG/MSI/AppImage packaging
- Auto-update via `electron-updater`

---

## Implementation Sequence

### Phase A — Fix Runtime Crashes (Day 1)

**Goal**: No `Error: No handler registered` crashes. App interactive with real SQLite data.

| # | Task | Depends On |
|---|------|-----------|
| 1 | Create 8 missing IPC handler files (`note`, `entity`, `search`, `sync`, `intelligence`, `settings`, `graph`, `digest`) | CRUD modules ✅ |
| 2 | Update `setup.ts` — register all 12 handlers | Step 1 |
| 3 | Restrict `preload.ts` generic `ipcRenderer.send` to allowlist | None |
| 4 | Verify: every `window.electronAPI.*` method returns without crashing | Steps 1-3 |

### Phase B — View Data Wiring (Day 2)

**Goal**: App displays real data, not mocks.

| # | Task | Depends On |
|---|------|-----------|
| 5 | Replace `MeetingDetailView` mock segments with `useTranscriptStream` | Phase A |
| 6 | Replace `MeetingDetailView` mock digest with real meeting data | Phase A |
| 7 | Fix `MeetingListView` date grouping — real date comparison, not `slice(0,3)` | None |
| 8 | Wire `OnboardingFlow` auth step to `PiyAPIBackend.login()` via IPC | Step 1 (sync handler) |
| 9 | Wire recovery key step to `RecoveryPhraseService.generatePhrase()` | None |
| 10 | Wire model download step to `model:downloadAll` IPC | Already exists ✅ |

### Phase C — Audio → Transcript Pipeline (Day 3-4)

**Goal**: Start meeting → hear audio → see live transcript.

| # | Task | Depends On |
|---|------|-----------|
| 11 | Implement `AudioPipelineService.ts` (full orchestrator) | Phase A |
| 12 | Wire `audio:startCapture/stopCapture` → AudioPipelineService | Step 11 |
| 13 | Add `audio:pcmData` IPC for renderer → main audio transport | Step 11 |
| 14 | Wire `meeting:start/stop` → pipeline start/stop | Step 12 |
| 15 | Verify: Start meeting → speak → see transcript segments appear | Steps 13-14 |

### Phase D — Encrypted Search Fix (Day 4)

**Goal**: Synced data is searchable via semantic search.

| # | Task | Depends On |
|---|------|-----------|
| 16 | Add `LocalEmbeddingService.embed()` call in `SyncManager.syncPendingEvents()` | Phase A |
| 17 | Fix namespace from `${table}.${operation}` to `meetings.${table}` | Step 16 |
| 18 | Add `embedding` + `skip_server_embedding: true` to Memory payload | Step 16 |
| 19 | Verify: Synced memory has embedding data in PiyAPI | Step 18 |

### Phase E — Intelligence Wiring (Day 5-6)

**Goal**: AI features functional end-to-end.

| # | Task | Depends On |
|---|------|-----------|
| 20 | Fix NoteEditor undo atomicity — use `commands.command(({ tr }) => ...)` | Phase A |
| 21 | Add 500-segment cap in `useTranscriptStream` | None |
| 22 | Implement `ModelManager` — LLM on-demand load, 60s idle unload | Phase A |
| 23 | Add Context Sessions API dual-path in `note:expand` handler | Step 22 |
| 24 | Wire `PostMeetingDigest` → Ollama synthesis | Phase A |
| 25 | Wire `SilentPrompter` → Ollama suggestions | Phase C |
| 26 | Add `power.handlers.ts` for main-process `powerMonitor` | Phase A |
| 27 | Fix `usePowerMode` — replace `navigator.getBattery()` with IPC to `power:getStatus` | Step 26 |
| 28 | Wire feature traps — all 6 upgrade triggers + 14-day trial + quota fallback | Phase A |
| 29 | Wire `SmartChip.tsx` to local entity extraction | Phase A |
| 30 | Wire `SpeakerHeatmap.tsx` to real speaker segment data | Phase C |
| 31 | Add embedding status polling (`waitForEmbedding`) after sync | Phase D |

### Phase F — Deferred (Post-Beta)

| # | Task | When |
|---|------|------|
| 32 | Payment integration (Razorpay + PiyAPI Billing) | Phase 9 (Week 19) |
| 33 | Meeting templates → influence AI prompts | Phase 8 (Week 15) |
| 34 | Context document attachment → AI context injection | Phase 8 (Week 15) |
| 35 | App icons + code signing + electron-builder | Phase 10 (Week 21) |
| 36 | Weekly aggregate digest (cross-meeting, `/ask` + `/graph`) | Phase 8 (Week 17) |
| 37 | Graph trigger pattern testing (contradicts/supersedes/parent) | Phase 8 (Week 16) |
| 38 | Pinned moments (GAP-28) + transcript inline corrections (GAP-29) | Phase 8 (Week 18) |
| 39 | Bidirectional source highlighting (GAP-26) | Phase 8 (Week 15) |
| 40 | Referral loop (invite → both get trial) | Phase 9 (Week 20) |

---

## Verification Checklist

### Automated
```bash
npx tsc --noEmit           # Zero type errors
npx jest --config jest.config.ts  # 24 test files pass
npm run dev                # Vite dev server starts
npm run electron:dev       # Electron app launches
```

### Functional (Manual)

| # | Test | Expected Result |
|---|------|----------------|
| 1 | Open app, click every nav item | No console errors, no crashes |
| 2 | Call every `window.electronAPI.*` method in DevTools | All return `{ success: true }`, none throw `No handler registered` |
| 3 | Start Meeting → check SQLite | Meeting record exists with correct timestamp |
| 4 | MeetingDetailView shows real transcript segments | No "Alex Demo" / "Sarah Sync" mock data |
| 5 | MeetingListView groups meetings by actual date | No `slice(0,3)` grouping |
| 6 | Type in NoteEditor → wait 2s | Note auto-saved to SQLite via `note:update` |
| 7 | Press Cmd+Enter in NoteEditor | AI expansion appears (or graceful fallback if no Ollama) |
| 8 | Press Ctrl+Z after expansion | Entire AI block removed in **one** keystroke |
| 9 | Start audio capture → speak | Transcript segments appear in TranscriptPanel |
| 10 | Stop Meeting | Duration calculated, digest section appears |
| 11 | Cmd+K → type search query | Results from FTS5 appear |
| 12 | Onboarding flow completes end-to-end | Auth → model download → recovery key → plan → ghost meeting |
| 13 | Recovery key displays real BIP39 words | Not mock array `['abandon', 'ability', ...]` |
| 14 | Check SyncManager output | Embedding data present in Memory payload |
| 15 | Open Settings | All settings load/save correctly |
| 16 | Inspect `preload.ts` `send()` | Generic channel restricted to allowlist |
| 17 | 30-minute simulated meeting | No memory leaks, RAM < 200MB |
| 18 | Click AI-badged note → transcript highlights | Source segments pulse violet (bidirectional highlighting) |
| 19 | SmartChip entity chips display | People (blue), dates (green), amounts (orange), actions (red) |
| 20 | Cmd+Shift+K opens GlobalContextBar | Cross-meeting semantic search returns results |
| 21 | Cmd+Shift+M opens MiniWidget | Floating pip shows recording timer + last transcript line |
| 22 | LLM loads on Cmd+Enter, unloads after 60s idle | Monitor Ollama process: loaded → unloaded |
| 23 | Pro user: note expansion uses Context Sessions API | Check network tab for `/api/v1/context/sessions` call |
| 24 | 3rd device login → Device Wall | Wall shows with upgrade prompt |
| 25 | 51st AI query → silent local fallback | No error, badge shows "Local mode", Qwen answers locally |
