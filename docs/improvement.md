# PiyNotes — Definitive Project Improvement Plan

> **Scope**: Every file in the project audited. **39 services** (15,000+ lines), **70+ components**, **7 views**, **10 hooks**, **23 IPC handlers**, **8 CRUD files**, **1 ASR worker** (438 lines), **1 mock layer** (1,334 lines), **497-line design system**, **396-line package.json**, **1,230-line type system**, **349-line schema**. Live PiyAPI tested across **7 languages**. Competitive analysis across **8 enterprise players**.

---

## PART 1 — DISCONNECTED INFRASTRUCTURE

> Fully built code (thousands of lines) that isn't wired. These are the **highest-ROI fixes** because the work is already done.

### 1.1 PHI Detection → SyncManager (3 lines to wire)

- `PHIDetectionService.ts` (361 lines): 11 PHI types, masking, risk scoring — ✅ complete with tests
- `SettingsView.tsx` lines 37-38: toggles for `phiDetectionEnabled` & `maskPHIBeforeSync` — ✅ UI exists
- `SyncManager.syncPendingEvents()` never calls `PHIDetectionService.checkBeforeSync()` — ❌ **NOT WIRED**
- **Impact**: HIPAA compliance. Zero competitors have this. Settings toggles are completely non-functional.

### 1.2 Language Setting → Whisper ASR (5 lines to wire)

- `SettingsView.tsx` line 42: language dropdown exists — ✅
- Whisper ONNX supports 99 languages — ✅ Built in
- `ASRService.initialize()` sends `{ type: 'init', data: { modelsDir } }` — **language is never passed**
- `asr.worker.ts` has NO language parameter in `initializeModel()` or `transcribe()`
- **Impact**: Every user gets English-only transcription regardless of language setting.

### 1.3 CloudTranscription → AudioPipeline (439 lines dead code)

- `CloudTranscriptionService.ts` (439 lines): Complete Deepgram WebSocket, streaming, diarization, usage tracking — ✅
- `TranscriptionIntegration.example.ts` (170 lines): Integration example — ✅
- `AudioSetup.tsx` (167 lines): Offers "Use Cloud" option when Stereo Mix unavailable — ✅
- `SettingsView.tsx` `useCloudTranscription` toggle — ✅ UI exists
- `AudioPipelineService.processAccumulatedChunk()` — ❌ **Never calls CloudTranscription**
- **Impact**: 439 lines of working cloud transcription code unused. Low-hardware users have no fallback.

### 1.4 Audio Highlights — No UI Entry Point

- `highlight.handlers.ts` (66 lines): create/list/delete — ✅ CRUD complete
- `audio_highlights` DB table — ✅ Schema exists
- `MiniWidget.tsx` declares `onBookmark` prop — ✅ Prop exists
- `AppLayout.tsx` has `handleQuickBookmark()` and `Cmd+B` shortcut (lines 287-303) — ✅ Handler exists
- **Issue**: Verify the bookmark button is visible during recording. If `onBookmark` is passed as `noop`, the feature is hidden.

### 1.5 Container.ts — DI Container Underused

- `container.ts` (93 lines): Lightweight DI container exists but only holds `config` and `logger`
- Project has **30+ singletons** each with `getInstance()`/`getXService()` pattern scattered across files
- **Fix**: Register all singletons. Enables mock injection for testing, explicit startup ordering, clean shutdown.

---

## PART 2 — ASR WORKER CRITICAL ISSUES

> The transcription pipeline has **3 critical problems** found during deep analysis.

### 2.1 Moonshine Decoder — ASCII Only

`asr.worker.ts` lines 306-320:

```typescript
function decodeTokens(tokens: Float32Array): string {
  for (let i = 0; i < tokens.length; i++) {
    const tokenId = Math.round(tokens[i] ?? 0)
    if (tokenId > 0 && tokenId < 128) {
      // ← ASCII ONLY
      decoded.push(String.fromCharCode(tokenId))
    }
  }
}
```

