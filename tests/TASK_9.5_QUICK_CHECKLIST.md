# Task 9.5 Quick Checklist

## One-Page Reference for macOS Multi-Architecture Testing

---

## Pre-Test Setup ✓

- [ ] 4 Mac architectures identified and available (Intel, M1, M2, M3)
- [ ] All machines running macOS 11 or later
- [ ] Application built and ready to deploy
- [ ] Test documentation templates prepared
- [ ] Screenshot tools ready

---

## Machine Requirements ✓

- [ ] **Machine 1**: Intel Mac (x86_64) - MacBook Pro or iMac (2015-2020)
- [ ] **Machine 2**: M1 Mac (arm64) - MacBook Air/Pro, Mac mini, or iMac 24" (2020-2021)
- [ ] **Machine 3**: M2 Mac (arm64) - MacBook Air/Pro, Mac mini, or Mac Studio (2022-2023)
- [ ] **Machine 4**: M3 Mac (arm64) - MacBook Pro 14"/16" or iMac 24" (2023+)

---

## For Each Machine

### Setup Phase

- [ ] Install application
- [ ] Document hardware configuration (model, processor, architecture)
- [ ] Document macOS version and build
- [ ] Reset Screen Recording permission (for clean test)
- [ ] Check audio system is working

### Permission Flow Test

- [ ] Launch application
- [ ] Navigate to audio settings
- [ ] Verify "Screen Recording permission required" message
- [ ] Click "Open System Settings" button
- [ ] Verify System Settings opens to correct pane
- [ ] Grant Screen Recording permission
- [ ] Return to app, verify permission detected

### System Audio Test

- [ ] Open Safari/Chrome with YouTube
- [ ] Play audio content
- [ ] Start recording in app
- [ ] Observe audio levels (30 seconds)
- [ ] Stop recording
- [ ] Check audio metrics (RMS > 0.01, Variance > 0.0001)

### Fallback Test (if permission denied)

- [ ] Verify fallback notification displays
- [ ] Test microphone capture
- [ ] Verify audio quality acceptable
- [ ] Document fallback behavior

### Architecture-Specific Tests

- [ ] Check process architecture (Activity Monitor)
- [ ] Monitor CPU usage
- [ ] Monitor RAM usage
- [ ] Test with external monitor (if available)
- [ ] Test with Bluetooth audio (if available)

### Documentation Phase

- [ ] Record test verdict (PASS/PARTIAL/FAIL)
- [ ] Document audio metrics
- [ ] Capture screenshots
- [ ] Note architecture-specific issues
- [ ] Write recommendations

---

## Success Criteria

### Per Machine

- ✅ **PASS**: Screen Recording permission granted, system audio works, RMS > 0.01, Variance > 0.0001
- ⚠️ **PARTIAL**: Permission denied BUT microphone fallback works
- ❌ **FAIL**: Neither system audio nor microphone works

### Overall

- **Target**: ≥80% success rate (3 out of 4 machines minimum)
- **Calculation**: (PASS + PARTIAL) / 4 × 100%

---

## Quick Troubleshooting

### Screen Recording Permission Not Working

1. System Settings → Privacy & Security → Screen Recording
2. Enable PiyAPI Notes
3. Restart application

### System Settings Link Doesn't Open

```bash
# Open manually
open "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
```

### No Audio Detected

1. Check system volume (>50%)
2. Verify audio is playing
3. Check Screen Recording permission is granted
4. Test with different audio source

### App Won't Start

```bash
rm -rf node_modules
npm install
npm run start
```

### Architecture Mismatch

```bash
# Check architecture
uname -m  # Should show x86_64 or arm64

# Check if app is native
ps aux | grep PiyAPI

# Rebuild for correct architecture
npm run rebuild
```

---

## Data to Collect

For each machine:

