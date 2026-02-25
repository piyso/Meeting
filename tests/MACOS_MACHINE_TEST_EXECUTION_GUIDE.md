# macOS Machine-by-Machine Test Execution Guide

## Quick Reference for Task 9.5

This guide provides step-by-step instructions for executing audio capture tests on each of the 4 required Mac architectures.

---

## Test Execution Workflow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Prepare Machine → 2. Run Tests → 3. Document Results    │
│                                                              │
│ For each of 4 Mac architectures:                            │
│   • Setup environment                                        │
│   • Execute test suite                                       │
│   • Record observations                                      │
│   • Capture screenshots                                      │
│   • Export test data                                         │
└─────────────────────────────────────────────────────────────┘
```

---

## Machine 1: Intel Mac

### Target Configuration

- **Processor**: Intel Core i5/i7/i9
- **Architecture**: x86_64
- **Typical Device**: MacBook Pro (2015-2020), iMac (2015-2020)
- **Expected Outcome**: Should work with Screen Recording permission

### Setup Steps

1. **Verify Hardware**

   ```bash
   # Check processor type
   sysctl -n machdep.cpu.brand_string
   # Should show: Intel(R) Core(TM) ...

   # Check architecture
   uname -m
   # Should show: x86_64
   ```

2. **Check macOS Version**

   ```bash
   sw_vers
   # ProductName: macOS
   # ProductVersion: 11.x or later
   # BuildVersion: ...
   ```

3. **Reset Screen Recording Permission (for clean test)**
   ```bash
   # Reset permission to test permission flow
   tccutil reset ScreenCapture [bundle-id]
   ```

### Test Execution

```bash
# Navigate to project directory
cd piyapi-notes

# Install dependencies (first time only)
npm install