All non-ASCII text (CJK, Arabic, Hindi, accented European) is **silently dropped**. A Japanese meeting produces empty output.

### 2.2 Whisper Turbo — Falls Back to Moonshine

`loadWhisperTurbo()` (lines 166-176) immediately falls back: `"Whisper.cpp native binding not available — falling back to Moonshine Base"`. Users on 16GB+ machines get the SAME model as 8GB machines.

### 2.3 No Language Parameter Anywhere

`initializeModel(data?: { modelsDir?: string })` — no language field in the type. Same for `transcribe()`. The language dropdown in Settings is completely decorative.

### 2.4 No Worker Crash Recovery

If the ASR worker crashes (`exit` event with non-zero code), `ASRService` sets `isReady = false` but has **no auto-restart**. User must restart the entire app.

---

## PART 3 — LOCAL EMBEDDING SERVICE — MULTILINGUAL BROKEN

### 3.1 Tokenizer Strips Non-ASCII

`LocalEmbeddingService.ts` line 303-306:

```typescript
const words = text
  .toLowerCase()
  .replace(/[^\w\s]/g, ' ') // \w = [a-zA-Z0-9_] — CJK/Hindi/Arabic → spaces
  .split(/\s+/)
```

All CJK characters become spaces → `[UNK]` tokens → garbage embeddings. Local semantic search is broken for non-English.

**Fix**: `.replace(/[^\p{L}\p{N}\s]/gu, ' ')` (Unicode letter/number categories).

### 3.2 English-Only Embedding Model

Model: `all-MiniLM-L6-v2` — English-first. Even with tokenizer fix, non-English quality is poor.

**Alternative**: `paraphrase-multilingual-MiniLM-L12-v2` — 50+ languages, similar size (~46MB).

---

## PART 4 — LOCAL ENTITY/PHI — ENGLISH/US ONLY

### 4.1 LocalEntityExtractor (104 lines) — English Regex

| Pattern                                   | Fails For                             |
| :---------------------------------------- | :------------------------------------ |
| PERSON `[A-Z][a-z]+\s+[A-Z][a-z]+`        | 田中太郎, أحمد, राहुल, 김대리         |
| AMOUNT `\$[\d,]+`                         | ¥5,000,000, €1,000, ₹50,000, ₩100,000 |
| ACTION_ITEM `need to\|should\|must\|will` | する必要がある, يجب, करना होगा        |

### 4.2 PHIDetectionService (361 lines) — US Patterns

| Pattern                     | Misses                                           |
| :-------------------------- | :----------------------------------------------- |
| SSN `\d{3}-\d{2}-\d{4}`     | Aadhaar (12-digit), My Number (JP), RRN (KR)     |
| PHONE `(\d{3})\d{3}-\d{4}`  | 090-xxxx-xxxx (JP), 010-xxxx-xxxx (KR), +91 (IN) |
| ADDRESS `Street\|Ave\|Blvd` | 東京都渋谷区, Straße, गली                        |

**PiyAPI cloud PHI** did detect Indian Aadhaar (0.97 confidence) but missed JP/KR phone formats.

---

## PART 5 — PiyAPI MULTILANGUAGE RESULTS (Live Tested)

### 5.1 Semantic Search — Cross-Language

| Query → Target        | Similarity | Verdict         |
| :-------------------- | :--------- | :-------------- |
| English → Japanese 🇯🇵 | **0.894**  | ✅ Excellent    |
| Japanese → Japanese   | **0.934**  | ✅ Near-perfect |
| German → German 🇩🇪    | **0.914**  | ✅ Excellent    |
| English → Korean 🇰🇷   | **0.901**  | ✅ Excellent    |
| English → Chinese 🇨🇳  | **0.500**  | ⚠️ Moderate     |
| English → Arabic 🇸🇦   | **0.229**  | ❌ Weak         |
| English → Hindi 🇮🇳    | **0.130**  | ❌ Very weak    |

