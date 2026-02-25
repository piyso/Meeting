# PiyAPI Notes - IPC Architecture Diagram

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        RENDERER PROCESS                          │
│                         (Frontend/UI)                            │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                  React Components                         │  │
│  │  - MeetingList.tsx                                        │  │
│  │  - NoteEditor.tsx                                         │  │
│  │  - TranscriptView.tsx                                     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            │                                     │
│                            ▼                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           window.electronAPI (Type-Safe)                  │  │
│  │  ✅ meeting.start()                                       │  │
│  │  ✅ note.expand()                                         │  │
│  │  ✅ on.transcriptChunk()                                  │  │
│  └──────────────────────────────────────────────────────────┘  │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                    ════════════╪════════════
                    CONTEXT BRIDGE (preload.ts)
                    ════════════╪════════════
                                │
┌───────────────────────────────┴─────────────────────────────────┐
│                         MAIN PROCESS                             │
│                      (Backend/Services)                          │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   IPC Handlers                            │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │ meeting.handlers.ts                                 │  │  │
│  │  │  - meeting:start                                    │  │  │
│  │  │  - meeting:stop                                     │  │  │
│  │  │  - meeting:list                                     │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │ note.handlers.ts (TODO)                            │  │  │
│  │  │  - note:create                                      │  │  │
│  │  │  - note:expand                                      │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │ audio.handlers.ts (TODO)                           │  │  │
│  │  │  - audio:startCapture                               │  │  │
│  │  │  - audio:stopCapture                                │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            │                                     │
│                            ▼                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                     Services Layer                        │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │ ✅ DatabaseService                                  │  │  │
│  │  │    - SQLite with WAL mode                           │  │  │
│  │  │    - FTS5 full-text search                          │  │  │
│  │  │    - CRUD operations                                │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │ 🚧 AudioPipelineService (TODO)                      │  │  │
│  │  │    - Audio capture (WASAPI/Core Audio)              │  │  │
│  │  │    - VAD worker management                          │  │  │
│  │  │    - Whisper worker management                      │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │ 🚧 IntelligenceService (TODO)                       │  │  │
│  │  │    - Ollama/MLX integration                         │  │  │
│  │  │    - Qwen 2.5 3B model management                   │  │  │
│  │  │    - Token streaming                                │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │ 🚧 SyncManager (TODO)                               │  │  │
│  │  │    - Event-sourced sync queue                       │  │  │
│  │  │    - AES-256-GCM encryption                         │  │  │
│  │  │    - Keytar integration                             │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            │                                     │
│                            ▼                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                  Worker Threads                           │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │ 🚧 whisper.worker.ts (TODO)                         │  │  │
│  │  │    - Whisper turbo / Moonshine Base                 │  │  │
│  │  │    - Audio → Text transcription                     │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │ 🚧 vad.worker.ts (TODO)                             │  │  │
│  │  │    - Silero VAD model                               │  │  │
│  │  │    - Voice activity detection                       │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            │                                     │
│                            ▼                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   Data Storage                            │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │ SQLite Database (piyapi-notes.db)                   │  │  │
│  │  │  - meetings                                          │  │  │
│  │  │  - transcripts (with FTS5)                           │  │  │
│  │  │  - notes (with FTS5)                                 │  │  │
│  │  │  - entities                                          │  │  │
│  │  │  - sync_queue                                        │  │  │
│  │  │  - encryption_keys                                   │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │ OS Keychain (via keytar)                            │  │  │
│  │  │  - Encryption keys                                   │  │  │
│  │  │  - API tokens                                        │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

## Data Flow Examples

### Example 1: Start Meeting

```
Frontend                  Preload                Main Process              Services
   │                         │                         │                      │
   │ meeting.start()         │                         │                      │
   ├────────────────────────>│                         │                      │
   │                         │ ipcRenderer.invoke()    │                      │
   │                         ├────────────────────────>│                      │
   │                         │                         │ getDatabaseService() │
   │                         │                         ├─────────────────────>│
   │                         │                         │                      │
   │                         │                         │ createMeeting()      │
   │                         │                         ├─────────────────────>│
   │                         │                         │                      │
   │                         │                         │<─────────────────────┤
   │                         │                         │   Meeting object     │
   │                         │<────────────────────────┤                      │
   │                         │   IPCResponse<Meeting>  │                      │
   │<────────────────────────┤                         │                      │
   │   { success, data }     │                         │                      │
   │                         │                         │                      │
```

### Example 2: Real-time Transcript Streaming

