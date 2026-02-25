# End-to-End Test Plan - PiyAPI Notes

**Date**: 2026-02-25  
**Status**: READY TO EXECUTE  
**Phase**: Phase 7 - Integration Testing & Beta Launch

---

## Overview

This document outlines comprehensive end-to-end tests for PiyAPI Notes covering the complete user journey from onboarding to advanced features. All tests must pass before beta launch.

---

## Test Environment Setup

### Hardware Requirements

- **Minimum Spec**: i5 8th gen, 8GB RAM, 256GB SSD
- **Recommended Spec**: i7 10th gen, 16GB RAM, 512GB SSD
- **High Spec**: M1/M2/M3 Mac or i9, 32GB RAM, 1TB SSD

### Software Requirements

- **Windows**: Windows 10/11 (latest updates)
- **macOS**: macOS 12+ (Monterey or later)
- **Node.js**: v18+ (for development testing)
- **Ollama**: Latest version (for LLM testing)

### Test Data

- Sample audio files (5min, 30min, 60min, 120min)
- Sample transcripts (various lengths)
- Sample notes (10, 50, 100, 500 notes)
- Test user accounts (Free, Starter, Pro tiers)

---

## Test Suite 1: Onboarding Flow (Task 33.1)

### Test 1.1: First Launch Experience

**Objective**: Verify smooth onboarding for new users

**Steps**:

1. Launch app for the first time
2. Verify welcome screen appears
3. Click "Get Started"
4. Verify model download screen appears
5. Wait for model download (Whisper turbo or Moonshine based on RAM)
6. Verify download progress indicator works
7. Verify checksum validation
8. Verify recovery key export screen appears
9. Save recovery key to file
10. Check "I have saved my recovery key" checkbox
11. Verify "Continue" button enables
12. Click "Continue"
13. Verify feature comparison screen appears
14. Review Free vs Starter vs Pro features
15. Click "Continue"
16. Verify tutorial screen appears
17. Complete interactive tutorial
18. Verify main app screen appears

**Pass Criteria**:

- ✅ All screens appear in correct order
- ✅ Model downloads successfully
- ✅ Recovery key export is mandatory
- ✅ Tutorial is interactive and helpful
- ✅ No errors or crashes
- ✅ Total time <5 minutes

**Fail Actions**:

- Document error messages
- Check network connectivity
- Verify disk space
- Check model download URLs

---

### Test 1.2: Recovery Key Export

**Objective**: Verify recovery key system works correctly

**Steps**:

1. During onboarding, reach recovery key export screen
2. Verify 24-word phrase is displayed
3. Verify phrase is formatted in 3 columns × 8 rows
4. Click "Copy to Clipboard"
5. Verify phrase is copied
6. Click "Save as File"
7. Verify file is saved with correct format
8. Try to skip without checking "I have saved my recovery key"
9. Verify "Continue" button is disabled
10. Check "I have saved my recovery key" checkbox
11. Verify "Continue" button enables
12. Click "Continue"

**Pass Criteria**:

- ✅ 24-word phrase is valid BIP39
- ✅ Copy to clipboard works
- ✅ Save to file works
- ✅ Cannot skip recovery key export
- ✅ Warning message is clear

---

## Test Suite 2: Meeting Recording (Task 33.1)

### Test 2.1: 60-Minute Meeting Flow

**Objective**: Verify complete meeting recording and transcription

**Steps**:

1. Click "Start Meeting" button
2. Verify audio capture starts (system audio or microphone)
3. Verify recording indicator appears (red dot + "Recording")
4. Verify duration timer starts (00:00:00)
5. Play audio or speak for 60 minutes
6. Verify transcripts appear in real-time (<10s lag)
7. Verify confidence scores are displayed
8. Verify low-confidence segments are highlighted
9. Take notes during meeting (type 10-20 notes)
10. Press Ctrl+Enter on a note to expand
11. Verify AI expansion works (<5s)
12. Verify expanded note appears
13. Click "Stop Meeting" button
14. Verify confirmation dialog appears
15. Confirm stop
16. Verify meeting is saved to database
17. Verify transcripts are saved
18. Verify notes are saved
19. Verify FTS5 index is updated

**Pass Criteria**:

- ✅ Audio capture works for 60 minutes
- ✅ No audio dropouts or glitches
- ✅ Transcription lag <10s
- ✅ Note expansion <5s
- ✅ RAM usage <6GB (Task 33.2)
- ✅ CPU usage <60% average (Task 33.3)
- ✅ No crashes or freezes
- ✅ All data saved correctly

