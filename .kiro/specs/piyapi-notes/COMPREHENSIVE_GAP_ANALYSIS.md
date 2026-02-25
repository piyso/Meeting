# Comprehensive Gap Analysis: piynotes.md vs Spec Documents

**Date**: February 24, 2026  
**Status**: ANALYSIS COMPLETE  
**Scope**: Complete comparison of piynotes.md (source of truth) against requirements.md, design.md, and tasks.md

---

## Executive Summary

After deep analysis, I've identified **7 critical gaps** where piynotes.md contains production-ready implementations that are missing or incomplete in the spec documents:

1. **GAP-N11**: Context Sessions API (replaces manual context window slicing)
2. **GAP-N15**: Per-Plan Content Limits (missing Enterprise tier, incomplete TranscriptChunker)
3. **GAP-N1**: Local Embedding Service (partially documented, needs full integration)
4. **GAP-N6**: Yjs CRDT (documented in design.md but missing from requirements.md and incomplete in tasks.md)
5. **GAP-N7**: PowerManager (documented but needs requirement)
6. **GAP-N16**: Recovery Key Export (documented but needs UI flow in tasks)
7. **GAP-N17**: hasCloudAccess() dual-path logic (missing entirely)

---

## Gap 1: Context Sessions API (GAP-N11) 🔴 CRITICAL

### What's in piynotes.md
**Location**: Lines 860-950

```typescript
private async getContextWindow(meetingId: string, noteText: string, timestamp: number): Promise<string> {
  // Option A: PiyAPI Context Sessions (Pro users with sync enabled)
  if (await this.hasCloudAccess()) {
    const session = await fetch(`${API_BASE}/api/v1/context/sessions`, {
      method: 'POST',
      body: JSON.stringify({
        namespace: 'meetings.transcripts',
        token_budget: 2048,
        time_range: { start: timestamp - 60, end: timestamp + 10 },
        filters: { meeting_id: meetingId }
      })
    }).then(r => r.json());
    
    const contextData = await fetch(
      `${API_BASE}/api/v1/context/retrieve?session_id=${session.context_session_id}&query=${encodeURIComponent(noteText)}`
    ).then(r => r.json());
    
    return contextData.context;
  }
  
  // Option B: Local fallback (Free users / offline)
  const segments = await db.all(`
    SELECT text FROM transcripts
    WHERE meeting_id = ? AND start_time >= ? AND end_time <= ?
    ORDER BY start_time ASC
  `, [meetingId, timestamp - 60, timestamp + 10]);
  
  return segments.map(s => s.text).join(' ');
}
```

**Benefits**:
1. Semantic retrieval (not just time-based slicing)
2. Automatic token budgeting for Qwen's 8-32K context window
3. Multi-turn context accumulation
4. Replaces ~80 lines of manual context management with 5-line API call

### What's in spec documents

**requirements.md**: ❌ NO MENTION of Context Sessions API
- Requirement 3 (Note Expansion) only mentions "surrounding transcript context"
- No specification of dual-path (cloud vs local) logic

**design.md**: ❌ OUTDATED - Shows manual slicing
- Lines 459-461: Still shows `Main->>DB: getContextWindow(meetingId, timestamp)` with manual query
- Section 3 (Note Expansion System) describes manual context window extraction (-60s to +10s)
- No mention of Context Sessions API

**tasks.md**: ❌ OUTDATED - Shows manual implementation
- Task 24.2: "Implement context window extraction (-60s to +10s)" - manual slicing
- No task for Context Sessions API integration
- No task for hasCloudAccess() dual-path logic

