# PiyNotes Master Improvement Roadmap
*Forensic audit of 25+ source files. Every item maps to a real file, a real gap, and a real fix.*

---

## 1. Performance: Eliminate Re-Render Cascades

### 1.1 Widget Timer Re-renders the Entire Tree
**File:** `WidgetApp.tsx:111-129`
The `useReducer` dispatch fires every 1s to update `elapsedTime`. Because `state` is a single flat object, this re-renders `MiniWidget` and all its children every second.
- [ ] **Fix:** Extract the timer into an isolated `<WidgetTimer />` component (like the main window's `IslandTimer`) that subscribes only to `recordingStartTime`. The parent `WidgetApp` never re-renders from the clock.

### 1.2 Transcript Segment Recomputation
**File:** `MeetingDetailView.tsx:124-138`
`segments` is recomputed via `useMemo` on every `transcripts` change, but each segment is a new object reference every time, defeating React's reconciliation. During active recording (~2 updates/sec), this forces a full re-render of `TranscriptPanel`.
- [ ] **Fix:** Implement structural sharing. Only create new segment objects for *changed* entries. Use a `Map<id, segment>` ref to cache previous segments and return stable references for unchanged ones.

### 1.3 Digest JSON Parsing in Render Path
**File:** `MeetingDetailView.tsx:294-311`
`decisions` and `actionItems` are parsed from JSON strings inside inline IIFEs during render. This runs `JSON.parse` on every re-render.
- [ ] **Fix:** Hoist these into `useMemo` hooks keyed on `digest?.decisions` and `digest?.actionItems`.

### 1.4 MeetingListView: Virtual Row Rebuilds
**File:** `MeetingListView.tsx:267-276`
`virtualRows` flattens `dateGroups` on every filter change, but also rebuilds when `columns` changes (resize). Since `columns` changes during window resize (which fires rapidly), this triggers expensive array slicing in a tight loop.
- [ ] **Fix:** Debounce the `columns` state update in the `ResizeObserver` callback (line 49). A 100ms debounce prevents 20+ re-renders during a window drag.

### 1.5 RecordingPulse Defined Inside Render
**File:** `MiniWidget.tsx:134-155`
`RecordingPulse` is defined as a function component **inside** `MiniWidget`'s body. React creates a new component *type* on every render, destroying and recreating the DOM node (and its Framer Motion animation state) every time any prop changes.
- [ ] **Fix:** Move `RecordingPulse` outside the component as a memoized standalone: `const RecordingPulse = React.memo(({ isPaused, theme }: ...) => { ... })`. This preserves animation continuity across parent re-renders.

### 1.6 CalendarStrip: toLocaleDateString Inside Memoized Component
**File:** `CalendarStrip.tsx:78`
`CalendarDay` is `React.memo`'d, but `date.toLocaleDateString(undefined, { weekday: 'short' })` runs on every render because the `date` object reference changes every time `days` is recomputed (line 163-167). New `Date` objects ≠ previous objects, so memo never skips.
- [ ] **Fix:** Key `CalendarDay` on `formatDateString(d)` (a string) instead of `d.toISOString()`, and pass pre-formatted `dayLabel` and `dateNum` as primitive props. `React.memo` can then shallow-compare primitives effectively.

### 1.7 useTranscriptStream: Full Sort on Every Tick
**File:** `useTranscriptStream.ts:109`
`allTranscripts` runs `combined.sort((a, b) => ...)` on the *entire* array every render tick (1s during recording). With 500+ transcript chunks, this is an O(n log n) operation every second.
- [ ] **Fix:** Maintain a pre-sorted ref. On new chunk arrival, binary-insert into the correct position (O(log n)) instead of re-sorting the whole array.

### 1.8 useLLMStream: Full Array Copy on Every 4th Token
**File:** `useLLMStream.ts:49`
`tokens` returns `[...tokensRef.current]` — a full array copy — on every render tick. For long AI responses (500+ tokens), this copies the entire array 125+ times.
- [ ] **Fix:** Return `tokensRef.current` directly (immutable by convention) or use `useSyncExternalStore` for proper React integration without copies.

### 1.9 mockData.ts is 45KB — Dead Weight in Production
**File:** `mockData.ts` (45,054 bytes)
This file is imported somewhere and ships in the production bundle.
- [ ] **Fix:** Gate all mock imports behind `import.meta.env.DEV` or move to a `__mocks__/` directory.

---

## 2. Bugs: Silent Failures & Stale State

### 2.1 activeMeetingId Never Cleared on Stop
**File:** `appStore.ts:140-152`
When `recordingState` transitions to `idle`, `recordingStartTime`, `lastTranscriptLine`, etc. are cleared, but `activeMeetingId` is **not** cleared. After stopping, the app still thinks it has an active meeting.
- [ ] **Fix:** Add `activeMeetingId: recordingState === 'idle' ? null : s.activeMeetingId` to the `setRecordingState` action.

### 2.2 localStorage Read Without try/catch
**File:** `appStore.ts:113-118`
`lastSyncTimestamp` reads `localStorage` synchronously during store creation. In SSR, test environments, or corrupt storage, this will crash the entire store.
- [ ] **Fix:** Wrap in `try { ... } catch { return null }`.

### 2.3 navigate() Creates New Objects Even When Unchanged
**File:** `appStore.ts:132-138`
`navigate()` always creates a new state object, even if the values haven't changed. This triggers re-renders in every component subscribed to `activeView` or `selectedMeetingId`.
- [ ] **Fix:** Add equality guard: `if (s.activeView === view && (meetingId === undefined || s.selectedMeetingId === meetingId)) return s`.

### 2.4 TranscriptPanel Stale Closure Bug
**File:** `TranscriptPanel.tsx:32-36`
The `handleHighlight` event listener references `rowVirtualizer` which is defined AFTER the `useEffect` that registers the listener (line 52). On first render, the listener captures a stale reference. Additionally, `segments` in the dep array causes the listener to be recreated on every transcript update during recording.
- [ ] **Fix:** Move the virtualizer ref to a `useRef` and access `virtualizerRef.current` inside the event handler. Remove `segments` from the effect's dependency array and access it via ref instead.

### 2.5 useSilentPrompter Fires While Tab is Hidden
**File:** `useSilentPrompter.ts:89`
The 2-minute interval fires regardless of `document.visibilityState`, wasting API calls when the user has tabbed away.
- [ ] **Fix:** Add `if (document.visibilityState === 'hidden') return` at the top of `generateSuggestion()`.

### 2.6 Widget Theme Resets on Restart
**File:** `MiniWidget.tsx:112`
`theme` is `useState<ThemeName>('monochrome')` — local state. On widget window reload or app restart, theme resets.
- [ ] **Fix:** Persist theme to `electron-store` via IPC. Initialize from persisted value. Or use `localStorage` in the widget's isolated renderer.

### 2.7 Audio Capture Has No Reconnection Logic
**File:** `audioCapture.ts:356-384`
If a Bluetooth headset disconnects mid-recording, `cleanup()` is called but there's no attempt to reconnect or fall back to another audio source. The recording silently stops capturing audio.
- [ ] **Fix:** Listen for `MediaStreamTrack.onended` event on the active audio track. When fired during active recording, attempt `startMicrophoneCapture()` as automatic fallback and notify the user via toast.

### 2.8 usePowerMode Polling Instead of Event-Driven
**File:** `usePowerMode.ts:47`
Polls power status every 30 seconds. Electron's `powerMonitor` has `on-ac` and `on-battery` events that should be used instead.
- [ ] **Fix:** Replace polling with IPC event subscriptions for `powerMonitor.on('on-ac')` and `powerMonitor.on('on-battery')` forwarded from the main process.

---

## 3. Widget Architecture: From Toolbar to Companion

### 3.1 Widget is Statically Anchored
**File:** `WidgetApp.tsx:172`
The widget renders `justify-start items-end p-6`, hard-pinning to top-right.
- [ ] **Fix (Cursor Teleportation):** On summon via global shortcut, call `screen.getCursorScreenPoint()` in main process and reposition widget near cursor.
- [ ] **Fix (Drag Memory):** Persist widget position via `electron-store`. Restore on next show.

### 3.2 No Orb → Pill → Panel Morphing
**File:** `MiniWidget.tsx`
The widget has a single visual state.
- [ ] **Fix:** Implement 3-state morph:
  - **Orb (default):** After 5s idle, collapse to 32×32px circle: recording dot + elapsed time only.
  - **Pill (hover):** On `mouseenter`, expand to current shape with dock buttons.
  - **Panel (Quick Note):** On note click, drop glassmorphic text input below.
- [ ] Use Framer Motion `layout` animations with spring physics (`stiffness: 400, damping: 25`).

### 3.3 No Audio-Reactive Feedback in Widget
**File:** `WidgetApp.tsx` — no audio level data passed to widget
The main window's `IslandAudioMeter` reads from `useAudioStatus`, but the widget has no equivalent. The recording dot blinks on a CSS timer, not synced to actual audio.
- [ ] **Fix:** Include `currentVolume` (RMS 0-1) in the `widget:updateState` IPC payload from `DynamicIsland.tsx:139-157`.
- [ ] In `MiniWidget`, bind the recording dot's `scale` to this RMS value via a CSS custom property `--audio-level`.

### 3.4 Widget Steals Focus
**File:** `electron/main.ts` (widget window creation)
If the widget's `BrowserWindow` is `focusable: true` (default), clicking it steals focus from Zoom/Figma.
- [ ] **Fix:** Set `focusable: false` and `type: 'panel'` on macOS. Use `setAlwaysOnTop(true, 'screen-saver')` to float over full-screen apps.

---

## 4. Audio Pipeline: Hardening for Production

### 4.1 No Backpressure on Audio IPC
**File:** `audioCapture.ts:329-335`
`handleAudioChunk` fires `ipcRenderer.send()` on every worklet chunk (~100 chunks/sec at 16kHz). If the main process is busy (e.g., running Whisper inference), chunks pile up in Electron's IPC queue with no backpressure signal.
- [ ] **Fix:** Implement a ring buffer (e.g., 3s of audio) in the renderer. Send buffered chunks at a lower frequency (10 chunks/sec) via a coalescing timer. This reduces IPC overhead by 10× while preserving audio fidelity.

### 4.2 No Audio Level Metering from Capture Pipeline
**File:** `audioCapture.ts`
The `AudioCaptureManager` never exposes RMS/peak levels. The audio indicator worker (`audio-indicator.worker.ts`) receives levels from a *separate* IPC channel, creating a discrepancy.
- [ ] **Fix:** Compute RMS in the AudioWorklet processor and include it in the `audioChunk` message. Forward this level to the renderer via a lightweight `audio:level` IPC event for the audio indicator and DynamicIsland.

### 4.3 Audio Indicator Worker Hardcoded Colors
**File:** `audio-indicator.worker.ts:32`
Uses `#ff9f0a` and `#6b7280` — doesn't respect the widget's theme system.
- [ ] **Fix:** Pass theme colors via the `update` message type so the worker renders in sync with the selected theme.

### 4.4 Single Audio Source Limitation
**File:** `audioCapture.ts:46-48`
The singleton pattern (`if (this.isCapturing) throw`) means you can't capture mic + system audio simultaneously. For speaker diarization (separating "my voice" from "other voices"), dual-source capture is essential.
- [ ] **Fix:** Refactor to support named capture sessions: `startCapture('system', ...)` and `startCapture('microphone', ...)` running concurrently with separate AudioContexts.

---

## 5. DynamicIsland: Polish & Accessibility

### 5.1 Hardcoded Color Values
**File:** `DynamicIsland.tsx` — uses inline hex like `#8E8E93`, `rgba(245,158,11,...)`.
- [ ] **Fix:** Replace all inline colors with CSS custom properties from `index.css`.

### 5.2 Missing ARIA Live Region on Transcript Preview
**File:** `DynamicIsland.tsx:226`
The transcript preview updates ~2×/sec during recording but has no `aria-live` attribute.
- [ ] **Fix:** Add `aria-live="polite"` to `.ui-di-transcript-preview` and `aria-label` to the hold-to-stop button.

### 5.3 Hover Grace Period Asymmetry
**File:** `DynamicIsland.tsx:323-330`
Both mouseEnter (60ms) and mouseLeave (500ms) have delays. The enter delay feels sluggish.
- [ ] **Fix:** Set `mouseEnter` to 0ms (instant), keep `mouseLeave` at 300ms. This asymmetry (instant open, delayed close) is the standard macOS menu pattern.

---

## 6. Zustand Store: Scalability & Architecture

### 6.1 Monolithic Store Approaching Critical Mass
**File:** `appStore.ts` (206 lines, 52 fields + actions)
Every `set()` call notifies all subscribers. Components that only care about `focusMode` re-check when `lastTranscriptLine` changes (10×/sec during recording).
- [ ] **Fix:** Split into domain-specific stores:
  - `useRecordingStore` — recording state, audio mode, timer, transcript line, coach tip
  - `useNavigationStore` — activeView, selectedMeetingId
  - `useUIStore` — focusMode, commandPalette, globalContext, toasts
  - `useSystemStore` — tier, quota, device info, online, sync

### 6.2 No Undo System for Destructive Actions
**File:** `appStore.ts` (Toast supports `undoAction` but nothing uses it)
The Toast interface has `undoAction?: () => void` and `undoLabel?: string`, but no component or action ever populates these fields. Meeting deletion uses `window.confirm()`.
- [ ] **Fix:** Implement soft-delete with undo. On "Delete Meeting", mark as `deleted_at = NOW()`, show toast with undo button, purge after 10s. No more `window.confirm()`.

---

## 7. NoteEditor: CRDT & Data Integrity

### 7.1 Y.Doc Created Per Meeting Without Cross-Device Sync
**File:** `NoteEditor.tsx:31-44`
`IndexeddbPersistence` stores CRDT state locally but has no network provider. If you edit notes on two devices, they diverge permanently.
- [ ] **Fix:** Add a WebSocket-based `y-websocket` or `y-webrtc` provider alongside `IndexeddbPersistence`. Route through the main process IPC → backend sync endpoint.

### 7.2 Periodic Auto-Save Doesn't Flush on App Quit
**File:** `NoteEditor.tsx:165-186`
The 30s auto-save timer runs on `setInterval`, but if the user quits the app between saves, up to 30s of edits are lost.
- [ ] **Fix:** Listen for `beforeunload` event and flush the current editor state immediately. Also hook into Electron's `before-quit` IPC to trigger a final save.

### 7.3 JSON.parse in mouseover DOM Handler
**File:** `NoteEditor.tsx:98`
Every `mouseover` event on an AI-verified paragraph runs `JSON.parse(context)`. During rapid mouse movement over paragraphs, this fires hundreds of times.
- [ ] **Fix:** Cache parsed results in a `WeakMap<HTMLElement, string[]>` to avoid re-parsing the same attribute.

---

## 8. Keyboard & Interaction: Missing Shortcuts

### 8.1 No Keyboard Navigation in CalendarStrip
**File:** `CalendarStrip.tsx`
The calendar days are `<motion.button>` elements but don't support arrow-key navigation. Users must click each day.
- [ ] **Fix:** Implement `onKeyDown` handler: ← → to move between days, Shift+← / Shift+→ for week navigation, Home for today.

### 8.2 No Escape Key in Widget Quick Note
**File:** `MiniWidget.tsx:320-338`
The quick note input has no key handler for Escape to dismiss. Users must click away.
- [ ] **Fix:** Add `onKeyDown` handler: Escape → `setIsNoteExpanded(false)`.

### 8.3 Missing Keyboard Shortcuts
**File:** `useKeyboardShortcuts.ts`
No shortcuts for:
- [ ] `Cmd+B` → Bookmark current moment during recording
- [ ] `Cmd+P` → Pause/Resume recording
- [ ] `Cmd+D` → Toggle entity sidebar
- [ ] `Cmd+[` → Back navigation (like Safari)
- [ ] `Cmd+Shift+C` → Copy transcript to clipboard

---

## 9. Visual Polish: Zen Glass Refinements

### 9.1 Native Vibrancy Not Used
**File:** `layout.css:64-73` / `index.css:246-258`
CSS `backdrop-filter: blur(64px)` works but is Chromium-rendered, not macOS compositor. It doesn't capture the real desktop wallpaper.
- [ ] **Fix:** Set `vibrancy: 'under-window'` and `visualEffectState: 'active'` on `BrowserWindow`. Reduce CSS blur to `blur(20px)` as cross-platform fallback.

### 9.2 Forced Colors Accessibility is Incomplete
**File:** `layout.css:696-718`
The `@media (forced-colors: active)` block covers DynamicIsland and ZenRail but misses MeetingCard, TranscriptPanel, PostMeetingDigest, and dialogs.
- [ ] **Fix:** Audit every interactive element for visible borders/text in forced-colors mode.

### 9.3 Duplicate Animation Definitions
**File:** `index.css:407-409` and `index.css:437-440`
`.animate-slide-up` is defined twice with different timings (line 407: `var(--transition-base)` = 300ms, line 439: `400ms var(--ease-spring)`). The second definition silently overrides the first.
- [ ] **Fix:** Remove the duplicate at line 437-440 or rename to `.animate-slide-up-spring`.

### 9.4 CSS Custom Property `--color-text-tertiary` == `--color-text-muted`
**File:** `index.css:47-48`
Both are set to `#8e8e93`. Having two tokens with identical values creates confusion about when to use which.
- [ ] **Fix:** Differentiate: `--color-text-tertiary: #636366` (lighter) vs `--color-text-muted: #8e8e93` (current), or document when each should be used.

---

## 10. Data Wiring: Feature Shells → Real Functionality

### 10.1 PostMeetingDigest: Action Item Completion Not Persisted
**File:** `PostMeetingDigest.tsx`
Checkboxes toggle local state only. No database write.
- [ ] **Fix:** Add IPC call `window.electronAPI?.actionItem?.update(...)` with optimistic UI on toggle.

### 10.2 WidgetApp initialState Uses Hardcoded Mocks
**File:** `WidgetApp.tsx:33-48`
`initialState` contains `elapsedTime: '01:24:03'`, `lastTranscriptLine: 'So if we integrate...'`. In production, users see fake data for ~500ms.
- [ ] **Fix:** Set all initial values to empty/zero defaults.

### 10.3 useDigest: No Caching Between Navigations
**File:** `useDigest.ts:77-81`
Navigating away from a meeting and back re-generates the entire digest. The `useEffect` calls `generateDigest()` on every mount.
- [ ] **Fix:** Use TanStack Query instead of raw `useState` + `useEffect`. This gives automatic caching, deduplication, and stale-while-revalidate behavior for free.

### 10.4 No Search Within Transcript
**File:** `TranscriptPanel.tsx`
No Cmd+F or search input to find text within the current meeting's transcript.
- [ ] **Fix:** Add a search bar that filters `virtualRows` by text match, scrolling to the first result and highlighting matches in-line.

---

## 11. Error Handling & Resilience

### 11.1 No React Error Boundaries
**File:** Entire app
If `TranscriptPanel` throws (e.g., corrupt transcript data), the entire meeting view crashes to a blank screen.
- [ ] **Fix:** Wrap each major view (`MeetingDetailView`, `MeetingListView`, `KnowledgeGraphView`) in an `ErrorBoundary` component that shows a recovery UI instead of a white screen.

### 11.2 useIPCCall: No Request Deduplication or Cancellation
**File:** `useIPCCall.ts:74-156`
Calling `execute()` twice fires two IPC calls. No `AbortController` support.
- [ ] **Fix:** Track in-flight requests via a `requestIdRef`. On new `execute()`, increment the ID. When the response arrives, only apply state if `requestId === requestIdRef.current` (stale response guard).

### 11.3 Silent Catch Blocks Swallow Critical Errors
**Files:** `useSyncEngine.ts:48`, `useSystemState.ts:60`, `usePowerMode.ts:23`
Multiple hooks have `catch { /* ignore */ }` blocks that swallow all errors, including potential auth failures or network issues that the user should know about.
- [ ] **Fix:** Log errors via `rendererLog` at minimum. For user-facing failures (quota check, sync), show a non-intrusive degraded-state indicator.

---

## 12. Cross-Cutting Architecture Improvements

### 12.1 No Offline Mutation Queue
**Files:** `useSyncEngine.ts`, `NoteEditor.tsx`
When offline, mutations (note edits, action item toggles, bookmarks) are either lost or silently fail. There's no retry queue.
- [ ] **Fix:** Implement an offline-first mutation queue using `IndexedDB`. Queue mutations when offline, replay when connectivity returns. TanStack Query's `MutationCache` with `onMutate` / `onError` rollback can handle this.

### 12.2 No Deep Linking / URL State
**File:** `appStore.ts:132-138` (navigate)
Navigation is entirely in-memory. You can't share a link to a specific meeting or transcript timestamp. Browser back/forward don't work.
- [ ] **Fix:** Implement hash-based routing (`#/meeting/abc123?t=120`). Parse on app start and sync `appStore.navigate()` with `window.location.hash`.

### 12.3 No Telemetry Hooks for Usage Analytics
**File:** Entire renderer
No tracking of: feature adoption (how many users use Quick Note? Entity Sidebar? Focus Mode?), recording session duration, or error rates.
- [ ] **Fix:** Add a lightweight, privacy-respecting analytics layer. Emit events to a local SQLite table. Optionally sync anonymized aggregates (with user consent) for product insights.

### 12.4 CalendarStrip: No External Calendar Integration
**File:** `CalendarStrip.tsx`
Shows only PiyNotes meetings. No Google Calendar or Outlook integration.
- [ ] **Fix:** Add IPC bridge to main process that reads calendar events via `CalDAV` or Google Calendar API. Show external events as gray dots alongside PiyNotes meeting indicators.

---

## 13. The Frontier: What Would Make This World-Class

### 13.1 Screen Context Fusion
- [ ] Capture low-FPS OCR-processed screen snapshots synchronized with audio timestamps. When asking "What was I looking at when X was decided?", fuse visual context with the transcript.

### 13.2 On-Device Inference (Apple MLX)
- [ ] Replace cloud STT with local WhisperKit/mlx-whisper running on the Neural Engine for zero-latency, zero-cost, fully private transcription.

### 13.3 Semantic File System (macOS FileProvider)
- [ ] Expose the knowledge graph as a virtual Finder drive: `People/`, `Projects/`, `Concepts/`. Drag a file in → auto-ingest into the graph.

### 13.4 Cross-App Memory Recall
- [ ] Use macOS Accessibility APIs to detect `@piy` typed in any app (Slack, Mail, etc.) and inject the requested memory snippet inline.

### 13.5 Weekly Audio Podcast Synthesis
- [ ] End-of-week: synthesize a 5-minute audio digest of all meetings using local TTS. Users listen to their summary on their commute.

### 13.6 Always-On Episodic Memory Buffer
- [ ] Replace "Start Meeting" with a passive rolling audio buffer. Ask PiyNotes about any conversation from the last 24 hours.

### 13.7 Cryptographic Audio Provenance
- [ ] Sign audio streams at the hardware level. Mathematically undeniable proof of what was said in an age of deepfakes.

### 13.8 Multi-Speaker Diarization with Voice Profiles
- [ ] Train per-speaker voice embeddings. Automatically tag "CEO said X" vs "Engineer said Y" in the transcript. Show per-speaker talk-time analytics.

### 13.9 Meeting Comparison & Trend Analysis
- [ ] Compare action items across meetings: "Show me all action items assigned to Piyush in the last 30 days." Visualize decision velocity, meeting frequency, and topic drift over time.

### 13.10 Ambient Mode: Desktop Companion Strip
- [ ] A persistent 2px-high strip at the top of the screen that expands on hover. Shows: current recording status, next meeting countdown, last unresolved action item. Always visible, never intrusive.
