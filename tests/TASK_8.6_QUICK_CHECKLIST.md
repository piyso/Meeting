# Task 8.6 Quick Checklist

## One-Page Reference for Multi-Machine Testing

---

## Pre-Test Setup ✓

- [ ] 5 Windows machines identified and available
- [ ] All machines have audio drivers installed
- [ ] Application built and ready to deploy
- [ ] Test documentation templates prepared
- [ ] Screenshot tools ready

---

## Machine Requirements ✓

- [ ] **Machine 1**: Standard laptop with Realtek audio
- [ ] **Machine 2**: Desktop with dedicated sound card
- [ ] **Machine 3**: USB audio interface (Focusrite, Behringer, etc.)
- [ ] **Machine 4**: High-end motherboard audio (ASUS, MSI, Gigabyte)
- [ ] **Machine 5**: Budget/generic audio configuration

---

## For Each Machine

### Setup Phase

- [ ] Install application
- [ ] Document hardware configuration
- [ ] Document driver information
- [ ] Document OS version
- [ ] Check audio system is working

### Test Phase

- [ ] Launch application
- [ ] Navigate to audio settings
- [ ] Check device enumeration
- [ ] Open YouTube/media player
- [ ] Start recording
- [ ] Observe audio levels (30 seconds)
- [ ] Stop recording
- [ ] Check audio metrics (RMS > 0.01, Variance > 0.0001)

### Fallback Test (if system audio fails)

- [ ] Verify fallback notification displays
- [ ] Test microphone capture
- [ ] Verify audio quality acceptable
- [ ] Document fallback behavior

### Documentation Phase

- [ ] Record test verdict (PASS/PARTIAL/FAIL)
- [ ] Document audio metrics
- [ ] Capture screenshots
- [ ] Note any issues
- [ ] Write recommendations

---

## Success Criteria

### Per Machine

- ✅ **PASS**: System audio works, RMS > 0.01, Variance > 0.0001
- ⚠️ **PARTIAL**: System audio fails BUT microphone fallback works
- ❌ **FAIL**: Neither system audio nor microphone works

### Overall

- **Target**: ≥80% success rate (4 out of 5 machines)
- **Calculation**: (PASS + PARTIAL) / 5 × 100%

---

## Quick Troubleshooting

### No Stereo Mix

1. Right-click speaker icon → Sounds
2. Recording tab → Right-click → Show Disabled Devices
3. Enable "Stereo Mix"

### Permission Denied

1. Windows Settings → Privacy → Microphone
2. Enable "Let apps access your microphone"

### No Audio Detected

1. Check system volume (>50%)
2. Verify audio is playing
3. Check if device is muted

### App Won't Start

```bash
rm -rf node_modules
npm install
npm run start
```

---

## Data to Collect

For each machine:

- [ ] CPU model
- [ ] RAM amount
- [ ] Audio driver name and version
- [ ] OS version and build
- [ ] Test verdict
- [ ] Audio metrics (RMS, variance)
- [ ] Screenshots (4-5 per machine)
- [ ] Issues encountered
- [ ] Mitigation strategies

---

## Post-Test Actions

- [ ] Complete all 5 machine tests
- [ ] Calculate success rate
- [ ] Compile results in TASK_8.6_TEST_RESULTS.md
- [ ] Analyze failure modes
- [ ] Write recommendations
- [ ] Update tasks.md status
- [ ] Decide: Proceed / Fix / Pivot

---

## Decision Matrix

| Success Rate | Action                   |
| ------------ | ------------------------ |
| ≥80%         | ✅ Proceed to Task 8.7   |
| 70-79%       | ⚠️ Fix and retest        |
| <70%         | ❌ Major revision needed |

---

## Files to Create

```
tests/results/
├── TASK_8.6_TEST_RESULTS.md (main results)
├── machine1-test-data.json
├── machine2-test-data.json
├── machine3-test-data.json
├── machine4-test-data.json
├── machine5-test-data.json
└── screenshots/
    ├── machine1/ (4-5 images)
    ├── machine2/ (4-5 images)
    ├── machine3/ (4-5 images)
    ├── machine4/ (4-5 images)
    └── machine5/ (4-5 images)
```

---

## Time Estimate

- **Machine 1**: 2 hours (setup + test + docs)
- **Machine 2**: 2 hours
- **Machine 3**: 2.5 hours (USB setup takes longer)
- **Machine 4**: 2 hours
- **Machine 5**: 2 hours
- **Analysis**: 2 hours
- **Total**: ~12-13 hours (2-3 days with buffer)

---

## Contact

**Questions?** Check:

1. WINDOWS_MULTI_MACHINE_TEST_PLAN.md (detailed plan)
2. MACHINE_TEST_EXECUTION_GUIDE.md (step-by-step guide)
3. AUDIO_CAPTURE_TEST_GUIDE.md (technical details)

---

**Quick Start**:

1. Read this checklist
2. Follow MACHINE_TEST_EXECUTION_GUIDE.md for each machine
3. Fill in TASK_8.6_TEST_RESULTS.md as you go
4. Calculate success rate at the end

**Remember**: This is a documentation task since actual hardware testing requires physical machines. The goal is to create comprehensive test plans and templates for when physical testing can be performed.
