# BlueArkive Deep Code Audit — Issues & Findings

---

## 🔴 Critical

### 1. CSP wildcard `*.supabase.co` allows data exfiltration to any Supabase project
- **File:** `electron/main.ts:859`
- **Issue:** `connect-src 'self' https://*.supabase.co` permits connections to ANY Supabase project, not just yours. A compromised dependency could exfiltrate data to an attacker-controlled Supabase instance.
- **Fix:** Restrict to your specific project URL (e.g., `https://your-project-id.supabase.co`).

### 2. `before-quit` 5s timeout can corrupt SQLite WAL
- **File:** `electron/main.ts:1057-1060`
- **Issue:** `Promise.race` with a 5s deadline fires `app.exit(0)` even if async cleanup tasks (audio flush, ASR terminate, ONNX unload, embedding dispose) are still running. This can leave the WAL file in an inconsistent state, leak GPU memory, or truncate log writes.
- **Fix:** Increase timeout to 15s, or make each cleanup task individually timeout-guarded so the race only fires after all settle or timeout individually.

---

## 🟠 High

### 3. `keytar` falls back to INSECURE in-memory storage in production
- **File:** `src/main/services/KeyStorageService.ts:76-80`
- **Issue:** If the `keytar` native module fails to load (wrong arch, macOS Keychain dialog timeout), encryption keys and auth tokens are stored in a plain in-memory `Map`. The error is logged but the app continues.
- **Fix:** Block startup or require re-authentication when keytar is unavailable in production. Never fall back to in-memory for credential storage.

### 4. `AuthService` creates a null `SupabaseClient` when unconfigured
- **File:** `src/main/services/AuthService.ts:64-67`
- **Issue:** `this.supabase = null as unknown as SupabaseClient` — any code path that misses the `isConfigured()` guard will crash with a null dereference.
- **Fix:** Use a proper NullObject pattern or throw early in the constructor.

### 5. `CloudTranscriptionService` has unused import
- **File:** `src/main/services/CloudTranscriptionService.ts:12`
- **Issue:** `import { KeyStorageService as _KeyStorageService } from './KeyStorageService'` — imported but never used (aliased with `_` prefix).
- **Fix:** Remove the unused import.

---

## 🟡 Medium

### 6. Empty `.example` files pollute the tree
- **Files:**
  - `src/main/services/EncryptionService.example.ts`
  - `src/main/services/SyncManager.example.ts`
  - `src/main/services/TranscriptionIntegration.example.ts`
- **Issue:** Three files with zero bytes. Dead weight.
- **Fix:** Add actual example content or delete them.

### 7. `unicorn/` mock components ship to production
- **Files:**
  - `src/renderer/components/unicorn/AmbientThoughtBubble.tsx`
  - `src/renderer/components/unicorn/CollaboratorCursors.tsx`
- **Issue:** Both components use hardcoded mock data with `setInterval`. They are demo-only but will be bundled into production builds.
- **Fix:** Gate behind a `USE_MOCK_DATA` flag or remove from production bundle.

### 8. Race condition in `AppLayout.tsx` `startCapture` flow
- **File:** `src/renderer/components/layout/AppLayout.tsx:377-391`
- **Issue:** If `meetingId` changes or the component remounts while `startCapture` is in flight, the `.then()` callback calls `setRecordingState` on a stale meeting context.
- **Fix:** Use an `AbortController` or a mount guard ref.

### 9. Race condition in `useTranscriptStream` chunk listener
- **File:** `src/renderer/hooks/queries/useTranscriptStream.ts:48-77`
- **Issue:** The `meetingId` captured in the closure can become stale if meetings are rapidly stopped/started. Chunks from the old meeting could briefly be processed against the new meeting's state.
- **Fix:** Use a ref for `meetingId` and check it inside the callback.

### 10. `AudioIndicator` worker pool never terminates on app close
- **File:** `src/renderer/components/meeting/AudioIndicator.tsx:13-34`
- **Issue:** The module-level `workerPool` is never cleaned up. The worker continues running until the renderer process is killed.
- **Fix:** Add a cleanup hook or listen for `beforeunload`.

### 11. `YjsConflictResolver` documents lack app-close cleanup
- **File:** `src/main/services/YjsConflictResolver.ts:44-48`
- **Issue:** `Y.Doc` instances in the cache are never explicitly destroyed on quit. The owning `ConflictResolver` also lacks a cleanup method.
- **Fix:** Add a `destroy()` method and call it in `before-quit`.

### 12. `BackgroundEmbeddingQueue` not stopped in cleanup
- **File:** `src/main/services/BackgroundEmbeddingQueue.ts`
- **Issue:** The `before-quit` handler never calls `stop()` on the embedding queue. The `unref()` on the timer helps, but in-flight `processQueue()` calls may continue after the database is closed.
- **Fix:** Call `stop()` in the `before-quit` cleanup sequence.

### 13. `SyncStatusBadge` duplicates sync polling logic
- **Files:**
  - `src/renderer/components/ui/SyncStatusBadge.tsx`
  - `src/renderer/hooks/useSyncEngine.ts`
- **Issue:** Both independently poll `sync:getStatus` and listen to `syncEvent`. Redundant IPC calls.
- **Fix:** Have `SyncStatusBadge` read from the Zustand store populated by `useSyncEngine`.

### 14. `useWebhooks` logs query always returns empty array
- **File:** `src/renderer/hooks/queries/useWebhooks.ts:16-23`
- **Issue:** The `logs` query hardcodes `return []` with a comment saying "Delivery logs are per-webhook, not a global list."
- **Fix:** Either implement per-webhook log fetching or remove the dead query.

