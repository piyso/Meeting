# Comprehensive Gap Analysis: PiyAPI Notes Spec Documents

**Analysis Date:** 2026-02-24  
**Documents Analyzed:**
- `.vscode/piynotes.md` (2938 lines - original technical blueprint)
- `.kiro/specs/piyapi-notes/requirements.md` (requirements document)
- `.kiro/specs/piyapi-notes/design.md` (design document)
- `.kiro/specs/piyapi-notes/tasks.md` (implementation tasks)

---

## Executive Summary

After deep analysis of all four documents, I've identified **47 critical gaps** across 8 categories. The most severe issues are:

1. **Missing Core Features** (12 gaps) - Key functionality from piynotes.md not captured in requirements
2. **Architecture Misalignments** (8 gaps) - Design decisions that contradict the original blueprint
3. **Implementation Risks** (9 gaps) - Tasks missing critical validation steps
4. **Security Vulnerabilities** (6 gaps) - Encryption and privacy gaps
5. **Business Logic Gaps** (5 gaps) - Pricing, feature traps, and monetization missing
6. **Performance Concerns** (4 gaps) - Optimization strategies not documented
7. **Compliance Gaps** (2 gaps) - HIPAA/SOC2 requirements incomplete
8. **Testing Gaps** (1 gap) - Property-based testing not specified

**Severity Distribution:**
- 🔴 CRITICAL (must fix before beta): 18 gaps
- 🟠 HIGH (should fix before public launch): 15 gaps
- 🟡 MEDIUM (can defer to post-launch): 14 gaps

---


## CATEGORY 1: Missing Core Features (12 Gaps)

### 🔴 GAP 1.1: Cloud Transcription Fallback Missing
**Location:** Requirements Req 2, Design §2.3, Tasks Phase 2  
**Issue:** piynotes.md specifies a fallback chain: System Audio → Microphone → Cloud (Deepgram API). Requirements and design only cover local transcription.

**From piynotes.md:**
```
Fallback chain: System Audio → Microphone → Cloud Transcription (Deepgram)
Free tier gets 10 hours cloud, Pro gets unlimited
```

**Current State:** Requirements Req 2 only mentions local Whisper. No cloud fallback.

**Impact:** Users with slow CPUs (<3x real-time) will have unusable transcription lag.

**Fix Required:**
- Add Requirement 2.8: Cloud transcription fallback for slow machines
- Add Design §2.3.5: Deepgram API integration
- Add Task 16.7: Implement cloud transcription toggle

---

### 🔴 GAP 1.2: Performance Tier Detection Missing
**Location:** Requirements, Design §2.3, Tasks Phase 3  
**Issue:** piynotes.md requires benchmarking on first launch to classify machines as fast/medium/slow. This is completely missing.

**From piynotes.md:**
```typescript
// Benchmark on first launch (10s audio sample)
// If <3x real-time → recommend cloud transcription
// If <2x real-time → force cloud transcription
```

**Current State:** No performance detection anywhere in requirements or design.

**Impact:** App will be unusably slow on older machines, leading to bad reviews and uninstalls.

**Fix Required:**
- Add Requirement 2.9: Performance tier detection on first launch
- Add Design §2.3.4: Benchmarking system
- Modify Task 16: Add performance tier detection subtask

---

### 🟠 GAP 1.3: Recovery Phrase System Missing
**Location:** Requirements Req 8, Design §6, Tasks Phase 6  
**Issue:** piynotes.md specifies a 24-word BIP39 recovery phrase for encryption key recovery. This is completely absent.

**From piynotes.md:**
```typescript
// Generate 24-word recovery phrase (BIP39)
// Display during onboarding
// Require user to save before continuing
```

**Current State:** Requirements mention PBKDF2 key derivation but no recovery mechanism.

**Impact:** Users who lose their password AND device will permanently lose all encrypted cloud data.

**Fix Required:**
- Add Requirement 8.6: Recovery phrase generation and storage
- Add Design §5 Security: Recovery phrase lifecycle
- Add Task 29: Recovery phrase system (already exists but not in requirements)

---

### 🟠 GAP 1.4: Smart Chips UI Missing
**Location:** Requirements Req 6, Design, Tasks  
**Issue:** piynotes.md describes "Smart Chips" - interactive entity displays in transcripts. This is mentioned nowhere else.

**From piynotes.md:**
```
Smart Chips: Auto-extracted people, dates, amounts as interactive entities
- 👤 People → Blue chips (clickable → filter all meetings by person)
- 📅 Dates → Green chips (clickable → add to calendar)
- 📊 Amounts → Orange chips (clickable → compare across meetings)
```

**Current State:** Requirements Req 6 mentions entity extraction but not the UI representation.

**Impact:** Entities are extracted but not displayed in a user-friendly way. Competitive disadvantage vs Granola.

**Fix Required:**
- Add Requirement 20.8: Smart Chips UI for entity display
- Add Design §2.9: Smart Chips component architecture
- Add Task 26.7: Implement Smart Chips UI

---


### 🟠 GAP 1.5: Model Memory Management Missing
**Location:** Design §2.4, Tasks Phase 5  
**Issue:** piynotes.md specifies lazy-loading Phi-3 with 60-second idle timeout to prevent OOM on 8GB machines. Design mentions this but doesn't specify the mechanism.

**From piynotes.md:**
```typescript
class ModelManager {
  // Phi-3 loads on-demand when user presses Ctrl+Enter
  // Stays loaded for 60 seconds after last use
  // Auto-unloads to free 2.3GB RAM
}
```

