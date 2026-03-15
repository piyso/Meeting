# Backend Deep Test Plan

**Date:** February 25, 2026  
**Status:** Ready to Execute  
**Goal:** Comprehensive testing of all backend services against `.vscode/piynotes.md` specifications

---

## Test Coverage Overview

### ✅ Services with Existing Tests

1. EncryptionService - Has comprehensive tests
2. KeyStorageService - Has tests (needs enhancement for new methods)
3. PHIDetectionService - Has comprehensive tests
4. RecoveryPhraseService - Has comprehensive tests
5. SyncManager - Has comprehensive tests
6. TranscriptService - Has comprehensive tests

### 🔴 Services WITHOUT Tests (CRITICAL)

1. VectorClockManager - NO TESTS
2. YjsConflictResolver - NO TESTS
3. ConflictResolver - NO TESTS
4. DeviceManager - NO TESTS
5. AuditLogger - NO TESTS
6. CloudAccessManager - NO TESTS
7. LocalEmbeddingService - NO TESTS
8. TranscriptChunker - NO TESTS

---

## Test Plan by Service

### 1. VectorClockManager Tests

**File:** `src/main/services/__tests__/VectorClockManager.test.ts`

**Test Cases:**

- ✅ Initialize clock for device
- ✅ Increment clock on local change
- ✅ Compare clocks: local_newer
- ✅ Compare clocks: remote_newer
- ✅ Compare clocks: concurrent (conflict)
- ✅ Merge clocks (take maximum)
- ✅ Detect conflicts
- ✅ Serialize/deserialize
- ✅ Get timestamps, devices, max timestamp
- ✅ Clone clocks

**Expected Results:**

- All clock operations work correctly
- Conflict detection is accurate
- Serialization preserves data

---

### 2. YjsConflictResolver Tests

**File:** `src/main/services/__tests__/YjsConflictResolver.test.ts`

**Test Cases:**

- ✅ Create Yjs document
- ✅ Apply remote update
- ✅ Get current state
- ✅ Get state vector
- ✅ Get diff between states
- ✅ Merge documents automatically
- ✅ Subscribe to changes
- ✅ Export/import JSON
- ✅ Document statistics

**Expected Results:**

- CRDT merging works without data loss
- State vectors enable efficient sync
- Changes propagate correctly

---

### 3. ConflictResolver Tests

**File:** `src/main/services/__tests__/ConflictResolver.test.ts`

**Test Cases:**

- ✅ Detect conflicts using vector clocks
- ✅ Auto-resolve conflicts using Yjs
- ✅ Manual resolution: keep_local
- ✅ Manual resolution: keep_remote
- ✅ Manual resolution: merge
- ✅ Apply resolution to database
- ✅ Sync notes with remote versions
- ✅ Track vector clocks per note

**Expected Results:**

- Conflicts detected accurately
- Auto-resolution works for simple cases
- Manual resolution preserves user choice
- No data loss during conflicts

---

### 4. DeviceManager Tests

**File:** `src/main/services/__tests__/DeviceManager.test.ts`

**Test Cases:**

- ✅ Register device
- ✅ Enforce Free tier limit (1 device)
- ✅ Enforce Starter tier limit (2 devices)
- ✅ Pro tier unlimited devices
- ✅ Deactivate device
- ✅ Reactivate device
- ✅ Delete device permanently
- ✅ Update last sync time
- ✅ Rename device
- ✅ Get device list
- ✅ Get device count
- ✅ Audit logging integration

**Expected Results:**

- Device limits enforced correctly
- "Device Wall" triggers at correct limits
- Audit logs created for all operations

---

### 5. AuditLogger Tests

**File:** `src/main/services/__tests__/AuditLogger.test.ts`

**Test Cases:**

- ✅ Log create operation
- ✅ Log update operation
- ✅ Log delete operation
- ✅ Log login event
- ✅ Log logout event
- ✅ Log device operation
- ✅ Query logs with filters
- ✅ Export to JSON
- ✅ Export to CSV
- ✅ Get audit statistics
- ✅ Immutability (cannot modify logs)

**Expected Results:**

- All operations logged correctly
- Logs are immutable
- Query filters work correctly
- Export formats are valid
- SOC 2 compliance requirements met

---

### 6. CloudAccessManager Tests

**File:** `src/main/services/__tests__/CloudAccessManager.test.ts`

**Test Cases:**

- ✅ hasCloudAccess() returns true for Pro tier + online
- ✅ hasCloudAccess() returns false for Free tier
- ✅ hasCloudAccess() returns false when offline
- ✅ hasCloudAccess() returns false when not logged in
- ✅ getCloudAccessStatus() returns correct reason
- ✅ Integration with KeyStorageService

**Expected Results:**

- Cloud access correctly determined
- Dual-path logic works (cloud vs local)
- Offline fallback works

---

### 7. LocalEmbeddingService Tests

**File:** `src/main/services/__tests__/LocalEmbeddingService.test.ts`

**Test Cases:**

- ✅ Load ONNX model
- ✅ Generate embedding for text
- ✅ Embedding dimension is 384
- ✅ L2 normalization works
- ✅ Tokenization works
- ✅ Cosine similarity calculation
- ✅ Local semantic search
- ✅ Performance: <50ms per embedding
- ✅ RAM usage: ~100MB

**Expected Results:**

- Embeddings generated correctly
- Search returns relevant results
- Performance meets targets
- Works offline

---

### 8. TranscriptChunker Tests

**File:** `src/main/services/__tests__/TranscriptChunker.test.ts`

**Test Cases:**