# Start application
npm run start
```

### Test Checklist

- [ ] Application launches successfully
- [ ] Navigate to Settings → Audio
- [ ] Verify "Screen Recording permission required" message
- [ ] Click "Open System Settings" button
- [ ] System Settings opens to Screen Recording pane
- [ ] Enable permission for PiyAPI Notes
- [ ] Return to app, verify permission detected
- [ ] Open Safari with YouTube, play test video
- [ ] Click "Start Recording"
- [ ] Observe audio level indicators (should show activity)
- [ ] Record for 30 seconds
- [ ] Stop recording
- [ ] Check audio metrics: RMS > 0.01, Variance > 0.0001

### Expected Results

- ✅ Permission flow works correctly
- ✅ Screen Recording permission granted
- ✅ System audio captured successfully
- ✅ Quality: GOOD

### If Test Fails

1. Check if Screen Recording permission is truly granted
2. Verify system volume > 50%
3. Test microphone fallback
4. Document specific error message
5. Check Console.app for system errors

### Documentation

Complete Machine 1 section in `TASK_9.5_TEST_RESULTS.md`

---

## Machine 2: M1 Mac

### Target Configuration

- **Processor**: Apple M1
- **Architecture**: arm64
- **Typical Device**: MacBook Air (2020), MacBook Pro 13" (2020), Mac mini (2020), iMac 24" (2021)
- **Expected Outcome**: Should work with Screen Recording permission

### Setup Steps

1. **Verify Hardware**

   ```bash
   # Check processor type
   sysctl -n machdep.cpu.brand_string
   # Should show: Apple M1

   # Check architecture
   uname -m
   # Should show: arm64
   ```

2. **Check macOS Version**

   ```bash
   sw_vers
   # ProductVersion: 11.x or later (Big Sur minimum for M1)
   ```

3. **Verify Rosetta 2 (if needed for dependencies)**
   ```bash
   # Check if Rosetta 2 is installed
   /usr/bin/pgrep -q oahd && echo "Rosetta 2 is installed" || echo "Rosetta 2 is not installed"
   ```

### Test Execution

```bash
cd piyapi-notes
npm install
npm run start
```

### Test Checklist

- [ ] Application launches (verify native arm64 build)
- [ ] Check process architecture: Activity Monitor → PiyAPI Notes → Architecture (should show "Apple")
- [ ] Navigate to Settings → Audio
- [ ] Test permission flow
- [ ] Grant Screen Recording permission
- [ ] Test system audio capture with Safari/Chrome
- [ ] Verify audio quality
- [ ] Monitor CPU usage (should be lower than Intel)
- [ ] Monitor RAM usage
- [ ] Test with external monitor (if available)

### Expected Results

- ✅ Native arm64 performance
- ✅ Lower CPU usage than Intel
- ✅ Screen Recording permission works
- ✅ System audio captured successfully
- ✅ Quality: GOOD to EXCELLENT

### Architecture-Specific Tests

#### Test Apple Silicon Optimizations

1. Check if app is running natively (not via Rosetta)
2. Monitor CPU efficiency cores vs performance cores
3. Verify lower power consumption
4. Test thermal performance during long recording

Document:

- [ ] Running natively (not Rosetta): YES / NO
- [ ] CPU usage lower than Intel: YES / NO / N/A
- [ ] Thermal performance: GOOD / ACCEPTABLE / POOR

### If Test Fails

1. Verify app is built for arm64 (not x86_64)
2. Check for Rosetta 2 translation issues
3. Test microphone fallback
4. Check for M1-specific audio driver issues

### Documentation

Complete Machine 2 section in `TASK_9.5_TEST_RESULTS.md`

---

## Machine 3: M2 Mac

### Target Configuration

- **Processor**: Apple M2, M2 Pro, M2 Max, or M2 Ultra
- **Architecture**: arm64
- **Typical Device**: MacBook Air (2022), MacBook Pro 13" (2022), Mac mini (2023), Mac Studio (2022)
- **Expected Outcome**: Should work with Screen Recording permission, improved performance over M1

### Setup Steps

1. **Verify Hardware**

   ```bash
   # Check processor type
   sysctl -n machdep.cpu.brand_string
   # Should show: Apple M2 (or M2 Pro/Max/Ultra)

   # Check architecture
   uname -m
   # Should show: arm64
   ```

2. **Check macOS Version**

   ```bash
   sw_vers
   # ProductVersion: 12.x or later (Monterey minimum for M2)
   ```

3. **Check for ScreenCaptureKit availability**
   ```bash
   # ScreenCaptureKit available in macOS 12.3+
   # Verify macOS version is 12.3 or later
   ```

### Test Execution

```bash
cd piyapi-notes
npm install
npm run start
```

### Test Checklist

- [ ] Application launches
- [ ] Verify native arm64 build
- [ ] Test permission flow
- [ ] Grant Screen Recording permission
- [ ] Test system audio capture
- [ ] Compare performance to M1 (if available)
- [ ] Monitor CPU usage (should be similar or better than M1)
- [ ] Monitor RAM usage
- [ ] Test with multiple audio sources
- [ ] Test with external monitor (if available)

### Expected Results

- ✅ Native arm64 performance
- ✅ Similar or better performance than M1
- ✅ Screen Recording permission works
- ✅ System audio captured successfully
- ✅ Quality: EXCELLENT

### Architecture-Specific Tests

#### Test M2 Performance Improvements

1. Compare CPU usage to M1 (if data available)
2. Test with demanding audio scenarios
3. Verify improved efficiency
4. Test with multiple displays (M2 supports more displays)

Document:

- [ ] Performance vs M1: BETTER / SIMILAR / WORSE / N/A
- [ ] Multiple display support: TESTED / NOT TESTED
- [ ] CPU efficiency: EXCELLENT / GOOD / ACCEPTABLE

### If Test Fails

1. Check for M2-specific issues
2. Verify macOS version compatibility
3. Test microphone fallback
4. Check for audio driver updates

### Documentation

Complete Machine 3 section in `TASK_9.5_TEST_RESULTS.md`

---

## Machine 4: M3 Mac

### Target Configuration

- **Processor**: Apple M3, M3 Pro, or M3 Max
- **Architecture**: arm64
- **Typical Device**: MacBook Pro 14"/16" (2023), iMac 24" (2023)
- **Expected Outcome**: Should work with Screen Recording permission, best performance

### Setup Steps

1. **Verify Hardware**

   ```bash
   # Check processor type
   sysctl -n machdep.cpu.brand_string
   # Should show: Apple M3 (or M3 Pro/Max)

   # Check architecture
   uname -m
   # Should show: arm64
   ```

2. **Check macOS Version**

   ```bash
   sw_vers
   # ProductVersion: 14.x or later (Sonoma for M3)
   ```

3. **Check for latest features**
   ```bash
   # M3 Macs ship with macOS Sonoma
   # Verify latest privacy and security features
   ```

### Test Execution

```bash
cd piyapi-notes
npm install
npm run start
```

### Test Checklist

- [ ] Application launches
- [ ] Verify native arm64 build
- [ ] Test permission flow (may have enhanced privacy features)
- [ ] Grant Screen Recording permission
- [ ] Test system audio capture
- [ ] Compare performance to M1/M2 (if data available)
- [ ] Monitor CPU usage (should be best of all architectures)
- [ ] Monitor RAM usage
- [ ] Test with advanced audio features
- [ ] Test with external displays (M3 supports even more)

### Expected Results

- ✅ Native arm64 performance
- ✅ Best performance of all architectures
- ✅ Screen Recording permission works
- ✅ System audio captured successfully
- ✅ Quality: EXCELLENT

### Architecture-Specific Tests

#### Test M3 Advanced Features

1. Test with ray tracing (if applicable to audio processing)
2. Verify improved Neural Engine performance
3. Test with multiple high-resolution displays
4. Monitor power efficiency during recording

Document:

- [ ] Performance vs M1/M2: BETTER / SIMILAR / N/A
- [ ] Neural Engine utilization: HIGH / MEDIUM / LOW / N/A
- [ ] Power efficiency: EXCELLENT / GOOD / ACCEPTABLE
- [ ] Multiple display support: TESTED / NOT TESTED

### If Test Fails

1. Check for M3-specific issues
2. Verify macOS Sonoma compatibility
3. Test microphone fallback
4. Check for latest audio driver updates
5. Verify app is optimized for M3

### Documentation

Complete Machine 4 section in `TASK_9.5_TEST_RESULTS.md`

---

## Data Collection for Each Machine

### Required Information

For every machine, collect:

```markdown
## Machine [X] Data Collection