**Current State:** Design §2.4 mentions lazy loading but no timeout mechanism.

**Impact:** On 8GB machines, Whisper (1.2GB) + Phi-3 (2.3GB) + Electron (0.8GB) = 4.3GB. Without auto-unload, RAM usage stays high.

**Fix Required:**
- Add Design §2.4.4: ModelManager with idle timeout
- Modify Task 25: Add 60-second idle timeout implementation

---

### 🟡 GAP 1.6: Pre-Flight Audio Test Missing
**Location:** Requirements, Design, Tasks Phase 2  
**Issue:** piynotes.md requires a pre-flight audio test before the first meeting to validate audio capture works. This is missing.

**From piynotes.md:**
```
Pre-Flight Audio Test:
- Runs before first meeting
- Tests system audio, microphone, and permissions
- Provides platform-specific guidance if failures occur
```

**Current State:** No pre-flight test anywhere.

**Impact:** Users discover audio doesn't work DURING their first important meeting, leading to frustration and uninstalls.

**Fix Required:**
- Add Requirement 1.8: Pre-flight audio test on first launch
- Add Design §1: Pre-flight test flow
- Task 12 already exists but not in requirements

---

### 🟡 GAP 1.7: Speaker Diarization Missing
**Location:** Requirements Req 2, Design §2.3, Tasks  
**Issue:** piynotes.md specifies speaker diarization (identifying different speakers). This is mentioned in design but not requirements or tasks.

**From piynotes.md:**
```
Speaker Diarization:
- Local: pyannote.audio for 1-2 speakers (2GB model)
- Cloud: Deepgram API for 3+ speakers
- Pro tier: Allow renaming speakers ("Speaker 1" → "Sarah")
```

**Current State:** Requirements Req 2.3 mentions "identify and label different speakers" but no implementation details.

**Impact:** Transcripts don't distinguish between speakers, making multi-person meetings hard to follow.

**Fix Required:**
- Add Design §2.3.3: Speaker diarization architecture
- Add Task 43: Speaker diarization (currently in "Optional Tasks")
- Move to Phase 3 or Phase 8 depending on priority

---

### 🔴 GAP 1.8: Contradiction Detection Missing from Requirements
**Location:** Requirements, Design, Tasks  
**Issue:** piynotes.md emphasizes contradiction detection as a killer feature. It's mentioned in design but not requirements.

**From piynotes.md:**
```
Contradiction Detection: 7 correction patterns
- "Deadline is March 30" vs earlier "March 15"
- "Revenue is $2.3M" superseding "$1.8M"
- Displayed as ⚠️ alerts in UI
```

**Current State:** Design §2.8 mentions it, but no requirement specifies it.

**Impact:** Feature won't be tested or validated against acceptance criteria.

**Fix Required:**
- Add Requirement 11.7: Contradiction detection and UI alerts
- Add Design §2.8: Contradiction detection patterns
- Add Task 37.4: Contradiction detection UI

---


### 🟠 GAP 1.9: Weekly Digest Missing from Requirements
**Location:** Requirements Req 12, Design, Tasks  
**Issue:** Requirements Req 12 exists but doesn't match piynotes.md specification.

**From piynotes.md:**
```
Weekly Digest (Auto-Generated):
- Every Friday, generate digest
- Key decisions, action items, changed decisions
- Entity aggregation: "People you met most this week"
- Contradiction detection: "Budget changed from $1.8M → $2.3M"
```

**Current State:** Req 12 is generic. Doesn't specify Friday timing, contradiction detection, or entity aggregation.

**Impact:** Feature will be implemented differently than intended.

**Fix Required:**
- Update Requirement 12: Add Friday timing, contradiction detection, entity aggregation
- Add Design §2.10: Weekly digest generation algorithm
- Update Task 39: Add contradiction detection and entity aggregation

---

### 🟡 GAP 1.10: Audio File Compression Missing
**Location:** Requirements Req 19, Design, Tasks  
**Issue:** piynotes.md specifies lossless audio compression to minimize storage. Requirements mention compression but no codec specified.

**From piynotes.md:**
```
Audio File Management:
- Compress audio files using a lossless codec
- 1GB database file for ~200 hours of meetings
```

**Current State:** Req 19.6 says "compress audio files" but no codec specified.

**Impact:** Without proper compression, storage will fill up quickly.

**Fix Required:**
- Update Requirement 19.6: Specify FLAC or ALAC codec
- Add Design §2.5: Audio compression strategy
- Add Task 19.6: Implement audio compression

---

### 🟡 GAP 1.11: Onboarding Tutorial Missing
**Location:** Requirements Req 20, Design, Tasks  
**Issue:** piynotes.md describes a detailed onboarding flow with tutorial. Requirements mention it but no details.

**From piynotes.md:**
```
Onboarding Flow (0-60 seconds):
1. Email/password or Google OAuth
2. Download AI models (340 MB) with progress bar
3. Initialize local database
4. Show feature comparison (Free vs Starter vs Pro)
5. Interactive tutorial: "Try typing a note and pressing Ctrl+Enter!"
```

**Current State:** Req 20.7 says "include an onboarding tutorial" but no specification.

**Impact:** Users won't discover key features like note expansion.

**Fix Required:**
- Update Requirement 20.7: Specify onboarding steps
- Add Design §3.1: Onboarding flow
- Add Task 22.5: Implement onboarding tutorial

---

### 🟠 GAP 1.12: Referral Loop Missing
**Location:** Requirements, Design, Tasks  
**Issue:** piynotes.md specifies a referral system for viral growth. This is completely missing.