**Monitoring**:

- Monitor RAM every 10 seconds
- Monitor CPU every 10 seconds
- Log any errors or warnings
- Measure transcription lag

---

### Test 2.2: Audio Capture Fallback Chain

**Objective**: Verify fallback chain works correctly

**Steps**:

1. **Windows**: Disable Stereo Mix
2. **macOS**: Deny Screen Recording permission
3. Start meeting
4. Verify fallback to microphone
5. Verify user notification appears
6. Verify microphone capture works
7. Stop meeting
8. **Windows**: Enable Stereo Mix
9. **macOS**: Grant Screen Recording permission
10. Start new meeting
11. Verify system audio capture works

**Pass Criteria**:

- ✅ Fallback to microphone works
- ✅ User notification is clear
- ✅ No crashes during fallback
- ✅ System audio works after permission granted

---

## Test Suite 3: Encryption & Sync (Task 33.5)

### Test 3.1: Encrypted Sync Across 2 Devices

**Objective**: Verify encrypted sync works correctly

**Setup**:

- Device A: Desktop (Windows or macOS)
- Device B: Laptop (different OS)
- Both devices logged in with same account

**Steps**:

1. **Device A**: Create a new meeting
2. **Device A**: Add transcript: "Budget discussion for Q1 2026"
3. **Device A**: Add note: "Approved $2.3M budget"
4. **Device A**: Wait for sync (check sync indicator)
5. **Device B**: Wait 30 seconds
6. **Device B**: Verify meeting appears
7. **Device B**: Verify transcript appears
8. **Device B**: Verify note appears
9. **Device B**: Edit note: "Approved $2.3M budget (revised from $1.8M)"
10. **Device B**: Wait for sync
11. **Device A**: Wait 30 seconds
12. **Device A**: Verify note update appears

**Pass Criteria**:

- ✅ Meeting syncs within 30 seconds
- ✅ Transcript syncs correctly
- ✅ Note syncs correctly
- ✅ Note update syncs correctly
- ✅ No data loss
- ✅ Encryption works (verify ciphertext in network logs)

---

### Test 3.2: Offline Sync Recovery

**Objective**: Verify sync queue persists and recovers

**Steps**:

1. **Device A**: Disconnect from internet
2. **Device A**: Create 5 new meetings
3. **Device A**: Add transcripts and notes
4. **Device A**: Verify sync queue builds up
5. **Device A**: Close app
6. **Device A**: Reopen app (still offline)
7. **Device A**: Verify sync queue persists
8. **Device A**: Reconnect to internet
9. **Device A**: Wait for sync
10. **Device B**: Verify all 5 meetings appear

**Pass Criteria**:

- ✅ Sync queue persists across app restarts
- ✅ All queued events sync when online
- ✅ No data loss
- ✅ Exponential backoff works

---

## Test Suite 4: Performance Testing (Task 33.2-33.5)

### Test 4.1: RAM Usage Monitoring

**Objective**: Verify RAM stays <6GB during 60-minute meeting

**Steps**:

1. Start meeting
2. Monitor RAM every 10 seconds for 60 minutes
3. Record peak RAM usage
4. Record average RAM usage
5. Plot RAM usage over time
6. Stop meeting
7. Verify RAM drops after meeting ends

**Pass Criteria**:

- ✅ Peak RAM <6GB
- ✅ Average RAM <5GB
- ✅ RAM growth <10% per hour
- ✅ No memory leaks

**Tools**:

- Windows: Task Manager
- macOS: Activity Monitor
- Script: `tests/memory-leak-verification.js`

---

### Test 4.2: CPU Usage Monitoring

**Objective**: Verify CPU stays <60% average during transcription

**Steps**:

1. Start meeting
2. Monitor CPU every 10 seconds for 60 minutes
3. Record peak CPU usage
4. Record average CPU usage
5. Plot CPU usage over time
6. Stop meeting

**Pass Criteria**:

- ✅ Average CPU <60%
- ✅ Peak CPU <80%
- ✅ No sustained 100% CPU
- ✅ CPU drops during silence (VAD working)

---

### Test 4.3: Transcription Lag Measurement

**Objective**: Verify transcription lag <10s

**Steps**:

1. Start meeting
2. Play audio with known timestamps
3. Measure time from audio to transcript display
4. Record lag for 20 samples
5. Calculate average lag
6. Calculate max lag

**Pass Criteria**:

- ✅ Average lag <10s
- ✅ Target lag <5s
- ✅ Max lag <15s
- ✅ Lag consistent throughout meeting