### Hardware Details

- **Model**: [e.g., MacBook Pro 16-inch, 2021]
- **Processor**: [e.g., Apple M1 Pro]
- **Architecture**: [x86_64 / arm64]
- **RAM**: [e.g., 16GB unified memory]
- **Storage**: [e.g., 512GB SSD]
- **Audio Hardware**: [Built-in / USB interface / etc.]

### System Information

- **macOS Version**: [e.g., macOS 14.2 Sonoma]
- **Build Number**: [e.g., 23C64]
- **Kernel Version**: [from `uname -r`]
- **System Language**: [e.g., English]

### Permission Status

- **Screen Recording**: [Not Determined / Denied / Granted]
- **Microphone**: [Not Determined / Denied / Granted]
- **Accessibility**: [Not Determined / Denied / Granted]

### Test Results

- **Permission Flow Test**: [PASS / FAIL]
- **System Audio Test**: [PASS / FAIL]
- **Microphone Fallback**: [PASS / FAIL / NOT TESTED]
- **Overall Verdict**: [✅ PASS / ⚠️ PARTIAL / ❌ FAIL]

### Metrics

- **Average RMS**: [e.g., 0.0234]
- **Max RMS**: [e.g., 0.0456]
- **Variance**: [e.g., 0.000234]
- **CPU Usage**: [e.g., 15% average, 32% peak]
- **RAM Usage**: [e.g., 2.3 GB]
- **Test Duration**: [e.g., 30 seconds]

### Architecture-Specific Observations

[Note any architecture-specific behavior, performance characteristics, or issues]

### Issues Encountered

[Detailed description of any problems]

### Screenshots Captured

- [ ] System Settings - Screen Recording permission
- [ ] Permission dialog in application
- [ ] Application - Recording in progress
- [ ] Activity Monitor - CPU and RAM usage
- [ ] Error messages (if any)

### Notes

[Any additional observations or comments]
```

---

## Test Execution Timeline

### Recommended Schedule

**Day 1: Intel and M1**

- Morning: Machine 1 (Intel Mac)
  - Setup: 30 minutes
  - Testing: 1 hour
  - Documentation: 30 minutes
- Afternoon: Machine 2 (M1 Mac)
  - Setup: 30 minutes
  - Testing: 1 hour
  - Documentation: 30 minutes

**Day 2: M2 and M3**

- Morning: Machine 3 (M2 Mac)
  - Setup: 30 minutes
  - Testing: 1 hour
  - Documentation: 30 minutes
- Afternoon: Machine 4 (M3 Mac)
  - Setup: 30 minutes
  - Testing: 1 hour
  - Documentation: 30 minutes

**Day 3: Analysis and Comparison**

- Morning: Architecture Comparison
  - Compare performance metrics
  - Identify architecture-specific issues
  - Document patterns
- Afternoon: Results Compilation
  - Compile all results
  - Calculate success rate
  - Write recommendations

**Total Time**: ~3 days (with buffer for issues)

---

## Quick Troubleshooting Guide

### Problem: Application Won't Start

**Solutions:**

```bash
# Clear node modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Rebuild native modules for correct architecture
npm run rebuild