### Impact
**CRITICAL**: This is the single highest-leverage architectural improvement. Without it:
- Context is temporally adjacent, not semantically relevant
- No token budget management (can overflow Qwen's context)
- Includes silence-filled transcript segments
- More complex code (~80 lines vs 5 lines)

### Fix Required
1. **requirements.md**: Add new requirement for Context Sessions API with dual-path logic
2. **design.md**: Replace manual context window section with Context Sessions architecture
3. **tasks.md**: Replace Task 24.2 with Context Sessions integration task

---

## Gap 2: Per-Plan Content Limits (GAP-N15) 🟡 IMPORTANT

### What's in piynotes.md
**Location**: Lines 3603-3650

**Complete per-plan limits table**:
| Plan | Max Content |
|---|---|
| Free | 5,000 chars |
| Starter | 10,000 chars |
| Pro | 25,000 chars |
| Team | 50,000 chars |
| **Enterprise** | **100,000 chars** |

**Complete TranscriptChunker implementation**:
```typescript
class TranscriptChunker {
  static readonly PLAN_LIMITS: Record<string, number> = {
    free: 5_000,
    starter: 10_000,
    pro: 25_000,
    team: 50_000,
    enterprise: 100_000,  // ← MISSING in spec documents
  };

  static chunkTranscript(segments: Transcript[], plan: string = 'free'): Transcript[][] {
    const maxChunkSize = this.PLAN_LIMITS[plan] ?? this.PLAN_LIMITS.free;
    const safeLimit = Math.floor(maxChunkSize * 0.9); // 10% safety buffer
    
    const chunks: Transcript[][] = [];
    let currentChunk: Transcript[] = [];
    let currentSize = 0;

    for (const segment of segments) {
      const segmentSize = JSON.stringify(segment).length;
      if (currentSize + segmentSize > safeLimit && currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = [];
        currentSize = 0;
      }
      currentChunk.push(segment);
      currentSize += segmentSize;
    }
    if (currentChunk.length > 0) chunks.push(currentChunk);
    return chunks;
  }
}
```

### What's in spec documents

**requirements.md**: ⚠️ INCOMPLETE
- Requirement 30: Has Free (5K), Starter (10K), Pro (25K), Team (50K)
- **MISSING**: Enterprise (100K)
- Has chunking guidance but no TranscriptChunker class specification

**design.md**: ❌ NO SECTION for TranscriptChunker
- No design section for plan-aware chunking
- No TranscriptChunker class architecture

**tasks.md**: ⚠️ INCOMPLETE
- Task 30.11: Mentions "Document limits per plan" and "Automatic chunking"
- **MISSING**: TranscriptChunker implementation subtasks
- **MISSING**: Plan detection logic
- **MISSING**: Safety buffer (10%) specification

### Impact
**IMPORTANT**: Without complete per-plan limits:
- Enterprise tier users hit 413 errors
- No plan-aware chunking implementation guidance
- Developers don't know how to implement TranscriptChunker

### Fix Required
1. **requirements.md**: Add Enterprise (100K) to Requirement 30
2. **design.md**: Add TranscriptChunker design section with complete implementation
3. **tasks.md**: Expand Task 30.11 with TranscriptChunker implementation subtasks

---

## Gap 3: Local Embedding Service (GAP-N1) ⚠️ PARTIALLY DOCUMENTED

### What's in piynotes.md
**Location**: Lines 3396-3397 (checklist), APPENDIX A.1 (full implementation)

**Complete implementation** with:
- LocalEmbeddingService class (all-MiniLM-L6-v2, ONNX, 25MB)
- Dual-path: embed plaintext → encrypt content → send both to PiyAPI
- Local semantic search (Cmd+Shift+K) for offline use
- Integration with SyncManager

### What's in spec documents

**requirements.md**: ⚠️ MENTIONED but not detailed
- Requirement 31 mentions "Fallback to local search if cloud embedding fails"
- **MISSING**: Specification of local embedding service
- **MISSING**: all-MiniLM-L6-v2 model specification
- **MISSING**: Dual-path embedding pipeline

**design.md**: ❌ NO SECTION for Local Embedding Service
- No LocalEmbeddingService class design
- No embedding pipeline architecture
- No integration with SyncManager

**tasks.md**: ❌ NO TASKS for Local Embedding Service
- No task for LocalEmbeddingService implementation
- No task for embedding pipeline integration
- No task for local semantic search

### Impact
**CRITICAL**: Without local embeddings, the entire monetization strategy collapses:
- Free tier = 100% local, works perfectly
- Pro tier = Encrypted sync → search returns garbage → users downgrade

### Fix Required
1. **requirements.md**: Add new requirement for Local Embedding Service
2. **design.md**: Add LocalEmbeddingService design section
3. **tasks.md**: Add Phase 5 tasks for embedding service implementation

---

## Gap 4: Yjs CRDT (GAP-N6) ⚠️ PARTIALLY DOCUMENTED

### What's in piynotes.md
**Location**: Lines 3411 (checklist), APPENDIX A.3 (full implementation)

**Complete implementation**:
- YjsConflictResolver class
- Automatic conflict-free merging
- State vector synchronization
- Integration with SyncManager
- Undo/redo functionality

### What's in spec documents

**requirements.md**: ⚠️ MENTIONED but incomplete
- Requirement 32: "LWW Conflict Resolution with Yjs CRDT"
- Has acceptance criteria but missing implementation details

**design.md**: ✅ DOCUMENTED
- Complete YjsConflictResolver class implementation (lines 1648-1720)
- Integration with SyncManager
- **GOOD**: This is properly documented

**tasks.md**: ⚠️ INCOMPLETE
- Task 31.7: Mentions "Use Yjs CRDT for notes table"
- **MISSING**: YjsConflictResolver implementation subtasks
- **MISSING**: State vector sync subtasks
- **MISSING**: Undo/redo implementation subtasks

### Impact
**IMPORTANT**: Without Yjs, concurrent edits cause data loss on multi-device sync

### Fix Required
1. **requirements.md**: Expand Requirement 32 with implementation details
2. **tasks.md**: Expand Task 31.7 with detailed Yjs implementation subtasks

---

## Gap 5: PowerManager (GAP-N7) ⚠️ DOCUMENTED but needs requirement

### What's in piynotes.md
**Location**: Lines 3400 (checklist), APPENDIX A.2 (full implementation)

**Complete implementation**:
- PowerManager class
- Three modes: Performance / Balanced / Battery-Saver
- Battery impact estimates: 15%/10%/5% per hour
- Integration with ASRService and IntelligenceService

### What's in spec documents

**requirements.md**: ✅ DOCUMENTED
- Requirement 29: "Battery-Aware AI Scheduling"
- Complete acceptance criteria

**design.md**: ✅ DOCUMENTED
- Complete PowerManager class implementation (lines 1536-1640)
- Integration examples

**tasks.md**: ✅ DOCUMENTED
- Task 7.7: "Implement PowerManager for battery-aware AI"
- Complete subtasks

### Status
✅ **COMPLETE** - PowerManager is properly documented across all spec documents

---

## Gap 6: Recovery Key Export (GAP-N16) ⚠️ DOCUMENTED but needs UI flow

### What's in piynotes.md
**Location**: Lines 3422-3423 (checklist), APPENDIX A.6 (full UI flow)

**Complete UI flow**:
- Onboarding screen with recovery key display
- "Copy to Clipboard" and "Save as File" buttons
- Warning: "Store this somewhere safe — we can NEVER recover your encrypted data without it"
- Cannot skip: "I've Saved It →" button required

### What's in spec documents

**requirements.md**: ✅ DOCUMENTED
- Requirement 36: "Recovery Key Export During Onboarding"
- Complete acceptance criteria

**design.md**: ❌ NO UI FLOW
- No onboarding screen design
- No recovery key export UI specification

**tasks.md**: ⚠️ INCOMPLETE
- Tasks 29.2-29.4: Mention recovery key export
- **MISSING**: UI flow implementation subtasks
- **MISSING**: "Cannot skip" enforcement subtask

### Impact
**IMPORTANT**: Without recovery key export, users lose all encrypted data on OS reinstall

### Fix Required
1. **design.md**: Add recovery key export UI flow section
2. **tasks.md**: Expand Tasks 29.2-29.4 with UI implementation subtasks

---

## Gap 7: hasCloudAccess() Dual-Path Logic (GAP-N17) ❌ MISSING ENTIRELY

### What's in piynotes.md
**Location**: Lines 880-893

```typescript
/**
 * Check if user has cloud access (Pro/Team/Enterprise plan with sync enabled)
 * Used to determine Context Sessions API vs local SQL fallback
 */
private async hasCloudAccess(): Promise<boolean> {
  try {
    const token = await keytar.getPassword('piyapi-notes', 'access-token');
    if (!token) return false;
    const plan = await keytar.getPassword('piyapi-notes', 'plan-tier');
    return plan !== 'free' && navigator.onLine;
  } catch {
    return false;
  }
}
```

**Used for**:
- Context Sessions API vs local SQL fallback
- Cloud embedding vs local embedding
- Cloud entity extraction vs local regex

### What's in spec documents

**requirements.md**: ❌ NO MENTION
**design.md**: ❌ NO MENTION
**tasks.md**: ❌ NO MENTION

### Impact
**IMPORTANT**: This is the core dual-path logic that enables:
- Free tier: 100% local, works offline
- Pro tier: Cloud intelligence when online, local fallback when offline

### Fix Required
1. **requirements.md**: Add requirement for dual-path cloud/local logic
2. **design.md**: Add hasCloudAccess() architecture section
3. **tasks.md**: Add implementation task for hasCloudAccess()

---

## Summary Table

| Gap | piynotes.md | requirements.md | design.md | tasks.md | Priority |
|-----|-------------|-----------------|-----------|----------|----------|
| GAP-N11: Context Sessions API | ✅ Complete | ❌ Missing | ❌ Outdated | ❌ Outdated | 🔴 CRITICAL |
| GAP-N15: Per-Plan Limits | ✅ Complete | ⚠️ Incomplete | ❌ Missing | ⚠️ Incomplete | 🟡 IMPORTANT |
| GAP-N1: Local Embeddings | ✅ Complete | ⚠️ Mentioned | ❌ Missing | ❌ Missing | 🔴 CRITICAL |
| GAP-N6: Yjs CRDT | ✅ Complete | ⚠️ Incomplete | ✅ Complete | ⚠️ Incomplete | 🟡 IMPORTANT |
| GAP-N7: PowerManager | ✅ Complete | ✅ Complete | ✅ Complete | ✅ Complete | ✅ DONE |
| GAP-N16: Recovery Key UI | ✅ Complete | ✅ Complete | ❌ Missing | ⚠️ Incomplete | 🟡 IMPORTANT |
| GAP-N17: hasCloudAccess() | ✅ Complete | ❌ Missing | ❌ Missing | ❌ Missing | 🟡 IMPORTANT |

---

## Recommended Fix Order

### Priority 1: Critical Gaps (Must Fix Now)
1. **GAP-N11**: Context Sessions API - Highest leverage architectural improvement
2. **GAP-N1**: Local Embedding Service - Prevents monetization collapse

### Priority 2: Important Gaps (Fix Before Implementation)
3. **GAP-N15**: Per-Plan Content Limits - Add Enterprise tier, TranscriptChunker
4. **GAP-N17**: hasCloudAccess() - Core dual-path logic
5. **GAP-N6**: Yjs CRDT - Expand task breakdown
6. **GAP-N16**: Recovery Key UI - Add UI flow to design

---

## Next Steps

1. **Delegate to workflow subagent** to update all three spec documents systematically
2. **Update requirements.md** with 3 new requirements (Context Sessions, Local Embeddings, hasCloudAccess)
3. **Update design.md** with 4 new sections (Context Sessions, Local Embeddings, TranscriptChunker, Recovery Key UI)
4. **Update tasks.md** with expanded task breakdowns for all 6 gaps

---

*Document Version: 1.0*  
*Last Updated: 2026-02-24*  
*Author: Kiro AI Assistant*
