# PiyNotes — Feature Branch Blueprint

> **Research scope**: 25+ source files (12,000+ lines), 22 PiyAPI cloud methods mapped, live KG stats queried, competitive analysis of Otter.ai / Fireflies.ai / Granola.ai. Every suggestion links to exact source code.

---

## Table of Contents

1. [Infrastructure Audit](#1-infrastructure-audit)
2. [Dual-Path Architecture: Free (Local) vs Paid (PiyAPI)](#2-dual-path-architecture)
3. [PiyAPI Cloud Surface — Complete Method Catalog](#3-piyapi-cloud-surface)
4. [Feature 26 — Action Items Pipeline](#4-action-items-pipeline)
5. [Feature 27 — Sentiment Analysis](#5-sentiment-analysis)
6. [Feature 25 — Calendar Integration](#6-calendar-integration)
7. [Feature 28 — Webhooks / Zapier](#7-webhooks--zapier)
8. [Cross-Feature Infrastructure Changes](#8-cross-feature-infrastructure-changes)
9. [Unified Tier Feature Matrix (40+ rows)](#9-unified-tier-feature-matrix)
10. [Competitive Intelligence](#10-competitive-intelligence)
11. [Sprint Roadmap](#11-sprint-roadmap)

---

## 1. Infrastructure Audit

### Files Analyzed

| File                           | Lines | Key Findings                                                                                     |
| :----------------------------- | ----: | :----------------------------------------------------------------------------------------------- |
| `LocalEntityExtractor.ts`      |   107 | ACTION_ITEM regex L28 — English-only (`need to\|should\|must\|will`), 0.65 confidence            |
| `AudioPipelineService.ts`      |   756 | `processAccumulatedChunk()` L234 = real-time hook; `stopCapture()` L453 = post-meeting trigger   |
| `ModelManager.ts`              |   450 | `generate()` L248 with session pool; Qwen 2.5 3B (16GB+) or 1.5B (8GB); idle unload 30-120s      |
| `digest.handlers.ts`           |   606 | **Action items already persisted L379-401!** Cloud AI extracts via regex L244-273                |
| `intelligence.handlers.ts`     |   393 | `meetingSuggestion` L131 supports 4 prompt modes including `action`                              |
| `meeting.handlers.ts`          |   451 | `meeting:stop` L132 calls `stopCapture()` — webhook trigger point                                |
| `AuthService.ts`               |   733 | Google OAuth L407 uses `bluearkive://auth/callback` deep link — reusable for Calendar scope      |
| `CloudTranscriptionService.ts` |   439 | Deepgram WebSocket L233 with auto-reconnect — architecture template for webhook dispatch         |
| `MeetingDetailView.tsx`        |   332 | **No Action Items tab** — only TranscriptPanel + NoteEditor + PostMeetingDigest                  |
| `WeeklyDigestView.tsx`         |  1039 | Already renders action items with status badges L598-660 — reusable component pattern            |
| `TierMappingService.ts`        |   255 | 5 tiers: Free→Starter($9)→Pro($19)→Team($15/user)→Enterprise                                     |
| `CloudAccessManager.ts`        |   361 | `FeatureAccess` L41 has 17 flags — **none for action items, sentiment, webhooks, calendar**      |
| `SyncManager.ts`               |   755 | ALLOWED_TABLES L41: `meetings, transcripts, notes, entities, audio_highlights` — **must extend** |
| `environment.ts`               |   168 | Feature flags L84 — needs new flags for all 4 features                                           |
| `PiyAPIBackend.ts`             |  1090 | 22 cloud methods across 6 capabilities                                                           |
| `BackendSingleton.ts`          |    39 | Singleton factory: `getBackend()` / `setBackendToken()`                                          |
| `piyapi.handlers.ts`           |   186 | 6 PiyAPI IPC channels: feedback, fuzzySearch, deduplicate, pinMemory, getClusters, getContext    |

### CRUD Modules — What Exists vs What's Needed

| Module                    | Status                             |
| :------------------------ | :--------------------------------- |
| `meetings.ts`             | ✅ Exists                          |
| `transcripts.ts`          | ✅ Exists                          |
| `notes.ts`                | ✅ Exists                          |
| `entities.ts`             | ✅ Exists                          |
| `highlights.ts`           | ✅ Exists                          |
| `sync-queue.ts`           | ✅ Exists                          |
| `encryption-keys.ts`      | ✅ Exists                          |
| **`action-items.ts`**     | ❌ Missing — needed for Feature 26 |
| **`calendar-events.ts`**  | ❌ Missing — needed for Feature 25 |
| **`sentiment-scores.ts`** | ❌ Missing — needed for Feature 27 |
| **`webhooks.ts`**         | ❌ Missing — needed for Feature 28 |

### Hooks — What Exists vs What's Needed

17 hooks exist. Missing:

| Hook                 | Feature | Pattern                              |
| :------------------- | :------ | :----------------------------------- |
| **`useActionItems`** | 26      | Follow `useDigest` pattern           |
| **`useSentiment`**   | 27      | Follow `useSilentPrompter` pattern   |
| **`useCalendar`**    | 25      | Follow `useSyncEngine` pattern       |
| **`useWebhooks`**    | 28      | Follow `useTranscriptStream` pattern |

---

## 2. Dual-Path Architecture

Every feature runs through a **5-step cloud access decision tree** in `CloudAccessManager.getCloudAccessStatus()`:

```
1. isLoggedIn?     → No = local-only (reason: not_logged_in)
2. tier == 'free'? → Yes = local-only (reason: free_tier)
3. isOnline?       → No = local-only (reason: offline) — graceful degradation
4. hasValidToken?  → No = local-only (reason: token_expired)
5. All pass?       → ✅ Cloud access available
```

Two resolution modes:

```typescript
const hasCloud = limits.cloudSync && status.hasAccess // Requires: paid + online + token
const hasCloudAI = limits.cloudAI && status.hasAccess // Same + cloudAI tier flag
```

### Existing Dual-Path Patterns

**Pattern 1 — Cloud-First, Local Fallback** (`intelligence:askMeetings`):

```
1. Check CloudAccessManager.hasCloudAccess()
2. If cloud + quota → backend.ask() → stream response
3. If no cloud OR quota exhausted → ModelManager.generate() locally
4. Both paths use identical event.sender.send('intelligence:streamToken')
```

**Pattern 2 — Local-Only with Cloud Enrichment** (`digest:generate`):

```
1. ALWAYS use local ModelManager.generate() for summary (works offline)
2. IF tier >= Pro AND cloud available →
   a. backend.ask() for enhanced summary
   b. backend.ask() for key decisions
   c. backend.ask() for KG contradictions
3. Merge local + cloud results
```

### Design Principle

> **The local path is NEVER degraded by adding cloud features.** Free users get the same local capabilities as paid users. Cloud only ADDS — never replaces. If cloud is unavailable, paid users gracefully fall back to the free-tier local path.

### Data Flow — How Data Reaches PiyAPI Cloud

```
IPC Handler → SQLite CRUD
                ↓
         SyncManager.queueEvent('create', '<table>', recordId, payload)
                ↓ (validates table ∈ ALLOWED_TABLES)
         Stored in sync_queue (persists across restarts)
                ↓ (every 30s auto-sync fires)
         chunkContentIfNeeded() — splits at sentence boundaries if > tier limit
                ↓
         PHIDetectionService.detectPHI() — mask if enabled
                ↓
         LocalEmbeddingService.embed() — generate local vector embeddings from PLAINTEXT
                ↓
         EncryptionService.encrypt() — AES-256-GCM encrypt payload
                ↓
         PiyAPIBackend.batchCreateMemories([{
           content: ciphertext,
           namespace: 'meetings.<table>',
           tags: [table, operation, 'rid:<recordId>'],
           metadata: { encrypted: true, skip_server_embedding: true },
           embedding: localEmbedding  // Plaintext vector — NOT from ciphertext
         }])
                ↓
         markSyncedAtomic() — SQLite transaction: UPDATE synced_at + DELETE queue item
```

> **Key**: `skip_server_embedding: true` tells PiyAPI NOT to embed ciphertext (garbage vectors). Local plaintext embeddings are sent alongside the encrypted content.

---

## 3. PiyAPI Cloud Surface

22 methods in `PiyAPIBackend.ts`:

### Memory CRUD (5)

| Method                | REST                       | Purpose                 |
| :-------------------- | :------------------------- | :---------------------- |
| `createMemory`        | `POST /memories`           | Store encrypted memory  |
| `batchCreateMemories` | `POST /memories/batch`     | Batch store (up to 100) |
| `updateMemory`        | `PUT /memories/:id`        | Update memory           |
| `deleteMemory`        | `DELETE /memories/:id`     | Delete memory           |
| `getMemories`         | `GET /memories?namespace=` | List by namespace       |

### Search (3)

| Method           | REST                    | Tier     |
| :--------------- | :---------------------- | :------- |
| `semanticSearch` | `POST /search/semantic` | Starter+ |
| `hybridSearch`   | `POST /search/hybrid`   | Pro+     |
| `fuzzySearch`    | `POST /search/fuzzy`    | Starter+ |

### AI (1)

| Method | REST        | Tier                       |
| :----- | :---------- | :------------------------- |
| `ask`  | `POST /ask` | Starter+ (50/mo), Pro+ (∞) |

### Knowledge Graph (6)

| Method            | REST                                   | Tier                                |
| :---------------- | :------------------------------------- | :---------------------------------- |
| `kgIngest`        | `POST /kg/ingest`                      | Starter+                            |
| `extractEntities` | `POST /kg/ingest` → `GET /kg/entities` | Starter+                            |
| `getGraph`        | `GET /graph?namespace=`                | Free (readonly), Pro+ (interactive) |
| `traverseGraph`   | `GET /graph?memory_id=`                | Pro+                                |
| `searchGraph`     | `POST /graph/search`                   | Starter+                            |
| `getGraphStats`   | `GET /graph/stats`                     | Free+                               |

### Compliance (3)

| Method          | REST                   | Status                    |
| :-------------- | :--------------------- | :------------------------ |
| `checkPhi`      | `POST /compliance/phi` | **Stub** (404, MCP works) |
| `exportAll`     | `GET /export?type=`    | ✅ Working                |
| `deleteAllData` | Iterative deletion     | ✅ Working                |

### Context Sessions (2)

| Method                 | REST                     | Tier     |
| :--------------------- | :----------------------- | :------- |
| `createContextSession` | `POST /context/sessions` | Starter+ |
| `retrieveContext`      | `GET /context/retrieve`  | Starter+ |

### Adaptive Learning (2 via IPC)

| Method             | REST                      | Purpose                  |
| :----------------- | :------------------------ | :----------------------- |
| `feedbackPositive` | `POST /feedback/positive` | Teach PiyAPI what helped |
| `feedbackNegative` | `POST /feedback/negative` | Deprioritize unhelpful   |

### Live KG Stats (queried via MCP)

- **125** entities, **96** facts, **34** communities, **447** unresolved curiosities

---

## 4. Action Items Pipeline

### Current State — 90% Built

**Already exists (code proof):**

- ✅ `action_items` DB table (`schema.ts` L148-160) with 3 indexes
- ✅ `LocalEntityExtractor` regex for ACTION_ITEM (L28, 0.65 confidence, English-only)
- ✅ `digest.handlers.ts` extracts and persists action items via cloud AI (L379-401)
- ✅ `WeeklyDigestView.tsx` renders action items with status badges (L598-660)
- ✅ `intelligence:meetingSuggestion` supports `mode='action'` for real-time suggestions

**Missing (the 10%):**

- ❌ `action-items.ts` CRUD module
- ❌ `actionItem:*` IPC channels
- ❌ `ActionItemsTab` in MeetingDetailView (L251-262 is the insertion point)
- ❌ `useActionItems` hook
- ❌ Real-time extraction during recording
- ❌ KG integration for cross-meeting queries

### New CRUD Module API

```typescript
// src/main/database/crud/action-items.ts — 8 functions:
createActionItem(db, item: CreateActionItemInput): ActionItem
getActionItemsByMeeting(db, meetingId: string): ActionItem[]
getActionItemsByStatus(db, status: 'open'|'completed'|'overdue'): ActionItem[]
getActionItemsByAssignee(db, assignee: string): ActionItem[]
updateActionItem(db, id: string, updates: Partial<ActionItem>): ActionItem
deleteActionItem(db, id: string): void
getOverdueActionItems(db): ActionItem[]
getActionItemStats(db): { open: number; completed: number; overdue: number }
```

### IPC Channels (add to `ipcChannels.ts`)

```typescript
actionItem: {
  list: 'actionItem:list',
  create: 'actionItem:create',
  update: 'actionItem:update',
  delete: 'actionItem:delete',
  extract: 'actionItem:extract',
  extractRealTime: 'actionItem:extractRealTime',
  getOverdue: 'actionItem:getOverdue',
  stats: 'actionItem:stats',
}
```

### MeetingDetailView Change (L251-262)

Add tabbed right panel: **Digest | Action Items**

```diff
 {isPostMeeting && (
   <div className="ui-view-meeting-detail-side">
     <div className="ui-view-meeting-detail-panel sovereign-glass-panel">
+      <div className="ui-detail-tab-selector">
+        <button onClick={() => setActiveTab('digest')}>Digest</button>
+        <button onClick={() => setActiveTab('actions')}>Action Items</button>
+      </div>
+      {activeTab === 'actions' ? (
+        <ActionItemsTab meetingId={selectedMeetingId} />
+      ) : (
         <PostMeetingDigest ... />
+      )}
     </div>
   </div>
 )}
```

### Real-Time Extraction Hook

In `AudioPipelineService.ts` L289-317, after each transcript segment:

```typescript
// After saving transcript segment:
const entities = getLocalEntityExtractor().extract(segmentText)
const actionItems = entities.filter(e => e.type === 'ACTION_ITEM')
if (actionItems.length > 0) {
  this.emit('actionItemDetected', { meetingId, items: actionItems })
}
```

### Post-Meeting LLM Extraction

In `meeting.handlers.ts` after `stopCapture()` at L132:

```typescript
// Full transcript → structured LLM extraction:
const result = await modelManager.generate({
  prompt: `Extract action items as JSON array: {"text","assignee","priority"}
  Transcript: ${fullText.slice(0, 8000)}`,
  maxTokens: 500,
  temperature: 0.1,
})
```

### Free vs Paid Dual-Path

| Capability                | Free (Local)       | Starter+ (PiyAPI)                | Pro+ (PiyAPI)        |
| :------------------------ | :----------------- | :------------------------------- | :------------------- |
| Real-time regex detection | ✅ 0.65 confidence | ✅ Same                          | ✅ Same              |
| Local LLM extraction      | ✅ Qwen 1.5B/3B    | ✅ Same                          | ✅ Same              |
| Cloud AI extraction       | ❌                 | ✅ `backend.ask()` (50 quota)    | ✅ Unlimited         |
| Per-meeting CRUD          | ✅ Full            | ✅ Full                          | ✅ Full              |
| KG integration            | ❌                 | ✅ `backend.kgIngest()`          | ✅ Traverse + search |
| Cross-meeting search      | ❌                 | ✅ `semanticSearch()`            | ✅ `hybridSearch()`  |
| Cloud sync                | ❌                 | ✅ SyncManager                   | ✅ Multi-device      |
| Adaptive learning         | ❌                 | ✅ `feedbackPositive/Negative()` | ✅ Same              |

### Cloud AI Extraction (Paid)

```typescript
async function extractWithCloudAI(meetingId: string, transcript: string) {
  const access = await getCloudAccessManager().getFeatureAccess()
  if (!access.cloudAI) return extractWithLocalLLM(transcript) // Free fallback

  const backend = getBackend()
  const result = await backend.ask(
    `Extract ALL action items as JSON: [{"text","assignee","deadline","priority"}]
     Transcript:\n${transcript.slice(0, 8000)}`,
    'meetings'
  )
  const items = parseCloudActionItems(result.answer)

  // KG enrichment: action items become entities + facts
  for (const item of items) {
    await backend.kgIngest(
      `Action: "${item.text}" assigned to ${item.assignee || 'unassigned'}`,
      meetingId
    )
  }
  // Positive feedback for source memories
  if (result.sources?.length) {
    await backend.feedbackPositive(result.sources.map(s => s.memory_id))
  }
  return items
}
```

### Effort: ~15-20 hours | Risk: LOW (90% exists)

---

## 5. Sentiment Analysis

### Current State — Zero Code Exists

No files reference sentiment, mood, or emotion anywhere in the codebase.

### Architecture — Local-First Dual Strategy

**Strategy A: Keyword Heuristic** (real-time, <1ms, 0.4 confidence)

```typescript
const POSITIVE = [
  'agree',
  'great',
  'perfect',
  'love',
  'excellent',
  'awesome',
  'absolutely',
  'definitely',
]
const NEGATIVE = [
  'disagree',
  'concerned',
  'worried',
  'problem',
  'issue',
  'risk',
  'unfortunately',
  'difficult',
]
const INTENSIFIERS = ['very', 'extremely', 'really', 'absolutely', 'incredibly']

function quickSentiment(text: string): { score: number; label: string; confidence: number } {
  const words = text.toLowerCase().split(/\s+/)
  let score = 0,
    hasIntensifier = false
  for (const word of words) {
    if (INTENSIFIERS.some(i => word.startsWith(i))) hasIntensifier = true
    if (POSITIVE.some(p => word.startsWith(p))) score += hasIntensifier ? 2 : 1
    if (NEGATIVE.some(n => word.startsWith(n))) score -= hasIntensifier ? 2 : 1
    hasIntensifier = false
  }
  const normalized = Math.max(-1, Math.min(1, score / Math.max(words.length * 0.1, 1)))
  return {
    score: normalized,
    label: normalized > 0.2 ? 'positive' : normalized < -0.2 ? 'negative' : 'neutral',
    confidence: 0.4,
  }
}
```

**Strategy B: Local Qwen LLM** (post-meeting, batch 10-15 segments/prompt, 0.75 confidence)

```
Prompt: "Rate sentiment -1.0 to +1.0 for each line:\n0: \"Great progress!\"\n1: \"I'm worried about the budget\"\nFormat: INDEX | SCORE | LABEL"
```

> **Context window limit**: ModelManager L221 sets 4096 tokens. ~50-100 tokens per segment → batch max 10-15 per call. 1-hour meeting (~120 segments) = ~8-12 LLM calls.

**Strategy C: Cloud AI** (paid, 0.9+ confidence, full NLP)

```typescript
// backend.ask() with structured prompt → full contextual sentiment
// Can process more context (larger model, no 4096 limit)
// Detects sarcasm, tone, emphasis — not just keywords
```

### Schema

```sql
CREATE TABLE IF NOT EXISTS sentiment_scores (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL,
  transcript_id TEXT,
  speaker_name TEXT,
  segment_index INTEGER NOT NULL,
  timestamp_sec REAL NOT NULL,
  score REAL NOT NULL,                -- -1.0 to +1.0
  label TEXT NOT NULL,                -- 'positive' | 'neutral' | 'negative'
  confidence REAL DEFAULT 0.4,
  method TEXT DEFAULT 'heuristic',    -- 'heuristic' | 'llm' | 'cloud'
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
);
CREATE INDEX idx_sentiment_meeting_ts ON sentiment_scores(meeting_id, timestamp_sec);
CREATE INDEX idx_sentiment_speaker ON sentiment_scores(meeting_id, speaker_name);
```

### New Files

| File                             | Purpose                                            | Lines |
| :------------------------------- | :------------------------------------------------- | ----: |
| `SentimentAnalyzer.ts`           | Dual-strategy extraction                           |  ~200 |
| `crud/sentiment-scores.ts`       | DB operations                                      |   ~80 |
| `handlers/sentiment.handlers.ts` | IPC: `sentiment:getByMeeting`, `sentiment:analyze` |  ~100 |
| `hooks/useSentiment.ts`          | React query hook                                   |   ~40 |
| `SentimentTimeline.tsx`          | D3 area chart above transcript                     |  ~250 |
| `MeetingMoodBadge.tsx`           | 😊/😐/😟 on meeting cards                          |   ~30 |
| `WeeklyMoodTrend.tsx`            | Sparkline in digest                                |   ~80 |

### UI Integration

1. **MeetingDetailView** — D3 `SentimentTimeline` overlaid above `TranscriptPanel`
2. **MeetingListView** — `MeetingMoodBadge` (😊 >0.2, 😐 -0.2–0.2, 😟 <-0.2) on each card
3. **WeeklyDigestView** — "Meeting Mood" section after Action Items (L664)
4. **PostMeetingDigest** — "Mood Summary" with peak positive/negative moments

### Visualization — Sovereign UI

- **Gradient**: `#059669` (positive) → `#a3a3a3` (neutral) → `#dc2626` (negative)
- **Animation**: `framer-motion` (already a dependency)
- **Container**: `sovereign-glass-panel` class
- **Dark mode**: CSS variables from design system

### Free vs Paid Dual-Path

| Capability                    | Free | Starter+              | Pro+       | Team |
| :---------------------------- | :--- | :-------------------- | :--------- | :--- |
| Real-time heuristic           | ✅   | ✅                    | ✅         | ✅   |
| Local LLM analysis            | ✅   | ✅                    | ✅         | ✅   |
| Cloud NLP analysis            | ❌   | ✅                    | ✅         | ✅   |
| Per-meeting timeline          | ✅   | ✅                    | ✅         | ✅   |
| Per-speaker breakdown         | ✅   | ✅                    | ✅         | ✅   |
| Mood badge on cards           | ✅   | ✅                    | ✅         | ✅   |
| KG mood facts                 | ❌   | ✅ `kgIngest()`       | ✅         | ✅   |
| Cross-meeting search          | ❌   | ✅ `semanticSearch()` | ✅         | ✅   |
| Emotional intelligence report | ❌   | ❌                    | ✅ `ask()` | ✅   |
| Team mood dashboard           | ❌   | ❌                    | ❌         | ✅   |

### Cloud-Enhanced Sentiment (Paid)

```typescript
async function analyzeSentiment(segments, meetingId) {
  const access = await getCloudAccessManager().getFeatureAccess()

  // 1. ALWAYS run local heuristic (instant, free)
  const scores = segments.map(s => quickSentiment(s.text))

  // 2. ALWAYS run local LLM (if model loaded)
  try {
    /* batch 10 segments per ModelManager.generate() call */
  } catch {}

  // 3. IF paid → cloud override (highest accuracy)
  if (access.cloudAI) {
    const backend = getBackend()
    const result = await backend.ask(
      `Analyze sentiment segment-by-segment: SCORE, LABEL, CONFIDENCE.
       Flag tension, disagreement, enthusiasm.\n${fullText.slice(0, 12000)}`,
      'meetings'
    )
    // Override local scores where cloud confidence > local
    // Ingest mood summary into KG:
    await backend.kgIngest(
      `Meeting ${meetingId} had ${moodLabel} sentiment (${avgMood.toFixed(2)})`,
      meetingId
    )
  }
  return scores
}
```

### Effort: ~25-35 hours | Risk: MEDIUM

---

## 6. Calendar Integration

### Current State — Zero Calendar Code

Google OAuth is fully wired at `AuthService.ts` L407-428 with `bluearkive://auth/callback` deep link. Just add `calendar.readonly` scope.

### Architecture

**Free Tier: Apple ICS Read** (macOS only)

- Parse `~/Library/Calendars/**/*.ics` using `node-icalendar`
- Poll every 60s — no native module, no entitlements
- Limitation: 30-60s delay, read-only

**Paid Tier: Google Calendar API**

- OAuth scope: `https://www.googleapis.com/auth/calendar.readonly`
- REST: `GET /calendar/v3/calendars/primary/events`
- Real-time sync via Google Push Notifications (webhook)

### Google OAuth Change (Surgical — 1 line)

```diff
 // AuthService.ts L415-421:
 options: {
   redirectTo: 'bluearkive://auth/callback',
   skipBrowserRedirect: true,
+  scopes: 'https://www.googleapis.com/auth/calendar.readonly',
 }
```

> ⚠️ **BLOCKER**: Adding `calendar.readonly` requires Google OAuth verification review (2-6 weeks). **Apply on Day 1** — this is the only external blocking dependency across all 4 features.

### Schema

```sql
CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'google',     -- 'google' | 'apple' | 'outlook'
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  start_time INTEGER NOT NULL,                 -- Epoch seconds
  end_time INTEGER NOT NULL,
  location TEXT,
  attendees TEXT,                               -- JSON array: [{name, email}]
  meeting_url TEXT,                             -- Zoom/Meet link from description
  meeting_id TEXT,                              -- Linked BlueArkive meeting (FK)
  is_all_day BOOLEAN DEFAULT 0,
  recurrence TEXT,                              -- iCal RRULE
  synced_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX idx_cal_ext ON calendar_events(provider, external_id);
CREATE INDEX idx_cal_time ON calendar_events(start_time);
CREATE INDEX idx_cal_meeting ON calendar_events(meeting_id);
```

### Auto-Link Logic

When a meeting starts, fuzzy-match against calendar events within ±15 minutes:

```typescript
function autoLinkMeeting(title: string, events: CalendarEvent[]): string | null {
  const now = Date.now() / 1000
  const upcoming = events.filter(e => Math.abs(e.start_time - now) < 15 * 60)

  // 1. Exact title match
  const exact = upcoming.find(e => e.title.toLowerCase() === title.toLowerCase())
  if (exact) return exact.id

  // 2. Fuzzy substring match
  const fuzzy = upcoming.find(
    e =>
      e.title.toLowerCase().includes(title.toLowerCase()) ||
      title.toLowerCase().includes(e.title.toLowerCase())
  )
  if (fuzzy) return fuzzy.id

  // 3. Only one event in window → auto-link
  if (upcoming.length === 1) return upcoming[0].id

  return null
}
```

### Pre-Meeting AI Context (Pro+)

```typescript
async function getPreMeetingContext(eventId: string): Promise<string> {
  const event = getCalendarEvent(eventId)
  let context = `Meeting: ${event.title}\nAttendees: ${attendees.join(', ')}\n`

  const access = await getCloudAccessManager().getFeatureAccess()
  if (!access.cloudAI) return context // Free: just names

  // Pro+: PiyAPI context session for deep historical context
  const session = await backend.createContextSession({
    namespace: 'meetings',
    token_budget: 2000,
    time_range: { start: Date.now() - 90 * 24 * 3600 * 1000, end: Date.now() },
  })
  if (session) {
    const result = await backend.retrieveContext(
      session.context_session_id,
      `Previous meetings with ${attendees.join(' and ')}: topics, decisions, action items`
    )
    if (result?.context) context += `\nHistory:\n${result.context}\n`
  }
  return context
}
```

### Free vs Paid Dual-Path

| Capability                  | Free | Starter+              | Pro+                   |
| :-------------------------- | :--- | :-------------------- | :--------------------- |
| Apple ICS read              | ✅   | ✅                    | ✅                     |
| Google Calendar sync        | ❌   | ✅                    | ✅                     |
| Calendar view (day/week)    | ✅   | ✅                    | ✅                     |
| Basic auto-link (substring) | ✅   | ✅                    | ✅                     |
| Smart auto-link (semantic)  | ❌   | ✅ `semanticSearch()` | ✅                     |
| Pre-meeting AI context      | ❌   | ❌                    | ✅ `retrieveContext()` |
| Multi-device calendar       | ❌   | ✅ SyncManager        | ✅                     |
| Outlook integration         | ❌   | ❌                    | ✅ (future)            |

### Effort: ~20-30 hours | Risk: HIGH (Google verification)

---

## 7. Webhooks / Zapier

### Current State — Zero Code

No webhook files exist. But architecture templates exist:

- Supabase Edge Functions at `/supabase/functions/`
- `CloudTranscriptionService.ts` exponential backoff pattern (L286-307) — reusable
- `audit_logs` table captures events — source for triggers

### Webhook Events

| Event                   | Source                         | Payload                                        |
| :---------------------- | :----------------------------- | :--------------------------------------------- |
| `meeting.started`       | `AudioPipelineService.ts` L104 | `{meetingId, title, startTime}`                |
| `meeting.completed`     | `meeting.handlers.ts` L132     | `{meetingId, title, duration, segmentCount}`   |
| `transcript.ready`      | `AudioPipelineService.ts` L453 | `{meetingId, text, wordCount}`                 |
| `action_item.created`   | New `action-items.ts`          | `{id, meetingId, text, assignee, deadline}`    |
| `action_item.completed` | New `action-items.ts`          | `{id, text, completedAt}`                      |
| `digest.generated`      | `digest.handlers.ts` L376      | `{digestId, startDate, endDate, meetingCount}` |
| `sentiment.alert`       | New `SentimentAnalyzer.ts`     | `{meetingId, timestamp, score, context}`       |

### Security — HMAC Signature

```typescript
import crypto from 'crypto'

function signPayload(payload: object, secret: string): string {
  return crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex')
}

// Headers on every delivery:
// X-BlueArkive-Signature: sha256=<hex>
// X-BlueArkive-Event: meeting.completed
// X-BlueArkive-Delivery: <uuid>
// X-BlueArkive-Timestamp: <unix-ms>
```

### Retry Strategy (from CloudTranscriptionService pattern)

```typescript
const MAX_RETRIES = 5
const BACKOFF = [1000, 5000, 15000, 60000, 300000] // 1s → 5min

async function deliverWithRetry(url, payload, headers) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      })
      if (response.ok) return true
      if (response.status < 500) return false // 4xx = don't retry
    } catch {
      /* network error → retry */
    }
    await new Promise(r => setTimeout(r, BACKOFF[attempt]))
  }
  return false
}
```

### PHI Safety

> ⚠️ **Webhook payloads may contain PHI.** Before dispatching any webhook, run payload through `PHIDetectionService.maskPHI()`. Legally required for healthcare users.

### Dispatch — Local vs Cloud Relay

```typescript
async function dispatchWebhook(webhook, event) {
  const access = await getCloudAccessManager().getFeatureAccess()

  // PHI sanitization (Pro+)
  let payload = event.payload
  if (access.cloudAI) {
    const phi = PHIDetectionService.detectPHI(JSON.stringify(payload))
    if (phi.hasPHI) payload = JSON.parse(phi.maskedText)
  }

  const signature = crypto
    .createHmac('sha256', webhook.secret)
    .update(JSON.stringify(payload))
    .digest('hex')

  if (access.cloudSync) {
    // Pro+: Supabase Edge Function relay (reliable, always-on)
    await fetch(`${config.BLUEARKIVE_FUNCTIONS_URL}/webhook-relay`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${backend.getAccessToken()}` },
      body: JSON.stringify({ target_url: webhook.url, payload, max_retries: 5 }),
    })
  } else {
    // Starter: Local dispatch with retry
    await deliverWithLocalRetry(webhook.url, payload, headers)
  }
}
```

### Zapier Strategy

**Phase 1 (ship now)**: "Webhooks by Zapier" catch hook — user pastes URL, no Zapier app review needed.
**Phase 2 (3-6 months)**: Native Zapier CLI app — ~40 hours, branded, in Zapier directory.

### Free vs Paid Dual-Path

| Capability        | Free | Starter ($9)    | Pro ($19)           | Team ($15/user) |
| :---------------- | :--- | :-------------- | :------------------ | :-------------- |
| Webhook UI        | ❌   | ✅ 3 hooks max  | ✅ 10 hooks         | ✅ Unlimited    |
| Events            | ❌   | 3 core events   | All 7 events        | All 7 + team    |
| Dispatch          | ❌   | Local `fetch()` | Edge Function relay | Edge + SLA      |
| Daily limit       | ❌   | 100/day         | Unlimited           | Unlimited       |
| HMAC signing      | ❌   | ✅              | ✅                  | ✅              |
| PHI sanitization  | ❌   | ❌              | ✅                  | ✅              |
| Delivery log      | ❌   | Last 50         | Full history        | Full + export   |
| Retries           | ❌   | 3               | 5 + exponential     | 5 + alert       |
| KG-powered alerts | ❌   | ❌              | ✅                  | ✅              |

### Effort: ~30-40 hours | Risk: MEDIUM

---

## 8. Cross-Feature Infrastructure Changes

### 1. Extend FeatureAccess Interface (`CloudAccessManager.ts` L41-65)

```diff
 interface FeatureAccess {
+  actionItems: boolean
+  actionItemsRealTime: boolean        // Pro+
+  sentimentAnalysis: boolean
+  calendarSync: boolean
+  calendarAutoLink: boolean           // Pro+
+  webhooks: boolean
+  webhookLimit: number
   // ... existing 17 fields
 }
```

### 2. New Feature Flags (`environment.ts` L84-106)

```diff
+  action_items: true,
+  sentiment_analysis: true,
+  calendar_integration: false,         // Off by default — requires OAuth setup
+  webhooks: false,                     // Off by default — Pro+ only
```

### 3. Extend SyncManager ALLOWED_TABLES (`SyncManager.ts` L41)

```diff
-const ALLOWED_TABLES = ['meetings','transcripts','notes','entities','audio_highlights'] as const
+const ALLOWED_TABLES = [
+  'meetings','transcripts','notes','entities','audio_highlights',
+  'action_items','sentiment_scores','calendar_events','webhooks'
+] as const
```

### 4. Extend TierLimits Interface (`types/tiers.ts`)

```diff
+  calendarSync: boolean
+  calendarAutoLink: boolean
+  actionItems: boolean
+  sentimentAnalysis: boolean
+  webhooks: boolean
+  webhookLimit: number
```

---

## 9. Unified Tier Feature Matrix

| Feature                   | Free ($0)   | Starter ($9/mo) | Pro ($19/mo)      | Team ($15/u/mo) |
| :------------------------ | :---------- | :-------------- | :---------------- | :-------------- |
| **Core — Existing**       |             |                 |                   |                 |
| Local transcription       | ✅          | ✅              | ✅                | ✅              |
| Local AI (Qwen LLM)       | ✅          | ✅              | ✅                | ✅              |
| Cloud AI queries          | ❌          | 50/month        | Unlimited         | Unlimited       |
| Semantic search           | ❌          | ✅              | ✅                | ✅              |
| Hybrid search             | ❌          | ❌              | ✅                | ✅              |
| Knowledge Graph (view)    | ✅ readonly | ✅              | ✅                | ✅              |
| KG interactive            | ❌          | ❌              | ✅                | ✅              |
| Cloud sync                | ❌          | ✅              | ✅                | ✅              |
| Devices                   | 1           | 2               | Unlimited         | Unlimited       |
| Weekly Digest             | ❌          | ✅ local        | ✅ cloud enriched | ✅              |
| Speaker Diarization       | ❌          | ✅              | ✅                | ✅              |
| **Action Items — New**    |             |                 |                   |                 |
| Real-time regex detection | ✅          | ✅              | ✅                | ✅              |
| Local LLM extraction      | ✅          | ✅              | ✅                | ✅              |
| Cloud AI extraction       | ❌          | ✅ (50 quota)   | ✅ unlimited      | ✅              |
| Per-meeting CRUD          | ✅          | ✅              | ✅                | ✅              |
| KG integration            | ❌          | ✅              | ✅                | ✅              |
| Cross-meeting search      | ❌          | ✅              | ✅                | ✅              |
| Cloud sync                | ❌          | ✅              | ✅                | ✅              |
| Adaptive learning         | ❌          | ✅              | ✅                | ✅              |
| **Sentiment — New**       |             |                 |                   |                 |
| Real-time heuristic       | ✅          | ✅              | ✅                | ✅              |
| Local LLM analysis        | ✅          | ✅              | ✅                | ✅              |
| Cloud NLP analysis        | ❌          | ✅              | ✅                | ✅              |
| Per-meeting timeline      | ✅          | ✅              | ✅                | ✅              |
| Per-speaker breakdown     | ✅          | ✅              | ✅                | ✅              |
| Mood badge on cards       | ✅          | ✅              | ✅                | ✅              |
| KG mood facts             | ❌          | ✅              | ✅                | ✅              |
| Cross-meeting search      | ❌          | ✅              | ✅                | ✅              |
| Emotional intel report    | ❌          | ❌              | ✅                | ✅              |
| Team mood dashboard       | ❌          | ❌              | ❌                | ✅              |
| **Calendar — New**        |             |                 |                   |                 |
| Apple ICS read            | ✅          | ✅              | ✅                | ✅              |
| Google Calendar sync      | ❌          | ✅              | ✅                | ✅              |
| Calendar view             | ✅          | ✅              | ✅                | ✅              |
| Basic auto-link           | ✅          | ✅              | ✅                | ✅              |
| Smart auto-link           | ❌          | ✅              | ✅                | ✅              |
| Pre-meeting AI context    | ❌          | ❌              | ✅                | ✅              |
| Multi-device calendar     | ❌          | ✅              | ✅                | ✅              |
| Outlook integration       | ❌          | ❌              | ✅                | ✅              |
| **Webhooks — New**        |             |                 |                   |                 |
| Webhook management        | ❌          | ✅ 3 hooks      | ✅ 10 hooks       | ✅ Unlimited    |
| Core events (3)           | ❌          | ✅              | ✅                | ✅              |
| All events (7+)           | ❌          | ❌              | ✅                | ✅              |
| Local dispatch            | ❌          | ✅              | ✅                | ✅              |
| Edge Function relay       | ❌          | ❌              | ✅                | ✅              |
| PHI sanitization          | ❌          | ❌              | ✅                | ✅              |
| Daily limit               | ❌          | 100             | Unlimited         | Unlimited       |
| Delivery log              | ❌          | Last 50         | Full              | Full + export   |
| KG-powered alerts         | ❌          | ❌              | ✅                | ✅              |
| Zapier                    | ❌          | Catch hook      | Catch hook        | Native app      |

---

## 10. Competitive Intelligence

| Feature                 | **PiyNotes** (after all builds) | **Otter.ai**     | **Fireflies.ai**     | **Granola**         |
| :---------------------- | :------------------------------ | :--------------- | :------------------- | :------------------ |
| Calendar Integration    | ✅ Google + Apple ICS           | ✅ Auto-join     | ✅ Auto-join + CRM   | ✅ Google + Outlook |
| Action Items            | ✅ LLM + regex + KG             | ✅ AI extract    | ✅ AI → Asana/Monday | ✅ AI detection     |
| Sentiment Analysis      | ✅ Local NLP + cloud            | ⚠️ Keyword-based | ✅ Full NLP          | ❌ None             |
| Webhooks/Zapier         | ✅ HMAC + Edge relay            | ✅ Zapier        | ✅ Deep Zapier + CRM | ✅ Zapier + Notion  |
| **Bot-free Recording**  | ✅ **No bot**                   | ❌ OtterPilot    | ❌ Fred bot          | ✅ No bot           |
| **Local-first Privacy** | ✅ **All data local**           | ❌ Cloud-only    | ❌ Cloud-only        | ✅ Local-first      |
| **Knowledge Graph**     | ✅ **D3.js + PiyAPI**           | ❌               | ❌                   | ❌                  |
| **Semantic Search**     | ✅ **Hybrid search**            | ⚠️ Basic         | ✅ Smart search      | ❌                  |
| **Cross-meeting Q&A**   | ✅ **"Ask Meetings"**           | ✅               | ✅                   | ❌                  |

### Unique Advantages

1. **Privacy**: 100% local sentiment analysis — no audio leaves device. Fireflies/Otter send everything to cloud.
2. **Knowledge Graph**: Action items flow into KG. "What are all action items assigned to John across all meetings this quarter?" — no competitor can do this.
3. **Bot-free**: No bot joins meetings. Only Granola matches this.
4. **Offline**: Full functionality without internet (Free tier). Competitors are useless offline.

---

## 11. Sprint Roadmap

### Sprint Execution Order

| Sprint       | Feature               | Effort  | Impact                         | Risk         |
| :----------- | :-------------------- | :------ | :----------------------------- | :----------- |
| **Sprint 1** | Action Items Pipeline | ~15-20h | 🔥🔥🔥 Highest ROI (90% built) | LOW          |
| **Sprint 2** | Sentiment Analysis    | ~25-35h | 🔥🔥 Differentiator            | MEDIUM       |
| **Sprint 3** | Webhooks / Zapier     | ~30-40h | 🔥🔥 CRM integration           | MEDIUM       |
| **Sprint 4** | Calendar Integration  | ~20-30h | 🔥🔥🔥 Table stakes            | HIGH (OAuth) |

> ⚠️ **Start Google OAuth verification on Day 1** (parallel with Sprint 1). The review takes 2-6 weeks and is the only external blocking dependency.

### Pre-Requisites (Day 1, ~4 hours)

1. Wire PHI detection to SyncManager
2. Fix ACTION_ITEM regex for i18n
3. Create `action-items.ts` CRUD module
4. Add new feature flags to `environment.ts`
5. Extend ALLOWED_TABLES in SyncManager
6. Extend FeatureAccess interface
7. Submit Google Calendar OAuth verification

### Sprint 1 — Action Items (~2 weeks)

- [ ] IPC channels + action-items handlers
- [ ] ActionItemsTab component (Sovereign UI)
- [ ] Real-time extraction hook in AudioPipelineService
- [ ] Post-meeting LLM extraction in meeting:stop
- [ ] Cloud AI extraction dual-path (paid)
- [ ] KG integration (paid)
- [ ] useActionItems hook
- [ ] Testing + polish

### Sprint 2 — Sentiment (~2 weeks)

- [ ] SentimentAnalyzer service (heuristic + LLM)
- [ ] sentiment-scores CRUD + IPC handlers
- [ ] SentimentTimeline D3 area chart
- [ ] MeetingMoodBadge on meeting cards
- [ ] Cloud NLP dual-path (paid)
- [ ] KG mood facts (paid)
- [ ] useSentiment hook
- [ ] Testing + polish

### Sprint 3 — Webhooks (~2 weeks)

- [ ] WebhookService + HMAC signing
- [ ] webhooks + webhook_deliveries CRUD
- [ ] WebhookManagementView UI
- [ ] PHI sanitization before dispatch
- [ ] Edge Function relay (Pro+)
- [ ] Retry with exponential backoff
- [ ] useWebhooks hook
- [ ] Testing + polish

### Sprint 4 — Calendar (~2 weeks)

- [ ] CalendarService.ts (Google + Apple ICS)
- [ ] calendar-events CRUD + IPC handlers
- [ ] CalendarView + EventCard UI
- [ ] Auto-link logic (±15 min fuzzy match)
- [ ] Pre-meeting AI context (Pro+)
- [ ] useCalendar hook
- [ ] Apple ICS reader (macOS)
- [ ] Testing + polish

### Total: ~90-125 hours across 4 sprints (8 weeks)

---

## 12. Deep Dive: IPC Channel Registry

`ipcChannels.ts` (277 lines) is the single source of truth. Currently has **17 channel groups** with **67 individual channels**.

### Currently Registered Groups

```
meeting (7)  note (6)  transcript (3)  entity (3)  search (2)
sync (6)  audio (17)  intelligence (7)  model (8)  settings (4)
auth (11)  graph (6)  digest (2)  power (1)  device (5)
diagnostic (5)  quota (1)  billing (3)  audit (2)  export (2)
highlight (3)  piyapi (6)  widget (4)  shell (1)
events (11 push channels)
```

### Channels To Add

```typescript
// ── Action Items ──
actionItem: {
  list: 'actionItem:list',              // Get all action items for a meeting
  create: 'actionItem:create',          // Create from manual input or AI extraction
  update: 'actionItem:update',          // Toggle status, edit text, change assignee
  delete: 'actionItem:delete',          // Remove action item
  extract: 'actionItem:extract',        // Trigger post-meeting LLM extraction
  extractRealTime: 'actionItem:extractRealTime', // Subscribe to real-time regex hits
  getOverdue: 'actionItem:getOverdue',  // Dashboard: all overdue items
  stats: 'actionItem:stats',           // Counts: open/completed/overdue
},

// ── Sentiment ──
sentiment: {
  analyze: 'sentiment:analyze',         // Trigger full analysis for a meeting
  getByMeeting: 'sentiment:getByMeeting', // Timeline data for a specific meeting
  getMood: 'sentiment:getMood',         // Single meeting mood badge
  getTimeline: 'sentiment:getTimeline', // D3 chart data points
},

// ── Calendar ──
calendar: {
  sync: 'calendar:sync',               // Trigger Google Calendar sync
  list: 'calendar:list',               // Get events for a date range
  link: 'calendar:link',               // Manually link event → meeting
  autoLink: 'calendar:autoLink',       // Auto-link when meeting starts
  getPreContext: 'calendar:getPreContext', // Pre-meeting AI context (Pro+)
},

// ── Webhooks ──
webhook: {
  list: 'webhook:list',                // Get all webhooks
  create: 'webhook:create',            // Register a new webhook URL
  update: 'webhook:update',            // Edit URL, events, or status
  delete: 'webhook:delete',            // Remove webhook
  test: 'webhook:test',                // Send test payload
  getDeliveries: 'webhook:getDeliveries', // Delivery log
},

// ── Push Events (webContents.send) ──
events: {
  // ...existing 11 channels...
  actionItemDetected: 'event:actionItemDetected',   // Real-time regex hit
  sentimentUpdate: 'event:sentimentUpdate',         // Live sentiment score
  webhookDelivery: 'event:webhookDelivery',         // Delivery status
  calendarEventSoon: 'event:calendarEventSoon',     // 5-min pre-meeting alert
},
```

---

## 13. Deep Dive: Database Schema Gaps — Exact SQL

### What EXISTS (schema.ts L148-196)

```sql
-- action_items: ✅ EXISTS (L148-160) — but missing FTS5
CREATE TABLE IF NOT EXISTS action_items (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL,
  text TEXT NOT NULL,
  assignee TEXT,
  deadline INTEGER,
  priority TEXT DEFAULT 'normal',
  status TEXT DEFAULT 'open',
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  completed_at INTEGER,
  FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
);
-- Indexes exist: idx_action_items_meeting, idx_action_items_status, idx_action_items_assignee
```

### What Is MISSING — New Tables

```sql
-- ❌ MISSING: sentiment_scores table
CREATE TABLE IF NOT EXISTS sentiment_scores (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL,
  transcript_id TEXT,
  speaker_name TEXT,
  segment_index INTEGER NOT NULL,
  timestamp_sec REAL NOT NULL,
  score REAL NOT NULL,                -- -1.0 to +1.0
  label TEXT NOT NULL,                -- 'positive' | 'neutral' | 'negative'
  confidence REAL DEFAULT 0.4,
  method TEXT DEFAULT 'heuristic',    -- 'heuristic' | 'llm' | 'cloud'
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sentiment_meeting_ts ON sentiment_scores(meeting_id, timestamp_sec);
CREATE INDEX IF NOT EXISTS idx_sentiment_speaker ON sentiment_scores(meeting_id, speaker_name);
CREATE INDEX IF NOT EXISTS idx_sentiment_score ON sentiment_scores(score);

-- ❌ MISSING: calendar_events table
CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'apple', -- 'google' | 'apple' | 'outlook'
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  start_time INTEGER NOT NULL,            -- Epoch seconds
  end_time INTEGER NOT NULL,
  location TEXT,
  attendees TEXT,                          -- JSON: [{name, email}]
  meeting_url TEXT,                        -- Zoom/Meet link
  meeting_id TEXT,                         -- Linked BlueArkive meeting
  is_all_day BOOLEAN DEFAULT 0,
  recurrence TEXT,                         -- iCal RRULE
  synced_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cal_ext ON calendar_events(provider, external_id);
CREATE INDEX IF NOT EXISTS idx_cal_time ON calendar_events(start_time);
CREATE INDEX IF NOT EXISTS idx_cal_meeting ON calendar_events(meeting_id);

-- ❌ MISSING: webhooks table
CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,                   -- HMAC signing key
  events TEXT NOT NULL,                   -- JSON array: ['meeting.completed', 'action_item.created']
  is_active BOOLEAN DEFAULT 1,
  description TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_webhooks_active ON webhooks(is_active);

-- ❌ MISSING: webhook_deliveries table
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id TEXT PRIMARY KEY,
  webhook_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  response_status INTEGER,
  response_body TEXT,
  attempts INTEGER DEFAULT 1,
  status TEXT DEFAULT 'pending',          -- 'pending' | 'success' | 'failed' | 'dead'
  delivered_at INTEGER,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_deliveries_webhook ON webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON webhook_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_deliveries_created ON webhook_deliveries(created_at DESC);
```

### Missing FTS5 Tables

```sql
-- ❌ MISSING: action_items FTS (for local search like "budget action items")
CREATE VIRTUAL TABLE IF NOT EXISTS action_items_fts USING fts5(
  text,
  content=action_items,
  content_rowid=rowid
);

-- FTS triggers for action_items:
CREATE TRIGGER IF NOT EXISTS action_items_fts_insert AFTER INSERT ON action_items BEGIN
  INSERT INTO action_items_fts(rowid, text) VALUES (new.rowid, new.text);
END;
CREATE TRIGGER IF NOT EXISTS action_items_fts_delete AFTER DELETE ON action_items BEGIN
  INSERT INTO action_items_fts(action_items_fts, rowid, text)
  VALUES ('delete', old.rowid, old.text);
END;
CREATE TRIGGER IF NOT EXISTS action_items_fts_update AFTER UPDATE ON action_items
  WHEN old.text IS NOT new.text
BEGIN
  INSERT INTO action_items_fts(action_items_fts, rowid, text)
  VALUES ('delete', old.rowid, old.text);
  INSERT INTO action_items_fts(rowid, text) VALUES (new.rowid, new.text);
END;
```

### Files To Extend

| File                 | Change                                                                                                                 | Lines                  |
| :------------------- | :--------------------------------------------------------------------------------------------------------------------- | :--------------------- |
| `schema.ts`          | Add `sentiment_scores`, `calendar_events`, `webhooks`, `webhook_deliveries` tables + indexes + FTS                     | L197 (append)          |
| `migrations.ts`      | Add migration v4 for new tables (SCHEMA_VERSION 3→4)                                                                   | New migration function |
| `search.ts`          | Add `searchActionItems()` function                                                                                     | After L213             |
| `search.ts`          | Extend `rebuildSearchIndexes()` / `optimizeSearchIndexes()` to rebuild `action_items_fts`                              | L316, L337             |
| `export.handlers.ts` | Add `sentiment_scores`, `calendar_events`, `webhooks` to export data (L62-81)                                          | L62                    |
| `export.handlers.ts` | Add `sentiment_scores`, `calendar_events`, `webhooks`, `webhook_deliveries` to `deleteAllData` tables array (L174-188) | L178                   |

---

## 14. Deep Dive: Search Architecture — 3-Tier Cascade

`search.handlers.ts` (287 lines) reveals the EXACT search cascade that action items and sentiment should plug into:

### How Search Works Today

```
User types query
      ↓
search:query → FTS5 local search (searchAll from database/search.ts)
      ↓ (immediate, all tiers)
search:semantic → Dual path:
      ↓
┌─────────────────────────────────────────────────────────┐
│ ALWAYS: Local semantic search                           │
│   1. Load transcripts with embedding_blob from SQLite   │
│   2. LocalEmbeddingService.search(query, docs, limit)   │
│   3. Score by cosine similarity                        │
│   4. Return as source: 'local'                         │
└─────────────────────────────────────────────────────────┘
      ↓ (if cloud available)
┌─────────────────────────────────────────────────────────┐
│ CLOUD: Tiered search upgrade                           │
│   Pro+   → hybridSearch()  → source: 'cloud-hybrid'   │
│   Starter → semanticSearch() → source: 'cloud-semantic'│
│   Free    → fuzzySearch()    → source: 'cloud-fuzzy'   │
└─────────────────────────────────────────────────────────┘
      ↓
Merge + Deduplicate (by meetingId+snippet80)
      ↓
Sort by relevance DESC → slice(0, limit)
      ↓
Auto-fire feedbackPositive(memoryIds) on cloud results
```

### Encrypted Memory Handling (CRITICAL)

Cloud search results may contain encrypted memories. The search handler at L156-165 checks:

```typescript
const isEncrypted = hit.memory?.metadata?.encrypted === true
const snippet = isEncrypted
  ? String(hit.memory?.metadata?.meeting_title || 'Cloud result') // Never show ciphertext
  : (hit.memory?.content || '').substring(0, 200)
```

**ALL new feature handlers that display PiyAPI search results MUST replicate this check.**

### PiyAPI Memory ID Tracking

Search results carry `_piyApiMemoryId` (L170, L199, L228) for adaptive learning feedback. After cloud results are returned, L244-253 automatically:

```typescript
const memoryIds = cloudResults.map(r => r._piyApiMemoryId).filter(id => !!id)
backend.feedbackPositive(memoryIds).catch(() => {
  /* non-critical */
})
```

**Action items and sentiment should replicate this feedbackPositive pattern** when displaying PiyAPI-sourced results.

---

## 15. Deep Dive: Canonical Dual-Path Code Patterns

After reading ALL handlers, these are the 4 proven patterns already in the codebase:

### Pattern A — Local + Cloud Merge (entity.handlers.ts L8-100)

**Use for**: Action item extraction, sentiment analysis

```
1. ALWAYS run local extraction (LocalEntityExtractor.extract)
2. IF knowledgeGraphInteractive:
   a. health check
   b. backend.extractEntities()
   c. backend.kgIngest() (non-blocking, fire-and-forget)
3. Merge: cloud entities preferred (seenTexts dedup)
```

### Pattern B — Cloud-First, Local Fallback (note.handlers.ts L116-266)

**Use for**: Pre-meeting context injection, smart auto-link

```
1. Check CloudAccessManager.getFeatureAccess()
2. IF cloudAI + contextSessions + quota not exhausted:
   a. health check
   b. backend.createContextSession() with token_budget
   c. backend.retrieveContext() for enriched context
   d. backend.ask() with enriched prompt
   e. Record quota usage AFTER confirmed success
3. ELSE: ModelManager.generate() with local prompt
```

### Pattern C — Cloud-Only with Graceful Degradation (graph.handlers.ts)

**Use for**: Graph search, traversal, contradictions, stats

```
1. Check feature flag (knowledgeGraph/knowledgeGraphInteractive)
2. IF blocked: return { blocked: true, reason: 'requires X plan' }
3. health check
4. IF unhealthy: return empty result (no error)
5. Call PiyAPI method
6. IF method fails: use fallback (e.g. getGraph instead of traverseGraph)
```

### Pattern D — 3-Tier Cascade (search.handlers.ts L37-285)

**Use for**: Cross-meeting action item search, sentiment search

```
1. ALWAYS run local FTS5/embedding search
2. Check tier → select cloud method:
   - Pro+: hybridSearch
   - Starter: semanticSearch
   - Free: fuzzySearch (still useful!)
3. Handle encrypted memories (metadata.encrypted === true)
4. Merge local + cloud, dedup by key
5. Auto-fire feedbackPositive on cloud results
```

### Pattern E — Teaser for Upsell (graph.handlers.ts L309-355)

**Use for**: Free tier sentiment/calendar teasers

```
1. Check feature flag for basic access (not full access)
2. Return count/preview only (not full data)
3. Return { requiresPro: true, preview: 'X decisions changed' }
4. UI shows count + 🔓 Pro badge
```

---

## 16. Deep Dive: PHI/GDPR Integration Points

### PHIDetectionService — What's Available

`PHIDetectionService.ts` (407 lines) provides:

| Method                       | Purpose                                                        | Used Today       |
| :--------------------------- | :------------------------------------------------------------- | :--------------- |
| `detectPHI(text)`            | Returns `{hasPHI, riskLevel, detectedIdentifiers, maskedText}` | SyncManager L420 |
| `maskPHI(text, identifiers)` | Replace PHI with `***` masks                                   | SyncManager      |
| `checkBeforeSync(text)`      | Warning string or null if safe                                 | Not widely used  |
| `getDescription(result)`     | Human-readable summary                                         | UI display       |

Detects **15 PHI types** including international:

- US: SSN, Phone, Email, MRN, Credit Card, Address, Account Number, URL, IP, Date
- India: Aadhaar (12-digit, starts 2-9)
- Japan: My Number (12-digit), JP Phone (0xx-xxxx)
- Korea: Resident Registration Number (6-7 format)
- International: Phone (+country code format)

### Where PHI Must Be Applied for New Features

| Feature          | PHI Point                 | Must Do                                                                       |
| :--------------- | :------------------------ | :---------------------------------------------------------------------------- |
| **Action Items** | Before SyncManager queue  | `PHIDetectionService.detectPHI(actionItem.text)` — mask assignee names, dates |
| **Sentiment**    | Before KG ingest          | `PHIDetectionService.maskPHI()` on sentiment context text                     |
| **Calendar**     | Before cloud sync         | `PHIDetectionService.detectPHI(event.attendees)` — email addresses are PHI    |
| **Webhooks**     | **BEFORE EVERY dispatch** | `PHIDetectionService.detectPHI(JSON.stringify(payload))` — MOST CRITICAL      |

### GDPR Export — Files to Update

`export.handlers.ts` `export:userData` (L13-139) currently exports:

```
meetings, transcripts, notes, entities, actionItems, digests
```

Must add:

```diff
+ const sentimentScores = db.prepare('SELECT * FROM sentiment_scores ORDER BY meeting_id').all()
+ const calendarEvents = db.prepare('SELECT * FROM calendar_events ORDER BY start_time').all()
+ const webhooks = db.prepare('SELECT * FROM webhooks ORDER BY created_at').all()
```

`export:deleteAllData` tables array (L174-188) must include:

```diff
  const tables = [
    'transcripts', 'notes', 'entities', 'action_items', 'digests',
    'audio_highlights', 'sync_queue', 'query_usage', 'meeting_templates',
-   'devices', 'audit_logs', 'encryption_keys', 'settings', 'meetings',
+   'devices', 'audit_logs', 'encryption_keys', 'settings',
+   'sentiment_scores', 'calendar_events', 'webhook_deliveries', 'webhooks',
+   'meetings',
  ]
```

FTS cleanup (L200-206) must add:

```diff
  for (const fts of [
    'transcripts_fts', 'notes_fts', 'entities_fts',
+   'action_items_fts',
  ]) {
```

---

## 17. Deep Dive: MeetingCard UI Extension

### Current MeetingCard Interface (MeetingCard.tsx L5-18)

```typescript
interface MeetingCardProps {
  id: string
  title: string
  date: Date
  duration: number // seconds
  participantCount: number
  hasTranscript: boolean
  hasNotes: boolean
  onClick: (id: string) => void
  onContextMenu: (e: React.MouseEvent, id: string) => void
  index: number
  isRenaming?: boolean
  onRenameSubmit?: (newTitle: string) => void
}
```

### Required Extensions

```diff
 interface MeetingCardProps {
   // ...existing props...
+  moodScore?: number | null       // -1.0 to +1.0, null if not analyzed
+  moodLabel?: string | null       // 'positive' | 'neutral' | 'negative'
+  actionItemCount?: number        // Open action item count
+  hasCalendarEvent?: boolean      // Linked to calendar event
+  calendarEventTitle?: string     // Event title for display
 }
```

### Metadata Row Extension (L119-141)

```diff
 <div className="ui-meeting-card-meta">
   <span><Clock size={12} strokeWidth={2} />{durationDisplay}</span>
   <span><Users size={12} strokeWidth={2} />{participantCount}</span>
+  {moodScore != null && (
+    <span className={`ui-meeting-card-meta-badge mood-${moodLabel}`}>
+      {moodScore > 0.2 ? '😊' : moodScore < -0.2 ? '😟' : '😐'}
+      {moodLabel}
+    </span>
+  )}
+  {actionItemCount != null && actionItemCount > 0 && (
+    <span className="ui-meeting-card-meta-badge">
+      ☑ {actionItemCount}
+    </span>
+  )}
+  {hasCalendarEvent && (
+    <span className="ui-meeting-card-meta-badge">
+      📅 {calendarEventTitle || 'Scheduled'}
+    </span>
+  )}
   {hasTranscript && (<span className="ui-meeting-card-meta-badge">...</span>)}
   {hasNotes && (<span className="ui-meeting-card-meta-badge">...</span>)}
 </div>
```

### MeetingListView Data Flow

`MeetingListView.tsx` L27-29 gets meetings from `useMeetings()` hook. The `MeetingItem` interface at L192-201 must extend:

```diff
 interface MeetingItem {
   id: string
   title?: string | null
   created_at: number
   start_time: number
   duration?: number | null
   has_transcript?: boolean | null
   has_notes?: boolean | null
   participant_count?: number | null
+  mood_score?: number | null
+  mood_label?: string | null
+  action_item_count?: number | null
+  calendar_event_title?: string | null
 }
```

The backend `meeting:list` query (meeting.handlers.ts L82) must JOIN sentiment and action items:

```sql
SELECT m.*,
  (SELECT AVG(score) FROM sentiment_scores WHERE meeting_id = m.id) as mood_score,
  CASE
    WHEN AVG(score) > 0.2 THEN 'positive'
    WHEN AVG(score) < -0.2 THEN 'negative'
    ELSE 'neutral'
  END as mood_label,
  (SELECT COUNT(*) FROM action_items WHERE meeting_id = m.id AND status = 'open') as action_item_count,
  ce.title as calendar_event_title
FROM meetings m
LEFT JOIN calendar_events ce ON ce.meeting_id = m.id
GROUP BY m.id
ORDER BY m.start_time DESC
```

---

## 18. Deep Dive: Bugs, Blockers, and Risks

### Known Blockers

| #   | Blocker                                                               | Feature      | Severity     | Resolution                                                      |
| :-- | :-------------------------------------------------------------------- | :----------- | :----------- | :-------------------------------------------------------------- |
| B1  | Google OAuth `calendar.readonly` scope requires 2-6 week verification | Calendar     | **CRITICAL** | Apply Day 1, parallel with Sprint 1                             |
| B2  | PiyAPI `checkPhi` endpoint returns 404 (REST)                         | Webhooks     | MEDIUM       | Use local `PHIDetectionService` only; MCP endpoint works        |
| B3  | PiyAPI `deleteAllData` bulk endpoint returns 404                      | GDPR         | LOW          | Iterative deletion works (already implemented in PiyAPIBackend) |
| B4  | No CRUD module for `action_items` despite table existing (L148)       | Action Items | HIGH         | Must create `crud/action-items.ts`                              |
| B5  | `action_items` table has no FTS5 virtual table                        | Action Items | MEDIUM       | Must add FTS + triggers in schema.ts                            |
| B6  | `LocalEntityExtractor` ACTION_ITEM regex is English-only              | Action Items | MEDIUM       | Needs i18n: Spanish, French, German, Japanese, Hindi patterns   |

### Existing Bugs Discovered

| #   | Bug                                                                           | File                    | Line     | Fix                       |
| :-- | :---------------------------------------------------------------------------- | :---------------------- | :------- | :------------------------ |
| D1  | `MeetingCard` has no sentiment/action items metadata props                    | `MeetingCard.tsx`       | L5-18    | Extend interface          |
| D2  | `meeting:list` doesn't JOIN sentiment or action items                         | `meeting.handlers.ts`   | L82      | Add subquery JOINs        |
| D3  | `searchAll()` only searches transcripts + notes, not entities or action items | `search.ts`             | L198-213 | Add `searchActionItems()` |
| D4  | SyncManager `ALLOWED_TABLES` doesn't include any new tables                   | `SyncManager.ts`        | L41      | Extend array              |
| D5  | `rebuildSearchIndexes()` doesn't include `action_items_fts`                   | `search.ts`             | L316     | Add rebuild call          |
| D6  | GDPR `deleteAllData` doesn't delete new tables                                | `export.handlers.ts`    | L174     | Extend tables array       |
| D7  | GDPR `export:userData` doesn't export new tables                              | `export.handlers.ts`    | L62      | Add queries               |
| D8  | `CloudAccessManager.FeatureAccess` has no fields for new features             | `CloudAccessManager.ts` | L41      | Extend interface          |
| D9  | `TierMappingService` has no limits for new features                           | `TierMappingService.ts` | L15      | Extend tier config        |
| D10 | No feature flags in `environment.ts` for new features                         | `environment.ts`        | L84      | Add 4 new flags           |

### Architecture Risks

| #   | Risk                                                                                  | Impact      | Mitigation                                                                       |
| :-- | :------------------------------------------------------------------------------------ | :---------- | :------------------------------------------------------------------------------- |
| R1  | Local LLM context window (4096 tokens) limits sentiment batch size to ~10-15 segments | Quality     | Batch processing with rolling window                                             |
| R2  | Apple ICS file polling (60s) causes stale calendar data                               | UX          | Show "last synced" timestamp, manual refresh button                              |
| R3  | Webhook local dispatch depends on app being open                                      | Reliability | Pro+ Edge Function relay + dead letter queue                                     |
| R4  | Sentiment heuristic (0.4 confidence) is too crude for real UX value                   | Quality     | Always run LLM pass as upgrade; show confidence indicator                        |
| R5  | Free tier fuzzySearch still calls PiyAPI (line 214 search.handlers.ts)                | Cost        | Check if user has valid token before calling; was intentional but may cause 401s |
| R6  | KG ingestion is fire-and-forget (entity.handlers.ts L79) with `.catch(() => {})`      | Data        | Acceptable: non-critical enrichment, but should log failures                     |
| R7  | No rate limiting on webhook dispatches                                                | Abuse       | Add per-tier limits (100/day Starter, unlimited Pro+)                            |

---

## 19. Deep Dive: PiyAPIBackend — Complete 39-Method API Surface

`PiyAPIBackend.ts` (1090 lines) is the monolithic cloud integration layer. Every cloud call flows through here.

### Method Catalog

| #   | Method                              | Lines      | Cloud Endpoint                            | Used By                   | Feature Branch Relevance                          |
| :-- | :---------------------------------- | :--------- | :---------------------------------------- | :------------------------ | :------------------------------------------------ |
| 1   | `login(email, password)`            | L98-135    | `POST /auth/login`                        | Direct mode only          | —                                                 |
| 2   | `refreshToken(refreshToken)`        | L141-173   | `POST /auth/refresh`                      | Direct mode only          | —                                                 |
| 3   | `logout()`                          | L179-209   | `POST /auth/logout`                       | AuthService               | —                                                 |
| 4   | `createMemory(memory)`              | L211-233   | `POST /memories`                          | SyncManager               | **Action Items, Sentiment**                       |
| 5   | `batchCreateMemories(memories)`     | L235-268   | `POST /memories/batch`                    | SyncManager batch         | **Action Items batch sync**                       |
| 6   | `updateMemory(id, updates)`         | L270-292   | `PATCH /memories/:id`                     | SyncManager               | **Action Item status toggle**                     |
| 7   | `deleteMemory(id)`                  | L294-311   | `DELETE /memories/:id`                    | SyncManager, GDPR         | —                                                 |
| 8   | `getMemories(ns, limit, offset)`    | L313-343   | `GET /memories`                           | GDPR export               | —                                                 |
| 9   | `semanticSearch(query, ns, limit)`  | L345-376   | `POST /memories/search`                   | search.handlers (Starter) | **Cross-meeting action item search**              |
| 10  | `hybridSearch(query, ns, limit)`    | L378-409   | `POST /memories/hybrid-search`            | search.handlers (Pro+)    | **Cross-meeting action item search**              |
| 11  | `ask(query, namespace)`             | L411-438   | `POST /ask`                               | note.handlers, digest     | **AI sentiment analysis, Smart calendar context** |
| 12  | `getGraph(ns, maxHops)`             | L440-465   | `GET /graph`                              | graph.handlers            | **Action item KG nodes**                          |
| 13  | `traverseGraph(memoryId, maxHops)`  | L467-493   | `POST /graph/traverse`                    | graph.handlers            | **Contradiction detection**                       |
| 14  | `healthCheck()`                     | L495-559   | `GET /health`                             | All handlers              | All features                                      |
| 15  | `fuzzySearch(query, ns, limit)`     | L565-595   | `POST /memories/fuzzy-search`             | search.handlers (Free)    | **Action item search (free tier)**                |
| 16  | `feedbackPositive(memoryIds)`       | L597-620   | `POST /feedback/positive`                 | search.handlers auto      | **All cloud search results**                      |
| 17  | `feedbackNegative(memoryIds)`       | L622-641   | `POST /feedback/negative`                 | Manual                    | Adaptive learning                                 |
| 18  | `kgIngest(content, memoryId)`       | L643-671   | `POST /kg/ingest`                         | entity.handlers           | **Action Items, Sentiment KG**                    |
| 19  | `deduplicate(ns, dryRun)`           | L673-704   | `POST /memories/deduplicate`              | piyapi.handlers           | Maintenance                                       |
| 20  | `checkPhi(text)`                    | L706-730   | `POST /compliance/phi` ⚠️ 404             | stub                      | **Webhooks PHI (use local instead)**              |
| 21  | `exportAll(type)`                   | L732-754   | `GET /export`                             | export.handlers           | GDPR                                              |
| 22  | `extractEntities(text, ns)`         | L756-833   | `POST /kg/ingest` + `GET /kg/entities`    | entity.handlers           | **Action Items cloud extraction**                 |
| 23  | `deleteAllData()`                   | L835-891   | `DELETE /data/delete-all` ⚠️ 404 fallback | export.handlers           | GDPR                                              |
| 24  | `searchGraph(query, ns, limit)`     | L893-920   | `POST /graph/search`                      | graph.handlers            | **Action item graph search**                      |
| 25  | `getGraphStats(ns)`                 | L922-948   | `GET /graph/stats`                        | graph.handlers            | Dashboard stats                                   |
| 26  | `ensureAuthenticated()`             | L950-967   | — (local check)                           | All methods               | Internal                                          |
| 27  | `setAccessToken(token, userId)`     | L969-978   | — (local)                                 | AuthService               | Internal                                          |
| 28  | `getAccessToken()`                  | L980-985   | — (local)                                 | SyncManager               | Internal                                          |
| 29  | `createContextSession(params)`      | L987-1013  | `POST /context/sessions`                  | note.handlers             | **Pre-meeting AI context**                        |
| 30  | `retrieveContext(sessionId, query)` | L1015-1044 | `GET /context/retrieve`                   | note.handlers             | **Calendar context injection**                    |
| 31  | `normalizeSearchResults(results)`   | L1050-1063 | — (local)                                 | Internal                  | All search                                        |
| 32  | `normalizeSimilarity(value)`        | L1065-1075 | — (local)                                 | Internal                  | All search                                        |
| 33  | `stripInternalFields(obj)`          | L1077-1088 | — (local)                                 | Internal                  | All results                                       |

### Key Architecture Insights

1. **Proxy Mode** (L60-69): Supabase Edge Function at `/piyapi-proxy/*` routes all API calls. **Calendar OAuth tokens must NOT go through PiyAPI — they need a separate Google Calendar Edge Function.**

2. **Health Cache** (L54-58): 30-second TTL means rapid-fire handler calls don't DDoS PiyAPI. New feature handlers should call `healthCheck()` before every API request — the cache ensures it's free.

3. **Similarity Normalization** (L1069-1075): PiyAPI returns similarity as `int`, `string`, or `float`. `normalizeSimilarity()` handles all 3. **All new feature search results MUST go through this normalizer.**

4. **Internal Fields Stripping** (L1077-1088): 10 PiyAPI DB fields are stripped. **New feature memory objects will also need this stripping.**

5. **Entity Extraction 2-Step** (L756-833): `extractEntities()` is NOT a single call — it calls `kgIngest()` first, then fetches `/kg/entities` to get the actual entity list. **Action item cloud extraction should use this same 2-step pattern.**

---

## 20. Deep Dive: IBackendProvider Contract & Extension Points

`IBackendProvider.ts` (230 lines) defines the interface that `PiyAPIBackend` implements.

### GraphNode Type Union (CRITICAL for Action Items)

```typescript
export interface GraphNode {
  id: string
  label: string
  type: 'meeting' | 'person' | 'topic' | 'decision' | 'action_item' | 'memory' | string
  metadata?: Record<string, unknown>
}
```

**`'action_item'` is ALREADY a valid GraphNode type!** This means KG action item nodes will render in the graph naturally without any graph component changes.

### Methods NOT in IBackendProvider (PiyAPI-specific extras)

These methods exist on `PiyAPIBackend` but NOT in the interface — they're PiyAPI-specific power features:

```
fuzzySearch, feedbackPositive, feedbackNegative, kgIngest, deduplicate,
checkPhi, exportAll, extractEntities, deleteAllData, searchGraph,
getGraphStats, createContextSession, retrieveContext
```

**If we ever add a self-hosted backend**, these would need stubbed implementations.

---

## 21. Deep Dive: Real-Time Event Architecture

### Current Event Flow (Transcript → Renderer)

```
AudioPipelineService.processAudioChunk(Float32Array)
    ↓ (VAD → Whisper ASR)
TranscriptService.saveTranscript({meetingId, segment})
    ↓ emits 'transcript' event
transcript.handlers.ts → setupTranscriptEventForwarding()
    ↓ finds mainWindow via BrowserWindow.getAllWindows()
mainWindow.webContents.send('event:transcriptChunk', chunk)
    ↓ in renderer
useTranscriptStream hook → processes TranscriptChunk
```

### Where to Intercept for New Features

| Feature                         | Hook Point                                            | Event                         | Approach                                                                       |
| :------------------------------ | :---------------------------------------------------- | :---------------------------- | :----------------------------------------------------------------------------- |
| **Action Items (Real-time)**    | `TranscriptService.saveTranscript()` L70 (after emit) | `event:actionItemDetected`    | Run `LocalEntityExtractor.extractActionItems(text)` → if match, emit new event |
| **Sentiment (Real-time)**       | `TranscriptService.saveTranscript()` L70 (after emit) | `event:sentimentUpdate`       | Run heuristic on text → emit score                                             |
| **Action Items (Post-meeting)** | `AudioPipelineService.stopCapture()`                  | `actionItem:extract` IPC call | Full LLM extraction on accumulated transcript                                  |
| **Calendar Auto-Link**          | Meeting `start` event                                 | `calendar:autoLink`           | Match by time ±15min                                                           |

### Real-Time Push Pattern (Copy from L164-207)

```typescript
// New: setupActionItemEventForwarding in action-item.handlers.ts
transcriptService.on('transcript', data => {
  const matches = LocalEntityExtractor.extractActionItems(data.text)
  if (matches.length > 0) {
    const mainWindow = BrowserWindow.getAllWindows().find(
      w => !w.isDestroyed() && w.getBounds().width > 400
    )
    if (mainWindow) {
      mainWindow.webContents.send('event:actionItemDetected', {
        meetingId: data.meetingId,
        items: matches,
        timestamp: data.startTime,
      })
    }
  }
})
```

---

## 22. Deep Dive: CRUD Module & Store Gaps

### CRUD Modules (database/crud/)

| Module                      | Status                                | Exports                                                            | Needs                                                                         |
| :-------------------------- | :------------------------------------ | :----------------------------------------------------------------- | :---------------------------------------------------------------------------- |
| `meetings.ts`               | ✅ Complete                           | create, get, list, update, delete                                  | —                                                                             |
| `transcripts.ts`            | ✅ Complete                           | create, createBatch, get, getByMeeting, getByTimeRange, getContext | —                                                                             |
| `notes.ts`                  | ✅ Complete                           | create, get, update, delete, getByMeeting                          | —                                                                             |
| `entities.ts`               | ✅ Complete                           | create, getByMeeting, getByType                                    | —                                                                             |
| `sync-queue.ts`             | ✅ Complete                           | add, get, delete events                                            | —                                                                             |
| `encryption-keys.ts`        | ✅ Complete                           | create, get, has                                                   | —                                                                             |
| `highlights.ts`             | ⚠️ Exists but NOT exported from index | create, list, delete                                               | Add to `index.ts` exports                                                     |
| **`action-items.ts`**       | ❌ **MISSING**                        | —                                                                  | Must create: create, list, update, delete, getByMeeting, getOverdue, getStats |
| **`sentiment-scores.ts`**   | ❌ **MISSING**                        | —                                                                  | Must create: create, getByMeeting, getMood, getTimeline                       |
| **`calendar-events.ts`**    | ❌ **MISSING**                        | —                                                                  | Must create: create, upsert, list, link, autoLink, getByTimeRange             |
| **`webhooks.ts`**           | ❌ **MISSING**                        | —                                                                  | Must create: create, list, update, delete, getActive                          |
| **`webhook-deliveries.ts`** | ❌ **MISSING**                        | —                                                                  | Must create: create, list, updateStatus                                       |

### AppStore (Zustand) Gaps

`appStore.ts` has 8 `activeView` values:

```typescript
activeView:
  | 'meeting-list'
  | 'meeting-detail'
  | 'settings'
  | 'onboarding'
  | 'knowledge-graph'
  | 'weekly-digest'
  | 'ask-meetings'
  | 'pricing'
```

**Must add:**

```diff
+ | 'action-items'     // Action Items dashboard view
+ | 'sentiment'        // Sentiment analysis view (potentially integrated into meeting-detail)
+ | 'calendar'         // Calendar integration view
```

**Must add recording-time state:**

```diff
+ actionItemsDetected: number    // Real-time count during recording
+ currentMoodScore: number | null // Live sentiment during recording
```

---

## 23. Deep Dive: AskMeetings RAG Pipeline

`AskMeetingsView.tsx` (616 lines) implements a complete RAG (Retrieval-Augmented Generation) pipeline:

### RAG Flow

```
User query ("What action items were assigned to me?")
    ↓
Step 1: search:semantic → top 5 transcript results
    ↓ builds contextText from results
Step 2: intelligence:askMeetings({question, context})
    ↓ main process: local LLM or cloud AI
    ↓ streaming via intelligence:streamToken event
Step 3: Display answer with source citations (clickable → navigate to meeting)
```

### Key Design Decisions

1. **Pro+ locked** (L406): `currentTier === 'free' || currentTier === 'starter'` shows `ProTeaseOverlay`
2. **Token streaming** (L272-292): Listens to `intelligence:streamToken` event, updates last message's content in real-time
3. **History persistence** (L238-248): localStorage with 50-message cap, per-user keyed by email
4. **Pre-baked queries** (L498-518): 3 starter questions including "Summarize action items assigned to me"
5. **Markdown rendering** (L34-184): Custom `MarkdownText` component handles bold, italic, code blocks, lists, headings, links, blockquotes

### Integration with Action Items

The pre-baked query "Summarize action items assigned to me" already exists but **searches transcripts** for context, not the `action_items` table. After implementing the Action Items CRUD:

```diff
// Step 1b: Also search action items table
+ const actionItemResults = await window.electronAPI?.actionItem?.list({})
+ const aiContext = actionItemResults?.data
+   ?.map((ai, i) => `[Action ${i+1}]: ${ai.text} (assigned: ${ai.assignee || 'unassigned'}, status: ${ai.status})`)
+   .join('\n') || ''
+ contextText += '\n\n' + aiContext
```

---

## 24. Deep Dive: Complete File Audit Registry

### Files Read in This Analysis (50+ files, 15,000+ lines)

#### IPC Handlers (12 files)

| File                       | Lines | Key Findings                                                                            |
| :------------------------- | :---- | :-------------------------------------------------------------------------------------- |
| `audio.handlers.ts`        | 824   | 21 IPC channels, `powerSaveBlocker`, process priority elevation, audio chunk forwarding |
| `transcript.handlers.ts`   | 208   | `setupTranscriptEventForwarding()` — template for real-time push events                 |
| `meeting.handlers.ts`      | 451   | CRUD + export (JSON/Markdown), WAL checkpoint management                                |
| `graph.handlers.ts`        | 357   | 6 graph channels, `contradictionPreview` teaser pattern                                 |
| `search.handlers.ts`       | 287   | 3-tier search cascade, encrypted memory handling, auto-feedbackPositive                 |
| `entity.handlers.ts`       | 152   | Canonical dual-path: local extract → cloud extractEntities+kgIngest → merge             |
| `note.handlers.ts`         | 364   | Cloud-first local fallback template, QueryQuotaManager, batchExpand                     |
| `digest.handlers.ts`       | 606   | AI digest generation, regex parsing for decisions/action items                          |
| `intelligence.handlers.ts` | 393   | Hardware tier detection, LLM streaming, meeting suggestions                             |
| `export.handlers.ts`       | 235   | GDPR export/delete, already exports action_items                                        |
| `sync.handlers.ts`         | 202   | Login/logout/trigger sync                                                               |
| `piyapi.handlers.ts`       | —     | Cloud power features (feedback, fuzzy, dedup, pin, clusters, context)                   |

#### Services (14 files)

| File                           | Lines | Key Findings                                                                       |
| :----------------------------- | :---- | :--------------------------------------------------------------------------------- |
| `AudioPipelineService.ts`      | 756   | VAD → ASR → DB pipeline, `processAccumulatedChunk()` hook, `stopCapture()` trigger |
| `TranscriptService.ts`         | 234   | EventEmitter pattern, async embedding gen, `getContext()`                          |
| `BackgroundEmbeddingQueue.ts`  | 186   | 5-batch/10s, max 500, Float32Array BLOB persistence                                |
| `LocalEmbeddingService.ts`     | 446   | ONNX all-MiniLM-L6-v2, 384d, WordPiece tokenizer, DirectML GPU on Windows          |
| `LocalEntityExtractor.ts`      | 107   | ACTION_ITEM regex (English-only), 0.65 confidence                                  |
| `PHIDetectionService.ts`       | 407   | 15 PHI types including international, `detectPHI()`, `maskPHI()`                   |
| `CloudAccessManager.ts`        | 215   | `getCloudAccessStatus()`, `getFeatureAccess()` — dual-path gate                    |
| `TierMappingService.ts`        | 255   | 5-tier pricing, per-feature limits                                                 |
| `SyncManager.ts`               | 755   | Event-sourced queue, batch up to 50, PHI pre-check, ALLOWED_TABLES whitelist       |
| `QueryQuotaManager.ts`         | 132   | Starter: 50 queries/month, query_usage table                                       |
| `EncryptionService.ts`         | 280   | AES-256-GCM + PBKDF2 100K, key cache 5min                                          |
| `AuthService.ts`               | 733   | Supabase auth, Google OAuth, `bluearkive://auth/callback` deep link                |
| `CloudTranscriptionService.ts` | 439   | Deepgram API, usage tracking, WebSocket streaming                                  |
| `ModelManager.ts`              | —     | LLM lifecycle management                                                           |

#### Backend (3 files)

| File                  | Lines | Key Findings                                                                 |
| :-------------------- | :---- | :--------------------------------------------------------------------------- |
| `PiyAPIBackend.ts`    | 1090  | 39 methods, proxy mode vs direct, health cache 30s, similarity normalization |
| `IBackendProvider.ts` | 230   | Interface contract, GraphNode supports 'action_item' type                    |
| `BackendSingleton.ts` | —     | Singleton accessor for PiyAPIBackend                                         |

#### Database (5 files)

| File                 | Lines | Key Findings                                                                         |
| :------------------- | :---- | :----------------------------------------------------------------------------------- |
| `schema.ts`          | 349   | action_items exists (L148-160), missing: sentiment_scores, calendar_events, webhooks |
| `search.ts`          | 341   | 3 FTS tables, `searchAll()`, `rebuildSearchIndexes()`                                |
| `connection.ts`      | —     | SQLite connection management                                                         |
| `crud/index.ts`      | 24    | Exports 6 modules, missing: action-items, highlights, settings                       |
| `crud/sync-queue.ts` | 133   | Sync queue CRUD operations                                                           |

#### Renderer Views (6 files)

| File                     | Lines | Key Findings                                                     |
| :----------------------- | :---- | :--------------------------------------------------------------- |
| `MeetingListView.tsx`    | 518   | Virtualized grid, MeetingCard has no sentiment/action item props |
| `MeetingDetailView.tsx`  | 332   | Transcript + notes tabs, no action items section                 |
| `MeetingCard.tsx`        | 145   | Props lack moodScore, actionItemCount, hasCalendarEvent          |
| `WeeklyDigestView.tsx`   | 1039  | Period selector, AI generation, ProTeaseOverlay for free tier    |
| `AskMeetingsView.tsx`    | 616   | Full RAG pipeline with token streaming, Pro+ locked              |
| `KnowledgeGraphView.tsx` | 189   | GraphCanvas, ProTeaseOverlay, parallel fetch                     |

#### State & Types (3 files)

| File             | Lines | Key Findings                                                                         |
| :--------------- | :---- | :----------------------------------------------------------------------------------- |
| `appStore.ts`    | 194   | 8 activeView types, missing: action-items, sentiment, calendar                       |
| `ipcChannels.ts` | 277   | 17 groups, 67 channels — must add actionItem, sentiment, calendar, webhook           |
| `database.ts`    | 219   | Type definitions for Meeting, Transcript, Note — must add ActionItem, SentimentScore |

#### Config (1 file)

| File             | Lines | Key Findings                                                                       |
| :--------------- | :---- | :--------------------------------------------------------------------------------- |
| `environment.ts` | 168   | Feature flags: knowledge_graph, weekly_digest, phi_detection — missing 4 new flags |

---

## 25. Master Integration Checklist

Every file and change needed for all 4 features, in dependency order:

### Phase 0: Infrastructure (Must do first)

```
[ ] schema.ts — Add 3 new tables + 1 FTS5 table + triggers
[ ] migrations.ts — Add v4 migration
[ ] database.ts — Add ActionItem, SentimentScore, CalendarEvent, Webhook types
[ ] crud/action-items.ts — NEW: Full CRUD module
[ ] crud/sentiment-scores.ts — NEW: Full CRUD module
[ ] crud/calendar-events.ts — NEW: Full CRUD module
[ ] crud/webhooks.ts — NEW: Full CRUD module
[ ] crud/webhook-deliveries.ts — NEW: Full CRUD module
[ ] crud/index.ts — Add new exports + highlights export
[ ] ipcChannels.ts — Add 4 new channel groups + 4 push events
[ ] environment.ts — Add 4 feature flags
[ ] TierMappingService.ts — Add limits for new features
[ ] CloudAccessManager.ts — Extend FeatureAccess interface
[ ] SyncManager.ts — Add new tables to ALLOWED_TABLES
[ ] search.ts — Add searchActionItems(), extend rebuild/optimize
[ ] export.handlers.ts — Extend userData export + deleteAllData
[ ] appStore.ts — Add new activeView types + recording state
```

### Phase 1: Action Items

```
[ ] action-item.handlers.ts — NEW: 8 IPC handlers
[ ] ActionItemService.ts — NEW: Extraction logic (regex + LLM + cloud)
[ ] TranscriptService.ts — Add event hook for real-time detection
[ ] MeetingDetailView.tsx — Add Action Items tab
[ ] MeetingCard.tsx — Add actionItemCount prop
[ ] meeting.handlers.ts — Extend list query with COUNT JOIN
[ ] ActionItemsView.tsx — NEW: Cross-meeting dashboard
[ ] useActionItems.ts — NEW: Hook
```

### Phase 2: Sentiment Analysis

```
[ ] sentiment.handlers.ts — NEW: 4 IPC handlers
[ ] SentimentAnalysisService.ts — NEW: Heuristic + LLM + cloud
[ ] TranscriptService.ts — Add sentiment hook
[ ] MeetingCard.tsx — Add moodScore/moodLabel props
[ ] MeetingDetailView.tsx — Add sentiment timeline tab
[ ] SentimentTimeline.tsx — NEW: D3 chart component
[ ] useSentiment.ts — NEW: Hook
```

### Phase 3: Calendar Integration

```
[ ] calendar.handlers.ts — NEW: 5 IPC handlers
[ ] AppleCalendarService.ts — NEW: ICS file reader
[ ] GoogleCalendarService.ts — NEW: OAuth + REST API
[ ] CalendarView.tsx — NEW: Day/week/month grid
[ ] MeetingCard.tsx — Add hasCalendarEvent prop
[ ] useCalendar.ts — NEW: Hook
[ ] Google OAuth verification — CRITICAL BLOCKER (2-6 weeks)
```

### Phase 4: Webhooks/Zapier

```
[ ] webhook.handlers.ts — NEW: 6 IPC handlers
[ ] WebhookDispatchService.ts — NEW: HMAC signing + dispatch
[ ] PHIDetectionService.ts — Wire into webhook dispatch
[ ] WebhookSettingsView.tsx — NEW: Webhook management UI
[ ] useWebhooks.ts — NEW: Hook
[ ] supabase/functions/webhook-relay — NEW: Edge Function (Pro+)
```

### Total New Files: ~25 | Modified Files: ~17 | Total: ~42 files