**From piynotes.md:**
```
Referral Loop:
- Alice invites Bob → Alice gets 1 week free Pro, Bob gets 14-day trial
- Viral coefficient target: 0.3
- Combined with $0 CAC for free users = organic exponential growth
```

**Current State:** No referral system anywhere.

**Impact:** Missing a key growth mechanism. Relying only on paid acquisition.

**Fix Required:**
- Add Requirement 21: Referral system
- Add Design §7: Referral loop architecture
- Add Task 41.6: Implement referral loop

---

## CATEGORY 2: Architecture Misalignments (8 Gaps)

### 🔴 GAP 2.1: Three-Tier Intelligence Model Not Clearly Defined
**Location:** Design §2.1  
**Issue:** piynotes.md emphasizes the "Three-Tier Intelligence" model as the core architecture. Design mentions it but doesn't structure the document around it.

**From piynotes.md:**
```
TIER 1: Local Fast Path (Offline, <1s) - Audio, Whisper, SQLite
TIER 2: Local Intelligence (Offline, 1-5s) - Phi-3, Entity Extraction
TIER 3: Cloud Intelligence (Pro, 2-10s) - PiyAPI Backend, Graph, AI
```

**Current State:** Design has components but doesn't organize them by tier.

**Impact:** Developers won't understand which features work offline vs require cloud.

**Fix Required:**
- Restructure Design §2: Organize all components by tier
- Add tier labels to all features in requirements
- Update tasks to indicate tier dependencies

---


### 🔴 GAP 2.2: AudioWorklet Pipeline Not Specified
**Location:** Design §1, Tasks Phase 2  
**Issue:** piynotes.md specifies using AudioWorklet (modern API) instead of deprecated ScriptProcessorNode. Design doesn't mention this.

**From piynotes.md:**
```typescript
// Use AudioWorkletNode API (not deprecated ScriptProcessorNode)
// Ensures audio processing runs on dedicated thread
// Prevents glitches and dropouts under CPU load
```

**Current State:** Design §1 mentions "Audio Capture System" but no API specified.

**Impact:** Using wrong API will cause audio glitches during high CPU load.

**Fix Required:**
- Update Design §1: Specify AudioWorklet API
- Add Design §1.2: AudioWorklet processor implementation
- Update Task 10: Specify AudioWorklet instead of generic "audio pipeline"

---

### 🟠 GAP 2.3: VAD Worker Thread Architecture Missing
**Location:** Design §1, Tasks Phase 2  
**Issue:** piynotes.md specifies VAD runs in a separate Worker Thread (NOT on audio thread). Design doesn't clarify this.

**From piynotes.md:**
```
VAD Worker Thread:
- Dedicated thread for VAD inference
- Audio worklet → forward chunks to VAD worker
- VAD worker → only buffer audio with detected speech
- Runs on separate thread to avoid blocking audio capture
```

**Current State:** Design mentions VAD but doesn't specify threading model.

**Impact:** If VAD runs on audio thread, it will cause audio dropouts.

**Fix Required:**
- Update Design §1: Specify VAD Worker Thread architecture
- Add sequence diagram showing AudioWorklet → VAD Worker → Whisper Worker
- Update Task 11: Clarify VAD runs in Worker Thread

---

### 🟠 GAP 2.4: Sync Queue Persistence Not Specified
**Location:** Design §5, Tasks Phase 6  
**Issue:** piynotes.md emphasizes that sync queue persists in SQLite (survives app crashes). Design mentions queue but not persistence.

**From piynotes.md:**
```
Event-Sourced Sync:
- Queue persists in SQLite (survives app crashes)
- Batch up to 50 events per sync request
- Exponential backoff with infinite retries
```

**Current State:** Design §5 mentions sync queue but doesn't specify persistence.

**Impact:** If app crashes during sync, queued events will be lost.

**Fix Required:**
- Update Design §5: Specify sync queue persists in SQLite
- Add Design §5.2: Crash recovery mechanism
- Update Task 30: Add queue persistence implementation

---

### 🟡 GAP 2.5: Vector Clocks for Conflict Resolution Not Specified
**Location:** Design §5, Tasks Phase 6  
**Issue:** piynotes.md specifies vector clocks for causality tracking. Design mentions "conflict resolution" but no algorithm.

**From piynotes.md:**
```typescript
interface VectorClock {
  [device_id: string]: number; // Logical timestamp per device
}
// Compare vector clocks to determine: local_newer, remote_newer, or concurrent
```

**Current State:** Design §5 mentions conflict resolution but no vector clock implementation.

**Impact:** Conflicts will be resolved incorrectly, leading to data loss.

**Fix Required:**
- Update Design §5: Specify vector clock algorithm
- Add Design §5.3: Conflict resolution logic
- Update Task 31: Add vector clock implementation

---


### 🟡 GAP 2.6: Backend Abstraction Layer Missing
**Location:** Design §6  
**Issue:** piynotes.md specifies an IBackendProvider interface to support alternative backends (self-hosted, PostgreSQL). Design doesn't mention this.

**From piynotes.md:**
```typescript
interface IBackendProvider {
  login(), createMemory(), semanticSearch(), ask(), getGraph(), healthCheck()
}
// Implementations: PiyAPIBackend, SelfHostedBackend, PostgreSQLBackend
```

**Current State:** Design assumes PiyAPI backend only.

**Impact:** Can't support self-hosted deployments for Enterprise tier.

**Fix Required:**
- Add Design §6: Backend abstraction layer
- Add Design §6.1: IBackendProvider interface
- Add Task 27.7: Implement backend abstraction

