# All 35 Gaps - Comprehensive Tracking Document

**Date**: February 24, 2026  
**Status**: IN PROGRESS  
**Total Gaps**: 35  
**Completed**: 13 (GAP-01 through GAP-06, GAP-09 through GAP-12, GAP-15, GAP-17, GAP-20, GAP-34, GAP-35)  
**Remaining**: 22

---

## 🔴 CRITICAL GAPS (6 gaps - Break the Product)

### GAP-01: Encrypted Search Paradox ✅ COMPLETE
**Status**: ✅ COMPLETE  
**Location**: Lines 994-1017 + 1330-1371  
**Fix Applied**: Added Local Embedding Service (all-MiniLM-L6-v2, ONNX, 25MB) to TIER 1  
**Documentation**: `.kiro/specs/piyapi-notes/GAP-01-FIX-COMPLETE.md`  
**Verification**: Complete architecture update in `.vscode/piynotes.md`

### GAP-02: Auth Endpoint Paths Wrong ✅ COMPLETE
**Status**: ✅ COMPLETE (from previous fixes)  
**Location**: Lines 1190-1204  
**Fix Applied**: All auth routes updated to `/api/v1/auth/*`  
**Verification**: CRITICAL_FIXES_COMPLETION_SUMMARY.md shows complete

### GAP-03: Namespace Format Wrong ✅ COMPLETE
**Status**: ✅ COMPLETE (from previous fixes)  
**Location**: Lines 1230, 1312-1316, 1330-1332, 1345 (8+ locations)  
**Fix Applied**: All namespaces changed from slashes to dots (`meetings.transcripts`)  
**Verification**: CRITICAL_FIXES_COMPLETION_SUMMARY.md shows complete

### GAP-04: Batch Sync Creates Single Giant Memory ✅ COMPLETE
**Status**: ✅ COMPLETE (from previous fixes)  
**Location**: Lines 944-955  
**Fix Applied**: Rewritten sync() to create individual memories per event  
**Verification**: CRITICAL_FIXES_COMPLETION_SUMMARY.md shows complete

### GAP-05: HKDF Salt/Info Parameters Reversed ✅ COMPLETE
**Status**: ✅ COMPLETE (from previous fixes)  
**Location**: Line 1059  
**Fix Applied**: Corrected parameter order in crypto.hkdfSync()  
**Verification**: CRITICAL_FIXES_COMPLETION_SUMMARY.md shows complete

### GAP-06: API Key Exposed in Plaintext ✅ COMPLETE
**Status**: ✅ COMPLETE (from previous fixes)  
**Location**: Lines 1176-1182  
**Fix Applied**: Key rotated and redacted with security warning  
**Verification**: CRITICAL_FIXES_COMPLETION_SUMMARY.md shows complete

---

## 🟡 IMPORTANT GAPS (13 gaps - Cause Bugs or Confusion)

### GAP-07: Content Size Limit Undocumented/Fuzzy ⏳ PENDING
**Status**: ⏳ PENDING  
**Location**: Line 1219  
**Priority**: Phase 6 (Week 9-12)  
**Fix Required**: Document actual limits per plan, implement chunking to max 20KB  
**Impact**: Users hitting 413 errors without understanding why

### GAP-08: Missing WAL Checkpoint Strategy ⏳ PENDING
**Status**: ⏳ PENDING  
**Location**: Lines 844-849  
**Priority**: Phase 1 (Week 1-2)  
**Fix Required**: Add wal_autocheckpoint, passive checkpoint every 10 min, TRUNCATE on stop  
**Impact**: Multi-GB WAL files after long meetings

### GAP-09: RAM Table Still Says "Phi-3" ✅ COMPLETE
**Status**: ✅ COMPLETE  
**Location**: Line 1024  
**Priority**: Day 0 (Documentation fix)  
**Fix Applied**: Updated table header from "Phi-3" to "Qwen 2.5 3B"  
**Verification**: Line 1024 now shows correct model name

### GAP-10: Whisper Model Path References distil-small ✅ COMPLETE
**Status**: ✅ COMPLETE  
**Location**: Lines 456-458  
**Priority**: Day 0 (Documentation fix)  
**Fix Applied**: Updated to ggml-large-v3-turbo.bin (16GB) and moonshine-base.onnx (8GB)  
**Verification**: Correct model paths now documented with hardware tier detection

### GAP-11: Phase 0 Test Commands Reference Phi-3 ✅ COMPLETE
**Status**: ✅ COMPLETE  
**Location**: Lines 2334, 3694  
**Priority**: Day 0 (Documentation fix)  
**Fix Applied**: Changed test-phi3-speed.js to test-qwen-speed.js in all locations  
**Verification**: Both Phase 0 test sections now reference correct test file

### GAP-12: Phase 3 Downloads Wrong Model ✅ COMPLETE
**Status**: ✅ COMPLETE  
**Location**: Lines 2410-2417  
**Priority**: Day 0 (Documentation fix)  
**Fix Applied**: Updated wget commands for Whisper Turbo (16GB) and Moonshine Base (8GB)  
**Verification**: Phase 3 now downloads correct models based on hardware tier