### 5.2 ask_memory — Remarkable

- English question → correctly translated and answered content from JP/CN/DE/AR
- Korean question → answered **IN KOREAN** with 1.0 relevance score

### 5.3 KG Ingestion — English/Latin Only

| Language    | Entities | Facts    |
| :---------- | :------- | :------- |
| German 🇩🇪   | 6        | 4 ✅     |
| English     | 5        | 0 ✅     |
| Japanese 🇯🇵 | **0**    | **0** ❌ |
| Korean 🇰🇷   | **0**    | **0** ❌ |

### 5.4 Fuzzy Search — CJK Fails

Japanese query "予算" returned 0 results. Trigram similarity (pg_trgm) doesn't work for CJK.

---

## PART 6 — SECURITY & BUILD

### 6.1 `hardenedRuntime: false` (package.json line 205)

Apple requires Hardened Runtime for notarization since macOS 10.15. Without it, Gatekeeper blocks installation.

**Fix**: Set `true` + add entitlements for audio/screen capture:

```xml
<key>com.apple.security.device.audio-input</key><true/>
<key>com.apple.security.device.screen-capture</key><true/>
```

### 6.2 Dual Backend: Supabase + PiyAPI

Supabase (`@supabase/supabase-js`) referenced in **9 files**: AuthService, SyncManager, PiyAPIBackend, billing, auth handlers, diagnostic, OnboardingFlow, environment.

| Backend  | Purpose                              |
| :------- | :----------------------------------- |
| Supabase | Auth, billing, user mgmt             |
| PiyAPI   | Memories, KG, search, entities, sync |

Two cloud dependencies = two failure points. Consider consolidating.

### 6.3 `.pnotes` File Association Without Handler

`package.json` registers `.pnotes` file type on Windows/Linux with `"role": "Editor"`. But no `file:open` IPC handler processes opened files.

### 6.4 Deep Link Protocol

`bluearkive://` deep links registered. `main.ts` has `handleDeepLink()`. Ensure all deep link paths are validated against injection.

---

## PART 7 — UNTAPPED PiyAPI (11 of 35+ operations unused)

| #   | Feature                        | Integration Point                | Effort |
| :-- | :----------------------------- | :------------------------------- | :----- |
| 1   | `feedback_positive`/`negative` | 👍/👎 on AskMeetingsView results | ~2hr   |
| 2   | `fuzzy_search`                 | Fallback on 0-result searches    | ~1hr   |
| 3   | `deduplicate`                  | Weekly background KG cleanup     | ~1hr   |
| 4   | `create_context_session`       | Delta-sync optimization          | ~2hr   |
| 5   | `get_clusters`                 | "Meeting Topics" visualization   | ~4hr   |
| 6   | `kg_time_travel`               | "What did we know last month?"   | ~4hr   |
| 7   | `pin_memory`                   | User pins important decisions    | ~1hr   |
| 8   | `create_relationship`          | Manual meeting-to-meeting links  | ~2hr   |
| 9   | `version_history`/`rollback`   | Memory versioning UI             | ~2hr   |
| 10  | `check_phi`                    | Server-side PHI double-check     | ~1hr   |
| 11  | `get_context`                  | Token-budget LLM context packing | ~2hr   |

---

## PART 8 — MISSING ENTERPRISE FEATURES

### 8.1 Calendar Integration (Gap #1)

Every competitor (Otter, Fireflies, Fathom, Granola) has Google Calendar integration. PiyNotes does not. `ZenRail.tsx` imports `CalendarDays` from lucide-react but uses it for Weekly Digest, not calendar.

### 8.2 Action Items Pipeline (90% Built)

| Done                                        | Missing                               |
| :------------------------------------------ | :------------------------------------ |
| ✅ DB table + indexes                       | ❌ Per-meeting LLM extraction         |
| ✅ Regex extraction in LocalEntityExtractor | ❌ MeetingDetailView Action Items tab |
| ✅ SmartChip rendering                      | ❌ PostMeetingDigest integration      |
| ✅ WeeklyDigestView rendering               | ❌ No `action-items.ts` CRUD file     |

