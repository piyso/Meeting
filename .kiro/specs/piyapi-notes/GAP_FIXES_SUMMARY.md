# Gap Fixes Summary: PiyAPI Notes Spec Updates

**Date**: February 24, 2026  
**Status**: COMPLETE  
**Scope**: Systematic updates to requirements.md, design.md, and tasks.md to address 7 critical gaps

---

## Executive Summary

Successfully updated all three spec documents to address the 7 critical gaps identified in COMPREHENSIVE_GAP_ANALYSIS.md. The updates ensure that piynotes.md (source of truth) and the spec documents are now aligned.

---

## Gap Fixes Applied

### ✅ GAP-N11: Context Sessions API (CRITICAL)

**Status**: FIXED

**Updates Made**:

1. **requirements.md**:
   - Added Requirement 47: Context Sessions API
   - Specifies dual-path logic (cloud vs local SQL fallback)
   - Defines semantic retrieval, token budgeting, multi-turn context
   - Requires hasCloudAccess() for path determination

2. **design.md**:
   - Replaced manual context window section in Note Expansion System (Section 3)
   - Added complete Context Sessions API architecture with code examples
   - Shows Option A (PiyAPI API) vs Option B (Local SQL) implementation
   - Includes hasCloudAccess() function implementation
   - Documents benefits: semantic retrieval, automatic token budgeting, simpler code

3. **tasks.md**:
   - Updated Task 24.2 to implement dual-path context window extraction
   - Specifies Context Sessions API integration for Pro/Team/Enterprise users
   - Specifies local SQL fallback for Free tier / offline users
   - Requires hasCloudAccess() to determine path

**Impact**: Highest-leverage architectural improvement. Replaces ~80 lines of manual context management with 5-line API call for cloud users.

---

### ✅ GAP-N15: Per-Plan Content Limits (IMPORTANT)

**Status**: FIXED

**Updates Made**:

1. **requirements.md**:
   - Updated Requirement 30 to add Enterprise tier (100,000 chars)
   - Added TranscriptChunker specification with 10% safety buffer
   - Complete plan limits: Free (5K), Starter (10K), Pro (25K), Team (50K), Enterprise (100K)

2. **design.md**:
   - Added Section 8: TranscriptChunker (Per-Plan Content Limits)
   - Complete TranscriptChunker class implementation
   - Per-plan limits table with safety buffers
   - Usage examples in SyncManager
   - Chunk relationship tracking and reassembly

3. **tasks.md**:
   - Added Task 26.9: TranscriptChunker Implementation
   - Subtasks for class creation, automatic chunking, chunk relationships, reassembly
   - Updated Task 30.11 to reference Task 26.9 implementation
   - Test cases for large meetings

**Impact**: Prevents 413 errors during sync. Enables Enterprise tier (100K chars). Automatic chunking with safety buffer.

---

### ✅ GAP-N1: Local Embedding Service (CRITICAL)

**Status**: FIXED

**Updates Made**:

1. **requirements.md**:
   - Added Requirement 48: Local Embedding Service
   - Specifies all-MiniLM-L6-v2 model (ONNX, 25MB)
   - Defines dual-path embedding pipeline
   - Prevents monetization collapse (encrypted sync + search works)
   - Must run in Phase 5 (before sync in Phase 6)

2. **design.md**:
   - Added Section 7: Local Embedding Service
   - Complete LocalEmbeddingService class implementation
   - Dual-path embedding pipeline (embed → encrypt → send both)
   - Integration with SyncManager
   - Local semantic search (Cmd+Shift+K)
   - Model download script
   - Performance metrics: ~50ms per segment, ~100MB RAM, 25MB disk

3. **tasks.md**:
   - Added Task 26.7: Local Embedding Service Implementation (8 subtasks)
   - Model download, class creation, dual-path pipeline, SyncManager integration
   - Local semantic search implementation
   - Performance testing
   - Monetization strategy verification

**Impact**: Prevents monetization collapse. Free tier gets local semantic search. Pro tier gets encrypted sync + cloud search that works.

---

### ✅ GAP-N17: hasCloudAccess() Dual-Path Logic (IMPORTANT)