### GAP-13: LWW Conflict Resolution for Notes ⏳ PENDING
**Status**: ⏳ PENDING  
**Location**: Lines 1104-1166  
**Priority**: Phase 5 (Week 6-8)  
**Fix Required**: Implement Yjs CRDT for notes table  
**Impact**: Data loss on concurrent edits

### GAP-14: No Battery-Aware AI Scheduling ⏳ PENDING
**Status**: ⏳ PENDING  
**Location**: Missing entirely  
**Priority**: Phase 1 (Week 1-2)  
**Fix Required**: Add PowerManager using electron.powerMonitor  
**Impact**: Battery drain, thermal throttling

### GAP-15: embedding_status Value Mismatch ✅ COMPLETE
**Status**: ✅ COMPLETE (from previous fixes)  
**Location**: Line 1224  
**Fix Applied**: Documented correct value ('ready' not 'completed')  
**Verification**: CRITICAL_FIXES_COMPLETION_SUMMARY.md shows complete

### GAP-16: Missing Embedding Status Polling ⏳ PENDING
**Status**: ⏳ PENDING  
**Location**: After Line 1227  
**Priority**: Phase 6 (Week 9-12)  
**Fix Required**: Add polling logic or 4s wait after sync  
**Impact**: Search returns no results after sync

### GAP-17: Export downloadUrl is Relative ✅ COMPLETE
**Status**: ✅ COMPLETE (from previous fixes)  
**Location**: Line 1297  
**Fix Applied**: Documented need to prepend API_BASE  
**Verification**: CRITICAL_FIXES_COMPLETION_SUMMARY.md shows complete

### GAP-18: Compliance DELETE Needs Undocumented Params ⏳ PENDING
**Status**: ⏳ INVESTIGATION NEEDED  
**Location**: Lines 1300-1304  
**Priority**: Phase 8 (Week 15-18)  
**Fix Required**: Test endpoint and document parameters  
**Impact**: GDPR deletion may fail

### GAP-19: Graph Types contradicts/supersedes/parent = 0 ⏳ PENDING
**Status**: ⏳ PENDING  
**Location**: Lines 1384-1394  
**Priority**: Phase 8 (Week 15-18)  
**Fix Required**: Add content patterns to trigger these relationships  
**Impact**: Key Pro features don't work

### GAP-20: Lemon Squeezy → Dodo Payments ✅ COMPLETE
**Status**: ✅ COMPLETE (from previous fixes)  
**Location**: Lines 2104-2186  
**Fix Applied**: Documented recommendation to use PiyAPI billing or Dodo Payments  
**Verification**: CRITICAL_FIXES_COMPLETION_SUMMARY.md shows complete

### GAP-21: Missing Query Quota Fallback Logic ⏳ PENDING
**Status**: ⏳ PENDING  
**Location**: Line 2180  
**Priority**: Phase 9 (Week 19-20)  
**Fix Required**: Add client-side quota tracking and fallback to local Qwen  
**Impact**: Poor UX when quota exhausted

### GAP-22: No Recovery Key Export During Onboarding ⏳ PENDING
**Status**: ⏳ PENDING  
**Location**: Line 1102, Lines 1639-1697  
**Priority**: Onboarding (Week 13)  
**Fix Required**: Add recovery key export prompt in onboarding  
**Impact**: Permanent data loss if master key lost

---

## 🔵 MINOR GAPS (16 gaps - Polish & Documentation)

### GAP-23: Architecture Diagram Missing Local Embedding Service ⏳ PENDING
**Status**: ⏳ PENDING  
**Location**: Lines 119-211  
**Priority**: Phase 3 (Week 5)  
**Fix Required**: Add all-MiniLM-L6-v2 to Tier 1 diagram  
**Impact**: Incomplete documentation

### GAP-24: No Speaker Diarization UI ⏳ PENDING
**Status**: ⏳ PENDING  
**Location**: Lines 1496-1513  
**Priority**: Phase 4 (Week 5-6)  
**Fix Required**: Add speaker colors/lanes to transcript UI  
**Impact**: Hard to scan long meetings

### GAP-25: No AI Trust Badges ⏳ PENDING
**Status**: ⏳ PENDING  
**Location**: Lines 1730-1735  
**Priority**: Phase 5 (Week 6-8)  
**Fix Required**: Add 🤖/✍️ badges to distinguish AI vs human text  
**Impact**: Users can't tell what's AI-generated

### GAP-26: No Bidirectional Source Highlighting ⏳ PENDING
**Status**: ⏳ PENDING  
**Location**: Lines 1730-1735  
**Priority**: Phase 5 (Week 6-8)  
**Fix Required**: Link AI expansions back to source transcript segments  
**Impact**: Users can't verify AI claims