- ✅ Chunk transcript for Free tier (5K limit)
- ✅ Chunk transcript for Starter tier (10K limit)
- ✅ Chunk transcript for Pro tier (25K limit)
- ✅ Chunk transcript for Team tier (50K limit)
- ✅ Chunk transcript for Enterprise tier (100K limit)
- ✅ Apply 10% safety buffer
- ✅ Track chunk relationships (parent_id)
- ✅ Reassemble chunks correctly
- ✅ Warning at 80% of limit

**Expected Results:**

- Chunking works for all tiers
- Chunks reassemble without data loss
- Warnings trigger at correct thresholds

---

### 9. KeyStorageService Enhancement Tests

**File:** `src/main/services/__tests__/KeyStorageService.test.ts` (ENHANCE)

**New Test Cases to Add:**

- ✅ getAllUsers() returns all users
- ✅ getPlanTier() returns correct tier
- ✅ storePlanTier() saves tier
- ✅ validateAccessToken() validates correctly
- ✅ storeUserId() saves user ID
- ✅ getCurrentUserId() retrieves user ID
- ✅ clearCurrentUserId() clears user ID

**Expected Results:**

- All new methods work correctly
- Integration with CloudAccessManager works

---

## Integration Tests

### Multi-Device Sync Test

**File:** `src/main/services/__tests__/MultiDeviceSync.integration.test.ts`

**Test Scenario:**

1. Device A creates note offline
2. Device B creates note offline
3. Both devices come online
4. Sync occurs
5. Conflict detected
6. Auto-resolution or manual resolution
7. Both devices have same final state

**Expected Results:**

- No data loss
- Conflicts resolved correctly
- Final state consistent across devices

---

### End-to-End Sync Test

**File:** `src/main/services/__tests__/EndToEndSync.integration.test.ts`

**Test Scenario:**

1. Create meeting
2. Add transcripts
3. Add notes
4. Encrypt data
5. Generate embeddings
6. Upload to cloud
7. Download on second device
8. Decrypt data
9. Verify data integrity

**Expected Results:**

- All data syncs correctly
- Encryption/decryption works
- Embeddings preserved
- No data corruption

---

### Device Limit Enforcement Test

**File:** `src/main/services/__tests__/DeviceLimitEnforcement.integration.test.ts`

**Test Scenario:**

1. Free tier: Register 1st device → Success
2. Free tier: Register 2nd device → "Device Wall"
3. Starter tier: Register 2nd device → Success
4. Starter tier: Register 3rd device → "Device Wall"
5. Pro tier: Register 10 devices → All succeed

**Expected Results:**

- Limits enforced correctly
- "Device Wall" triggers at correct limits
- Upgrade prompt appears

---

## Performance Tests

### Embedding Generation Performance

**Test:** Generate 1000 embeddings, measure time

**Expected Results:**

- Average time: <50ms per embedding
- Total time: <50 seconds for 1000 embeddings
- RAM usage: ~100MB

---

### Conflict Resolution Performance

**Test:** Resolve 100 conflicts, measure time

**Expected Results:**

- Average time: <100ms per conflict
- Total time: <10 seconds for 100 conflicts

---

### Audit Log Query Performance

**Test:** Query 10,000 audit logs with filters

**Expected Results:**

- Query time: <100ms
- Export time: <1 second

---

## Test Execution Plan

### Phase 1: Unit Tests (Days 1-3)

1. VectorClockManager tests
2. YjsConflictResolver tests
3. ConflictResolver tests
4. DeviceManager tests
5. AuditLogger tests
6. CloudAccessManager tests
7. LocalEmbeddingService tests
8. TranscriptChunker tests
9. KeyStorageService enhancement tests

### Phase 2: Integration Tests (Days 4-5)

1. Multi-device sync test
2. End-to-end sync test
3. Device limit enforcement test

### Phase 3: Performance Tests (Day 6)

1. Embedding generation performance
2. Conflict resolution performance
3. Audit log query performance

### Phase 4: Verification (Day 7)

1. Review all test results
2. Fix any failing tests
3. Document test coverage
4. Create test report

---

## Success Criteria

### Unit Tests

- ✅ All unit tests pass
- ✅ Code coverage >80%
- ✅ No critical bugs found

### Integration Tests

- ✅ Multi-device sync works without data loss
- ✅ End-to-end sync completes successfully
- ✅ Device limits enforced correctly

### Performance Tests

- ✅ All performance targets met
- ✅ No memory leaks detected
- ✅ No performance regressions

---

## Test Commands

```bash
# Run all tests
npm test

# Run specific test file
npm test VectorClockManager.test.ts

# Run with coverage
npm test -- --coverage

# Run integration tests
npm test -- --testPathPattern=integration

# Run performance tests
npm test -- --testPathPattern=performance
```

---

## Dependencies Required

```bash
# Install test dependencies
npm install --save-dev @types/jest jest ts-jest

# Install Yjs for CRDT tests
npm install yjs y-protocols

# Already installed:
# - better-sqlite3 (database)
# - keytar (keychain)
# - uuid (IDs)
# - onnxruntime-node (embeddings)
```

---

## Next Steps

1. ✅ Create test plan (THIS DOCUMENT)
2. ⏳ Install dependencies (yjs, y-protocols)
3. ⏳ Write unit tests for all 8 services
4. ⏳ Write integration tests
5. ⏳ Write performance tests
6. ⏳ Run all tests
7. ⏳ Fix any failures
8. ⏳ Generate test report

---

**Status:** Ready to begin test implementation
**Estimated Time:** 7 days
**Priority:** HIGH - Backend cannot be considered complete without tests