```
Worker Thread            Service                Main Process            Preload              Frontend
     │                      │                         │                      │                    │
     │ Transcript chunk     │                         │                      │                    │
     ├─────────────────────>│                         │                      │                    │
     │                      │ Save to DB              │                      │                    │
     │                      ├─────────────────────────>│                      │                    │
     │                      │                         │                      │                    │
     │                      │ Emit event              │                      │                    │
     │                      │<────────────────────────┤                      │                    │
     │                      │                         │ webContents.send()   │                    │
     │                      │                         ├─────────────────────>│                    │
     │                      │                         │                      │ callback(chunk)    │
     │                      │                         │                      ├───────────────────>│
     │                      │                         │                      │                    │
     │                      │                         │                      │  Update UI         │
     │                      │                         │                      │<───────────────────┤
```

### Example 3: Note Expansion with LLM Streaming

```
Frontend              Preload              Main Process         Intelligence Service      Ollama
   │                     │                      │                        │                   │
   │ note.expand()       │                      │                        │                   │
   ├────────────────────>│                      │                        │                   │
   │                     │ ipcRenderer.invoke() │                        │                   │
   │                     ├─────────────────────>│                        │                   │
   │                     │                      │ expandNote()           │                   │
   │                     │                      ├───────────────────────>│                   │
   │                     │                      │                        │ POST /generate    │
   │                     │                      │                        ├──────────────────>│
   │                     │                      │                        │                   │
   │                     │                      │                        │<──────────────────┤
   │                     │                      │                        │  Token stream     │
   │                     │                      │<───────────────────────┤                   │
   │                     │                      │  Emit token event      │                   │
   │                     │<─────────────────────┤                        │                   │
   │                     │  event:llmToken      │                        │                   │
   │<────────────────────┤                      │                        │                   │
   │  Display token      │                      │                        │                   │
   │                     │                      │                        │                   │
   │  (Repeat for each token...)                │                        │                   │
   │                     │                      │                        │                   │
   │                     │<─────────────────────┤                        │                   │
   │<────────────────────┤  Final response      │                        │                   │
   │  { success, data }  │                      │                        │                   │
```

## Security Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│                    RENDERER PROCESS                          │
│                   (Untrusted Zone)                           │
│                                                               │
│  ❌ NO access to:                                            │
│     - Node.js APIs                                           │
│     - Electron APIs                                          │
│     - File system                                            │
│     - Native modules                                         │
│                                                               │
│  ✅ CAN access:                                              │
│     - window.electronAPI (controlled interface)              │
│     - Web APIs (fetch, localStorage, etc.)                   │
└─────────────────────────────────────────────────────────────┘
                            │
                ════════════╪════════════
                  SECURITY BOUNDARY
                  (contextBridge)
                ════════════╪════════════
                            │
┌─────────────────────────────────────────────────────────────┐
│                     MAIN PROCESS                             │
│                    (Trusted Zone)                            │
│                                                               │
│  ✅ Full access to:                                          │
│     - Node.js APIs                                           │
│     - Electron APIs                                          │
│     - File system                                            │
│     - Native modules                                         │
│     - System resources                                       │
└─────────────────────────────────────────────────────────────┘
```

## Type Safety Flow

```
┌──────────────────────────────────────────────────────────────┐
│                    src/types/ipc.ts                           │
│                                                                │
│  interface StartMeetingParams { ... }                         │
│  interface StartMeetingResponse { ... }                       │
│  interface ElectronAPI { ... }                                │
└──────────────────────────────────────────────────────────────┘
                            │
                            ├─────────────────────────────────┐
                            │                                 │
                            ▼                                 ▼
┌──────────────────────────────────────┐  ┌──────────────────────────────────┐
│      electron/preload.ts              │  │  src/main/ipc/handlers/*.ts      │
│                                       │  │                                  │
│  const api: ElectronAPI = {          │  │  async (_event, params:          │
│    meeting: {                         │  │    StartMeetingParams) => {      │
│      start: (params) =>               │  │    // TypeScript validates       │
│        ipcRenderer.invoke(...)        │  │    // params structure           │
│    }                                  │  │  }                               │
│  }                                    │  │                                  │
└──────────────────────────────────────┘  └──────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                  Frontend (React)                             │
│                                                                │
│  // TypeScript autocomplete and validation                    │
│  const response = await window.electronAPI.meeting.start({    │
│    title: 'My Meeting',  // ✅ Type-checked                   │
│    namespace: 'work'     // ✅ Type-checked                   │
│  })                                                            │
│                                                                │
│  if (response.success) {                                       │
│    // response.data is typed as StartMeetingResponse          │
│    console.log(response.data.meeting.id)                      │
│  }                                                             │
└──────────────────────────────────────────────────────────────┘
```

## Legend

- ✅ = Implemented and working
- 🚧 = Planned/stubbed, ready for implementation
- ❌ = Not allowed/blocked for security
