🔬 PiyNotes / BlueArkive — Ultra-Deep Project Analysis
70+ source files reviewed line-by-line. 30+ issues found across every subsystem.

🔴 CRITICAL BUGS (Will Break Core Features)
C1. activeMeetingId is NEVER SET — Breaks 8 Components
Detail Value
Files affected
appStore.ts
,
AppLayout.tsx
,
DynamicIsland.tsx
,
MeetingListView.tsx
,
WidgetApp.tsx
Root cause activeMeetingId exists in
AppState
(L33) and is initialized as null (L100), but no setActiveMeetingId action exists in the store. The
navigate()
function only sets selectedMeetingId.
Impact ❌ Global shortcut stop (L167) — if (state.activeMeetingId) is always false → toggle-recording can never stop
❌ Bookmark (L243) — guard !state.activeMeetingId always true → bookmarks fail silently
❌ Quick export (L184) — falls back to selectedMeetingId (works, but fragile)
❌ Stop recording (L356) — meeting:stop never called → audio keeps capturing
❌ Pause/resume (L369) — if (!state.activeMeetingId) return always exits
❌ "Return to Meeting" banner (MeetingListView L290) — never shown
❌ DynamicIsland audio level (L48-49) — useAudioStatus(null) returns empty data
❌ Widget (L50) — can't find active meeting
C2. Double Audio Stop — Race Condition on Meeting End
Detail Value
Location
AppLayout.tsx:L356-L359
Problem handleStopRecording calls BOTH:

1. window.electronAPI.meeting.stop() — which internally calls AudioPipelineService.stopCapture() (
   meeting.handlers.ts:L160-L163
   )
2. stopCapture()
   from
   useAudioSession
   hook — which calls audio:stopCapture IPC
   Impact The second
   stopCapture()
   hits AudioPipelineService.stopCapture() after it already ran, causing either a no-op (because isCapturing is false) or trying to process already-released buffers. The powerSaveBlocker.stop() in
   audio.handlers.ts
   gets called twice with the same ID.
   C3. GDPR "Right to Be Forgotten" Wrongly Tier-Gated
   Detail Value
   Location
   export.handlers.ts:L143-L158
   Problem export:deleteAllData checks features.cloudSync and rejects Free tier users with "Data deletion requires Starter plan or higher"
   Legal issue GDPR Article 17 (Right to Erasure) applies to ALL users regardless of subscription tier. This is a legal compliance violation. The local data deletion should always work; only the cloud deletion part should be conditional.
   C4. Circular Dependency via require() in Note Batch Expand
   Detail Value
   Location
   note.handlers.ts:L319
   Problem Uses CJS require('../../../../electron/main') inside an async function to get
   getMainWindow
   . This creates a circular dependency (main.ts → setup.ts → note.handlers.ts → main.ts). Node.js may return a partially-initialized module, causing
   getMainWindow
   to be undefined.
   Fix Pass BrowserWindow reference through IPC setup or use BrowserWindow.getAllWindows()[0] instead.
   🟠 IMPORTANT ISSUES (Broken or Incomplete Features)
   I1. Recovery Phrase Wordlist Only 248 Words (Should Be 2048)
   Detail Value
   Location
   auth.handlers.ts:L22-L271
   Problem The BIP39 wordlist contains only 248 words (A-B range). Full BIP39 has 2048 words. With 248 words, a 24-word phrase has 248^24 ≈ 2^190 combinations instead of 2048^24 ≈ 2^264. While still large, it's cryptographically weaker than intended and not BIP39-compatible for external wallet recovery tools.
   I2. 6 Audio Test Handlers Are Stubs
   Detail Value
   Location
   audio.handlers.ts:L458-L584
   Problem audio:startSystemAudioTest, audio:stopSystemAudioTest, audio:getSystemAudioTestStatus, audio:startMicrophoneTest, audio:stopMicrophoneTest, audio:getMicrophoneTestStatus — all return hardcoded "not yet implemented" responses.
   Impact Users cannot test audio before recording. The onboarding audio test step is non-functional.
   I3. Audio Device Enumeration Returns Hardcoded Values
   Detail Value
   Location
   AudioPipelineService.ts:L477-L520
   Problem
   enumerateAudioSources()
   returns static stubs per platform — not actual hardware enumeration. macOS always returns one "System Audio (via ScreenCaptureKit)" device, Windows always returns WASAPI + microphone. Linux returns empty [].
   Impact Users with Bluetooth headsets, USB mics, or multiple audio interfaces can't select their device.
   I4. Meeting Export Doesn't Save File to Disk
   Detail Value
   Location
   meeting.handlers.ts:L330-L432
   vs
   AppLayout.tsx:L182-L192
   Problem meeting:export returns { content, format, filename } as IPC response data, but never opens a save dialog (dialog.showSaveDialog). The renderer
   handleQuickExport
   doesn't use the returned content — just shows "Exported as Markdown" toast.
   Result User thinks export worked, but no file is saved anywhere.
   I5.
   useAudioSession
   Calls Missing IPC Handlers
   Detail Value
   Location
   useAudioSession.ts:L93-L106
   Problem
   pauseCapture()
   calls window.electronAPI.audio.pauseCapture?.() and
   resumeCapture()
   calls window.electronAPI.audio.resumeCapture?.(). But no audio:pauseCapture or audio:resumeCapture IPC handler exists in
   audio.handlers.ts
   . The optional chaining ?.() silently no-ops.
   Impact Pause/resume UI appears to work (state changes), but audio capture continues uninterrupted in the background. Paused time is still recorded and transcribed.
   I6. Digest AI Parsing Uses Fragile Regex
   Detail Value
   Location
   digest.handlers.ts:L198-L257
   Problem Parses AI output using regex like /DECISION:\s*(.+?)(?:\s*|\s*MEETING:\s*(.+?))?$/gm. LLMs are nondeterministic — they may not follow the exact format. If the AI adds a bullet point, number prefix, or uses "Decision:" (lowercase), the regex produces zero matches and the digest has no decisions.
   I7. SharedArrayBuffer Without Cross-Origin Isolation
   Detail Value
   Location
   AudioPipelineService.ts:L53
   Problem
   AudioBufferPool
   tries new Float32Array(new SharedArrayBuffer(...)). In Electron with contextIsolation: true, SharedArrayBuffer may be unavailable in the main process's V8 context unless COOP/COEP headers are set. The catch fallback is present but if SharedArrayBuffer IS available without cross-origin policies, the buffer can't safely cross IPC boundaries.
   I8. Export
   deleteAllData
   Deletes meetings Table Twice
   Detail Value
   Location
   export.handlers.ts:L196+L217
   Problem meetings appears in the tables array at L196 ("LAST — parent table") AND gets a separate DELETE FROM meetings at L217. The second delete is redundant but harmless.
   I9. shell:openExternal Handler Misplaced in Audio Handlers
   Detail Value
   Location
   audio.handlers.ts:L427-L456
   Problem A general-purpose shell:openExternal handler is registered inside
   registerAudioHandlers()
   . This works but breaks separation of concerns — if audio handlers aren't registered, shell operations also break. Should be in its own handler module.
   I10. Search Deduplication Loses Multi-Snippet Results
   Detail Value
   Location
   search.handlers.ts:L206-L212
   Problem Deduplication uses seenMeetingIds to filter cloud results by meeting ID. If multiple relevant snippets exist from the same meeting, only the first local result is kept and all cloud results for that meeting are discarded.
   I11. Sync Login Creates New PiyAPIBackend Without Cleanup
   Detail Value
   Location
   sync.handlers.ts:L72
   Problem Each sync:login call creates new PiyAPIBackend() without disposing the previous instance. If PiyAPIBackend holds HTTP connections, WebSocket connections, or timers, these leak.
   🟡 MODERATE ISSUES
   M1.
   isAuthenticated
   Store Field Is Dead Code
   Location:
   appStore.ts:L29,L96
   No setter action for
   isAuthenticated
   exists. It's initialized as false and never changes. No component reads it for feature gating.