**Status**: FIXED

**Updates Made**:

1. **requirements.md**:
   - Added Requirement 49: Dual-Path Cloud/Local Logic
   - Defines hasCloudAccess() function behavior
   - Specifies usage for Context Sessions API, embedding service, entity extraction
   - Enables Free tier to operate 100% locally

2. **design.md**:
   - Added Section 9: hasCloudAccess() Dual-Path Logic
   - Complete CloudAccessManager class implementation
   - getCloudAccessStatus() for detailed status
   - Usage examples for Context Sessions API, embedding, entity extraction
   - UI status display

3. **tasks.md**:
   - Added Task 26.8: hasCloudAccess() Implementation (7 subtasks)
   - CloudAccessManager class creation
   - Integration with Context Sessions API, embedding service, entity extraction
   - UI status display
   - Dual-path logic testing

**Impact**: Core dual-path logic. Free tier: 100% local. Pro tier: Cloud intelligence when online, local fallback when offline.

---

### ✅ GAP-N6: Yjs CRDT (IMPORTANT)

**Status**: FIXED

**Updates Made**:

1. **requirements.md**:
   - Expanded Requirement 32 with implementation details
   - Added: Must install Yjs alongside Tiptap in Phase 4 (not retrofitted later)
   - Added: YjsConflictResolver class specification
   - Added: State vector synchronization details

2. **design.md**:
   - Already properly documented (no changes needed)
   - Complete YjsConflictResolver class implementation exists

3. **tasks.md**:
   - Expanded Task 31.7 with detailed Yjs implementation subtasks
   - Added: Install Yjs alongside Tiptap in Phase 4 (CRITICAL note)
   - Added: YjsConflictResolver class methods
   - Added: State vector sync integration
   - Added: Testing concurrent edits

**Impact**: Prevents data loss on concurrent edits. Automatic conflict-free merging. Must be installed in Phase 4, not retrofitted.

---

### ✅ GAP-N16: Recovery Key Export UI (IMPORTANT)

**Status**: FIXED

**Updates Made**:

1. **requirements.md**:
   - Already properly documented (no changes needed)
   - Requirement 36 has complete acceptance criteria

2. **design.md**:
   - Added Section 10: Recovery Key Export UI Flow
   - Complete RecoveryKeyExport.tsx component design
   - CSS styling for warning banner, recovery phrase grid, buttons
   - Integration with OnboardingFlow
   - Cannot skip enforcement

3. **tasks.md**:
   - Expanded Tasks 29.2-29.4 with UI implementation subtasks
   - Added: RecoveryKeyExport.tsx component creation
   - Added: Warning banner, grid layout, buttons, checkbox
   - Added: Onboarding flow integration (5 steps)
   - Added: Warning text specifications

**Impact**: Prevents data loss. Users cannot skip recovery key export. Clear warnings about unrecoverable data.

---

### ✅ GAP-N7: PowerManager (COMPLETE)

**Status**: ALREADY COMPLETE (no changes needed)

**Verification**:

1. **requirements.md**: ✅ Requirement 29 properly documented
2. **design.md**: ✅ Complete PowerManager class implementation
3. **tasks.md**: ✅ Task 7.7 properly documented

**Action Taken**: Marked Task 7.7 as complete with note referencing design.md

**Impact**: Battery-aware AI scheduling. Performance/balanced/battery-saver modes. Battery impact estimates.

---

## Summary Table

| Gap | Priority | requirements.md | design.md | tasks.md | Status |
|-----|----------|-----------------|-----------|----------|--------|
| GAP-N11: Context Sessions API | 🔴 CRITICAL | ✅ Added Req 47 | ✅ Added Section 3 update | ✅ Updated Task 24.2 | ✅ FIXED |
| GAP-N15: Per-Plan Limits | 🟡 IMPORTANT | ✅ Updated Req 30 | ✅ Added Section 8 | ✅ Added Task 26.9 | ✅ FIXED |
| GAP-N1: Local Embeddings | 🔴 CRITICAL | ✅ Added Req 48 | ✅ Added Section 7 | ✅ Added Task 26.7 | ✅ FIXED |
| GAP-N17: hasCloudAccess() | 🟡 IMPORTANT | ✅ Added Req 49 | ✅ Added Section 9 | ✅ Added Task 26.8 | ✅ FIXED |
| GAP-N6: Yjs CRDT | 🟡 IMPORTANT | ✅ Expanded Req 32 | ✅ Already complete | ✅ Expanded Task 31.7 | ✅ FIXED |
| GAP-N16: Recovery Key UI | 🟡 IMPORTANT | ✅ Already complete | ✅ Added Section 10 | ✅ Expanded Tasks 29.2-29.4 | ✅ FIXED |
| GAP-N7: PowerManager | ✅ DONE | ✅ Already complete | ✅ Already complete | ✅ Marked complete | ✅ VERIFIED |