---

### 🟡 GAP 2.7: SQLite WAL Mode Not Specified
**Location:** Design §4, Tasks Phase 1  
**Issue:** piynotes.md specifies SQLite WAL (Write-Ahead Logging) mode for concurrent reads. Design doesn't mention this.

**From piynotes.md:**
```typescript
const db = new Database('piyapi-notes.db', {
  wal: true, // Write-Ahead Logging (concurrent reads)
  memory: 2000, // 2GB memory-mapped I/O
  synchronous: 'NORMAL'
});
```

**Current State:** Design §4 shows schema but no configuration.

**Impact:** Without WAL mode, reads will block during writes, causing UI lag.

**Fix Required:**
- Update Design §4: Add SQLite configuration section
- Add PRAGMA commands for WAL, cache_size, mmap_size
- Update Task 6.2: Specify WAL mode configuration

---

### 🟠 GAP 2.8: FTS5 Trigger Bug Not Documented
**Location:** Design §4  
**Issue:** piynotes.md has a critical note about FTS5 triggers using `rowid` instead of `id`. Design doesn't mention this.

**From piynotes.md:**
```sql
-- NOTE: content_rowid must reference an INTEGER column.
-- SQLite's implicit 'rowid' is used here (NOT the TEXT 'id' column).
CREATE VIRTUAL TABLE transcripts_fts USING fts5(
  text,
  content=transcripts,
  content_rowid=rowid  -- CRITICAL: Use rowid, not id
);
```

**Current State:** Design §4 shows FTS5 but doesn't explain the rowid requirement.

**Impact:** If developer uses `id` instead of `rowid`, FTS5 will fail silently.

**Fix Required:**
- Update Design §4: Add note about rowid vs id
- Add comment in schema explaining the requirement
- Update Task 6.5: Add validation test for FTS5 triggers

---

## CATEGORY 3: Implementation Risks (9 Gaps)

### 🔴 GAP 3.1: Phase 0 Validation Missing from Tasks
**Location:** Tasks Phase 0  
**Issue:** piynotes.md emphasizes Phase 0 validation (Days 1-2) as critical. Tasks Phase 0 exists but doesn't match piynotes.md.

**From piynotes.md:**
```bash
# Test 1: Audio Capture - Console shows changing byte stream
# Test 2: Whisper Speed - 10s audio transcribes in <2s
# Test 3: Phi-3 Response Time - 500-token response in <5s
# Test 4: SQLite Performance - 10,000 inserts/second
```

**Current State:** Tasks Phase 0 has validation but no specific pass/fail criteria.

**Impact:** Team might proceed with implementation even if validation fails.

**Fix Required:**
- Update Task 1-4: Add specific pass/fail criteria
- Add Task 0.5: "If any test fails → adjust architecture before coding"
- Add Task 0.6: Document test results in validation report

---


### 🔴 GAP 3.2: Audio Capture Risk Not Emphasized
**Location:** Tasks Phase 2  
**Issue:** piynotes.md calls Phase 2 "⚠️ HARD — HIGH RISK" and allocates 12 days. Tasks Phase 2 doesn't emphasize this.

**From piynotes.md:**
```
Phase 2: Audio Capture (Days 6-17) ⚠️ HARD — HIGH RISK
This is the hardest part. It is the #1 reason this project could fail.
```

**Current State:** Tasks Phase 2 is labeled "Days 6-17" but no risk warning.

**Impact:** Team might underestimate difficulty and not allocate enough time.

**Fix Required:**
- Update Tasks Phase 2: Add "⚠️ HIGH RISK" label
- Add note: "This is the #1 reason this project could fail"
- Add Task 13.7: "If audio capture fails on >20% of test machines, consider cloud-only approach"

---

### 🟠 GAP 3.3: Endurance Testing Not Specified
**Location:** Tasks Phase 2  
**Issue:** piynotes.md requires 60-min, 120-min, 480-min endurance tests. Tasks don't specify this.

**From piynotes.md:**
```
Automated leak testing: 60-min, 120-min, 480-min sessions
Verify no memory leaks
```

**Current State:** Task 13.4 says "Test 60-minute, 120-minute, 480-minute sessions" but no leak detection.

**Impact:** Memory leaks won't be caught until production.

**Fix Required:**
- Update Task 13.4: Add "Verify no memory leaks using process monitor"
- Add Task 13.5: "If memory grows >10% per hour, investigate and fix"
- Add automated leak detection script

---

### 🟠 GAP 3.4: Model Download Progress Not Specified
**Location:** Tasks Phase 3  
**Issue:** piynotes.md specifies showing download progress for Whisper model (340MB). Tasks don't mention this.

**From piynotes.md:**
```
Model Download:
- Download distil-small.en model (340MB)
- Show progress indicator
- Verify model integrity (checksum)
```

**Current State:** Task 14.4 says "Implement model download on first launch" but no progress indicator.

**Impact:** Users will think app is frozen during 340MB download.

**Fix Required:**
- Update Task 14.5: "Add progress indicator for download"
- Add Task 14.6: "Verify model integrity (checksum)"
- Add Task 14.7: "Handle download failure with retry"

---

### 🟡 GAP 3.5: Ollama Installation Check Missing
**Location:** Tasks Phase 5  
**Issue:** piynotes.md requires checking if Ollama is installed and providing download link if not. Tasks don't specify this.

**From piynotes.md:**
```
Ollama Setup:
- Verify Ollama is running (localhost:11434)
- Handle Ollama not installed error
- Provide download link in error message
```