M2. Meeting Markdown Export Uses Epoch Seconds as Time String
Location:
meeting.handlers.ts:L380
new Date(t.start_time \* 1000).toLocaleTimeString() — transcript start_time is relative seconds (e.g., 120.5 = 2min into meeting), NOT an epoch. This produces meaningless strings like "12:00:00 AM" for relative timestamps.

M3. Digest Topic Extraction Is Low-Quality
Location:
digest.handlers.ts:L112-L128
Uses SUBSTR(t.text, 1, 80) as a "topic" — this is just the first 80 chars of a transcript line, not a topic. Results in nonsensical entries like "And then I was telling him about the meeting we had…" as a "topic."

M4. Recovery Phrase Not Validated on Recovery
Location:
auth.handlers.ts
Recovery phrase is generated and stored, but there's no IPC handler for validating/using a recovery phrase to actually recover an account. The feature is write-only.

M5.
walCheckpoint
Dynamic Import in Timer
Location:
meeting.handlers.ts:L91-L93
Uses await import('../../database/connection') inside a setInterval callback. Node.js module cache handles repeated imports, but it's unnecessary overhead — should import at module level.

M6. graph:search Uses as any Cast
Location:
graph.handlers.ts:L229-L232
Casts backend as any to check for searchGraph method. If the method doesn't exist, falls back to fetching the entire graph and filtering locally — potentially expensive for large graphs.

M7. note:expand Records Quota Before Confirming Success
Location:
note.handlers.ts:L187
quotaManager.recordUsage() is called at L187 before the return at L189. If the response parsing fails between L187-L198, quota is consumed without delivering a result to the user.

M8. No Entity Extraction during Recording
Entity extraction (EntityExtractor handlers) runs only when manually triggered or in digest generation. Transcripts created during live recording don't get automatically entity-extracted in real-time. Entities only appear after the meeting ends and a digest is generated.

🟢 MINOR / POLISH ISSUES

# Issue Location Impact

P1
mockData.ts
(44KB) +
mockElectronAPI.ts
(53KB) ship in production bundle src/renderer/ ~100KB dead weight in production
P2 meeting_templates table defined in schema but never used — no CRUD, IPC, or UI
schema.ts:L179-L187
Dead schema
P3 action_items table has schema+insert but no list/update/delete IPC handlers
schema.ts:L152-L163
Action items are write-only
P4 PostMeetingDigest receives pinnedMoments={[]} hardcoded
MeetingDetailView.tsx:L227
Bookmarks never shown in digest
P5 40+ development markdown files clutter project root Root directory Unprofessional for open-source or handoff
P6 SettingsView.tsx is 223 bytes placeholder
SettingsView.tsx
Settings panel routes but shows nothing
P7 Linux returns empty audio device list
AudioPipelineService.ts:L515
Zero Linux audio support
P8 entities_fts table not cleaned in deleteAllData
export.handlers.ts:L207
FTS entity data persists after full deletion
P9 useAppStore.getState() called inside render-adjacent functions
AppLayout.tsx:L156
Breaks React's unidirectional data flow pattern
P10 No test files exist tests/ directory is empty Zero automated test coverage
System Completeness Matrix (Updated)
Feature Backend IPC Frontend Status
Meeting CRUD ✅ ✅ ✅ ✅ Working
Audio Capture ✅ ✅ ✅ ⚠️ Hardcoded devices
Audio Pause/Resume ❌ No IPC handler ❌ ✅ UI exists 🔴 Non-functional
Audio Device Test ❌ 6 stubs ✅ IPC defined ✅ UI exists 🔴 Non-functional
Transcription (Whisper) ✅ ✅ ✅ ✅ Working
Notes + AI Expansion ✅ ✅ ✅ ✅ Working
Entity Extraction ✅ ✅ ✅ ⚠️ Not real-time
FTS + Semantic Search ✅ ✅ ✅ ✅ Working
Knowledge Graph ✅ Cloud ✅ ✅ ✅ Working (Starter+)
Weekly Digest ✅ ✅ ✅ ⚠️ Fragile AI regex
Ask Meetings (AI Chat) ✅ ✅ ✅ ✅ Working
Sync (CRDT) ✅ ✅ ✅ ⚠️ Backend leak on re-login
Auth ✅ ✅ ✅ ⚠️ isAuthenticated unused
Recovery Phrase ⚠️ 248 words ✅ ✅ 🔴 No recovery handler
Recording Toggle Shortcut ✅ ✅ ✅ 🔴 Stop broken (needs C1 fix)
Bookmark Moments ✅ DB ✅ IPC ✅ UI 🔴 Broken (needs C1)
Meeting Export ⚠️ No save dialog ✅ ✅ UI 🔴 No file saved
Meeting Templates ✅ Schema ❌ ❌ ❌ Dead feature
Action Items ✅ Schema + insert ❌ List/update ❌ ⚠️ Write-only
GDPR Delete All ✅ ✅ ✅ 🔴 Wrongly gated
Linux Audio ❌ ✅ ✅ ❌ No support
Top 5 Priorities to Fix
Priority Issue Effort Impact
1 C1: Add setActiveMeetingId to store + call it on meeting:start 15 min Unblocks 8 broken features
2 C2: Remove duplicate stopCapture() in handleStopRecording 2 min Fixes race condition
3 C3: Remove tier gate from export:deleteAllData for local data 5 min GDPR compliance
4 I4: Add dialog.showSaveDialog() to export handler OR make renderer save the returned content 15 min Makes export functional
5 I5: Add audio:pauseCapture + audio:resumeCapture IPC handlers 20 min Makes pause/resume work
Severity Legend
Tag Meaning
🔴 C Critical — Feature is broken or data is lost/corrupted
🟠 I Important — Feature partially broken or significant gap
🟡 M Moderate — Incorrect behavior in edge cases
🟢 P Polish — Code hygiene, unused code, minor UX issues
🔴 Critical Bugs (7)
C1 — activeMeetingId Is Never Set → 8 Features Broken
Files:
appStore.ts
,
AppLayout.tsx