- [ ] Model and processor
- [ ] Architecture (x86_64 / arm64)
- [ ] macOS version and build
- [ ] Test verdict
- [ ] Audio metrics (RMS, variance)
- [ ] CPU and RAM usage
- [ ] Architecture-specific observations
- [ ] Screenshots (4-5 per machine)
- [ ] Issues encountered
- [ ] Mitigation strategies

---

## Post-Test Actions

- [ ] Complete all 4 machine tests
- [ ] Calculate success rate
- [ ] Compare performance across architectures
- [ ] Compile results in TASK_9.5_TEST_RESULTS.md
- [ ] Analyze architecture-specific issues
- [ ] Write recommendations
- [ ] Update tasks.md status
- [ ] Decide: Proceed / Fix / Pivot

---

## Decision Matrix

| Success Rate | Action                   |
| ------------ | ------------------------ |
| ≥80%         | ✅ Proceed to Task 9.6   |
| 70-79%       | ⚠️ Fix and retest        |
| <70%         | ❌ Major revision needed |

---

## Architecture Comparison Checklist

After all tests, compare:

- [ ] Permission flow differences
- [ ] Audio quality (RMS, variance)
- [ ] CPU usage (Intel vs M1 vs M2 vs M3)
- [ ] RAM usage
- [ ] Performance and responsiveness
- [ ] macOS version compatibility
- [ ] Architecture-specific issues

---

## Files to Create

```
tests/results/
├── TASK_9.5_TEST_RESULTS.md (main results)
├── mac-intel-test-data.json
├── mac-m1-test-data.json
├── mac-m2-test-data.json
├── mac-m3-test-data.json
└── screenshots/
    ├── mac-intel/ (4-5 images)
    ├── mac-m1/ (4-5 images)
    ├── mac-m2/ (4-5 images)
    └── mac-m3/ (4-5 images)
```

---

## Time Estimate

- **Machine 1 (Intel)**: 2 hours (setup + test + docs)
- **Machine 2 (M1)**: 2 hours
- **Machine 3 (M2)**: 2 hours
- **Machine 4 (M3)**: 2 hours
- **Architecture Comparison**: 1 hour
- **Analysis**: 1 hour
- **Total**: ~10 hours (2 days with buffer)

---

## Key Differences from Windows Testing

### macOS-Specific

- ✅ Screen Recording permission (not Stereo Mix)
- ✅ System Settings link (not Sound settings)
- ✅ getDisplayMedia API (not desktopCapturer)
- ✅ Architecture diversity (Intel vs Apple Silicon)
- ✅ Native arm64 performance testing

### Testing Focus

- Permission flow is critical on macOS
- Architecture performance comparison
- Apple Silicon optimizations
- macOS version compatibility
- External display audio handling

---

## Contact

**Questions?** Check:

1. MACOS_MULTI_MACHINE_TEST_PLAN.md (detailed plan)
2. MACOS_MACHINE_TEST_EXECUTION_GUIDE.md (step-by-step guide)
3. AUDIO_CAPTURE_TEST_GUIDE.md (technical details)

---

## Quick Commands Reference

```bash
# Check architecture
uname -m

# Check processor
sysctl -n machdep.cpu.brand_string

# Check macOS version
sw_vers

# Reset Screen Recording permission
tccutil reset ScreenCapture [bundle-id]

# Open System Settings
open "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"

# Check if Rosetta 2 is installed
/usr/bin/pgrep -q oahd && echo "Rosetta 2 is installed" || echo "Not installed"

# Force architecture
arch -arm64 npm run start  # Apple Silicon
arch -x86_64 npm run start  # Intel
```

---

**Quick Start**:

1. Read this checklist
2. Follow MACOS_MACHINE_TEST_EXECUTION_GUIDE.md for each machine
3. Fill in TASK_9.5_TEST_RESULTS.md as you go
4. Compare architectures and calculate success rate

**Remember**: This is a documentation task since actual hardware testing requires physical machines. The goal is to create comprehensive test plans and templates for when physical testing can be performed.

---

**Document Version**: 1.0  
**Created**: 2024-01-15  
**Purpose**: Task 9.5 Quick Reference