# Check Node.js version and architecture
node --version  # Should be 18+
node -p "process.arch"  # Should match system architecture

# Check for port conflicts
lsof -i :3000
```

### Problem: Screen Recording Permission Not Working

**Solutions:**

1. Manually grant permission:
   - System Settings → Privacy & Security → Screen Recording
   - Enable PiyAPI Notes
   - Restart application

2. Reset permission database:

   ```bash
   tccutil reset ScreenCapture [bundle-id]
   ```

3. Check for macOS version compatibility:
   ```bash
   sw_vers
   # Ensure macOS 11 or later
   ```

### Problem: System Settings Link Doesn't Open

**Solutions:**

1. Check URL scheme:

   ```javascript
   // macOS 13+
   'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'

   // macOS 12 and earlier
   'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
   ```

2. Open manually:
   ```bash
   open "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
   ```

### Problem: No Audio Detected

**Solutions:**

1. Check system volume (>50%)
2. Verify audio is playing in browser
3. Check if audio output is muted
4. Test with different audio source
5. Verify Screen Recording permission is granted

### Problem: Architecture Mismatch

**Solutions:**

```bash
# Check if app is running via Rosetta
ps aux | grep PiyAPI

# Force native architecture
arch -arm64 npm run start  # For Apple Silicon
arch -x86_64 npm run start  # For Intel

# Rebuild for correct architecture
npm run rebuild
```

### Problem: Poor Audio Quality

**Solutions:**

1. Increase system volume to 70-80%
2. Check for background noise
3. Verify sample rate settings
4. Test with different audio source
5. Check for audio interference

---

## Post-Test Checklist

After completing all 4 machines:

- [ ] All test results documented
- [ ] Screenshots collected and organized
- [ ] Success rate calculated
- [ ] Architecture-specific issues analyzed
- [ ] Performance comparison completed
- [ ] Recommendations written
- [ ] Results compiled in TASK_9.5_TEST_RESULTS.md
- [ ] Task 9.5 marked as complete in tasks.md
- [ ] Team notified of results
- [ ] Decision made: Proceed / Fix / Pivot

---

## Success Criteria Summary

### Minimum Requirements

- ✅ 4 different Mac architectures tested (Intel, M1, M2, M3)
- ✅ At least 2 different macOS versions tested
- ✅ Success rate ≥ 80% (3 out of 4 machines minimum)

### Quality Requirements

- ✅ All results documented thoroughly
- ✅ Screenshots captured for each machine
- ✅ Architecture-specific issues identified
- ✅ Performance comparison completed

### Deliverables

- ✅ Completed TASK_9.5_TEST_RESULTS.md
- ✅ Test data JSON files for each machine
- ✅ Screenshots folder with organized images
- ✅ Architecture comparison document
- ✅ Updated tasks.md with results

---

## Architecture Comparison Checklist

After testing all machines, compare:

- [ ] **Permission Flow**: Any differences across architectures?
- [ ] **Audio Quality**: RMS and variance comparison
- [ ] **CPU Usage**: Intel vs M1 vs M2 vs M3
- [ ] **RAM Usage**: Memory efficiency comparison
- [ ] **Performance**: Speed and responsiveness
- [ ] **Compatibility**: macOS version differences
- [ ] **Issues**: Architecture-specific problems

---

## Contact Information

**Questions During Testing:**

- Check existing documentation first
- Review troubleshooting guide
- Consult with team lead
- Document unknown issues for later analysis

**Reporting Issues:**

- Create detailed issue report
- Include machine configuration
- Attach screenshots
- Describe steps to reproduce
- Note architecture-specific details

---

**Document Version**: 1.0  
**Created**: 2024-01-15  
**Purpose**: Task 9.5 Execution Guide