### 15. `useIPCCall` silently swallows errors when `errorMessage` is `null`
- **File:** `src/renderer/hooks/useIPCCall.ts:121`
- **Issue:** The condition `errorMessage !== null` means passing `{ errorMessage: null }` silently swallows ALL errors. The default is `undefined` (which works), but `null` creates a footgun.
- **Fix:** Change to `errorMessage !== undefined` or remove the null check.

---

## 🟢 Low

### 16. Scratch/temp files tracked in git root
- **Files:** `scratch.py`, `promt.md`, `scratch_proposal.md`
- **Issue:** One-off scripts and design notes pollute the repo root.
- **Fix:** Delete or move to a `scripts/` or `docs/` directory.

### 17. Non-app directories in repo root
- **Directories:** `landing-web/`, `billing-web/`, `cofounder/`, `ui/`, `poster2/`, `poster3/`
- **Issue:** These are separate concerns (landing page, billing page, product briefs, UX docs, poster designs) that inflate the repo and confuse tooling.
- **Fix:** Move to separate repos or a monorepo `packages/` directory.

### 18. `DatabaseService` is an unnecessary pass-through wrapper
- **File:** `src/main/services/DatabaseService.ts`
- **Issue:** Every method delegates directly to CRUD modules with no added business logic. Adds indirection without benefit.
- **Fix:** Either add actual business logic to justify the layer, or have callers use CRUD modules directly.

### 19. Duplicate `HardwareTier` type definitions
- **Files:**
  - `src/main/services/ModelManager.ts:20-25` (interface)
  - `src/main/services/ModelDownloadService.ts:18` (string union)
  - `src/main/services/HardwareTierService.ts:21` (string union)
- **Issue:** Three different definitions of the same concept.
- **Fix:** Consolidate into `src/types/`.

### 20. `OnboardingFlow.tsx` is 50,783 bytes
- **File:** `src/renderer/components/OnboardingFlow.tsx`
- **Issue:** A single massive component hurts maintainability and parse time.
- **Fix:** Split into sub-components (e.g., `LoginStep`, `RegisterStep`, `RecoveryStep`).

### 21. `WeeklyDigestView.tsx` is 45,163 bytes (1029 lines)
- **File:** `src/renderer/views/WeeklyDigestView.tsx`
- **Issue:** Same concern as OnboardingFlow — too large for a single file.
- **Fix:** Extract sub-components (e.g., `DigestSummary`, `ActionItemsList`, `ContradictionsPanel`).

### 22. `d3` namespace import in `GraphCanvas`
- **File:** `src/renderer/components/graph/GraphCanvas.tsx:4`
- **Issue:** `import * as d3 from 'd3'` pulls in ~200KB. Though code-split via `React.lazy`, tree-shaking could reduce the footprint.
- **Fix:** Import only needed modules (e.g., `d3-force`, `d3-selection`, `d3-zoom`).

### 23. `useTranscriptStream` re-renders every second during recording
- **File:** `src/renderer/hooks/queries/useTranscriptStream.ts:34-38`
- **Issue:** `renderTick` increments every 1s, causing `allTranscripts` useMemo to re-sort and re-render the entire transcript list even when no new chunks arrived.
- **Fix:** Only increment `renderTick` when new chunks actually arrive.

### 24. `CalendarService.parseICS` inconsistent optional chaining
- **File:** `src/main/services/CalendarService.ts:48-51`
- **Issue:** `blocks[i]?.split('END:VEVENT')[0]` — the `[0]` access is not guarded. Low risk but inconsistent with the optional chaining on `blocks[i]`.
- **Fix:** Use `blocks[i]?.split('END:VEVENT')?.[0]` for consistency.

---

## Summary

| Priority | Count |
|----------|-------|
| Critical | 2 |
| High | 3 |
| Medium | 10 |
| Low | 9 |
| **Total** | **24** |

---

# MeetingDetailView — Deep Analysis

> Full audit of `src/renderer/views/MeetingDetailView.tsx` and all child components, hooks, and services.

## Architecture

`MeetingDetailView` orchestrates 7 subsystems: `TranscriptPanel` + `useTranscriptStream` (live transcript with dual-buffer streaming), `NoteEditor` + `useNotes` (Tiptap + Yjs CRDT + IndexedDB + SQLite), `PostMeetingDigest` + `useDigest` (AI summary/actions/export), `EntitySidebar` (entity extraction), `SilentPrompter` + `useSilentPrompter` (AI coach every 2 min), `RecordingToolbar`, and `SplitPane` (resizable layout).

---

## 🔴 Critical

### 25. `isPostMeeting` conflates idle+selected with post-meeting state
- **File:** `src/renderer/views/MeetingDetailView.tsx:33-34`
- **Issue:** `isPostMeeting = recordingState === 'processing' || (recordingState === 'idle' && !!selectedMeetingId)` — the digest panel appears for ANY meeting viewed when idle, not just meetings that just finished. Combined with Issue #26, this triggers redundant AI generation on every navigation.
- **Fix:** Add a `meetingStatus` field to distinguish "just completed" from "viewing historical." Only show digest when `meetingStatus === 'completed'` or `recordingState === 'processing'`.

### 26. `useDigest` regenerates on every navigation — no cache check
- **File:** `src/renderer/hooks/useDigest.ts:77-81`
- **Issue:** Digest auto-generates on every `meetingId` change when `skip` is false. It never checks if a digest already exists in the DB. Navigating between meetings triggers redundant, expensive LLM calls.
- **Fix:** First query for an existing digest, only call `digest:generate` if none exists or user explicitly clicks "Regenerate."

---

## 🟠 High