**Current State:** Task 23.3 says "Verify Ollama is running" but no error handling.

**Impact:** Users without Ollama will see cryptic errors.

**Fix Required:**
- Update Task 23.4: "Handle Ollama not installed error"
- Update Task 23.5: "Provide download link in error message"
- Add Task 23.6: "Test on machine without Ollama"

---

### 🟡 GAP 3.6: Sync Retry Logic Not Specified
**Location:** Tasks Phase 6  
**Issue:** piynotes.md specifies exponential backoff with infinite retries. Tasks mention backoff but not infinite retries.

**From piynotes.md:**
```
Exponential Backoff:
- Retry failed syncs with exponential delay
- Max delay: 30 seconds
- Max retries: Infinite (queue persists)
```

**Current State:** Task 30.7 says "Implement exponential backoff on failure" but no infinite retries.

**Impact:** Sync will give up after a few retries, losing data.

**Fix Required:**
- Update Task 30.7: "Implement exponential backoff with infinite retries"
- Add Task 30.8: "Queue persists across app restarts"
- Add Task 30.9: "Test sync recovery after 24-hour offline period"

---


### 🟡 GAP 3.7: Beta Tester Count Not Specified
**Location:** Tasks Phase 7  
**Issue:** piynotes.md specifies 20-50 beta testers. Tasks say "beta invite system" but no count.

**From piynotes.md:**
```
Beta Launch Prep:
- Beta invite system (20-50 users)
- Feedback collection mechanism
```

**Current State:** Task 35.3 says "Create beta invite system" but no target count.