---

### Test 4.4: Search Performance

**Objective**: Verify search <100ms with 100 meetings

**Setup**:

- Create 100 meetings
- Each meeting has 10-20 transcript segments
- Total: 1000-2000 segments

**Steps**:

1. Open search (Cmd+Shift+K)
2. Search for "budget"
3. Measure search time
4. Repeat 10 times
5. Calculate average search time
6. Search for "meeting"
7. Measure search time
8. Search for "Q1 2026"
9. Measure search time

**Pass Criteria**:

- ✅ Average search time <100ms
- ✅ Target search time <50ms
- ✅ Search results accurate
- ✅ FTS5 index working correctly

---

## Test Suite 5: Long Duration Testing (Task 33.4)

### Test 5.1: 120-Minute Meeting

**Objective**: Verify app handles 2-hour meetings

**Steps**:

1. Start meeting
2. Play audio or speak for 120 minutes
3. Monitor RAM, CPU, disk usage
4. Verify transcripts continue appearing
5. Take notes throughout
6. Expand notes periodically
7. Stop meeting
8. Verify all data saved

**Pass Criteria**:

- ✅ No crashes
- ✅ No memory leaks
- ✅ RAM <6GB
- ✅ CPU <60% average
- ✅ All transcripts saved
- ✅ All notes saved

---

### Test 5.2: 480-Minute Meeting (8 Hours)

**Objective**: Verify app handles full workday meeting

**Steps**:

1. Start meeting
2. Play audio or speak for 480 minutes (8 hours)
3. Monitor RAM, CPU, disk usage every 30 minutes
4. Verify transcripts continue appearing
5. Take notes throughout
6. Stop meeting
7. Verify all data saved

**Pass Criteria**:

- ✅ No crashes
- ✅ No memory leaks
- ✅ RAM growth <10% per hour
- ✅ CPU <60% average
- ✅ All transcripts saved
- ✅ Database size reasonable (<500MB)

---

## Test Suite 6: Multi-Device Testing (Task 33.7)

### Test 6.1: Windows 10/11 Testing

**Machines**:

- Windows 10 (Realtek audio)
- Windows 11 (USB audio interface)
- Windows 11 (Focusrite Scarlett)

**Tests**:

- Audio capture (Stereo Mix)
- Microphone fallback
- Model download
- Transcription
- Sync

**Pass Criteria**:

- ✅ >80% success rate across machines
- ✅ Document all failures

---

### Test 6.2: macOS Testing

**Machines**:

- Intel Mac (macOS 12)
- M1 Mac (macOS 13)
- M2 Mac (macOS 14)

**Tests**:

- Audio capture (Screen Recording permission)
- Microphone fallback
- Model download
- Transcription (Whisper turbo)
- Sync

**Pass Criteria**:

- ✅ >80% success rate across machines
- ✅ Document all failures

---

## Test Suite 7: Security Testing

### Test 7.1: Encryption Round-Trip

**Objective**: Verify encryption/decryption works correctly

**Steps**:

1. Create meeting with sensitive data
2. Add transcript: "Patient John Doe, SSN: 123-45-6789"
3. Verify PHI detection triggers
4. Verify warning appears
5. Sync to cloud
6. Verify data is encrypted (check network logs)
7. Decrypt on Device B
8. Verify data matches original

**Pass Criteria**:

- ✅ PHI detection works
- ✅ Data encrypted before sync
- ✅ Decryption works correctly
- ✅ No plaintext in network logs

---

### Test 7.2: Recovery Phrase Account Recovery

**Objective**: Verify account recovery works

**Steps**:

1. Create account on Device A
2. Save recovery phrase
3. Create meetings and notes
4. Sync to cloud
5. "Forget password" on Device B
6. Use recovery phrase to recover account
7. Verify all data accessible
8. Verify encryption keys recovered

**Pass Criteria**:

- ✅ Recovery phrase works
- ✅ All data recovered
- ✅ Encryption keys recovered
- ✅ No data loss

---

## Test Suite 8: Tier-Based Features

### Test 8.1: Free Tier Limitations

**Objective**: Verify Free tier works offline

**Steps**:

1. Create Free tier account
2. Disconnect from internet
3. Create meeting
4. Verify local transcription works
5. Verify local semantic search works
6. Verify no cloud sync
7. Verify 5K char limit enforced
8. Verify device limit (1 device)

**Pass Criteria**:

- ✅ Local features work offline
- ✅ No cloud features available
- ✅ Limits enforced correctly

---

### Test 8.2: Starter Tier Features