### 27. `NoteEditor` mounts the Tiptap editor TWICE on every navigation
- **File:** `src/renderer/components/meeting/NoteEditor.tsx:30-43, 55-115`
- **Issue:** `useEditor` depends on `[providerOrDoc, meetingId]`. `providerOrDoc` starts `null`, set to Y.Doc only after `IndexeddbPersistence` fires `'synced'`. This causes: (1) editor created WITHOUT Collaboration, (2) provider syncs → state updates, (3) editor DESTROYED and RECREATED with Collaboration. Visible flash + double init cost.
- **Fix:** Wait for provider sync before creating the editor (single creation), or derive extensions array via `useMemo` for a stable editor instance.

### 28. `EntitySidebar` uses raw `useState`/`useEffect` instead of TanStack Query
- **File:** `src/renderer/components/meeting/EntitySidebar.tsx:24-62`
- **Issue:** Manual fetching with hand-rolled loading/error states. Every other data component uses TanStack Query. No caching, no stale-while-revalidate, manual `setInterval` polling instead of `refetchInterval`.
- **Fix:** Migrate to `useQuery({ queryKey: ['entities', meetingId], queryFn: ..., refetchInterval: isRecording ? 15_000 : false })`.

### 29. Linear/Notion/"Connect more tools" buttons are non-functional
- **File:** `src/renderer/components/meeting/PostMeetingDigest.tsx:246-317`
- **Issue:** Elaborate hover animations but no `onClick` handlers. False affordances — users click expecting integration setup and nothing happens.
- **Fix:** Wire to actual integration flows or hide behind a feature flag until implemented.

### 30. Title edit doesn't revert on save failure
- **File:** `src/renderer/views/MeetingDetailView.tsx:180-200`
- **Issue:** UI updates immediately on keystroke. Debounced save fires after 500ms. If save fails, toast appears but input still shows unsaved title. On reload, old title reappears — perceived data loss.
- **Fix:** Store last successfully saved title in a ref. On save failure, revert `editableTitle` to that ref value.

---

## 🟡 Medium

### 31. `segments` useMemo uses fragile `as unknown as Record<string, unknown>` casting
- **File:** `src/renderer/views/MeetingDetailView.tsx:124-138`
- **Issue:** Every transcript is cast through double-unknown then each field individually `String()`-wrapped. Symptom of `Transcript | TranscriptChunk` union lacking a shared interface. If field names change upstream, casts silently produce wrong values (e.g., every speaker becomes `'Unknown Speaker'`).
- **Fix:** Define a shared `BaseTranscript` interface with common fields (`id`, `text`, `start_time`, `speaker_name`), have both types extend it, use that for mapping.

### 32. `totalTranscriptChars` recomputes O(n) reduce on every transcript change
- **File:** `src/renderer/views/MeetingDetailView.tsx:142-149`
- **Issue:** During recording, transcripts arrive at ~50-100/min. `useMemo` runs `reduce` over the full array each time. At 500+ segments this becomes noticeable.
- **Fix:** Maintain a running counter ref incremented as chunks are added, avoiding the full reduce.

### 33. `NoteEditor` triple persistence creates reconciliation risk
- **File:** `src/renderer/components/meeting/NoteEditor.tsx:30-43, 88-112, 128-149`
- **Issue:** Content persists through Yjs CRDT → IndexedDB (y-indexeddb) → SQLite (debounced + 30s periodic). On reload, content restores from IndexedDB, NOT SQLite. If IndexedDB is cleared but SQLite has data, notes appear empty.
- **Fix:** On mount, check if SQLite has content AND IndexedDB is empty, then seed IndexedDB from SQLite. Or eliminate one persistence layer.

### 34. `NoteEditor` periodic save skips "cleared" documents
- **File:** `src/renderer/components/meeting/NoteEditor.tsx:132`
- **Issue:** `if (!ed || ed.isEmpty) return` — `isEmpty` returns `true` when document has no content. If user types notes then deletes everything, periodic save skips and old content remains in SQLite. The `lastSavedHtmlRef` dedup already handles redundant saves.
- **Fix:** Remove the `ed.isEmpty` check. The `lastSavedHtmlRef` comparison is sufficient.

### 35. `useSilentPrompter` 2-minute initial delay too long for short meetings
- **File:** `src/renderer/hooks/useSilentPrompter.ts:89`
- **Issue:** `setInterval(generateSuggestion, 2 * 60 * 1000)` — first suggestion fires after 2 full minutes. For 5-10 min meetings, only 1-2 suggestions appear.
- **Fix:** Fire first suggestion after 30-45s via `setTimeout`, then every 2 min via `setInterval`.

### 36. `useSilentPrompter` slices mid-word at 1000-char boundary
- **File:** `src/renderer/hooks/useSilentPrompter.ts:60`
- **Issue:** `recentText.slice(-1000)` can cut words in half, degrading AI suggestion quality with truncated tokens.
- **Fix:** Find the nearest space before position `recentText.length - 1000` and slice from there.

### 37. `PostMeetingDigest` export doesn't provide file access
- **File:** `src/renderer/components/meeting/PostMeetingDigest.tsx:41-77`
- **Issue:** After successful export, only a toast is shown. No "Open in Finder" or download trigger. User must manually locate the file.
- **Fix:** After export, provide a button to reveal file in Finder (`shell.showItemInFolder`) or trigger a save dialog.

### 38. `useTranscriptStream` phantom buffer has no memory cap
- **File:** `src/renderer/hooks/queries/useTranscriptStream.ts:63-66, 68-72`
- **Issue:** Only committed chunks capped at 500. Phantom (interim) chunks have no limit. If ASR produces many interim results without finalizing, phantom grows unbounded.
- **Fix:** Apply same 500-entry cap to phantom chunks, or evict entries older than 60s.