appStore.ts
declares activeMeetingId: string | null = null but no setter action exists. Neither MeetingListView.handleQuickStart nor
AppLayout
ever calls a setActiveMeetingId.

Cascading failures:

handleStopRecording (L356): if (state.activeMeetingId) → never true → meeting.stop is never called → end_time/duration never saved
handlePauseRecording (L369): returns immediately → pause button is a no-op
executeBookmark (L243): returns immediately → ⌘+Shift+B does nothing
toggle-recording stop path (L167): dead code → can't stop via shortcut
handleQuickExport
(L184): mid falls back to selectedMeetingId only
DynamicIsland
(L49): useAudioStatus(activeMeetingId) → null → no audio level visualization
MeetingListView
(L290): "Return to Meeting" banner never shows
Widget
updateState
never receives correct meeting context
C2 — Ask Your Meetings RAG Context Never Injected
Files:
AskMeetingsView.tsx
,
search.handlers.ts

search:semantic handler returns:

js
{ success: true, data: { results: [...], query: 'xxx' } }
But
AskMeetingsView.tsx
L250 does:

js
if (searchResult.success && searchResult.data && searchResult.data.length > 0)
.data is an object ({results, query}), not an array — .data.length is undefined → condition always fails → contextText stays empty → the LLM answers with zero meeting context. The entire RAG pipeline is dead.

Fix: Change to searchResult.data.results?.length > 0 and iterate searchResult.data.results.

C3 — Double Audio Stop Race Condition
Files:
AppLayout.tsx

handleStopRecording calls BOTH:

window.electronAPI.meeting.stop() — which internally calls audioPipeline.stopCapture()
stopCapture()
from
useAudioSession
— which calls audio:stopCapture IPC
This sends two stop commands to the audio pipeline, causing either a "not recording" error or a race condition in resource cleanup.

C4 — GDPR Deletion Gated Behind Paid Tier
File:
export.handlers.ts

The export:deleteAllData handler checks features.cloudSync (Starter+) before allowing data deletion. Free-tier users cannot delete their own data — this violates GDPR Article 17 (Right to Erasure).

C5 — Circular require() in Note Handlers
File:
note.handlers.ts

Dynamic require('../../../../electron/main') creates a circular dependency with the main entry point. On cold start with a batch expand immediately after boot,
getMainWindow()
may return undefined because main hasn't fully initialized.

C6 —
useDigest
and digest:generate Signature Mismatch
Files:
useDigest.ts
,
digest.handlers.ts

useDigest
hook calls:

js
window.electronAPI.digest.generate({ meetingId })
But the digest:generate handler expects { startDate, endDate, periodType } for period-based digests. If the handler doesn't support meetingId-only mode, the PostMeetingDigest panel will always fail.

C7 —
deleteAllData
Deletes meetings Table Twice
File:
export.handlers.ts

The
deleteAllData
function runs DELETE FROM meetings twice in its cleanup chain, wasting a transaction row and potentially conflicting with cascade deletes on the first pass.

🟠 Important Issues (14)
I1 — Audio Pause/Resume Has No Backend
Files:
useAudioSession.ts
,
audio.handlers.ts

pauseCapture()
and
resumeCapture()
call audio:pauseCapture / audio:resumeCapture IPC handlers that do not exist. The UI shows "Paused" but audio continues recording.

I2 — 6 Audio Test Handlers Are Stubs
File:
audio.handlers.ts

audio:startSystemAudioTest, audio:stopSystemAudioTest, audio:startMicrophoneTest, audio:stopMicrophoneTest, audio:startCaptureTest, audio:stopCaptureTest all return { success: false, error: "Not yet implemented" }.

I3 — Audio Device Enumeration Returns Hardcoded Values
File:
AudioPipelineService.ts

enumerateAudioSources()
returns hardcoded stub devices instead of querying actual hardware. Users cannot select their real microphones.

I4 — Meeting Export Doesn't Save to Disk
Files:
meeting.handlers.ts
,
AppLayout.tsx

meeting:export returns markdown content as a string but never opens a dialog.showSaveDialog().
handleQuickExport
in AppLayout shows "📄 Exported as Markdown" toast but the content is discarded.

I5 — Recovery Phrase: Only 248 Words, No Recovery Handler
File:
auth.handlers.ts