### 8.3 Sentiment Analysis

Local Qwen LLM → segment-level sentiment. Extend `SpeakerHeatmap.tsx` (1KB). "Meeting Mood" in digest.

### 8.4 Webhook Integration

`WebhookService`: events `meeting.completed`, `action_item.created`, `digest.generated`. Users connect CRM via Zapier.

---

## PART 9 — WIDGET & PERFORMANCE

| #   | Issue                                | Fix                                              | Impact           |
| :-- | :----------------------------------- | :----------------------------------------------- | :--------------- |
| 1   | Timer IPC flood (60 calls/min)       | Send timestamp, compute locally                  | ⚡ 12× fewer IPC |
| 2   | Widget state: 10 separate `useState` | Single state object                              | ⚡ Fewer renders |
| 3   | No macOS vibrancy                    | `vibrancy: 'under-window'` (1 line)              | 🖥️ ~40% GPU      |
| 4   | Not visible on all Spaces            | `setVisibleOnAllWorkspaces(true)`                | 🖥️ Spaces        |
| 5   | 3 widget implementations             | Clarify MiniWidget vs WidgetApp vs DynamicIsland | 🧹 Dead code?    |
| 6   | `RecordingTimer.tsx` (1.3KB)         | Delete — never imported                          | 🧹 Dead          |
| 7   | `d3` full import in GraphCanvas      | Tree-shake to d3-selection/force/drag            | 📦 Bundle        |

---

## PART 10 — CODE QUALITY

### 10.1 RecoveryPhraseService — 2,366 Lines

Contains full BIP39 2,048-word English wordlist inline. Actual service logic is ~300 lines. **Extract wordlist to JSON file** (~2,000 lines saved).

### 10.2 Mixed CSS Strategy

`index.css` line 17-19: `@tailwind base; @tailwind components; @tailwind utilities;` — Tailwind IS actively used alongside 20+ vanilla CSS files. Some components use Tailwind classes, others use BEM-style vanilla CSS.

**Recommendation**: Pick one. The Sovereign UI design system (497-line `index.css`) is entirely vanilla CSS.

### 10.3 mockElectronAPI (1,334 Lines!)

Incredibly thorough stateful mock: simulated delays, streaming, all IPC operations mocked. This is excellent dev infrastructure — make sure it stays in sync with real IPC changes.

### 10.4 No Tests for Critical Paths

| Has Tests ✅        | No Tests ❌               |
| :------------------ | :------------------------ |
| PHIDetectionService | SyncManager               |
| EncryptionService   | AudioPipelineService      |
| ConflictResolver    | BackgroundEmbeddingQueue  |
| YjsConflictResolver | CloudTranscriptionService |
|                     | DeviceManager             |
|                     | Widget IPC                |

### 10.5 Root Directory Clutter

41 markdown files in root (TASK*\*, BACKEND*\*, implementation plans). Move to `docs/archive/`.

### 10.6 ModelManager Session Leak

`ModelManager.forceUnload()` must be called in `app.on('will-quit')`. If missed, LLM sessions leak GPU memory.

---

## PART 11 — COMPETITIVE ADVANTAGES (Protect These)