### 39. No error boundary scoped to MeetingDetailView
- **File:** `src/renderer/views/MeetingDetailView.tsx` (entire component)
- **Issue:** If any child (NoteEditor, TranscriptPanel, EntitySidebar) throws, the entire view unmounts. Only root `App.tsx` has an error boundary — a NoteEditor crash takes down transcript, digest, and everything.
- **Fix:** Wrap each major section in its own `ErrorBoundary` with a fallback UI.

### 40. `useDigest` `skip` parameter naming is misleading
- **File:** `src/renderer/hooks/useDigest.ts:15`
- **Issue:** Parameter named `skip` but called with `isAiLocked` (from `currentTier === 'free'`). Name doesn't convey it's a tier-based gate.
- **Fix:** Rename to `disabled` or `isLocked`, or derive lock state inside the hook from the tier.

---

## 🟢 Low

### 41. `pinnedMoments` uses `||` instead of `??` for numeric fallback
- **File:** `src/renderer/views/MeetingDetailView.tsx:80`
- **Issue:** `const sec = h.start_time || 0` — if `start_time` is `-1` or `NaN`, it silently becomes `0`. Nullish coalescing (`??`) would only fall back on `null`/`undefined`.
- **Fix:** Use `h.start_time ?? 0`.

### 42. `EntitySidebar` dual return pattern in useEffect is confusing
- **File:** `src/renderer/components/meeting/EntitySidebar.tsx:57-62`
- **Issue:** Returns `() => clearInterval(interval)` in recording branch, `return undefined` in non-recording branch. Both could simply return the cleanup.
- **Fix:** Unify to single return: `return () => clearInterval(interval)`.

### 43. `SplitPane` global event listeners not scoped to instance
- **File:** `src/renderer/components/ui/SplitPane.tsx:84-91`
- **Issue:** `pointerup`/`pointermove` added to `window` globally. If multiple SplitPanes coexist, all respond to same events.
- **Fix:** Check `e.target` is within owning container, or use a unique instance ID.

### 44. No empty state for meetings without transcripts
- **File:** `src/renderer/views/MeetingDetailView.tsx:158-164`
- **Issue:** Only empty states are "No Meeting ID selected" and "Loading...". When a meeting exists but has zero transcripts (recording failed), left panel shows empty TranscriptPanel with no guidance.
- **Fix:** Add: "No transcript available for this meeting. The recording may not have been saved."

### 45. `formatTimestamp` defined at module level but only used locally
- **File:** `src/renderer/views/MeetingDetailView.tsx:333-337`
- **Issue:** Pure utility outside component. Fine, but inconsistent — other utilities (e.g., `extractTimestamp` in `useDigest.ts`) are defined inside hooks.
- **Fix:** Move to shared `utils/format.ts` for consistency and testability.

---

## Performance Hot Paths