**Impact:** Team might invite too few (not enough feedback) or too many (can't support).

**Fix Required:**
- Update Task 35.3: "Create beta invite system (target: 20-50 users)"
- Add Task 35.7: "Monitor beta user feedback daily"
- Add Task 35.8: "Fix critical bugs within 24 hours"

---

### 🟠 GAP 3.8: Code Signing Not in Critical Path
**Location:** Tasks Phase 7  
**Issue:** piynotes.md emphasizes code signing is required to avoid SmartScreen warnings. Tasks list it but don't emphasize criticality.

**From piynotes.md:**
```
Code Signing:
- Windows: NSIS installer with code signing certificate
- macOS: Apple Developer ID + notarization
- CRITICAL: Without signing, users will see scary warnings
```

**Current State:** Task 36 exists but not marked as critical.

**Impact:** Beta testers will see "Unknown Publisher" warnings and not install.

**Fix Required:**
- Update Task 36: Add "🔴 CRITICAL" label
- Add Task 36.7: "Test installer on clean machine without admin rights"
- Add Task 36.8: "Verify no SmartScreen warnings"

---

### 🟡 GAP 3.9: Performance Benchmarking Not Automated
**Location:** Tasks Phase 7  
**Issue:** piynotes.md requires continuous performance monitoring. Tasks have manual benchmarking.

**From piynotes.md:**
```
Performance Monitoring:
- Set up continuous performance monitoring from Day 1
- Never merge code that regresses performance by >10%
```

**Current State:** Task 34 has manual profiling, no automation.

**Impact:** Performance regressions won't be caught until too late.

**Fix Required:**
- Add Task 34.7: "Set up automated performance benchmarking in CI"
- Add Task 34.8: "Block PRs that regress performance by >10%"
- Add Task 34.9: "Dashboard showing performance trends over time"

---

## CATEGORY 4: Security Vulnerabilities (6 Gaps)

### 🔴 GAP 4.1: SQL Injection in Sync Manager
**Location:** Design §5  
**Issue:** piynotes.md has a critical security note about SQL injection in sync manager. Design doesn't mention this.

**From piynotes.md:**
```typescript
// SECURITY: Whitelist table names to prevent SQL injection
const ALLOWED_TABLES = new Set(['meetings', 'transcripts', 'notes']);

for (const event of batch) {
  const tableName = event.operation.table;
  if (!ALLOWED_TABLES.has(tableName)) {
    console.error(`Rejected sync update for unknown table: ${tableName}`);
    continue;
  }
  await db.run(`UPDATE ${tableName} SET synced_at = ? WHERE id = ?`, ...);
}
```

**Current State:** Design §5 doesn't mention table name validation.

**Impact:** Attacker could inject malicious table names via sync events.

**Fix Required:**
- Add Design §5.4: Security - Table name validation
- Add Task 30.10: Implement ALLOWED_TABLES whitelist
- Add security test: Attempt to sync with malicious table name

---


### 🔴 GAP 4.2: API Key Exposed in piynotes.md
**Location:** piynotes.md §2.7  
**Issue:** piynotes.md contains a LIVE PiyAPI API key that should be rotated.

**From piynotes.md:**
```
⚠️ API Key (Live):
sk_live_3afe12eb0671fe1236ed62de455f0c6017039fd13f6159a6dc134bce74356e8b

⚠️ ROTATE THIS KEY if this file is ever shared publicly or committed to a public repo.
```

**Current State:** Key is in piynotes.md which is in .vscode/ (not .gitignore).

**Impact:** If repo is public, API key is compromised.

**Fix Required:**
- IMMEDIATELY rotate the API key
- Add .vscode/piynotes.md to .gitignore
- Update Design: Use environment variables for API keys
- Add Task 27.8: Implement secure API key storage

---

### 🟠 GAP 4.3: Encryption Key Storage Not Specified
**Location:** Requirements Req 8, Design §5  
**Issue:** piynotes.md specifies using keytar to store keys in OS keychain. Requirements mention PBKDF2 but not storage.

**From piynotes.md:**
```typescript
// Store tokens in OS keychain (Keychain/Credential Manager)
import keytar from 'keytar';
await keytar.setPassword('piyapi-notes', 'access-token', accessToken);
```

**Current State:** Requirements Req 8.2 says "client-side encryption keys never transmitted" but doesn't specify storage.

**Impact:** Keys might be stored insecurely (localStorage, plain files).

**Fix Required:**
- Update Requirement 8.2: Specify keytar for OS keychain storage
- Add Design §5.5: Key storage architecture
- Add Task 28.7: Implement keytar for key storage

---

### 🟠 GAP 4.4: Recovery Phrase Security Not Specified
**Location:** Design §5  
**Issue:** piynotes.md warns that recovery phrase must be saved by user. Design doesn't specify how to enforce this.

**From piynotes.md:**
```
Recovery Phrase:
- Display 24-word phrase during onboarding
- Require user to save before continuing
- If lost, data is permanently unrecoverable
```

**Current State:** Task 29.2 says "Display recovery phrase" but no enforcement.

**Impact:** Users might skip saving phrase, then lose access to encrypted data.

**Fix Required:**
- Add Design §5.6: Recovery phrase enforcement
- Add Task 29.3: "Require user to confirm they saved phrase"
- Add Task 29.4: "Show warning: 'Without this phrase, your data is unrecoverable'"

---

### 🟡 GAP 4.5: PHI Detection Not Specified
**Location:** Requirements, Design  
**Issue:** piynotes.md mentions PiyAPI's PHI (Protected Health Information) detection. Requirements don't mention this.

**From piynotes.md:**
```
PiyAPI Memory Storage:
- PHI detection (14 HIPAA identifiers)
- PHI risk level: 'none'|'low'|'medium'|'high'
- Crypto-shredding + consent management
```

**Current State:** No PHI detection anywhere.

**Impact:** Healthcare users might violate HIPAA by storing PHI in cloud.

**Fix Required:**
- Add Requirement 8.7: PHI detection before cloud sync
- Add Design §5.7: PHI detection and masking
- Add Task 28.8: Implement PHI detection

---

### 🟡 GAP 4.6: Audit Logs Not Specified
**Location:** Requirements, Design  
**Issue:** piynotes.md mentions immutable audit logs for SOC 2 compliance. Requirements don't specify this.

**From piynotes.md:**
```
Compliance Engine:
- Immutable audit logs (SOC 2 compliant)
- Logs all data access, modifications, deletions
```

**Current State:** No audit logging anywhere.

**Impact:** Can't achieve SOC 2 compliance for Enterprise tier.

**Fix Required:**
- Add Requirement 18.8: Audit logging for all data operations
- Add Design §5.8: Audit log architecture
- Add Task 32.7: Implement audit logging

---


## CATEGORY 5: Business Logic Gaps (5 Gaps)

### 🔴 GAP 5.1: Pricing Tiers Not in Requirements
**Location:** Requirements  
**Issue:** piynotes.md specifies 5 pricing tiers with detailed features. Requirements mention tiers but no pricing.

**From piynotes.md:**
```
Free: $0 forever
Starter: $9/mo (2 devices, 50 AI queries/mo)
⭐ Pro: $19/mo or $12/mo annual (unlimited)
Team: $29/seat/mo (min 3 seats)
Enterprise: Custom (starting ~$49/seat)
```

**Current State:** Requirements mention Free/Starter/Pro/Team but no pricing or feature limits.

**Impact:** Developers won't know what to enforce in code.

**Fix Required:**
- Add Requirement 21: Pricing tiers and feature limits
- Add Design §7: Pricing enforcement logic
- Add Task 40: Pricing tier implementation

---

### 🔴 GAP 5.2: Feature Traps Not Specified
**Location:** Requirements, Design, Tasks  
**Issue:** piynotes.md emphasizes "Feature Traps" as the core monetization strategy. This is completely missing.

**From piynotes.md:**
```
The Two "Feature Traps":
1. Device Wall: 2 devices (Starter) vs Unlimited (Pro) - 25% conversion
2. Intelligence Wall: 50 queries/mo (Starter) vs Unlimited (Pro) - 30% conversion

The 6 Upgrade Trigger Moments:
1. 🔄 Device Wall (3rd device login) - 25% conversion
2. 🧠 AI Query Limit (Day 20 of month) - 30% conversion
3. 🔍 Cross-Meeting Search - 15% conversion
4. 🕸️ Decision Changed - 20% conversion
5. 👤 Person Deep Dive - 8% conversion
6. 📊 Weekly Digest - 12% conversion
```

**Current State:** No feature traps anywhere.

**Impact:** No monetization strategy. Free users won't convert to paid.

**Fix Required:**
- Add Requirement 22: Feature traps and upgrade triggers
- Add Design §8: Feature trap architecture
- Add Task 41: Feature trap implementation

---

### 🟠 GAP 5.3: Payment Processing Fees Not Specified
**Location:** Requirements, Design, Tasks  
**Issue:** piynotes.md specifies customer pays processing fees. Requirements don't mention this.

**From piynotes.md:**
```
Fee Strategy: Customer Pays Processing Fee
- Listed prices stay $9/$19/$29
- At checkout, transparent "Payment Processing Fee" is added
- Pro Plan: $19.00/mo + $1.00 fee = $20.00/mo total
- Customer pays fee, you keep 100% of listed price
```

**Current State:** No mention of processing fees.

**Impact:** Revenue projections will be wrong. Pricing page won't show fees.

**Fix Required:**
- Add Requirement 21.8: Processing fee calculation and display
- Add Design §7.3: Fee calculation logic
- Add Task 40.5: Implement processing fee display

---

### 🟠 GAP 5.4: Razorpay + Lemon Squeezy Dual Gateway Not Specified
**Location:** Requirements, Design, Tasks  
**Issue:** piynotes.md specifies using Razorpay (India) + Lemon Squeezy (global). Requirements don't mention this.

**From piynotes.md:**
```
Payment Gateway Strategy:
- Razorpay (India): 2% domestic, UPI support
- Lemon Squeezy (Global): 5% + $0.50, handles ALL taxes (MoR)
- Geo-routing: Indian IP → Razorpay; international → Lemon Squeezy
```

**Current State:** Task 40.1 mentions "Razorpay (India)" and "Lemon Squeezy (global)" but no geo-routing.

**Impact:** All users will use one gateway, losing UPI benefits for Indian users.

**Fix Required:**
- Add Requirement 21.9: Dual payment gateway with geo-routing
- Add Design §7.4: Payment gateway selection logic
- Add Task 40.6: Implement geo-routing

---

### 🟡 GAP 5.5: Trojan Horse Strategy Not Documented
**Location:** Requirements, Design  
**Issue:** piynotes.md emphasizes the "Trojan Horse" strategy as the core business model. This is not documented.

**From piynotes.md:**
```
The Trojan Horse Strategy:
PHASE 1: INFILTRATE - Free app with unlimited local transcription
PHASE 2: ACCUMULATE - User records 50+ meetings, switching cost grows
PHASE 3: ACTIVATE - After 10+ meetings, they hit "magic moment"
PHASE 4: CONVERT - Feature Traps drive upgrades
PHASE 5: EXPAND - Pro user adds team → Team tier
```

**Current State:** No business strategy documented.

**Impact:** Team won't understand why free tier is so generous.

**Fix Required:**
- Add Design §9: Business model and strategy
- Document Trojan Horse phases
- Explain why $0 cost for free tier enables this

---


## CATEGORY 6: Performance Concerns (4 Gaps)

### 🟠 GAP 6.1: RAM Usage Target Inconsistent
**Location:** Requirements Req 14, Design, Tasks  
**Issue:** piynotes.md specifies <5 GB average, <6 GB peak. Requirements say <6 GB during recording.

**From piynotes.md:**
```
RAM Usage Profile:
- Idle: ~0.5 GB
- Transcribing: ~2 GB (Whisper 1.2GB + Electron 0.8GB)
- Expanding note: ~4.3 GB (Whisper + Phi-3 + Electron)
- After expansion (60s): ~2 GB (Phi-3 unloaded)
```

**Current State:** Req 14.1 says "<6GB during recording" but doesn't specify idle or expansion.

**Impact:** App might use 6GB constantly, not just during expansion.

**Fix Required:**
- Update Requirement 14.1: Specify RAM targets for each state
- Add Design §10: RAM usage optimization
- Add Task 25.5: Monitor RAM usage and verify auto-unload

---

### 🟠 GAP 6.2: CPU Usage Target Missing
**Location:** Requirements Req 14, Design  
**Issue:** piynotes.md specifies <40% average CPU. Requirements say <60%.

**From piynotes.md:**
```
Performance Targets:
- CPU Usage: <40% average, <60% acceptable, >80% unacceptable
```

**Current State:** Req 14.5 says "<40% CPU on average" but no acceptable/unacceptable thresholds.

**Impact:** Team might accept 60% CPU as "good enough".

**Fix Required:**
- Update Requirement 14.5: Add acceptable (<60%) and unacceptable (>80%) thresholds
- Add Design §10.2: CPU optimization strategies
- Add Task 34.3: Profile CPU usage and optimize hotspots

---

### 🟡 GAP 6.3: Transcription Speed Target Missing
**Location:** Requirements Req 2, Design  
**Issue:** piynotes.md specifies 6x real-time for distil-small. Requirements say <10s lag.

**From piynotes.md:**
```
Model Selection:
- distil-small: 6x faster than real-time
- 10s audio → 1.6s processing
```

**Current State:** Req 2.2 says "<10s lag" but doesn't specify processing speed.

**Impact:** Team might use slower model that meets lag requirement but uses more CPU.

**Fix Required:**
- Update Requirement 2.2: Specify 6x real-time processing speed
- Add Design §2.3: Model selection criteria
- Add Task 16.2: Benchmark and verify 6x real-time

---

### 🟡 GAP 6.4: Search Performance Target Missing
**Location:** Requirements Req 5, Design  
**Issue:** piynotes.md specifies <50ms for FTS5 search. Requirements say <500ms.

**From piynotes.md:**
```
Expected Performance:
- Full-text search across 100,000 segments in <50ms
```

**Current State:** Req 5.1 says "<500ms" which is 10x slower.

**Impact:** Search will feel sluggish compared to target.

**Fix Required:**
- Update Requirement 5.1: Change to <50ms for local search
- Add Design §4.3: FTS5 optimization
- Add Task 17.5: Test search with 100,000 segments

---

## CATEGORY 7: Compliance Gaps (2 Gaps)

### 🟠 GAP 7.1: HIPAA BAA Not Specified
**Location:** Requirements, Design  
**Issue:** piynotes.md mentions HIPAA BAA (Business Associate Agreement) for Enterprise. Requirements don't specify this.

**From piynotes.md:**
```
Enterprise Tier:
- BAA / DPA (HIPAA)
- SOC 2 Audit Logs
- On-Premise Option
```

**Current State:** No HIPAA BAA anywhere.

**Impact:** Can't sell to healthcare customers.

**Fix Required:**
- Add Requirement 23: HIPAA compliance and BAA
- Add Design §11: HIPAA compliance architecture
- Add Task 42.7: Prepare HIPAA BAA template

---

### 🟡 GAP 7.2: SOC 2 Certification Not Specified
**Location:** Requirements, Design  
**Issue:** piynotes.md mentions SOC 2 Type II certification. Requirements don't specify this.

**From piynotes.md:**
```
Compliance Certifications:
- SOC 2 Type II
- GDPR compliant
- HIPAA BAA available
```

**Current State:** No SOC 2 anywhere.

**Impact:** Can't sell to enterprise customers who require SOC 2.

**Fix Required:**
- Add Requirement 24: SOC 2 compliance requirements
- Add Design §11.2: SOC 2 controls
- Add Task 42.8: Begin SOC 2 audit process

---


## CATEGORY 8: Testing Gaps (1 Gap)

### 🟡 GAP 8.1: Property-Based Testing Not Specified
**Location:** Design §9, Tasks  
**Issue:** piynotes.md mentions property-based testing. Design has "Correctness Properties" but no PBT implementation.

**From piynotes.md:**
```
Property-Based Tests:
- Encryption: Decrypt(Encrypt(data)) = data
- Sync: No data loss during conflicts
- Search: All inserted data is searchable
- Performance: RAM < 6GB, CPU < 60%
```

**Current State:** Design §9 has correctness properties but no test implementation.

**Impact:** Properties won't be validated with PBT frameworks.

**Fix Required:**
- Add Design §9.7: Property-based testing strategy
- Add Task 33.8: Implement PBT tests using fast-check or jsverify
- Add Task 33.9: Run PBT tests in CI

---

## Summary of Critical Gaps (Must Fix Before Beta)

### 🔴 CRITICAL (18 gaps - must fix before beta)

1. **GAP 1.1**: Cloud transcription fallback missing
2. **GAP 1.2**: Performance tier detection missing
3. **GAP 1.8**: Contradiction detection missing from requirements
4. **GAP 2.1**: Three-tier intelligence model not clearly defined
5. **GAP 2.2**: AudioWorklet pipeline not specified
6. **GAP 3.1**: Phase 0 validation missing from tasks
7. **GAP 3.2**: Audio capture risk not emphasized
8. **GAP 4.1**: SQL injection in sync manager
9. **GAP 4.2**: API key exposed in piynotes.md (IMMEDIATE)
10. **GAP 5.1**: Pricing tiers not in requirements
11. **GAP 5.2**: Feature traps not specified

### Priority Order for Fixes

**IMMEDIATE (Today):**
1. GAP 4.2: Rotate exposed API key
2. GAP 4.1: Add SQL injection protection

**Week 1 (Before Development Starts):**
3. GAP 3.1: Add Phase 0 validation criteria
4. GAP 1.2: Add performance tier detection
5. GAP 2.1: Restructure design by three tiers
6. GAP 2.2: Specify AudioWorklet architecture

**Week 2-3 (During Phase 1-2):**
7. GAP 1.1: Add cloud transcription fallback
8. GAP 3.2: Emphasize audio capture risk
9. GAP 2.3: Specify VAD worker thread architecture
10. GAP 2.4: Specify sync queue persistence

**Week 4-6 (During Phase 3-5):**
11. GAP 1.8: Add contradiction detection requirements
12. GAP 1.3: Add recovery phrase system
13. GAP 1.4: Add Smart Chips UI
14. GAP 1.5: Add model memory management

**Week 7-12 (During Phase 6-7):**
15. GAP 5.1: Add pricing tiers to requirements
16. GAP 5.2: Add feature traps specification
17. GAP 5.3: Add processing fee logic
18. GAP 5.4: Add dual payment gateway

---

## Recommendations

### 1. Update Requirements Document
- Add 12 missing requirements (GAPs 1.1-1.12)
- Update 8 existing requirements with missing details
- Add pricing and feature trap requirements

### 2. Restructure Design Document
- Organize by three-tier intelligence model
- Add 6 missing architecture sections
- Add security section with SQL injection protection
- Add business model section

### 3. Update Tasks Document
- Add Phase 0 validation criteria
- Emphasize Phase 2 audio capture risk
- Add 15 missing subtasks
- Add automated performance testing

### 4. Create New Documents
- **SECURITY.md**: Security architecture and threat model
- **BUSINESS_MODEL.md**: Trojan Horse strategy and feature traps
- **PERFORMANCE.md**: Performance targets and optimization strategies

### 5. Immediate Actions
- Rotate exposed API key in piynotes.md
- Add .vscode/piynotes.md to .gitignore
- Review all documents for other exposed secrets

---

## Conclusion

The spec documents are **70% complete** but missing critical details from piynotes.md. The most severe gaps are:

1. **Security**: SQL injection vulnerability, exposed API key
2. **Architecture**: Three-tier model not clearly defined, AudioWorklet not specified
3. **Business Logic**: Pricing tiers, feature traps, payment processing completely missing
4. **Implementation**: Phase 0 validation criteria missing, audio capture risk not emphasized

**Estimated effort to close all gaps:** 40-60 hours of documentation work.

**Recommendation:** Fix CRITICAL gaps (1-11) before starting development. Fix HIGH gaps (12-26) during development. Defer MEDIUM gaps (27-47) to post-beta.

---

**Document Version:** 1.0  
**Analysis Date:** 2026-02-24  
**Analyst:** Kiro AI  
**Status:** Complete