The recovery phrase wordlist has only 248 words (BIP39 requires 2048). There is no auth:recoverWithPhrase handler — users who lose their password have no way to recover.

I6 — Digest AI Parsing Uses Fragile Regex
File:
digest.handlers.ts

The LLM response parser uses regex patterns like /^(?:Decision|Key Decision):\s*(.+)/i to extract structured data. If the LLM changes formatting (uses • or * prefixes, or uses markdown headers), data is silently lost.

I7 — SharedArrayBuffer Missing Cross-Origin Headers
File:
AudioPipelineService.ts

Audio pipeline uses SharedArrayBuffer for buffer pooling but the Electron renderer may not have Cross-Origin-Isolator-Policy: require-corp / Cross-Origin-Opener-Policy: same-origin headers. This can cause SharedArrayBuffer to be undefined.

I8 — shell:openExternal in Wrong Handler File
File:
audio.handlers.ts

The shell:openExternal IPC handler is registered inside
audio.handlers.ts
— it belongs in a shell.handlers.ts or utility.handlers.ts. This makes it hard to find and creates a misleading dependency.

I9 — Search Deduplication Loses Multi-Snippet Results
File:
search.handlers.ts

Results are deduplicated by meeting.id. If both local and cloud results return different relevant snippets from the same meeting, only the local result survives. This discards potentially valuable cloud-semantic matches.

I10 — sync:login Creates Backend Without Cleanup
File:
sync.handlers.ts

Each sync:login call creates a new PiyAPIBackend() instance. Old instances are never cleaned up — if the user logs in/out repeatedly, orphaned connections and event listeners stay alive.

I11 —
useSilentPrompter
Transcript Type Mismatch
File:
useSilentPrompter.ts

The hook expects transcripts as Array<{ text: string; startTime: number }> (camelCase). But
useTranscriptStream
returns objects with startTime via mapping. The issue is that the filter(t => t.startTime >= fiveMinAgo) works on the mapped data but the type annotation is fragile and could break if the mapping changes.

I12 — handleQuickStart Never Sets Recording Start Time
File:
MeetingListView.tsx

handleQuickStart sets recordingState = 'starting' and navigates to meeting-detail, but never sets recordingStartTime in the store. The elapsed timer in DynamicIsland won't start until the AppLayout effect at L329-343 catches the state change.

I13 — MeetingCard Duration Shows Raw Seconds
File:
MeetingListView.tsx

duration={m.duration || 0} passes raw seconds to MeetingCard. If m.duration is null (meeting still running or never stopped), it displays 0 — which is misleading.

I14 — FTS Entity Data Persists After
deleteAllData
File:
export.handlers.ts

The
deleteAllData
function deletes from core tables but does NOT rebuild FTS5 indexes. Ghost data in transcripts_fts, notes_fts, and entities_fts will return stale search results even after deletion.

🟡 Moderate Issues (10)
M1 —
isAuthenticated
Store State Unused
File:
appStore.ts

isAuthenticated
boolean exists but no component reads it to gate features.

M2 — Meeting Export Time Format Incorrect
File:
meeting.handlers.ts

Markdown export uses toFixed(2) on start_time (epoch seconds), producing "1741012345.00s" instead of human-readable timestamps.

M3 — Digest Topic Extraction Based on Fragile Slicing
File:
digest.handlers.ts

Topic extraction uses text.slice(0, 50) as a topic label — this produces sentence fragments, not actual topic names.

M4 — meeting_templates Table Unused
File:
schema.ts

The meeting_templates table has a schema but no CRUD operations, no IPC handlers, and no UI. Dead code.

M5 — action_items Table is Write-Only
File:
schema.ts

Action items are written by digest generation but there are no list/update/delete handlers. The calendar/task integration is non-functional.

M6 — useAppStore.getState() Used in Render-Adjacent Code
Files: Multiple hooks and components

useAppStore.getState() is safe in callbacks but used in places where it could cause stale reads if the component tree is deep.

M7 — AskMeetingsView
MarkdownText
Parser Very Limited
File:
AskMeetingsView.tsx

Only handles: **bold**, `` code blocks, > blockquotes. Missing: headings, links, lists, italics, inline code. LLM responses with these are rendered as plain text.

M8 —
useTranscriptStream
Hard-Caps at 500 Live Chunks
File:
useTranscriptStream.ts

Live chunks are evicted at 500 entries (oldest-first). For long meetings (2+ hours), early transcripts silently vanish from the live view. Historical transcripts from the DB partially recover this, but there's a window where data is lost during recording.

M9 — schema_version Table Created Twice
Files:
schema.ts
,
connection.ts

CREATE TABLE IF NOT EXISTS schema_version appears in both the schema SQL and the
initializeSchema()
function. Not a bug (thanks to IF NOT EXISTS), but confusing.

M10 —
countSearchResults
Uses Wrong Params Array
File:
search.ts

Both transcript and note count queries use the same params array. When meetingId is provided, the array has 2 items [safeQuery, meetingId] — this is correct for both queries since both append meetingId conditionally only if present. No actual bug, but the shared params pattern is fragile.

🟢 Polish Issues (12)
P1 — Mock Data in Production Bundle
Unused mock data files are included in the build, adding bundle bloat.

P2 —
SettingsView.tsx
is a Placeholder
The settings view shows stubbed content with no functional settings.

P3 — Linux Audio Enumeration Empty
AudioPipelineService
returns an empty array for Linux audio devices.

P4 — No Automated Tests
Zero test files exist across the entire codebase.

P5 — console.log Statements in Production
Several files use raw console.log instead of the Logger service.

P6 — Inline Tailwind Classes in Non-Tailwind Project
Multiple components use Tailwind-style utility classes (flex, items-center, gap-2, etc.) via inline className strings rather than the project's CSS module approach.

P7 — Missing Error Boundaries on Lazy Routes
Lazy-loaded views have error boundaries at the loader level but not at the component level — an error in rendering (not loading) will crash the entire app.

P8 — KnowledgeGraphView Fetches on Every isOnline Toggle
File:
KnowledgeGraphView.tsx

The useEffect dependency [isLocked, isOnline] causes the graph to refetch every time WiFi toggles, even if data is already loaded.