| Feature                | Code                                     | Why Unique                                            |
| :--------------------- | :--------------------------------------- | :---------------------------------------------------- |
| Full Offline AI        | ASR(306)+Model(450)+Pipeline(711)        | Only meeting tool that works without internet         |
| E2E Encryption         | EncryptionService(280)                   | AES-256-GCM+PBKDF2 100K. Competitors store plaintext. |
| Visual Knowledge Graph | GraphCanvas(303)+KGView(187)             | D3 force graph. Nobody else has this.                 |
| PHI Auto-Detection     | PHIDetectionService(361)                 | 11 HIPAA identifiers (just needs wiring)              |
| Live AI Coach          | useSilentPrompter(104)                   | 4-mode real-time tips during meetings                 |
| CRDT Notes             | NoteEditor(238)+Yjs                      | Offline-first collaborative editing                   |
| Zero-GC Audio          | AudioBufferPool(711)                     | Pre-allocated SharedArrayBuffer pool                  |
| Crash Recovery         | Pipeline.recoverOrphanedAudio()          | Scans temp dir for orphaned audio                     |
| BIP39 Recovery Phrase  | OnboardingFlow(705)+RecoveryPhrase(2366) | Zero-knowledge encryption key backup                  |
| Interactive Tutorial   | GhostMeetingTutorial(431)                | Simulated live meeting for onboarding                 |
| Post-Meeting Digest    | PostMeetingDigest(381)                   | Summary+decisions+actions+export                      |
| Hardware-Adaptive AI   | ModelManager tier detection              | 8/12/16GB auto-selects optimal model                  |
| SOC 2 Audit Trail      | AuditLogger(671)                         | Immutable logs, 20+ event types, CSV/JSON export      |
| Model Verification     | ModelDownloadService(572)                | SHA-256 checksum + retry + progress IPC               |

---

## PART 12 — TIER SYSTEM DEEP ANALYSIS

> Traced through 12 files: `TierMappingService.ts`, `CloudAccessManager.ts`, `QueryQuotaManager.ts`, `DeviceWallDialog.tsx`, `IntelligenceWallDialog.tsx`, `billing.handler.ts`, `TranscriptChunker.ts`, `ZenRail.tsx`, `useSystemState.ts`, `appStore.ts`, `PricingView.tsx`, `SettingsView.tsx`.

### 12.1 Current Tier Map (from `TierMappingService.ts`)

|                 | **Free** | **Starter** ($9/mo) | **Pro** ($19/mo)   | **Team** ($15/user/mo) | **Enterprise** |
| :-------------- | :------- | :------------------ | :----------------- | :--------------------- | :------------- |
| INR Price       | ₹0       | ₹749 (₹599/yr)      | ₹1,499 (₹1,199/yr) | ₹1,249 (₹999/yr)       | Custom         |
| Devices         | 1        | 2                   | ∞                  | ∞                      | ∞              |
| Transcript      | 5K chars | 10K chars           | 25K chars          | 50K chars              | 100K chars     |
| AI Queries      | 0        | 50/month            | ∞                  | ∞                      | ∞              |
| Cloud Sync      | ❌       | ✅                  | ✅                 | ✅                     | ✅             |
| Cloud AI        | ❌       | ✅                  | ✅                 | ✅                     | ✅             |
| Knowledge Graph | ❌       | Read-only           | Interactive        | Interactive            | Interactive    |
| Diarization     | ❌       | ❌                  | ✅                 | ✅                     | ✅             |
| Weekly Digest   | ❌       | ❌                  | ✅                 | ✅                     | ✅             |
| Hybrid Search   | ❌       | ❌                  | ✅                 | ✅                     | ✅             |
| Team Collab     | ❌       | ❌                  | ❌                 | ✅                     | ✅             |
| Audit Logs      | ❌       | ❌                  | ❌                 | ❌                     | ✅             |

**Payment**: Dual-gateway — Razorpay (India) + Lemon Squeezy (global). Both monthly + yearly plan IDs exist in code.

### 12.2 What's Working Well

1. **Single Source of Truth** — `TierMappingService.ts` controls ALL limits. Change one number, it updates everywhere.
2. **Graceful Degradation** — When Starter exhausts 50 AI queries, `QueryQuotaManager` silently falls back to local Qwen LLM. No hard block.
3. **Two Premium Paywalls** — `DeviceWallDialog` (device limit hit) + `IntelligenceWallDialog` (AI quota exhausted). Both offer escape routes.
4. **JWT Security** — `billing.handler.ts` intentionally does NOT pass JWT as URL parameter to checkout (prevents leak via browser history/logs).
5. **60s Auto-Refresh** — `useSystemState.ts` refreshes quota every 60s + on window focus, so exhaustion is detected mid-session.