---

## Strategic Build Order (Updated)

Based on the gap fixes, the recommended build order is:

1. **Phase 4**: Install Yjs CRDT alongside Tiptap (GAP-N6)
   - CRITICAL: Must be installed with Tiptap, not retrofitted later
   - Prevents data loss on concurrent edits

2. **Phase 5**: Local Embeddings (GAP-N1) BEFORE Sync (Phase 6)
   - CRITICAL: Must be built before sync to prevent monetization collapse
   - Enables encrypted sync + search to work together

3. **Phase 5**: Context Sessions API (GAP-N11)
   - Highest-leverage architectural improvement
   - Semantic retrieval vs time-based slicing

4. **Phase 5**: hasCloudAccess() (GAP-N17)
   - Core dual-path logic for all cloud/local decisions
   - Used by Context Sessions API, embeddings, entity extraction

5. **Phase 5**: TranscriptChunker (GAP-N15)
   - Prevents 413 errors during sync
   - Enables Enterprise tier (100K chars)

6. **Phase 6**: Recovery Key UI (GAP-N16)
   - During onboarding flow
   - Prevents data loss from lost passwords

---

## Files Modified

1. `.kiro/specs/piyapi-notes/requirements.md`
   - Added 3 new requirements (47, 48, 49)
   - Updated 2 existing requirements (30, 32)
   - Updated MVP scope section

2. `.kiro/specs/piyapi-notes/design.md`
   - Updated Section 3 (Note Expansion System) with Context Sessions API
   - Added Section 7 (Local Embedding Service)
   - Added Section 8 (TranscriptChunker)
   - Added Section 9 (hasCloudAccess())
   - Added Section 10 (Recovery Key Export UI)

3. `.kiro/specs/piyapi-notes/tasks.md`
   - Updated Task 24.2 (Context Sessions API)
   - Added Task 26.7 (Local Embedding Service) - 8 subtasks
   - Added Task 26.8 (hasCloudAccess()) - 7 subtasks
   - Added Task 26.9 (TranscriptChunker) - 6 subtasks
   - Updated Task 30.11 (reference to Task 26.9)
   - Expanded Task 31.7 (Yjs CRDT) - 15 subtasks
   - Expanded Tasks 29.2-29.4 (Recovery Key UI)
   - Marked Task 7.7 (PowerManager) as complete

---

## Next Steps

1. ✅ **Spec documents updated** - All gaps addressed
2. ⏳ **Implementation** - Follow updated tasks.md
3. ⏳ **Testing** - Verify all gap fixes work as specified
4. ⏳ **Validation** - Ensure piynotes.md and spec documents remain aligned

---

## Verification Checklist

- [x] GAP-N11: Context Sessions API documented in all 3 files
- [x] GAP-N15: Per-Plan Limits (including Enterprise 100K) documented
- [x] GAP-N1: Local Embedding Service documented with complete implementation
- [x] GAP-N17: hasCloudAccess() documented with usage examples
- [x] GAP-N6: Yjs CRDT expanded with implementation details
- [x] GAP-N16: Recovery Key UI flow documented with complete UI design
- [x] GAP-N7: PowerManager verified as complete
- [x] All new requirements added to MVP scope
- [x] All tasks have clear subtasks and acceptance criteria
- [x] Strategic build order documented

---

*Document Version: 1.0*  
*Last Updated: 2026-02-24*  
*Author: Kiro AI Assistant*  
*Status: COMPLETE*