P9 — AskMeetingsView Chat Persisted to localStorage
File:
AskMeetingsView.tsx

Chat history is stored in localStorage (5MB limit) instead of SQLite. Large conversations with base64 images or large source citations could hit the limit silently.

P10 —
WeeklyDigestView

getDateRange
Weekly Start Off-By-One
File:
WeeklyDigestView.tsx

start.setDate(start.getDate() - start.getDay()) sets the week start to Sunday. If the user is in a Monday-start locale, this produces a 1-day mismatch.

P11 — New Meeting Dialog Never Used
File:
MeetingListView.tsx

NewMeetingDialog is imported and rendered but setDialogOpen(true) is never called — the quick-start flow bypasses it.

P12 — AISourceBadge Hardcoded to "edge"
File:
AskMeetingsView.tsx

Every assistant message shows <AISourceBadge source="edge" /> regardless of whether the response came from local or cloud AI.

Priority Fix Order

# ID Fix Effort Impact

1 C1 Add setActiveMeetingId action to store; call it in handleQuickStart and
handleStartMeeting
15 min Unblocks 8 features
2 C2 Change searchResult.data.length → searchResult.data.results?.length in AskMeetingsView 5 min Fixes entire RAG pipeline
3 C3 Remove await stopCapture() from handleStopRecording (meeting.stop already stops audio) 2 min Eliminates race condition
4 C4 Remove tier gate from
deleteAllData
— GDPR applies to all users 5 min Legal compliance
5 I1 Add audio:pauseCapture / audio:resumeCapture IPC handlers 30 min Enables pause/resume
6 I4 Add dialog.showSaveDialog() to meeting export 15 min Actually saves files
7 C6 Add meetingId-only mode to digest:generate or fix
useDigest
call 20 min Fixes post-meeting digest
8 I14 Add
rebuildSearchIndexes()
call after
deleteAllData
5 min Cleans FTS ghost data
9 C7 Remove duplicate DELETE FROM meetings 2 min Clean delete chain
10 I9 Change dedup key from meetingId to meetingId+snippet 10 min Preserves multi-snippet results
PiyNotes/BlueArkive — EXHAUSTIVE Deep Bug Report v2
Scope: Line-by-line review of ALL 107 source files across main + renderer Date: 2026-03-11 Methodology: Every .ts/.tsx file opened and audited: 22 IPC handlers, 7 CRUD modules, 15+ services, config, schema, migrations, setup, and all key renderer components

Severity Legend
Tag Meaning
🔴 C Critical — Feature broken, data lost, or security vulnerability
🟠 I Important — Feature partially broken or significant gap
🟡 M Moderate — Incorrect behavior in edge cases
🟢 P Polish — Code hygiene, unused code, minor UX
🔴 Critical Bugs (10)
C1 — activeMeetingId Never Set → 8 Features Broken
Files:
appStore.ts
,
AppLayout.tsx

No setActiveMeetingId action exists. Cascading failures:

handleStopRecording → meeting.stop never called → end_time/duration never saved
handlePauseRecording → returns immediately → pause is a no-op
executeBookmark → returns immediately → ⌘+Shift+B dead
toggle-recording stop path → dead code
DynamicIsland
→ useAudioStatus(null) → no audio visualization
MeetingListView
→ "Return to Meeting" banner never shows
Widget → never receives correct meeting context
handleQuickExport
→ only accesses selectedMeetingId fallback
C2 — Ask Your Meetings RAG Context Never Injected
Files:
AskMeetingsView.tsx
,
search.handlers.ts

search:semantic returns { data: { results: [...], query: '...' } } but the view checks searchResult.data.length > 0. .data is an object → .length is undefined → condition always false → LLM answers with zero meeting context. Entire RAG pipeline is dead.

Fix: searchResult.data.results?.length > 0, iterate .data.results

C3 — Double Audio Stop Race Condition
File:
AppLayout.tsx

handleStopRecording calls BOTH meeting.stop() (which internally calls audioPipeline.stopCapture()) AND
stopCapture()
from
useAudioSession
. Two stop commands → race condition or "not recording" error.

C4 — GDPR Deletion Gated Behind Paid Tier
File:
export.handlers.ts

export:deleteAllData checks features.cloudSync before allowing deletion. Free-tier users cannot delete their own data → violates GDPR Article 17.

C5 — 🔒 SECURITY: JWT Token Leaked in Billing Checkout URL
File:
billing.handler.ts

billing:openCheckout passes the JWT access token as a URL query parameter to shell.openExternal():

js
if (token) url.searchParams.set('token', token)
Token leaks via: browser history, server access logs, HTTP Referer headers, and shared links. Should use a short-lived auth code flow or POST-based token exchange instead.

C6 — Circular require() in 3 Files
Files:
note.handlers.ts
,
transcript.handlers.ts
,
window.handlers.ts

All three use require('../../../../electron/main') to import
getMainWindow()
. This creates circular dependencies with the main entry — on cold start,
getMainWindow()
may return undefined because main hasn't fully initialized.

C7 —
useDigest
and digest:generate Signature Mismatch
Files:
useDigest.ts
,
digest.handlers.ts

Hook calls digest.generate({ meetingId }) but handler expects { startDate, endDate, periodType }. PostMeetingDigest AI generation fails.

C8 —
deleteAllData
Deletes meetings Table Twice
File:
export.handlers.ts

DELETE FROM meetings runs twice in the cleanup chain — second one is redundant and wastes a transaction.

C9 — NoteEditor AI Expansion Inserts HTML as Plain Text
File:
NoteEditor.tsx

The insert-ai-text handler creates a paragraph node with the HTML string as literal text content:

js
editor.schema.nodeFromJSON({ type: 'paragraph', content: [{ type: 'text', text: html }] })
The
html
variable contains <div class="ai-expansion..."> — this renders as visible HTML tags in the editor instead of formatted content. Should use editor.commands.insertContent(html) instead.

C10 — DatabaseService.listMeetings Pagination Total Wrong After Tag Filter
File:
DatabaseService.ts