### 12.3 Problems Found (7 Issues)

#### Problem 1: Free Tier Is a Broken Demo

- **0 AI queries**, no cloud sync, no KG, no Weekly Digest, no diarization
- **5K chars ≈ 3 minutes of audio** — users can barely complete one meeting
- Free users can't experience ANY intelligence feature → no idea why they should upgrade
- **Fix**: Give Free users 5–10 AI queries/month + read-only KG. Let them see the magic.

#### Problem 2: Starter ($9) Has No Diarization

- In a 3-person meeting, the transcript is a wall of undifferentiated text
- User pays $9/mo but can't tell who said what — the app feels **broken**
- This is the #1 reason Starter users would churn or skip straight to Pro
- **Fix**: Give Starter basic diarization (cap at 2 speakers). Reserve unlimited speakers for Pro.

#### Problem 3: Starter ($9) Has No Weekly Digest

- Weekly Digest uses the **local Qwen LLM** — costs ZERO to serve
- Locking it behind Pro ($19) wastes the cheapest retention tool available
- Digest is what creates habit/stickiness — users open the app Monday morning to see their week
- **Fix**: Unlock Weekly Digest for Starter. It's free compute.

#### Problem 4: Pro ($19) > Team ($15/user) Pricing Paradox

- A solo user on Pro pays **$19/mo**
- That same user could switch to Team and pay **$15/mo** — it's cheaper
- This creates a perverse incentive to "downgrade" from Pro to Team
- **Fix**: Either Team requires minimum 3 seats ($45/mo floor), or raise Team to $19/user/mo and differentiate on admin features.

#### Problem 5: ZenRail Lock Icons Are Cosmetic

- Free/Starter users see 🔒 on KG, Digest, Ask views in `ZenRail.tsx`
- But clicking the icon **navigates anyway** — shows a degraded/empty view
- **Fix**: Intercept click → show paywall BEFORE navigating. Or show a rich empty state with clear upgrade CTA.

#### Problem 6: Transcript Limit Is Invisible

- Users don't know about 5K/10K/25K limit until `TranscriptChunker` silently splits their transcript
- No progress indicator during recording. No warning at 80%.
- **Fix**: Show real-time character counter during recording. At 80%, show toast: "Approaching transcript limit — upgrade for 5x more."

#### Problem 7: No Contact Sales for Enterprise

- Enterprise tier shows "Custom" pricing but PricingView has no "Contact Us" button or email
- Enterprise buyers can't self-serve — they need a demo booking link
- **Fix**: Add `mailto:sales@bluearkive.com` or Calendly embed.

### 12.4 Recommended Tier Restructure

|               | **Free**            | **Starter** ($9)     | **Pro** ($19) | **Team** ($15/user, min 3) |
| :------------ | :------------------ | :------------------- | :------------ | :------------------------- |
| Devices       | 1                   | 2                    | ∞             | ∞                          |
| Transcript    | 5K                  | **15K** ↑            | **50K** ↑     | **100K** ↑                 |
| AI Queries    | **5/mo** ← NEW      | 50/mo                | ∞             | ∞                          |
| Cloud Sync    | ❌                  | ✅                   | ✅            | ✅                         |
| KG            | **Read-only** ← NEW | Read-only            | Interactive   | Interactive                |
| Diarization   | ❌                  | **2 speakers** ← NEW | ∞             | ∞                          |
| Weekly Digest | ❌                  | **✅** ← NEW         | ✅            | ✅                         |
| Hybrid Search | ❌                  | ❌                   | ✅            | ✅                         |
| Team Collab   | ❌                  | ❌                   | ❌            | ✅                         |
| Audit/SSO     | ❌                  | ❌                   | ❌            | ✅                         |

