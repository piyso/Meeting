# PiyAPI Notes — Backend, Architecture & Infrastructure Suggestions

> **Scope:** All main-process services, IPC handlers, database, workers, preload, CI/CD, security, performance, competitive strategy, monetization, and distribution. Verified against **35 services**, **14 IPC handlers**, **75+ preload methods**, **10 database tables**, **3 worker threads**, and **24 test files**.

---

## Table of Contents

1. [Backend Maturity Audit](#1-backend-maturity-audit)
2. [Competitive Intelligence](#2-competitive-intelligence)
3. [Ambient Intelligence & Proactive AI](#3-ambient-intelligence--proactive-ai)
4. [Recipes: Backend Implementation](#4-recipes-backend-implementation)
5. [Trust, Privacy & Security Architecture](#5-trust-privacy--security-architecture)
6. [Monetization Engine](#6-monetization-engine)
7. [Performance & Memory Architecture](#7-performance--memory-architecture)
8. [Advanced Architectural Horizons](#8-advanced-architectural-horizons)
9. [Testing & Backend Quality](#9-testing--backend-quality)
10. [CI/CD & Release Engineering](#10-cicd--release-engineering)
11. [Internationalization (Backend)](#11-internationalization-backend)
12. [Competitive Moat & Distribution](#12-competitive-moat--distribution)
13. [Backend Execution Roadmap](#13-backend-execution-roadmap)

---

## 1. Backend Maturity Audit

### Main-Process Services (35 files, `src/main/services/`)

| Service                        | Lines | Status | Notes                                                                                                                                           |
| :----------------------------- | ----: | :----: | :---------------------------------------------------------------------------------------------------------------------------------------------- |
| `AudioPipelineService.ts`      |   390 |   ✅   | VAD, 30s chunking, device enumeration, macOS permission checks, device switching history                                                        |
| `SyncManager.ts`               |   622 |   ✅   | Event-sourced queue, atomic `markSyncedAtomic()`, ALLOWED_TABLES whitelist, content size limits by tier, embedding polling, exponential backoff |
| `CloudAccessManager.ts`        |   405 |   ✅   | 14 feature flags per tier, cache with 60s TTL                                                                                                   |
| `RecoveryPhraseService.ts`     |  26KB |   ✅   | BIP39-style 24-word phrase generation and recovery                                                                                              |
| `EncryptionService.ts`         |   237 |   ✅   | Async PBKDF2 (100K iterations), AES-256-GCM, round-trip test                                                                                    |
| `DeviceManager.ts`             |   513 |   ✅   | Registration, deactivation, reactivation, rename, plan-based limits                                                                             |
| `QueryQuotaManager.ts`         |   138 |   ✅   | Starter 50/month limit, SQLite `query_usage` table                                                                                              |
| `PHIDetectionService.ts`       |   321 |   ✅   | Protected Health Information auto-redaction                                                                                                     |
| `LocalEmbeddingService.ts`     |   300 |   ✅   | Local vector embeddings for semantic search                                                                                                     |
| `AuditLogger.ts`               |   390 |   ✅   | Immutable audit trail in `audit_logs` table                                                                                                     |
| `HardwareTierService.ts`       |   150 |   ✅   | M1/M2/M3 detection, RAM budget calculation                                                                                                      |
| `CloudTranscriptionService.ts` |   260 |   ✅   | Deepgram cloud fallback for Pro users                                                                                                           |
| `CrashReporter.ts`             |   107 |   ✅   | Error reporting                                                                                                                                 |
| `DiagnosticLogger.ts`          |   250 |   ✅   | System diagnostics and crash context                                                                                                            |

### IPC Handlers (14 files) — All ✅

`audio` (21KB), `meeting` (12KB), `note` (12KB), `auth` (9KB), `transcript` (5KB), `sync` (4KB), `search` (3.7KB), `digest` (3.6KB), `settings` (3KB), `model` (3KB), `intelligence` (2.8KB), `graph` (2.5KB), `entity` (2.4KB), `power` (758B).

### Preload API — 75+ methods

Meeting CRUD, note ops, transcript streaming, sync (login/logout/googleAuth), audio (22 methods), intelligence, search, entity, graph, digest, model, power monitoring.

### Database — 10 Tables + 2 FTS5 + 12 Indexes

`meetings`, `transcripts`, `notes`, `entities`, `sync_queue`, `encryption_keys`, `settings`, `query_usage`, `devices`, `audit_logs`. FTS5 virtual tables for `transcripts_fts` and `notes_fts` with auto-sync triggers.

### Worker Threads — 3 Workers

`asr.worker.ts`, `vad.worker.ts`, `audio-indicator.worker.ts`.

---

## 2. Competitive Intelligence

### Granola AI ($13/mo) — Key Backend Gaps

| Feature                                  |     Status      |     Gap     |
| :--------------------------------------- | :-------------: | :---------: |
| **Recipes** (custom AI prompt templates) |       ❌        | 🔴 Critical |
| **Cross-Meeting AI Chat**                |       ❌        | 🔴 Critical |
| **Multi-Language** (10 languages)        | ❌ English only |  🟡 Medium  |
| **Zapier Integration**                   |       ❌        |  🟡 Medium  |

### tl;dv ($18/mo) — Key Backend Gaps

| Feature                                   | Status |     Gap     |
| :---------------------------------------- | :----: | :---------: |
| **30+ Language Transcription**            |   ❌   |  🟡 Medium  |
| **Multi-Meeting Cross-Reports**           |   ❌   | 🔴 Critical |
| **CRM Integration** (Salesforce, HubSpot) |   ❌   |  🟡 Medium  |

### Our Unique Advantages Over ALL Competitors

| Advantage                          | Otter | Fireflies | Granola | tl;dv |
| :--------------------------------- | :---: | :-------: | :-----: | :---: |
| **Local-first audio**              |  ❌   |    ❌     |   ❌    |  ❌   |
| **Client-side E2E encryption**     |  ❌   |    ❌     |   ❌    |  ❌   |
| **Cross-meeting knowledge graph**  |  ❌   |    ❌     |   ❌    |  ❌   |
| **User-sovereign recovery phrase** |  ❌   |    ❌     |   ❌    |  ❌   |
| **Full offline functionality**     |  ❌   |    ❌     | Partial |  ❌   |
| **PHI auto-redaction**             |  ❌   |    ❌     |   ❌    |  ❌   |
| **Immutable audit logging**        |  ❌   |    ❌     |   ❌    |  ❌   |

---

## 3. Ambient Intelligence & Proactive AI

### 3.1 Post-Meeting Auto-Digest

When `recordingState → 'processing'`:

1. `digest.handlers.ts` generates summary/decisions/actions via Ollama
2. Fire macOS native notification: `"📝 'Q4 Planning' — 3 action items detected"`

### 3.2 Cross-Meeting AI Chat (Backend)

Query pipeline: `transcripts_fts` → `entities` table → knowledge graph edges → combine context → feed to LLM. Requires a new `intelligence:crossMeetingQuery` IPC handler.

### 3.3 Weekly Cross-Meeting Digest (Pro)

Scheduled task (every Friday 4 PM): query all meetings from past 7 days, detect contradictions via graph edges, generate aggregate digest via LLM.

### 3.4 Decision Contradiction Alerts

During live meetings, compare extracted entities against knowledge graph. When a `contradicts` edge is detected, emit IPC event to renderer for amber toast.

### 3.5 Meeting Prep Agent

Query local DB for last meeting with calendar-detected attendees. Generate 3-bullet summary 5 minutes before meeting starts. Requires calendar API integration.

---

## 4. Recipes: Backend Implementation

### Database Schema

New `recipes` table:

```sql
CREATE TABLE IF NOT EXISTS recipes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  prompt_template TEXT NOT NULL,
  category TEXT NOT NULL,
  is_custom BOOLEAN DEFAULT 0,
  is_builtin BOOLEAN DEFAULT 1,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);
```

### IPC Handler

New `recipe.handlers.ts`:

- `recipe:list` — list all recipes (built-in + custom)
- `recipe:create` — create custom recipe (Starter+)
- `recipe:run` — inject transcript into prompt template, send to Ollama, return result
- `recipe:delete` — delete custom recipe

### Built-in Recipe Prompts

Ship 6 built-in recipes as seed data in migrations.

### Competitive Edge

Unlike Granola (cloud-only), our recipes run **locally via Ollama**. Medical/legal transcripts never leave the device.

---

## 5. Trust, Privacy & Security Architecture

### 5.1 PHI Redaction Notifications

`PHIDetectionService.ts` runs silently. After meetings, emit an IPC event with the redaction count so the renderer can show a toast.

### 5.2 Processing Mode Badge Data

Expose a new IPC method `intelligence:getProcessingMode` that returns `'local' | 'cloud' | 'offline'` based on current tier and connectivity.

### 5.3 Marketing Positioning

> _"The only meeting assistant that can't read your meetings."_

---

## 6. Monetization Engine

### Tier Architecture (Already Implemented)

`CloudAccessManager.getFeatureAccess()` returns 14 feature flags:

| Feature             |    Free    | Starter (₹299) | Pro (₹599) | Enterprise |
| :------------------ | :--------: | :------------: | :--------: | :--------: |
| Local transcription |     ✅     |       ✅       |     ✅     |     ✅     |
| Cloud AI            |     ❌     |     50/mo      |     ∞      |     ∞      |
| Cloud sync          |     ❌     |       ✅       |     ✅     |     ✅     |
| Multi-device        |     1      |       2        |     ∞      |     ∞      |
| Semantic search     |     ❌     |       ✅       |     ✅     |     ✅     |
| Knowledge graph     |     ❌     |       ❌       |     ✅     |     ✅     |
| Weekly digest       |     ❌     |       ❌       |     ✅     |     ✅     |
| Speaker diarization |     ❌     |       ❌       |     ✅     |     ✅     |
| Team collaboration  |     ❌     |       ❌       |     ❌     |     ✅     |
| Audit logs          |     ❌     |       ❌       |     ❌     |     ✅     |
| Recipes             | 3 built-in |   ∞ built-in   | ∞ + custom | ∞ + custom |
| Cross-meeting chat  |     ❌     |       ❌       |     ✅     |     ✅     |
| Multi-language      |     ❌     |       ❌       |     ✅     |     ✅     |

### Silent Quota Fallback

When `QueryQuotaManager.checkQuota()` returns `exhausted: true`, route inference to local Qwen. **Never break the app.**

### 14-Day Pro Trial

Add `trial_start` and `trial_expires` to `settings` table. Calculate ROI: `"Your trial saved you ~3.2 hours."`.

---

## 7. Performance & Memory Architecture

### RAM Budget

| Component          |       Target | Strategy                                |
| :----------------- | -----------: | :-------------------------------------- |
| LLM (Qwen 2.5 3B)  |     ≤ 4.5 GB | Load on-demand, unload after 5 min idle |
| ASR (Whisper)      |     ≤ 1.5 GB | Active only during recording            |
| Electron (V8 + UI) |     ≤ 500 MB | Monitor with `process.memoryUsage()`    |
| SQLite + FTS5      |     ≤ 100 MB | WAL mode, periodic checkpoints          |
| **Total**          | **≤ 6.5 GB** | Must work on 8 GB Mac                   |

### Hardware Tier Degradation

`HardwareTierService.ts`:

- **High (16GB+ Apple Silicon):** Full Qwen + Whisper turbo + diarization
- **Low (8GB Intel):** Disable Qwen → cloud only. Distil-Whisper. Lower VAD.
- **Zero Internet + Low:** Disable AI expansion, keep transcription. **Never crash.**

### SQLite Tuning

Add to `connection.ts`:

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -8000;
PRAGMA busy_timeout = 5000;
```

### Hierarchical Map-Reduce Summarization

Rolling 5-minute micro-summaries during meetings. Final digest reads micro-summaries only. 70% less RAM, near-instant digest generation.

---

## 8. Advanced Architectural Horizons

### Gap 1: macOS Audio Void

**Problem:** `desktopCapturer` unreliable for Zoom/Teams audio on macOS.
**Fix:** Chrome/Edge Extension injects into Google Meet/Zoom Web, intercepts `MediaStream`, pipes PCM via `ws://127.0.0.1:15321` to desktop daemon.

### Gap 2: CRDT Main Thread Choke

**Problem:** `YjsConflictResolver.ts` runs on main thread. 2 weeks offline → event loop blocks.
**Fix:** Move to `sync.worker.ts` (precedent: `asr.worker.ts`, `vad.worker.ts`).

### Gap 3: Integration Paradox

**Problem:** E2E encryption blocks server-to-server integrations (Zapier/Notion).
**Fix:** **Localhost API Daemon** on `127.0.0.1`. Local Raycast/Obsidian plugins query decrypted data directly.

### Gap 4: Speaker Diarization

**Problem:** Local Whisper has poor `speaker_id` differentiation.
**Fix:** ONNX-based Pyannote.audio lite voice embeddings → "Voice Graph" stored via `LocalEmbeddingService.ts`. All biometric data on-device.

### Gap 5: Context Window Collapse

**Problem:** 2-hour meeting (15K words) exceeds local LLM context limits.
**Fix:** Map-Reduce summarization (see §7).

---

## 9. Testing & Backend Quality

### Existing Tests (24 files)

- 6 database tests (connection, CRUD, FTS5 triggers, search performance, transcript linkage)
- 14 service tests (Encryption, SyncManager, DeviceManager, PHI, CRDT, etc.)
- 1 IPC handler test (transcript event forwarding)
- 1 audio pipeline test (external devices)

### Missing Tests

- `digest.handlers.ts` — no tests
- `intelligence.handlers.ts` — no tests
- `graph.handlers.ts` — no tests
- `QueryQuotaManager.ts` — no tests
- `CloudTranscriptionService.ts` — no tests
- Integration tests for full audio → transcript → digest pipeline

---

## 10. CI/CD & Release Engineering

### Current State (`release.yml`)

- ✅ macOS ARM64 + x64 builds on `macos-14`
- ❌ Code signing **disabled** (`CSC_IDENTITY_AUTO_DISCOVERY: false`)
- ❌ No Windows CI job
- ❌ No Linux CI job
- ❌ **No test step** (builds without running tests!)
- ❌ No auto-update mechanism

### Required Fixes

1. Add `npm test` step before build
2. Enable Apple code signing (`CSC_LINK`, `APPLE_ID`, `APPLE_TEAM_ID`)
3. Enable notarization for macOS Gatekeeper
4. Add Windows job on `windows-latest`
5. Configure `electron-updater` for in-app auto-updates

---

## 11. Internationalization (Backend)

### Multi-Language Transcription

Whisper natively supports 96 languages. Implementation:

1. Add `transcription_language` to `settings` table
2. Pass `language` param from `settings.handlers.ts` to `ASRService.ts`
3. Auto-detect language option via Whisper's `detect_language` feature

---

## 12. Competitive Moat & Distribution

### 5 Unique Moats

1. **Local-first audio** — audio never leaves device on free tier
2. **Client-side E2E encryption** — even PiyAPI cannot read user data
3. **Cross-meeting knowledge graph** — contradiction detection
4. **User-sovereign recovery phrase** — BIP39-style key ownership
5. **Full-stack audit logging** — HIPAA/SOC 2 compliance path

### Distribution Roadmap

| Phase | Timeline | Deliverable                                    |
| :---- | :------- | :--------------------------------------------- |
| **1** | Now      | macOS Desktop (Electron, Apple Silicon)        |
| **2** | Q2 2026  | Windows + Linux                                |
| **3** | Q3 2026  | Browser Extension for Google Meet/Zoom Web     |
| **4** | Q3 2026  | Read-only iOS/Android Companion (React Native) |
| **5** | Q4 2026  | Calendar Integration (auto-start recording)    |
| **6** | Q1 2027  | Localhost API/SDK for plugins                  |
| **7** | Q2 2027  | Team/Enterprise workspace                      |

---

## 13. Backend Execution Roadmap

### Phase A: Critical Backend Fixes (Days 1-5)

| #   | Task                                                         | Files                              |
| :-- | :----------------------------------------------------------- | :--------------------------------- |
| A1  | Wire `digest.handlers.ts` to auto-generate on recording stop | `digest.handlers.ts`, main process |
| A2  | Create `intelligence:meetingSuggestion` IPC handler          | New handler                        |
| A3  | Create `crash:report` IPC handler                            | New handler                        |
| A4  | Persist `lastSyncTimestamp` in `settings` table              | `settings.handlers.ts`             |
| A5  | Add `npm test` to CI pipeline                                | `release.yml`                      |

### Phase B: New Backend Features (Days 6-12)

| #   | Task                                           |
| :-- | :--------------------------------------------- |
| B1  | `recipes` table + seed data migration          |
| B2  | `recipe.handlers.ts` (list/create/run/delete)  |
| B3  | `intelligence:crossMeetingQuery` handler       |
| B4  | Multi-language param pass-through to ASR       |
| B5  | Weekly digest scheduled task                   |
| B6  | 14-day Pro trial logic in `CloudAccessManager` |

### Phase C: Architecture (Days 13-18)

| #   | Task                                    |
| :-- | :-------------------------------------- |
| C1  | `sync.worker.ts` (CRDT off main thread) |
| C2  | SQLite WAL mode + cache tuning          |
| C3  | Map-Reduce micro-summary engine         |
| C4  | LLM idle timeout (5 min unload)         |

### Phase D: Distribution (Days 19-25)

| #   | Task                                     |
| :-- | :--------------------------------------- |
| D1  | Enable Apple code signing + notarization |
| D2  | Browser extension WebSocket daemon       |
| D3  | Localhost REST API daemon (`127.0.0.1`)  |
| D4  | Windows CI job                           |
| D5  | `electron-updater` auto-update config    |

---

> **Backend bottom line:** The service layer is 85% complete. Remaining work: **(1) new IPC handlers** (recipes, cross-meeting chat, crash reporting), **(2) architectural hardening** (CRDT worker thread, Map-Reduce summarization, SQLite WAL), and **(3) CI/CD maturity** (test step, code signing, auto-updates, Windows builds).