Tags are filtered post-query in JavaScript (L148-158), but total comes from a SQL COUNT(\*) before tag filtering (L139-145). This means total is higher than actual results → hasMore is wrong → pagination shows extra pages with zero items.

🟠 Important Issues (18)
I1 — Audio Pause/Resume Has No Backend
Files:
useAudioSession.ts
,
audio.handlers.ts

pauseCapture()
and
resumeCapture()
call IPC handlers that don't exist. UI shows "Paused" but audio continues.

I2 — 6 Audio Test Handlers Are Stubs
All return { success: false, error: "Not yet implemented" }.

I3 — Audio Device Enumeration Returns Hardcoded Values
enumerateAudioSources()
returns stubs, not real hardware.

I4 — Meeting Export Doesn't Save to Disk
Returns content string but never opens dialog.showSaveDialog().
handleQuickExport
shows success toast but data is discarded. Same issue with audit:export.

I5 — Recovery Phrase: Only 248 Words, No Recovery Handler
Wordlist is non-BIP39 (248 vs 2048 words). No auth:recoverWithPhrase handler exists.

I6 — Digest AI Parsing Uses Fragile Regex
Patterns like /^(?:Decision|Key Decision):\s*(.+)/i break if LLM uses •, *, markdown headers.

I7 — SharedArrayBuffer Missing Cross-Origin Headers
Audio pipeline uses SharedArrayBuffer without COOP/COEP headers.

I8 — shell:openExternal in Wrong Handler File
Located in
audio.handlers.ts
instead of a utility/shell handler.

I9 — Search Deduplication Loses Multi-Snippet Results
Deduplicated by meetingId — discards different cloud-semantic snippets from same meeting.

I10 — sync:login Creates Backend Without Cleanup
Repeated logins create orphaned PiyAPIBackend instances.

I11 — FTS Entity Data Persists After
deleteAllData
Ghost data in transcripts_fts, notes_fts, entities_fts still returns stale search results.
rebuildFtsIndexes()
only rebuilds transcripts_fts and notes_fts — skips entities_fts.

I12 — Widget Never Auto-Hidden When Recording Stops
File:
window.handlers.ts

Dead code: else if (!state.isRecording && widgetWindow.isVisible()) block has empty body — widget stays visible after recording ends.

I13 — BackgroundEmbeddingQueue.flush() Infinite Loop Risk
File:
BackgroundEmbeddingQueue.ts

If
processQueue()
fails at the batch level (L130-133), items are re-queued via this.queue.unshift(...batch).
flush()
keeps calling
processQueue()
while queue.length > 0 — if the error is persistent, flush spins forever, blocking the event loop.

I14 — 🔒 KeyStorageService.deleteAllKeys Doesn't Clear Current User
File:
KeyStorageService.ts

deleteAllKeys(userId)
removes all credentials for a user but does NOT call
clearCurrentUserId()
. After deletion,
getCurrentUserId()
still returns the deleted user's ID → phantom auth state.

I15 — 🔒
validateAccessToken
Uses === (Timing Attack)
File:
KeyStorageService.ts

storedToken === token comparison leaks token length via timing. Should use crypto.timingSafeEqual().

I16 — Batch-Delete CRUD Sync Queue Items Outside Transaction
Files:
notes.ts L198-206
,
transcripts.ts L287-295
,
entities.ts L268-276

All three deleteXxxByMeetingId functions delete rows THEN create sync queue items outside the delete operation. If a sync item creation fails, local deletions aren't propagated to cloud.

I17 — Highlights Never Sync to Cloud
File:
highlights.ts

createHighlight
and
deleteHighlight
never call
createSyncQueueItem()
. Bookmarks are local-only and lost if the user switches devices.

I18 — DatabaseService.getEntitiesByMeeting Ignores Type Filter
File:
DatabaseService.ts

getEntitiesByMeeting(meetingId: string, _types?: string[])
has \_types prefixed with _ (intentionally unused). Callers that pass types get unfiltered results.

🟡 Moderate Issues (14)
M1 —
isAuthenticated
Store State Unused
M2 — Meeting Export Time Format: toFixed(2) on epoch
M3 — Digest Topic Extraction: text.slice(0, 50) → sentence fragments
M4 — meeting_templates Table Unused (dead schema)
M5 — action_items Table is Write-Only (no list/update/delete)
M6 — useAppStore.getState() in Render-Adjacent Code (stale reads)
M7 —
MarkdownText
Parser Only Handles Bold + Code + Blockquote
M8 —
useTranscriptStream
Hard-Caps at 500 Live Chunks (silent eviction)
M9 — schema_version Created Twice (harmless via IF NOT EXISTS)
M10 — window.handlers Sets Up Maximize Events After 1s setTimeout (Race)
setTimeout(setupMaximizeEvents, 1000) — if main window isn't created within 1s, listener never attaches.

M11 — config/environment No NaN Validation for parseInt
parseInt(process.env.MAX_RECORDING_DURATION_MS || '0', 10) — if env var is "abc", value becomes NaN, breaking comparisons throughout the app.

M12 — CloudAccessManager.getCurrentUserId Returns First User Randomly
File:
CloudAccessManager.ts

Calls
getAllUsers()
and returns users[0]. If multiple users exist, tier/access checks may apply to the wrong user.

M13 —
PostMeetingDigest
Export Logs Success But No File Saved
File:
PostMeetingDigest.tsx

Logs res.data.filename and char count but never opens a save dialog or copies content. User clicks "MD" / "PDF" / "JSON" and nothing happens.

M14 —
createEntities
Does 2N SELECT Queries Inside Transaction
File:
entities.ts

Each entity is SELECT'd once for sync queue (L93) and once for return (L107) = O(2N) reads. For large entity batches (100+ entities per meeting), this is slow.

🟢 Polish Issues (14)

# Issue