### GAP-27: No Audio Playback Timeline ⏳ PENDING
**Status**: ⏳ PENDING  
**Location**: Missing entirely  
**Priority**: Phase 4 (Week 5-6)  
**Fix Required**: Add waveform scrubber with speaker heatmap  
**Impact**: Can't navigate long recordings

### GAP-28: No Pinned Moments Feature ⏳ PENDING
**Status**: ⏳ PENDING  
**Location**: Missing entirely  
**Priority**: Phase 4 (Week 5-6)  
**Fix Required**: Add star/pin functionality for key moments  
**Impact**: Can't mark important moments

### GAP-29: No Transcript Corrections ⏳ PENDING
**Status**: ⏳ PENDING  
**Location**: Missing entirely  
**Priority**: Phase 4 (Week 5-6)  
**Fix Required**: Make transcript text inline-editable post-meeting  
**Impact**: Errors persist forever

### GAP-30: No Mini Floating Widget Mode ⏳ PENDING
**Status**: ⏳ PENDING  
**Location**: Missing entirely  
**Priority**: Phase 4 (Week 5-6)  
**Fix Required**: Add compact always-on-top view (Cmd+Shift+M)  
**Impact**: Takes too much screen space during Zoom/Meet

### GAP-31: No Progressive Onboarding / Ghost Meeting ⏳ PENDING
**Status**: ⏳ PENDING  
**Location**: Missing entirely  
**Priority**: Onboarding (Week 13)  
**Fix Required**: Add tutorial with sample meeting  
**Impact**: Blank screen for first-time users

### GAP-32: No Meeting Templates ⏳ PENDING
**Status**: ⏳ PENDING  
**Location**: Missing entirely  
**Priority**: Phase 4 (Week 5-6)  
**Fix Required**: Add pre-configured note structures (1:1, Standup, etc.)  
**Impact**: Users always start from blank

### GAP-33: No Context Document Attachment ⏳ PENDING
**Status**: ⏳ PENDING  
**Location**: Missing entirely  
**Priority**: Phase 4 (Week 5-6)  
**Fix Required**: Allow attaching reference files before meeting  
**Impact**: LLM can't cross-reference documents

### GAP-34: Week 5-6 Still Says "distil-small model" ✅ COMPLETE
**Status**: ✅ COMPLETE  
**Location**: Line 3292  
**Priority**: Day 0 (Documentation fix)  
**Fix Applied**: Updated to "turbo (16GB) / Moonshine Base (8GB)"  
**Verification**: Week 5-6 timeline now shows correct models

### GAP-35: "Next Steps" Still References Phi-3 ✅ COMPLETE
**Status**: ✅ COMPLETE  
**Location**: Line 3694  
**Priority**: Day 0 (Documentation fix)  
**Fix Applied**: Changed to test-qwen-speed.js  
**Verification**: Next Steps section now references correct test command

---

## Summary Statistics

**By Status:**
- ✅ Complete: 13 gaps (GAP-01 through GAP-06, GAP-09 through GAP-12, GAP-15, GAP-17, GAP-20, GAP-34, GAP-35)
- ⏳ Pending: 21 gaps
- 🔍 Investigation: 1 gap (GAP-18)

**By Priority:**
- Day 0 (Documentation): 6 gaps - 6 complete (100%) ✅
- Phase 1 (Week 1-2): 2 gaps (08, 14)
- Phase 3 (Week 5): 1 gap (23)
- Phase 4 (Week 5-6): 8 gaps (24, 27, 28, 29, 30, 32, 33)
- Phase 5 (Week 6-8): 3 gaps (13, 25, 26)
- Phase 6 (Week 9-12): 3 gaps (07, 16, 22)
- Phase 8 (Week 15-18): 2 gaps (18, 19)
- Phase 9 (Week 19-20): 1 gap (21)
- Onboarding (Week 13): 1 gap (31)

**By Severity:**
- 🔴 Critical (Product-Breaking): 6 gaps - 6 complete (100%) ✅
- 🟡 Important (Causes Bugs): 13 gaps - 5 complete (38%)
- 🔵 Minor (Polish): 16 gaps - 2 complete (13%)

---

## Next Actions

### ✅ Day 0 - Documentation Fixes (COMPLETE)
All 6 documentation gaps have been fixed:
1. ✅ GAP-09: Updated RAM table (Phi-3 → Qwen 2.5 3B)
2. ✅ GAP-10: Updated Whisper model path
3. ✅ GAP-11: Updated Phase 0 test commands
4. ✅ GAP-12: Updated Phase 3 model downloads
5. ✅ GAP-34: Updated Week 5-6 reference
6. ✅ GAP-35: Updated "Next Steps" reference

### Phase 1 (Week 1-2 - Architecture Fixes)
1. Fix GAP-08: Add WAL checkpoint strategy
2. Fix GAP-14: Add PowerManager for battery-aware AI

### Phase 3-9 (Weeks 5-20 - Feature Implementation)
1. Implement remaining 20 gaps according to priority matrix

---

*Last Updated: 2026-02-24*  
*Document Version: 1.0*