**Objective**: Verify Starter tier features work

**Steps**:

1. Create Starter tier account
2. Verify cloud sync works
3. Verify 2 device limit
4. Try to add 3rd device
5. Verify "Device Wall" appears
6. Verify 10K char limit
7. Verify 50 AI queries/month limit

**Pass Criteria**:

- ✅ Cloud sync works
- ✅ Device limit enforced
- ✅ Char limit enforced
- ✅ AI query limit enforced

---

## Test Suite 9: Error Handling

### Test 9.1: Network Failure During Sync

**Objective**: Verify graceful handling of network failures

**Steps**:

1. Start sync
2. Disconnect network mid-sync
3. Verify error message appears
4. Verify retry logic kicks in
5. Reconnect network
6. Verify sync completes

**Pass Criteria**:

- ✅ No crashes
- ✅ Error message clear
- ✅ Retry logic works
- ✅ Sync completes eventually

---

### Test 9.2: Disk Full Error

**Objective**: Verify handling of disk full errors

**Steps**:

1. Fill disk to <100MB free
2. Start meeting
3. Verify error message appears
4. Verify app doesn't crash
5. Free up disk space
6. Verify app recovers

**Pass Criteria**:

- ✅ Error message clear
- ✅ No crashes
- ✅ App recovers gracefully

---

## Test Execution Checklist

### Pre-Testing

- [ ] Set up test environments (Windows, macOS)
- [ ] Prepare test data (audio files, transcripts)
- [ ] Install monitoring tools
- [ ] Create test user accounts
- [ ] Document baseline performance

### During Testing

- [ ] Execute all test suites
- [ ] Record results in `tests/results/`
- [ ] Document all failures
- [ ] Take screenshots of errors
- [ ] Monitor system resources
- [ ] Log all issues

### Post-Testing

- [ ] Analyze results
- [ ] Calculate success rates
- [ ] Identify critical bugs
- [ ] Prioritize fixes
- [ ] Re-test after fixes
- [ ] Generate test report

---

## Success Criteria

### MVP (45-Day Beta)

- ✅ Audio capture works on 80%+ of test machines
- ✅ Transcription lag <10s
- ✅ Note expansion <5s
- ✅ RAM usage <6GB
- ✅ App doesn't crash during 60-minute meeting
- ✅ Sync works across 2 devices
- ✅ <5% crash rate

### Public Launch (6 Months)

- ✅ 10,000 total users
- ✅ 500 paying users (5% conversion)
- ✅ $9,000 MRR
- ✅ 60% retention after 30 days
- ✅ 4.0+ rating

---

## Test Report Template

```markdown
# Test Report - [Test Suite Name]

**Date**: YYYY-MM-DD
**Tester**: [Name]
**Environment**: [OS, Hardware]

## Test Results

| Test ID | Test Name      | Status  | Notes            |
| ------- | -------------- | ------- | ---------------- |
| 1.1     | First Launch   | ✅ PASS |                  |
| 1.2     | Recovery Key   | ✅ PASS |                  |
| 2.1     | 60-Min Meeting | ❌ FAIL | RAM exceeded 6GB |

## Issues Found

1. **Issue #1**: RAM usage exceeded 6GB at 45-minute mark
   - Severity: HIGH
   - Steps to reproduce: [...]
   - Expected: RAM <6GB
   - Actual: RAM 6.2GB

## Performance Metrics

- Average RAM: 5.2GB
- Peak RAM: 6.2GB
- Average CPU: 45%
- Peak CPU: 72%
- Transcription lag: 7.3s average

## Recommendations

1. Investigate memory leak at 45-minute mark
2. Optimize transcription pipeline
3. Add memory monitoring alerts

## Conclusion

[PASS / FAIL / PARTIAL PASS]
```

---

## Next Steps

1. Execute Test Suite 1 (Onboarding)
2. Execute Test Suite 2 (Meeting Recording)
3. Execute Test Suite 3 (Encryption & Sync)
4. Execute Test Suite 4 (Performance)
5. Execute Test Suite 5 (Long Duration)
6. Execute Test Suite 6 (Multi-Device)
7. Execute Test Suite 7 (Security)
8. Execute Test Suite 8 (Tier Features)
9. Execute Test Suite 9 (Error Handling)
10. Generate comprehensive test report
11. Fix critical bugs
12. Re-test
13. Proceed to beta launch

---

**Status**: READY TO EXECUTE  
**Estimated Time**: 2-3 weeks for complete testing  
**Team Size**: 2-3 testers recommended