P1 Mock data in production bundle
P2
SettingsView.tsx
is a placeholder
P3 Linux audio enumeration returns empty
P4 No automated tests (0 test files execute)
P5 console.log in production instead of Logger
P6 Tailwind-style classes in non-Tailwind project
P7 Missing error boundaries on lazy routes
P8 KnowledgeGraphView refetches on every isOnline toggle
P9 Chat history stored in localStorage (5MB limit)
P10
WeeklyDigestView
weekly start: Sunday vs Monday locale mismatch
P11 NewMeetingDialog rendered but never opened
P12 AISourceBadge always shows "edge" regardless of actual source
P13 handleQuickStart never sets recordingStartTime
P14 MeetingCard shows raw 0 for null duration
Priority Fix Order

# ID Fix Effort Impact

1 C1 Add setActiveMeetingId action; call in handleQuickStart/
handleStartMeeting
15 min Unblocks 8 features
2 C2 searchResult.data.results?.length in AskMeetingsView 5 min Fixes entire RAG pipeline
3 C5 Remove JWT from URL params; use POST-based token exchange 30 min Security fix
4 C3 Remove redundant
stopCapture()
from handleStopRecording 2 min Eliminates race
5 C4 Remove tier gate from
deleteAllData
5 min GDPR compliance
6 C9 Use editor.commands.insertContent(html) in NoteEditor 5 min Fixes AI expansion display
7 C10 Apply tag filter in SQL or fix the total count post-filter 10 min Fixes pagination
8 I1 Add audio:pauseCapture / audio:resumeCapture handlers 30 min Enables pause/resume
9 I4 Add dialog.showSaveDialog() to meeting + audit export 15 min Actually saves files
10 I12 Add widgetWindow.hide() inside the empty body 2 min Widget auto-hides
Scope: Line-by-line review of ALL 120+ source files across main + renderer Date: 2026-03-11 Methodology: Every .ts/.tsx file opened and audited: 22 IPC handlers, 7 CRUD modules, 15+ services, config, schema, migrations, setup, store, all renderer components, hooks, views, and utilities

Severity Legend
Tag Meaning
🔴 C Critical — Feature broken, data lost, or security vulnerability
🟠 I Important — Feature partially broken or significant gap
🟡 M Moderate — Incorrect behavior in edge cases
🟢 P Polish — Code hygiene, unused code, minor UX
🔴 Critical Bugs (12)
C1 — activeMeetingId Never Set → 8+ Features Broken
Files:
appStore.ts
,
AppLayout.tsx

appStore.ts
declares activeMeetingId: null (L100) but has no setter action. Cascading failures:

handleStopRecording → meeting.stop never called → end_time/duration never saved
handlePauseRecording → returns immediately (no-op)
executeBookmark → returns immediately (⌘+Shift+B dead)
DynamicIsland
→
useAudioStatus(null)
→ no audio visualization ever
MeetingListView
→ "Return to Meeting" banner never shows
Widget → never receives correct meeting context
handleQuickExport
→ only uses selectedMeetingId fallback
useSilentPrompter
→ AI coach gets no meeting context
C2 — Ask Your Meetings RAG Context Never Injected
Files:
AskMeetingsView.tsx
,
search.handlers.ts

search:semantic returns { data: { results: [...], query } } but view checks searchResult.data.length > 0. .data is an object → .length is undefined → always false → LLM answers with zero meeting context.

Fix: searchResult.data.results?.length > 0, iterate .data.results

C3 — Double Audio Stop Race Condition
File:
AppLayout.tsx

handleStopRecording calls BOTH meeting.stop() (which internally calls audioPipeline.stopCapture()) AND
stopCapture()
from
useAudioSession
. Two stop commands → race condition.

C4 — GDPR Deletion Gated Behind Paid Tier
File:
export.handlers.ts

export:deleteAllData checks features.cloudSync before allowing deletion. Free-tier users cannot delete their own data → violates GDPR Article 17.

C5 — 🔒 JWT Token Leaked in Billing Checkout URL
File:
billing.handler.ts

js
if (token) url.searchParams.set('token', token)
Token leaks via browser history, server logs, HTTP Referer headers. Should use POST-based token exchange.

C6 — Circular require() in 3 Files
Files:
note.handlers.ts
,
transcript.handlers.ts
,
window.handlers.ts

All use require('../../../../electron/main') → circular dependency.
getMainWindow()
may return undefined on cold start.

C7 —
useDigest
and digest:generate Signature Mismatch
Files:
useDigest.ts
,
digest.handlers.ts

Hook calls digest.generate({ meetingId }) but handler expects { startDate, endDate, periodType }. PostMeetingDigest AI generation fails.

C8 —
deleteAllData
Deletes meetings Table Twice
File:
export.handlers.ts

C9 — NoteEditor AI Expansion Inserts HTML as Plain Text
File:
NoteEditor.tsx

js
editor.schema.nodeFromJSON({ type: 'paragraph', content: [{ type: 'text', text: html }] })
Renders <div class="ai-expansion..."> as visible HTML tags. Should use editor.commands.insertContent(html).

C10 —
listMeetings
Pagination Total Wrong After Tag Filter
File:
DatabaseService.ts

Tags filtered post-query in JS, but total comes from SQL COUNT(\*) before filter → hasMore wrong → empty extra pages.

C11 —
useSilentPrompter
Type Mismatch → AI Coach Gets No Context
File:
useSilentPrompter.ts

Hook signature: transcripts: Array<{ text: string; startTime: number }> (camelCase) But transcript data from DB uses start_time (snake_case). .filter(t => t.startTime >= fiveMinAgo) always evaluates undefined >= number = false → AI coach never sends transcript context → all suggestions are hallucinated.

C12 —
useTranscriptStream
Produces Duplicate Segments
File:
useTranscriptStream.ts

When a live chunk gets persisted to DB, it appears in both historicalTranscripts (from query) and chunksRef (from IPC listener) → same segment rendered twice in TranscriptPanel until next query refetch.

🟠 Important Issues (22)
I1 — Audio Pause/Resume Has No Backend
pauseCapture()
and
resumeCapture()
call IPC handlers that don't exist. UI shows "Paused" but audio continues.

I2 — 6 Audio Test Handlers Are Stubs
All return { success: false, error: "Not yet implemented" }.

I3 — Audio Device Enumeration Returns Hardcoded Values
I4 — Meeting Export Doesn't Save to Disk
Returns content string but never opens dialog.showSaveDialog(). Same for audit:export.