**Key changes**:

1. Free gets 5 AI queries + read-only KG → hooks users by showing intelligence
2. Starter gets diarization (2 speakers) + Weekly Digest → actually usable, retention ↑
3. Transcript limits increased across board (competitive with Otter's 40-min free limit)
4. Team has 3-seat minimum → prevents Pro→Team "downgrade hack"

### 12.5 Competitive Pricing Comparison

| App              | Free            | Paid         | What Free Gets                      |
| :--------------- | :-------------- | :----------- | :---------------------------------- |
| **Otter.ai**     | 300 min/mo      | $8.33-$20/mo | Transcription + limited AI          |
| **Fireflies.ai** | 800 min storage | $10-$19/mo   | Transcription + search              |
| **Fathom**       | Free forever    | $15-$29/mo   | Unlimited transcription + summaries |
| **Granola**      | 25 meetings/mo  | $16/mo       | Full features, hard cap             |
| **Krisp**        | 120 min/day     | $8-$12/mo    | Transcription + noise cancel        |
| **PiyNotes**     | 5K chars, no AI | $9-$19/mo    | Transcription only, no intelligence |

**PiyNotes' Free tier is the weakest in the market**. Every competitor gives free users enough to experience the product's intelligence. PiyNotes gives them a mute recorder.

### 12.6 Tier Enforcement Architecture

```
User opens app
    │
    ▼
useSystemState.ts ──────── loads tier from Keychain via auth.getCurrentUser()
    │                       refreshes every 60s + on window focus
    ▼
appStore.ts ───────────── stores currentTier in Zustand store
    │
    ├──→ ZenRail.tsx ──── shows 🔒 icons if tier = free|starter
    │
    ├──→ AppLayout.tsx ── routes views, shows ConflictMergeDialog
    │
    ▼
CloudAccessManager.ts ─── runtime gating engine (1-min cache)
    │                      checks: logged in? → tier? → online? → token valid?
    │
    ├──→ getFeatureAccess() ──→ TierMappingService.getTierLimits()
    │                            SINGLE SOURCE OF TRUTH
    │
    ├──→ TranscriptChunker ──→ enforces per-tier char limits
    │
    ├──→ QueryQuotaManager ──→ tracks Starter's 50/mo in SQLite
    │                           exhausted → IPC → IntelligenceWallDialog
    │
    ├──→ DeviceManager ──────→ checks device count vs limit
    │                           exceeded → IPC → DeviceWallDialog
    │
    └──→ SyncManager ────────→ hasCloudAccess()? sync : skip
```

**Files involved**: `TierMappingService.ts` (255 lines) → `CloudAccessManager.ts` (355 lines) → `QueryQuotaManager.ts` (132 lines) → `DeviceManager.ts` → `TranscriptChunker.ts` (285 lines) → `billing.handler.ts` (169 lines)

---

## PART 13 — MULTILANGUAGE VERDICT

**PiyAPI Cloud**: ✅ Capable — search works (0.89-0.93 for CJK), ask_memory translates across languages, storage handles all Unicode. **But**: KG entity extraction and fuzzy search fail for non-Latin scripts.

**Local Pipeline**: ❌ NOT capable — 4 layers are English-only:

1. ASR worker (ASCII decoder)
2. Embedding tokenizer (strips CJK)
3. Entity extraction (English regex)
4. PHI detection (US patterns)

**Strategy**: Cloud-first for non-English (wire Deepgram), then fix local layers incrementally.

---

## COMPLETE PRIORITY MATRIX (Updated with Tier Fixes)

| P      | Item                                       | Effort                  | Impact              |
| :----- | :----------------------------------------- | :---------------------- | :------------------ |
| **P0** | Wire PHI → SyncManager                     | 3 lines                 | 🔥 HIPAA            |
| **P0** | Wire Language → ASR worker                 | 5 lines                 | 🌐 99 langs         |
| **P0** | Fix Moonshine ASCII decoder                | ~2hr                    | 🌐 Non-English      |
| **P0** | Set `hardenedRuntime: true`                | 1 line + entitlements   | 🔐 Notarization     |
| **P0** | Give Free tier 5 AI queries + read-only KG | ~2hr                    | 💰 Activation       |
| **P0** | Give Starter diarization (2 speakers)      | ~3hr                    | 💰 Retention        |
| **P0** | Give Starter Weekly Digest                 | ~30min (just flip flag) | 💰 Retention        |
| **P0** | Fix Pro > Team pricing paradox             | Config change           | 💰 Revenue leak     |
| **P0** | Delete RecordingTimer.tsx                  | 1 min                   | 🧹 Dead code        |
| **P1** | Wire CloudTranscription → Pipeline         | ~4hr                    | ☁️ Low-HW fallback  |
| **P1** | Fix embedding tokenizer `\w` → `\p{L}`     | 1 line                  | 🌐 Local search     |
| **P1** | Add real-time transcript limit indicator   | ~3hr                    | 💰 Upsell UX        |
| **P1** | Make ZenRail locks block navigation        | ~2hr                    | 💰 Paywall clarity  |
| **P1** | Timer IPC flood fix                        | ~2hr                    | ⚡ Performance      |
| **P1** | Action Items per-meeting + tab             | ~4hr                    | 💼 Enterprise       |
| **P1** | ASR worker auto-restart (max 3)            | ~1hr                    | 🔄 Reliability      |
| **P2** | Add Enterprise "Contact Sales" button      | ~30min                  | 💰 Enterprise leads |
| **P2** | Calendar integration                       | ~6hr                    | 📅 Table stakes     |
| **P2** | Extract BIP39 wordlist to JSON             | ~30min                  | 📦 -2000 lines      |
| **P2** | Add intl PHI patterns (JP/KR/IN)           | ~3hr                    | 🌐 Global PHI       |
| **P2** | Container.ts — register all singletons     | ~3hr                    | 🏗️ Architecture     |
| **P2** | Create action-items.ts CRUD module         | ~1hr                    | 🧹 Data layer       |
| **P3** | PiyAPI adaptive learning feedback          | ~2hr                    | 🧠 Search quality   |
| **P3** | PiyAPI fuzzy search fallback               | ~1hr                    | 🔍 Typo tolerance   |
| **P3** | Switch local embedding to multilingual     | ~2hr                    | 🌐 50 languages     |
| **P3** | Sentiment analysis via local LLM           | ~4hr                    | 💬 Meeting mood     |
| **P3** | Webhooks/Zapier integration                | ~6hr                    | 🔗 CRM access       |
| **P4** | Widget vibrancy + workspace visibility     | 2 lines                 | 🖥️ macOS            |
| **P4** | Clarify 3 widget implementations           | ~2hr                    | 🧹 Dead code?       |
| **P4** | Standardize CSS strategy                   | ~2hr                    | 🎨 Consistency      |
| **P4** | Move root markdown to docs/archive         | ~30min                  | 📁 Clean root       |
| **P4** | Widget ARIA accessibility                  | ~2hr                    | ♿ WCAG             |
| **P4** | Verify .pnotes file handler exists         | ~1hr                    | 📄 File assoc       |
| **P5** | ModelManager cleanup on quit               | ~30min                  | 🧹 Memory leak      |
| **P5** | Remaining PiyAPI features (8)              | ~15hr                   | 🧩 Full platform    |
| **P5** | SyncManager test suite                     | ~4hr                    | 🧪 Critical path    |
| **P5** | AudioPipeline test suite                   | ~4hr                    | 🧪 Core pipeline    |
| **P5** | d3 tree-shaking                            | ~2hr                    | 📦 Bundle size      |
| **P5** | Consolidate Supabase + PiyAPI auth         | ~8hr                    | 🏗️ Single backend   |
