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