| Path | Frequency | Cost | Optimization |
|---|---|---|---|
| `segments` useMemo | Every transcript change (50-100/min) | O(n) map + double-cast | Shared interface, remove casts |
| `totalTranscriptChars` | Every transcript change | O(n) reduce | Running counter ref |
| `allTranscripts` useMemo | Every 1s tick + committed chunk | O(n) sort | Only sort on new arrival (see #23) |
| `useSilentPrompter` | Every 2 min | IPC + LLM | Already throttled |
| `EntitySidebar` poll | Every 15s during recording | IPC query | Migrate to TanStack Query |

---

## MeetingDetailView Summary

| Priority | Count |
|----------|-------|
| Critical | 2 |
| High | 4 |
| Medium | 10 |
| Low | 5 |
| **New Total** | **21** |

| Combined Total | Count |
|----------------|-------|
| Critical | 4 |
| High | 7 |
| Medium | 20 |
| Low | 14 |
| **Grand Total** | **45** |

---

# KnowledgeGraphView — Deep Analysis

> Full audit of `src/renderer/views/KnowledgeGraphView.tsx`, `src/renderer/components/graph/GraphCanvas.tsx`, and backend graph handlers.

## Architecture

`KnowledgeGraphView` renders a D3.js force-directed graph of meetings, people, topics, decisions, and actions. Data flows: `graph:get` IPC → `useState` → `GraphCanvas` (D3 simulation). Contradictions are fetched separately via `graph:getContradictions` and used only for red-glow highlighting. Tier gating happens server-side in `graph.handlers.ts` (free/starter get empty data, pro gets interactive).

---

## 🔴 Critical

### 46. `openMeeting` navigates with graph node ID instead of actual meeting ID
- **File:** `src/renderer/views/KnowledgeGraphView.tsx:63-65, 179-188`
- **Issue:** `openMeeting(selectedNode.id)` passes the graph node ID (e.g., `'gn-1'`) to `navigate('meeting-detail', id)`. The actual meeting ID is stored in `selectedNode.metadata.meetingId` (e.g., `'meet-001'`). Clicking "Open Meeting" in the sidebar navigates to a non-existent meeting — guaranteed broken navigation.
- **Fix:** Use `selectedNode.metadata?.meetingId` as the navigation target: `navigate('meeting-detail', selectedNode.metadata.meetingId)`.

### 47. `isLocked` hardcoded to `false` — entire lock UI path is dead code
- **File:** `src/renderer/views/KnowledgeGraphView.tsx:16, 28, 68-99`
- **Issue:** `const isLocked = false` with comment "Let backend tier gates handle it." The early return `if (isLocked) return` on line 28 and the full-page `ProTeaseOverlay` UI on lines 68-99 will NEVER execute. The backend does gate the data (returns empty for free/starter), but the frontend lock UI — with its upgrade CTA — is completely dead. Free/starter users see an empty graph with no explanation.
- **Fix:** Either remove the dead lock UI code, or wire `isLocked` to actual tier state (e.g., `currentTier === 'free' || currentTier === 'starter'`).

### 47b. `graph:get` returns `blocked: true` but frontend never checks it
- **File:** `src/main/ipc/handlers/graph.handlers.ts:16-27` and `src/renderer/views/KnowledgeGraphView.tsx:39-40`
- **Issue:** When tier access is denied, the backend returns `{ nodes: [], edges: [], blocked: true, reason: 'Knowledge Graph requires Starter or Pro plan' }`. The frontend checks `graphRes.success && graphRes.data` — since `data` is a truthy object (even with empty arrays), it sets `graphData` to this blocked response. The `blocked` flag and `reason` message are never read. Free users see "Cognitive Void" empty state instead of the tier-gate message.
- **Fix:** Check `graphRes.data.blocked` and display the `reason` message with an upgrade CTA instead of the generic empty state.

---

## 🟠 High

### 48. Raw `useState`/`useEffect` instead of TanStack Query
- **File:** `src/renderer/views/KnowledgeGraphView.tsx:20-56`
- **Issue:** Graph data fetching uses manual `useState` + `useEffect` with hand-rolled loading/error states. Every other data component uses TanStack Query. No caching, no stale-while-revalidate, no background refetch. The effect depends only on `[isLocked]` (which never changes), so graph data NEVER refreshes after initial mount — even after recording new meetings.
- **Fix:** Migrate to `useQuery({ queryKey: ['graph'], queryFn: ..., staleTime: 30_000 })`. Add a refresh button that calls `queryClient.invalidateQueries({ queryKey: ['graph'] })`.

### 49. No refresh mechanism — graph data is stale after mount
- **File:** `src/renderer/views/KnowledgeGraphView.tsx:56`
- **Issue:** `useEffect` dependency array is `[isLocked]` only. Since `isLocked` is hardcoded `false`, the effect fires once on mount and never again. If the user records new meetings, switches namespaces, or wants updated contradictions, they must navigate away and back.
- **Fix:** Add a "Refresh" button in the header, or use TanStack Query with `refetchInterval` / `staleTime`.

### 50. Contradictions are fetched but never displayed to the user
- **File:** `src/renderer/views/KnowledgeGraphView.tsx:21, 33-34, 138`
- **Issue:** `contradictions` state is fetched and passed to `GraphCanvas` for red-glow highlighting on nodes, but there is NO contradictions list, panel, or summary for users to review. The backend detects decision changes across meetings — valuable intelligence that's completely invisible.
- **Fix:** Add a "Contradictions" tab or panel in the sidebar showing `statement1` vs `statement2` with meeting links and confidence scores.

### 51. `GraphCanvas` never responds to container resize
- **File:** `src/renderer/components/graph/GraphCanvas.tsx:50-51, 80`
- **Issue:** `width` and `height` are read from `containerRef.current.clientWidth/clientHeight` on mount. The `forceCenter` is set to `(width/2, height/2)`. If the user resizes the window or the sidebar opens/closes, the force center remains at the old dimensions — the graph drifts off-center.
- **Fix:** Add a `ResizeObserver` on the container that updates dimensions and re-centers the simulation.

### 51b. `handleNodeClick` not wrapped in `useCallback` — causes D3 simulation to recreate on EVERY render
- **File:** `src/renderer/views/KnowledgeGraphView.tsx:58-60` and `src/renderer/components/graph/GraphCanvas.tsx:279`
- **Issue:** `handleNodeClick` is a plain function defined inline, creating a new reference every render. `GraphCanvas`'s `useEffect` has `onNodeClick` in its dependency array (line 279). This means the ENTIRE D3 simulation (force layout, SVG elements, zoom, drag handlers) is destroyed and recreated on every single render of KnowledgeGraphView — not just when data changes. This is a severe performance bug causing jank and CPU waste.
- **Fix:** Wrap `handleNodeClick` in `useCallback`: `const handleNodeClick = useCallback((node: GraphNode) => { setSelectedNode(node) }, [])`.

### 51c. Zoom/pan state is lost when D3 simulation recreates
- **File:** `src/renderer/components/graph/GraphCanvas.tsx:96-103, 279`
- **Issue:** When the effect re-runs (due to any dependency change, including the `onNodeClick` reference change from #51b), a new zoom behavior is created and applied to the SVG. The user's current zoom level and pan position are reset to default. Combined with #51b, this means zoom resets on every render.
- **Fix:** Store and restore the zoom transform across simulation recreations, or stabilize dependencies so the effect doesn't re-run unnecessarily.

### 51d. `nodes.length === 0` early return leaks previous graph — stale data remains visible
- **File:** `src/renderer/components/graph/GraphCanvas.tsx:42`
- **Issue:** `if (nodes.length === 0) return` — when nodes become empty (e.g., data refresh returns empty, or tier downgrade), the effect returns early WITHOUT cleaning up the previous simulation or removing old SVG elements. The previous graph remains rendered with stale data. The user sees old nodes/edges that no longer exist.
- **Fix:** Always clean up the previous simulation and SVG content before the early return: move the cleanup above the guard clause.

### 51e. `ZenRail` never locks Knowledge Graph — free users navigate to broken empty graph
- **File:** `src/renderer/components/layout/ZenRail.tsx:34-46, 69-78`
- **Issue:** `isViewLocked('knowledge-graph')` returns `false` for ALL tiers. The comment says "Free: KG is read-only (allowed)". But the backend returns `{ nodes: [], edges: [], blocked: true }` for free users. So free users CAN navigate to the KG but see an empty graph with the misleading "Cognitive Void" message instead of a tier-gate. Unlike `weekly-digest` and `ask-meetings`, there's NO lock icon on the KG button to indicate limited functionality.
- **Fix:** Either lock KG for free users in the rail (with lock icon), or implement a proper tier-gate UI in KnowledgeGraphView that reads the `blocked` flag.

---

## 🟡 Medium

### 52. `GraphCanvas`: `d3Nodes` shallow copy shares `metadata` object reference
- **File:** `src/renderer/components/graph/GraphCanvas.tsx:59`
- **Issue:** `nodes.map(n => ({ ...n, radius: getRadius(n.type) }))` — `metadata` is an object, so the shallow copy shares the same reference with React state. If D3 or any mutation touches `metadata`, it silently corrupts React state.
- **Fix:** Deep-clone metadata: `metadata: { ...n.metadata }`.

### 53. `GraphCanvas`: `getGradientId` has misleading `includes` array
- **File:** `src/renderer/components/graph/GraphCanvas.tsx:158-164`
- **Issue:** `action_item` is explicitly handled on line 159 mapping to `grad-action`. But the `includes` check on line 160 lists `['meeting', 'person', 'topic', 'decision', 'action']` — missing `action_item`. The explicit check saves it, but the `includes` array is misleading and a future refactor could break `action_item` nodes.
- **Fix:** Add `'action_item'` to the `includes` array, or use a single lookup map.

### 54. `GraphCanvas`: drag handlers redefined on every render
- **File:** `src/renderer/components/graph/GraphCanvas.tsx:260-273`
- **Issue:** `dragstarted`, `dragged`, `dragended` are defined inside `useEffect` and recreated on every dependency change. D3's `.call(d3.drag()...)` stores references to these handlers. When the effect re-runs, old handlers remain bound to the old simulation while new handlers bind to the new one — potential for stale closures.
- **Fix:** Define drag handlers outside `useEffect` using refs for the simulation reference.

### 55. `GraphCanvas`: marker IDs are global — collisions with multiple instances
- **File:** `src/renderer/components/graph/GraphCanvas.tsx:111, 125`
- **Issue:** Marker IDs `'arrow'` and `'arrow-contradicts'` are hardcoded. If two `GraphCanvas` instances ever coexist (e.g., in a split view), the second instance's markers overwrite the first's in the SVG `defs` — both graphs render with the wrong arrows.
- **Fix:** Use unique IDs per instance (e.g., `useId()` or a counter ref).

### 56. `GraphCanvas`: `label` text elements lack `text-anchor` — long labels overflow
- **File:** `src/renderer/components/graph/GraphCanvas.tsx:233-245`
- **Issue:** Labels use `dx=15, dy=4` with default `text-anchor='start'`. Long labels (e.g., "Sprint 23 Retrospective") extend far to the right, potentially overflowing the SVG viewport or overlapping other nodes.
- **Fix:** Add `text-anchor='middle'` or truncate labels with ellipsis at a max character count.

### 57. `GraphCanvas`: `d3.color(color)?.brighter(0.8)` can produce washed-out colors
- **File:** `src/renderer/components/graph/GraphCanvas.tsx:147`
- **Issue:** `brighter(0.8)` on already-bright colors can produce near-white gradients, making nodes invisible against light backgrounds. The fallback `|| color` handles null but not the washed-out case.
- **Fix:** Clamp the brightness or use a fixed lighter shade from a predefined palette.

### 58. No search/filter UI despite backend support
- **File:** `src/renderer/views/KnowledgeGraphView.tsx` (missing feature)
- **Issue:** The IPC API supports `graph:search` (text search across nodes) and `graph:traverse` (explore from a node). Neither is exposed in the UI. Users with large graphs have no way to find specific nodes.
- **Fix:** Add a search bar in the header that calls `graph:search` and highlights/centers matching nodes.

### 59. `GraphCanvas`: TypeScript cast `as unknown as` for D3 drag types
- **File:** `src/renderer/components/graph/GraphCanvas.tsx:206-209`
- **Issue:** `as unknown as (sel: d3.Selection<...>) => void` works around D3 type mismatches. Fragile — if D3 types change upstream, this silently breaks.
- **Fix:** Use proper D3 type generics or a typed wrapper function.

### 59b. `graph:search` mock returns wrong shape — `{ nodes }` instead of `{ results }`
- **File:** `src/renderer/mockElectronAPI.ts:994`
- **Issue:** `search: async () => delayed({ nodes: MOCK_GRAPH.nodes.slice(0, 3) })` — returns `{ nodes }` but the IPC type expects `IPCResponse<{ results: GraphNode[] }>`. The mock shape doesn't match the type contract. Any code consuming `graph:search` results in mock mode will fail.
- **Fix:** Change to `delayed({ results: MOCK_GRAPH.nodes.slice(0, 3) })`.

### 59c. `graph:traverse` and `graph:search` mocks ignore all parameters
- **File:** `src/renderer/mockElectronAPI.ts:992-994`
- **Issue:** `traverse` ignores `nodeId` — always returns first 5 nodes. `search` ignores `query` — always returns first 3 nodes. Makes mock-mode testing of these features impossible.
- **Fix:** Implement basic param-aware logic: filter by `nodeId` for traverse, filter by `query` substring match for search.

### 59d. `graph:get` response includes `interactive` flag that frontend never uses
- **File:** `src/main/ipc/handlers/graph.handlers.ts:41, 56` and `src/renderer/views/KnowledgeGraphView.tsx`
- **Issue:** Backend returns `interactive: features.knowledgeGraphInteractive` in the graph data. The frontend never reads this flag. It could gate drag/zoom/click behaviors for Starter users (read-only view).
- **Fix:** Read `graphData.interactive` and conditionally disable drag, node click, and zoom for non-interactive tiers.

### 59e. Contradictions fetch failure is silently swallowed
- **File:** `src/renderer/views/KnowledgeGraphView.tsx:45-47`
- **Issue:** If `graph:getContradictions` fails (returns `success: false`), the error is silently ignored. The graph renders without contradiction highlighting and the user never knows data is missing.
- **Fix:** Add an `else` branch to log the error or show a non-blocking warning toast.

### 59f. `IBackendProvider.GraphEdge` has no `id` field — mismatch with IPC `GraphEdge`
- **File:** `src/main/services/backend/IBackendProvider.ts:79-85` vs `src/types/ipc.ts:573-588`
- **Issue:** Backend `GraphEdge` has `{ source, target, type, weight, metadata }` — no `id`. IPC `GraphEdge` requires `id: string`. The backend returns edges without IDs, but the IPC contract expects them. The `graph.handlers.ts` passes backend data directly to the frontend without adding IDs.
- **Fix:** Either add `id` to `IBackendProvider.GraphEdge`, or generate IDs in `graph.handlers.ts` when transforming the response.

### 59g. `IBackendProvider.GraphEdge.type` is narrower than IPC `GraphEdge.type`
- **File:** `src/main/services/backend/IBackendProvider.ts:82` vs `src/types/ipc.ts:577-586`
- **Issue:** Backend edge types: `'follows' | 'references' | 'contradicts' | 'related_to' | 'groups' | string`. IPC edge types: `'follows' | 'references' | 'contradicts' | 'supersedes' | 'supports' | 'questions' | 'implements' | 'parent'`. The IPC type has `supersedes`, `questions`, `implements`, `parent` that the backend doesn't define. The backend has `related_to`, `groups` that IPC doesn't define. Data mismatch at the contract boundary.
- **Fix:** Align the two type definitions. The IPC type should be the superset since it's the public contract.

### 59h. `GraphCanvas` only highlights `'contradicts'` edges — `'supersedes'` contradictions are invisible
- **File:** `src/renderer/components/graph/GraphCanvas.tsx:179, 182, 184-186`
- **Issue:** Red styling (stroke, dasharray, glow, arrow marker) is only applied when `d.type === 'contradicts'`. But `Contradiction.type` can also be `'supersedes'` (ipc.ts:604). Superseded decisions won't get red highlighting on the graph, making them invisible to users.
- **Fix:** Check for both: `d.type === 'contradicts' || d.type === 'supersedes'`.

### 59i. `MockBackend.getGraph` always returns empty — graph UI untestable in dev mode
- **File:** `src/main/services/backend/MockBackend.ts:112-113`
- **Issue:** `return { nodes: [], edges: [] }` — the mock backend never returns graph data. The `MOCK_GRAPH` data in `mockElectronAPI.ts` is only used by the renderer-side mock API, not the main-process MockBackend. Developers running with `MockBackend` can never test the graph visualization.
- **Fix:** Have `MockBackend.getGraph` return mock data (import from shared mock data or generate programmatically).

### 59j. `PiyAPIBackend.getGraph` has zero response validation
- **File:** `src/main/services/backend/PiyAPIBackend.ts:482-483`
- **Issue:** `const data = await response.json(); return data` — no validation that the response matches `GraphData` shape. If PiyAPI changes its response format or returns an error object with 200 status, the frontend receives garbage data that may crash GraphCanvas.
- **Fix:** Validate the response shape with a type guard or Zod schema before returning.

### 59k. `currentTier` selector causes unnecessary re-renders — only used in dead code
- **File:** `src/renderer/views/KnowledgeGraphView.tsx:13, 90`
- **Issue:** `const currentTier = useAppStore(s => s.currentTier)` subscribes to tier changes, causing re-renders on every tier update. But `currentTier` is ONLY used in the dead `isLocked` block (line 90, which never renders). Unnecessary subscription.
- **Fix:** Remove the selector or move it inside the dead block so it's only evaluated when needed.

---

## 🟢 Low

### 60. `handleNodeClick` doesn't support toggle (click again to deselect)
- **File:** `src/renderer/views/KnowledgeGraphView.tsx:58-60`
- **Issue:** Clicking a node opens the sidebar. Clicking the same node again does nothing — the sidebar stays open. Users must click the ✕ button to close.
- **Fix:** `if (selectedNode?.id === node.id) { setSelectedNode(null); return; }`.

### 61. `graphData` state typed as `null` but conditional only checks truthiness
- **File:** `src/renderer/views/KnowledgeGraphView.tsx:20, 133`
- **Issue:** `graphData` is `GraphData | null`. The check `graphData ?` on line 133 correctly guards against `null`, but if the backend returns `{ nodes: [], edges: [] }` (empty graph), the GraphCanvas renders with zero nodes — which is handled by the EmptyState overlay on line 141. This is correct but the dual empty-check pattern (line 133 + line 141) is redundant.
- **Fix:** Consolidate: if `!graphData || graphData.nodes.length === 0`, show EmptyState directly.

### 62. `graph-offline-badge` shown but offline graph still works locally
- **File:** `src/renderer/views/KnowledgeGraphView.tsx:117`
- **Issue:** The "Offline Mode" badge appears when `!isOnline`, but the graph handler returns empty data when offline (line 27-43 in `graph.handlers.ts`). The badge implies offline functionality exists, but the graph is actually empty.
- **Fix:** Either implement local graph computation for offline mode, or hide the graph entirely when offline with a clear message.

### 63. `GraphCanvas`: `contradictionMeetingIds` Set rebuilt inside useEffect body
- **File:** `src/renderer/components/graph/GraphCanvas.tsx:63-67`
- **Issue:** The Set is computed inside the effect, which is correct since it depends on `contradictions`. But it could be extracted to a `useMemo` outside for clarity.
- **Fix:** Move to `useMemo` before the effect: `const contradictionMeetingIds = useMemo(() => {...}, [contradictions])`.

### 64. Empty graph state has no action button
- **File:** `src/renderer/views/KnowledgeGraphView.tsx:141-151`
- **Issue:** The "Cognitive Void" `EmptyState` has no `action` prop — no "Record a Meeting" or "Refresh" button. Users must navigate away via the sidebar to record.
- **Fix:** Add `action={<Button onClick={() => navigate('meeting-list')}>Record a Meeting</Button>}`.

### 65. `graph:contradictionPreview` handler exists but is never called from UI
- **File:** `src/main/ipc/handlers/graph.handlers.ts:316-362`
- **Issue:** The backend has a `contradictionPreview` handler returning a count for Starter users (e.g., "3 decisions changed this week — 🔓 Pro"). The frontend never calls it. This is a missed upsell opportunity.
- **Fix:** Call `contradictionPreview` on mount and show a banner/badge with the count and upgrade CTA for non-Pro users.

### 66. `ProTeaseOverlay` focus trap is overly aggressive — blocks screen readers
- **File:** `src/renderer/components/ui/ProTeaseOverlay.tsx:30-34`
- **Issue:** Tab key is unconditionally prevented and focus forced back to the upgrade button. Keyboard users and screen reader users cannot access any other content on the page — they're trapped with no way to read context.
- **Fix:** Only trap focus within the dialog itself, not the entire page. Allow tabbing between dialog elements. If there's only one focusable element, trapping is fine but document it.

### 67. `ProTeaseOverlay` Escape navigates away without warning
- **File:** `src/renderer/components/ui/ProTeaseOverlay.tsx:26-28`
- **Issue:** Pressing Escape immediately calls `navigate('meeting-list')`. An accidental Escape press loses the user's context with no confirmation.
- **Fix:** Either do nothing on Escape (user must click the button), or show a confirmation dialog.

### 68. `d3Edges` shallow copy also shares `metadata` reference
- **File:** `src/renderer/components/graph/GraphCanvas.tsx:60`
- **Issue:** Same as #52 but for edges: `edges.map(e => ({ ...e }))` — `metadata` object reference is shared with React state.
- **Fix:** Deep-clone metadata: `metadata: { ...e.metadata }`.

### 69. `GraphCanvas`: `getRadius` returns same radius (6) for person, decision, action — no visual distinction
- **File:** `src/renderer/components/graph/GraphCanvas.tsx:20-29`
- **Issue:** Only `meeting` (12) and `topic` (10) get distinct radii. `person`, `decision`, `action`, `action_item` all get 6. Person nodes (key entities) are visually indistinguishable from minor action nodes.
- **Fix:** Add distinct radii: `person: 11`, `decision: 9`, `action: 8`, `action_item: 7`.

### 70. `GraphCanvas`: `drop-shadow` CSS filter in SVG `filter` attribute — cross-browser risk
- **File:** `src/renderer/components/graph/GraphCanvas.tsx:218`
- **Issue:** `attr('filter', 'drop-shadow(0 4px 8px rgba(0,0,0,0.5))')` — uses CSS `drop-shadow()` in an SVG `filter` attribute. This is non-standard and may not render correctly in all browsers/Electron versions. SVG filters should use SVG filter primitives (`feDropShadow`, `feGaussianBlur`, etc.).
- **Fix:** Define an SVG filter in `<defs>` for the hover glow effect, similar to the `red-glow` filter.

### 71. `GraphCanvas`: `font-family` uses CSS custom property — may not resolve in SVG
- **File:** `src/renderer/components/graph/GraphCanvas.tsx:241`
- **Issue:** `attr('font-family', 'var(--font-body), system-ui, sans-serif')` — CSS `var()` in SVG `font-family` attribute has inconsistent browser support. The fallback `system-ui, sans-serif` helps but the `var()` itself may cause the entire value to be ignored.
- **Fix:** Use a hardcoded font stack: `'Inter, system-ui, -apple-system, sans-serif'`.

### 72. `GraphCanvas`: labels have no truncation or collision avoidance
- **File:** `src/renderer/components/graph/GraphCanvas.tsx:233-245`
- **Issue:** Labels at `dx=15` from node center can overlap with adjacent nodes' labels. Long labels like "Sprint 23 Retrospective" extend far right. No truncation, no collision detection.
- **Fix:** Truncate labels at ~20 chars with ellipsis, or implement basic label collision avoidance in the tick handler.

---

## Performance Hot Paths

| Path | Frequency | Cost | Optimization |
|---|---|---|---|
| D3 force simulation | On mount + data change | O(n²) per tick until alphaMin | Already has `alphaMin(0.01)`, good |
| `contradictionMeetingIds` Set | Every render | O(c) where c = contradictions | Move to useMemo |
| `nodes.map` shallow copy | Every data change | O(n) | Already minimal |
| Graph data fetch | Once on mount | IPC + network | Migrate to TanStack Query with staleTime |

---

## KnowledgeGraphView Summary

| Priority | Count |
|----------|-------|
| Critical | 3 |
| High | 8 |
| Medium | 19 |
| Low | 13 |
| **New Total** | **43** |

| Combined Total | Count |
|----------------|-------|
| Critical | 7 |
| High | 15 |
| Medium | 39 |
| Low | 27 |
| **Grand Total** | **88** |