I5 — Recovery Phrase: Only 248 Words, No Recovery Handler
Wordlist is non-BIP39. No auth:recoverWithPhrase handler exists.

I6 — Digest AI Parsing Uses Fragile Regex
I7 — SharedArrayBuffer Missing Cross-Origin Headers
I8 — shell:openExternal in Wrong Handler File
I9 — Search Deduplication Loses Multi-Snippet Results
I10 — sync:login Creates Backend Without Cleanup
I11 — FTS Entity Data Persists After
deleteAllData
rebuildFtsIndexes()
skips entities_fts.

I12 — Widget Never Auto-Hidden When Recording Stops
File:
window.handlers.ts

Dead code: else if (!state.isRecording && widgetWindow.isVisible()) block is empty.

I13 — BackgroundEmbeddingQueue.flush() Infinite Loop Risk
I14 — 🔒
deleteAllKeys
Doesn't Clear Current User → Phantom Auth
I15 — 🔒
validateAccessToken
Uses === (Timing Attack)
I16 — Batch-Delete CRUD Sync Queue Items Outside Transaction
I17 — Highlights Never Sync to Cloud
I18 —
getEntitiesByMeeting
Ignores \_types Filter Parameter
I19 — Pinned Moments Tab Always Empty
File:
MeetingDetailView.tsx

pinnedMoments={[]} is hardcoded. Even though highlights CRUD and IPC exist, the view never fetches bookmarks from DB → Pinned tab in PostMeetingDigest always shows "No bookmarked moments."

I20 —
EntitySidebar
Doesn't Re-fetch During Recording
File:
EntitySidebar.tsx

useEffect fetches entities once on mount. During active recording, new entities discovered mid-meeting are never shown until sidebar is closed and reopened.

I21 —
WidgetApp
Uses Hardcoded meetingId: 'current'
File:
WidgetApp.tsx

Widget stopCapture calls audio.stopCapture({ meetingId: 'current' }) — backend handler validates against actual database IDs, so this may silently fail.

I22 —
SettingsView
Fetches All Meetings for Count (limit: 999)
File:
SettingsView.tsx

meeting.list({ limit: 999 }) loads all meeting objects into memory just to count them. Should use a dedicated count query or total from paginated response.

🟡 Moderate Issues (18)

# Issue File

M1
isAuthenticated
store state unused appStore.ts
M2 Digest Topic: text.slice(0, 50) → sentence fragments digest.handlers.ts
M3 meeting_templates table unused (dead schema) schema.ts
M4 action_items table is write-only (no list/update) schema.ts
M5 useAppStore.getState() in render-adjacent code (stale reads) multiple
M6
MarkdownText
parser only handles bold + code + blockquote MarkdownText.tsx
M7
useTranscriptStream
hard-caps at 500 live chunks useTranscriptStream.ts
M8 schema_version created twice (harmless) schema.ts
M9 window.handlers uses 1s setTimeout for maximize events window.handlers.ts
M10 config/environment no NaN validation for parseInt environment.ts
M11 CloudAccessManager.getCurrentUserId returns users[0] CloudAccessManager.ts
M12
PostMeetingDigest
export logs success but no file saved PostMeetingDigest.tsx
M13
createEntities
does O(2N) SELECTs inside transaction entities.ts
M14 appStore.setLastSyncTimestamp(null) never clears localStorage appStore.ts L183-186
M15
CommandPalette
semantic search data shape may not match CommandPalette.tsx L177
M16
OnboardingFlow
fallback recovery phrase is static 12-word list OnboardingFlow.tsx L148-162
M17 Settings key validation: any arbitrary key can be written settings.handlers.ts
M18
ZenRail
L105 — userTier.charAt(0) crashes if undefined ZenRail.tsx
🟢 Polish Issues (16)

# Issue

P1 Mock data in production bundle
P2 Linux audio enumeration returns empty
P3 No automated tests (0 test files execute)
P4 console.log in production instead of Logger
P5 Tailwind-style utility classes in non-Tailwind project
P6 Missing error boundaries on lazy routes
P7
KnowledgeGraphView
refetches on every isOnline toggle
P8 Chat history stored in localStorage (5MB limit)
P9
WeeklyDigestView
Sunday vs Monday locale mismatch
P10 NewMeetingDialog rendered but never opened
P11 AISourceBadge always shows "edge"
P12 handleQuickStart never sets recordingStartTime
P13 MeetingCard shows raw 0 for null duration
P14
GraphCanvas
D3 sim recreated without debounce → flicker on rapid data changes
P15
SilentPrompter
component has onDismiss in useEffect deps (unstable callback risk)
P16
ErrorBoundary
L39 uses ipcRenderer.send('error',...) — channel may not be registered
Priority Fix Order

# ID Fix Effort Impact

1 C1 Add setActiveMeetingId action; call on start recording 15 min Unblocks 8+ features
2 C2 searchResult.data.results?.length in AskMeetingsView 5 min Fixes entire RAG pipeline
3 C11 Fix
useSilentPrompter
to use start_time from transcripts 5 min Fixes AI coach context
4 C12 Deduplicate by transcriptId in
useTranscriptStream
combine step 5 min Eliminates double segments
5 C5 Remove JWT from URL params; use POST-based token exchange 30 min Security fix
6 C3 Remove redundant
stopCapture()
from handleStopRecording 2 min Eliminates race
7 C4 Remove tier gate from
deleteAllData
5 min GDPR compliance
8 C9 Use editor.commands.insertContent(html) in NoteEditor 5 min Fixes AI expansion
9 C10 Apply tag filter in SQL or fix total post-filter 10 min Fixes pagination
10 I1 Add audio:pauseCapture / audio:resumeCapture handlers 30 min Enables pause/resume
11 I4 Add dialog.showSaveDialog() to meeting + audit export 15 min Actually saves files
12 I12 Add widgetWindow.hide() inside the empty body 2 min Widget auto-hides
13 I19 Fetch highlights for meeting, wire to pinnedMoments prop 15 min Enables Pinned tab
14 I20 Add polling/refetch interval to
EntitySidebar
during recording 10 min Live entity updates
