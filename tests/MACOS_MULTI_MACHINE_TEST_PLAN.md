# macOS Multi-Machine Audio Capture Test Plan

## Task 9.5: Test on Intel Mac, M1, M2, M3

**Objective**: Validate audio capture implementation across diverse macOS hardware architectures to ensure >80% success rate.

**Status**: Ready for execution (Audio capture implementation complete - Tasks 9.1-9.4)

---

## Test Overview

### Purpose

This test validates that the PiyAPI Notes audio capture system works reliably across different Mac architectures (Intel, M1, M2, M3) with varying macOS versions and audio configurations.

### Success Criteria

- **Target Success Rate**: ≥80% of machines successfully capture audio
- **Pass Conditions**: System audio (via Screen Recording permission) OR microphone fallback works
- **Documentation**: All architecture-specific issues documented with mitigation strategies

### Test Scope

- **Minimum Machines**: 4 different Mac architectures (Intel, M1, M2, M3)
- **Architecture Diversity**: Intel x86_64, Apple Silicon M1, M2, M3
- **macOS Versions**: macOS 11 (Big Sur) and later
- **Audio Configurations**: Built-in audio, USB interfaces, Bluetooth devices, external monitors

---

## Required Test Machines

### Machine Profile Requirements

#### Machine 1: Intel Mac

- **Type**: MacBook Pro or iMac (2015-2020)
- **Processor**: Intel Core i5/i7/i9
- **Architecture**: x86_64
- **macOS**: macOS 11 (Big Sur) or later
- **Purpose**: Test Intel-based Mac compatibility
- **Expected Result**: Should work with Screen Recording permission

#### Machine 2: M1 Mac

- **Type**: MacBook Air, MacBook Pro 13", Mac mini, or iMac 24" (2020-2021)
- **Processor**: Apple M1
- **Architecture**: arm64
- **macOS**: macOS 11 (Big Sur) or later
- **Purpose**: Test first-generation Apple Silicon
- **Expected Result**: Should work with Screen Recording permission

#### Machine 3: M2 Mac

- **Type**: MacBook Air, MacBook Pro 13", Mac mini, or Mac Studio (2022-2023)
- **Processor**: Apple M2 or M2 Pro/Max/Ultra
- **Architecture**: arm64
- **macOS**: macOS 12 (Monterey) or later
- **Purpose**: Test second-generation Apple Silicon
- **Expected Result**: Should work with Screen Recording permission

#### Machine 4: M3 Mac

- **Type**: MacBook Pro 14"/16" or iMac 24" (2023+)
- **Processor**: Apple M3 or M3 Pro/Max
- **Architecture**: arm64
- **macOS**: macOS 14 (Sonoma) or later
- **Purpose**: Test latest Apple Silicon generation
- **Expected Result**: Should work with Screen Recording permission

---

## Pre-Test Setup

### 1. Environment Preparation

For each test machine:

```bash
# Clone repository
git clone [repository-url]
cd piyapi-notes

# Install dependencies
npm install

# Build application
npm run build

# Verify build
npm run start
```

### 2. Audio System Check

Before testing, verify:

- [ ] System audio is working (play test sound)
- [ ] Volume is set to 50% or higher
- [ ] No other applications are using audio exclusively
- [ ] Screen Recording permission is NOT granted yet (test permission flow)
- [ ] Microphone permission status is known

### 3. Document Machine Configuration

For each machine, record:

```markdown
## Machine [X] Configuration

**Hardware:**

- Model: [e.g., MacBook Pro 16-inch, 2021]
- Processor: [e.g., Apple M1 Pro]
- Architecture: [x86_64 / arm64]
- RAM: [Amount and type]
- Audio Hardware: [Built-in / USB interface / etc.]
- External Devices: [Monitors, Bluetooth audio, etc.]

**Software:**

- macOS Version: [e.g., macOS 14.2 Sonoma]
- Build Number: [e.g., 23C64]
- System Language: [Language setting]
- Screen Recording Permission: [Not Determined / Denied / Granted]
- Microphone Permission: [Not Determined / Denied / Granted]

**Network:**

- Internet Connection: [Available/Not available]
- Firewall Status: [Active/Inactive]
```

---

## Test Procedure

### Phase 1: Permission Flow Test

#### Step 1: Launch Application (First Time)

```bash
npm run start
```

#### Step 2: Test Permission Detection

1. Navigate to Settings → Audio
2. Verify permission status detection
3. Check for "Screen Recording permission required" message
4. Verify "Open System Settings" button appears

#### Step 3: Grant Screen Recording Permission

1. Click "Open System Settings" button
2. Verify System Settings opens to correct pane:
   - macOS 13+: Privacy & Security → Screen Recording
   - macOS 12: Security & Privacy → Privacy → Screen Recording
3. Enable permission for PiyAPI Notes
4. Return to application
5. Verify permission status updates

#### Step 4: Document Permission Flow

Record:

- [ ] Permission status detected correctly: YES / NO
- [ ] System Settings opened correctly: YES / NO
- [ ] Permission grant successful: YES / NO
- [ ] Application detected permission change: YES / NO
- [ ] Any errors or warnings: [description]

### Phase 2: System Audio Capture Test

#### Step 1: Test getDisplayMedia Capture

1. Ensure Screen Recording permission is granted
2. Open Safari or Chrome with YouTube
3. Play audio content (music or speech)
4. In PiyAPI Notes, click "Start Recording"
5. Observe audio level indicators
6. Record for 30 seconds
7. Stop recording

#### Step 2: Verify Capture Quality

1. Check audio waveform visualization
2. Verify RMS values > 0.01
3. Verify variance > 0.0001
4. Play back captured audio (if implemented)

#### Step 3: Document Results

Record:

- [ ] Screen Recording permission granted: YES / NO
- [ ] System audio detected: YES / NO
- [ ] Audio captured successfully: YES / NO
- [ ] Average RMS value: [value]
- [ ] Audio quality: GOOD / ACCEPTABLE / POOR
- [ ] Any errors or warnings: [description]

### Phase 3: Fallback Testing

#### Test Microphone Fallback

If Screen Recording permission denied or system audio fails:

1. Application should automatically detect failure
2. Fallback notification should display
3. Microphone capture should activate
4. Test microphone by speaking
5. Verify audio is captured

Document:

- [ ] Fallback triggered automatically: YES / NO
- [ ] User notification displayed: YES / NO
- [ ] Microphone capture works: YES / NO
- [ ] Audio quality acceptable: YES / NO

### Phase 4: Architecture-Specific Testing

#### Test External Monitor Audio (if available)

1. Connect external monitor with audio
2. Play audio through monitor speakers
3. Verify audio is captured
4. Test with HDMI and DisplayPort connections

Document:

- [ ] External monitor audio detected: YES / NO / N/A
- [ ] HDMI audio captured: YES / NO / N/A
- [ ] DisplayPort audio captured: YES / NO / N/A

#### Test Bluetooth Audio (if available)

1. Connect Bluetooth headphones or speakers
2. Play audio through Bluetooth device
3. Verify audio is captured
4. Test with AirPods specifically

Document:

- [ ] Bluetooth audio detected: YES / NO / N/A
- [ ] AirPods audio captured: YES / NO / N/A
- [ ] Audio quality with Bluetooth: GOOD / ACCEPTABLE / POOR / N/A

### Phase 5: Stress Testing

#### Long Duration Test

1. Start recording
2. Play audio continuously for 60 minutes
3. Monitor RAM usage every 10 minutes
4. Monitor CPU usage
5. Stop recording

Document:

- [ ] Recording completed without crash: YES / NO
- [ ] RAM usage stable: YES / NO
- [ ] CPU usage acceptable (<40% average): YES / NO
- [ ] Audio quality maintained: YES / NO
- [ ] Any memory leaks detected: YES / NO

#### Multiple Session Test

1. Record 5 consecutive 10-minute sessions
2. Stop and start between each session
3. Verify no degradation in performance

Document:

- [ ] All sessions completed: YES / NO
- [ ] Performance consistent: YES / NO
- [ ] No resource accumulation: YES / NO

---

## Test Results Documentation

### Result Classification

#### ✅ PASS

- System audio captured successfully with Screen Recording permission
- Audio quality meets requirements (RMS > 0.01, variance > 0.0001)
- No errors or warnings
- User experience smooth

#### ⚠️ PARTIAL PASS

- Screen Recording permission denied BUT microphone fallback worked
- Audio quality acceptable with fallback
- User guidance needed but available
- Workaround exists and is documented

#### ❌ FAIL

- Neither system audio nor microphone works
- Audio quality unacceptable
- Critical errors with no workaround
- User cannot capture audio

### Results Template

For each machine, complete:

```markdown
## Machine [X]: [Description]

### Configuration Summary

- **Model**: [MacBook Pro 16-inch, 2021]
- **Processor**: [Apple M1 Pro]
- **Architecture**: [arm64]
- **macOS**: [macOS 14.2 Sonoma]
- **Test Date**: [YYYY-MM-DD]
- **Tester**: [Name]

### Test Results

**Overall Verdict**: [✅ PASS / ⚠️ PARTIAL PASS / ❌ FAIL]

**Permission Flow Test**

- Permission Detection: [CORRECT / INCORRECT]
- System Settings Link: [WORKED / FAILED]
- Permission Grant: [SUCCESSFUL / FAILED]
- Permission Update Detection: [IMMEDIATE / DELAYED / FAILED]

**System Audio Test**

- Screen Recording Permission: [GRANTED / DENIED]
- System Audio Captured: [YES / NO]
- Audio Quality: [GOOD / ACCEPTABLE / POOR]
- Average RMS: [value]
- Variance: [value]

**Fallback Test**

- Fallback Triggered: [YES / NO / N/A]
- Microphone Works: [YES / NO / N/A]
- Fallback Quality: [GOOD / ACCEPTABLE / POOR / N/A]

**Architecture-Specific Tests**

- External Monitor Audio: [PASS / FAIL / NOT TESTED]
- Bluetooth Audio: [PASS / FAIL / NOT TESTED]
- USB Audio Interface: [PASS / FAIL / NOT TESTED]

**Stress Test**

- 60-Minute Test: [PASS / FAIL / NOT TESTED]
- RAM Stable: [YES / NO / NOT TESTED]
- CPU Acceptable: [YES / NO / NOT TESTED]

### Issues Encountered

[Describe any issues, errors, or unexpected behavior]

### Architecture-Specific Issues

[Document any issues specific to this Mac architecture]

### Mitigation Strategies

[Document workarounds or solutions found]

### Screenshots

- [ ] System Settings - Screen Recording permission
- [ ] Permission dialog in app
- [ ] Recording in progress screenshot
- [ ] Audio level indicators
- [ ] Error messages (if any)

### Recommendations

[Suggestions for improving compatibility with this architecture]
```

---

## Success Rate Calculation

After testing all machines:

```
Total Machines Tested: [N]
Passed (System Audio): [X]
Partial Pass (Fallback): [Y]
Failed: [Z]

Success Rate = (X + Y) / N × 100%
```

### Decision Matrix

| Success Rate | Action                                                  |
| ------------ | ------------------------------------------------------- |
| ≥80%         | ✅ Proceed to next task (9.6)                           |
| 70-79%       | ⚠️ Review failures, implement fixes, retest             |
| <70%         | ❌ Major revision needed, consider alternative approach |

---

## Common Issues and Solutions

### Issue 1: Screen Recording Permission Not Granted

**Symptoms:**

- Permission dialog doesn't appear
- System Settings link doesn't work
- Permission status shows "denied"

**Diagnosis:**

```javascript
// Check Screen Recording permission status
const status = systemPreferences.getMediaAccessStatus('screen')
console.log('Screen Recording Permission:', status) // 'not-determined', 'denied', 'granted'
```

**Solutions:**

1. **Manual Permission Grant**:
   - System Settings → Privacy & Security → Screen Recording
   - Enable PiyAPI Notes
   - Restart application

2. **Alternative**: Use microphone fallback
3. **Alternative**: Recommend cloud transcription

**Implementation Status**: ✅ Handled in Task 9.3

### Issue 2: Permission Denied

**Symptoms:**

- `NotAllowedError` when calling `getDisplayMedia()`
- Permission prompt not showing

**Diagnosis:**

```javascript
// Check microphone permission status
const permissionStatus = await navigator.permissions.query({ name: 'microphone' })
console.log('Permission:', permissionStatus.state) // 'granted', 'denied', 'prompt'
```

**Solutions:**

1. **macOS Privacy Settings**:
   - System Settings → Privacy & Security → Microphone
   - Enable for PiyAPI Notes

2. **Electron Permissions**:
   - Check Electron permission handlers
   - Implement proper permission request flow

**Implementation Status**: ✅ Handled in Task 9.4

### Issue 3: External Monitor Audio Not Captured

**Symptoms:**

- Audio from external monitor not detected
- Only built-in audio captured

**Diagnosis:**

```javascript
// Check available audio sources
const sources = await navigator.mediaDevices.enumerateDevices()
sources
  .filter(d => d.kind === 'audiooutput')
  .forEach(device => {
    console.log('Audio Output:', device.label, 'ID:', device.deviceId)
  })
```

**Solutions:**

1. **Select Correct Audio Source**:
   - Ensure external monitor is selected as audio output
   - Verify monitor has audio capability

2. **HDMI/DisplayPort Audio**:
   - Check if monitor supports audio over HDMI/DisplayPort
   - Update monitor firmware if available

3. **Fallback**:
   - Use microphone capture
   - Document limitation

### Issue 4: Architecture-Specific Performance

**Symptoms:**

- Different performance on Intel vs Apple Silicon
- Unexpected CPU or RAM usage

**Diagnosis:**

```javascript
// Detect architecture
const arch = process.arch // 'x64' or 'arm64'
const platform = process.platform // 'darwin'
console.log('Architecture:', arch)
```

**Solutions:**

1. **Optimize for Architecture**:
   - Use native binaries for each architecture
   - Test performance on both Intel and Apple Silicon

2. **Resource Management**:
   - Adjust buffer sizes based on architecture
   - Monitor performance metrics

3. **Documentation**:
   - Document expected performance per architecture
   - Provide architecture-specific guidance

---

## Failure Mode Analysis

### Critical Failures (Block Release)

- [ ] Audio capture fails on >20% of machines
- [ ] No fallback mechanism works
- [ ] Data loss or corruption
- [ ] Application crashes during recording

### Major Failures (Require Fix)

- [ ] Screen Recording permission flow broken on >50% of machines
- [ ] Poor audio quality on >30% of machines
- [ ] Permission errors not handled gracefully
- [ ] High resource usage (>6GB RAM or >40% CPU)

### Minor Failures (Document and Monitor)

- [ ] Specific macOS version incompatibilities
- [ ] UI/UX issues in permission dialogs
- [ ] Performance variations across architectures
- [ ] Edge cases in audio configuration

---

## Architecture Comparison Matrix

| Feature                     | Intel Mac  | M1 Mac     | M2 Mac     | M3 Mac     |
| --------------------------- | ---------- | ---------- | ---------- | ---------- |
| Screen Recording Permission | [✅/❌]    | [✅/❌]    | [✅/❌]    | [✅/❌]    |
| System Audio Capture        | [✅/❌]    | [✅/❌]    | [✅/❌]    | [✅/❌]    |
| Microphone Fallback         | [✅/❌]    | [✅/❌]    | [✅/❌]    | [✅/❌]    |
| External Monitor Audio      | [✅/❌]    | [✅/❌]    | [✅/❌]    | [✅/❌]    |
| Bluetooth Audio             | [✅/❌]    | [✅/❌]    | [✅/❌]    | [✅/❌]    |
| Performance (CPU %)         | [XX%]      | [XX%]      | [XX%]      | [XX%]      |
| RAM Usage (GB)              | [X.X]      | [X.X]      | [X.X]      | [X.X]      |
| Overall Rating              | [✅/⚠️/❌] | [✅/⚠️/❌] | [✅/⚠️/❌] | [✅/⚠️/❌] |

---

## Post-Test Actions

### 1. Compile Results

- [ ] Complete results template for all machines
- [ ] Calculate overall success rate
- [ ] Identify architecture-specific issues
- [ ] Document all workarounds

### 2. Update Documentation

- [ ] Update `TASK_9.1_IMPLEMENTATION.md` with findings
- [ ] Add troubleshooting section to user docs
- [ ] Create architecture compatibility matrix
- [ ] Update FAQ with common issues

### 3. Code Improvements

- [ ] Implement fixes for identified issues
- [ ] Enhance error messages based on feedback
- [ ] Improve fallback chain reliability
- [ ] Add telemetry for audio issues (if applicable)

### 4. User Guidance

- [ ] Create video tutorial for Screen Recording permission
- [ ] Write step-by-step troubleshooting guide
- [ ] Add in-app help for permission configuration
- [ ] Prepare support documentation

### 5. Decision Gate

- [ ] Review results with team
- [ ] Decide: Proceed / Fix and Retest / Pivot to Cloud
- [ ] Update project timeline if needed
- [ ] Communicate findings to stakeholders

---

## Test Execution Checklist

### Pre-Test

- [ ] All 4 Mac architectures identified and available
- [ ] Test environment prepared on each machine
- [ ] Application built and ready to test
- [ ] Documentation templates prepared
- [ ] Screen recording software ready (optional)

### During Test

- [ ] Follow test procedure systematically
- [ ] Document all observations in real-time
- [ ] Take screenshots of key moments
- [ ] Record any unexpected behavior
- [ ] Note architecture-specific issues

### Post-Test

- [ ] Complete results documentation
- [ ] Calculate success rate
- [ ] Analyze architecture-specific issues
- [ ] Prepare recommendations
- [ ] Update task status in tasks.md

---

## Appendix

### A. Audio Metrics Reference

**RMS (Root Mean Square)**

- Measures average audio signal strength
- Range: 0.0 (silence) to 1.0 (maximum)
- Typical speech: 0.02 - 0.10
- Threshold for "audio present": >0.01

**Variance**

- Measures signal variability
- Low variance (<0.0001): Static or silent
- High variance (>0.0001): Dynamic audio
- Indicates audio is changing over time

**SNR (Signal-to-Noise Ratio)**

- Ratio of signal power to noise power
- Measured in decibels (dB)
- Good quality: >20 dB
- Acceptable: >10 dB
- Poor: <10 dB

### B. macOS Audio Architecture

```
Application Layer
    ↓
Electron getDisplayMedia API
    ↓
Chromium Media Stack
    ↓
ScreenCaptureKit (macOS 12.3+)
    ↓
Core Audio
    ↓
Audio Hardware
```

### C. macOS Version Compatibility

| macOS Version | Code Name | Screen Recording | Notes                  |
| ------------- | --------- | ---------------- | ---------------------- |
| 11.x          | Big Sur   | ✅               | First Apple Silicon    |
| 12.x          | Monterey  | ✅               | ScreenCaptureKit added |
| 13.x          | Ventura   | ✅               | Improved privacy       |
| 14.x          | Sonoma    | ✅               | Latest features        |

### D. Test Data Collection

For each test, collect:

```json
{
  "machineId": "machine-1",
  "timestamp": "2024-01-15T10:30:00Z",
  "hardware": {
    "model": "MacBook Pro 16-inch, 2021",
    "processor": "Apple M1 Pro",
    "architecture": "arm64",
    "ram": "16GB"
  },
  "os": {
    "name": "macOS",
    "version": "14.2",
    "build": "23C64",
    "codeName": "Sonoma"
  },
  "testResults": {
    "permissionFlow": {
      "detectionCorrect": true,
      "systemSettingsOpened": true,
      "permissionGranted": true
    },
    "systemAudio": {
      "available": true,
      "captured": true,
      "avgRMS": 0.0234,
      "maxRMS": 0.0456,
      "variance": 0.000234
    },
    "fallback": {
      "triggered": false,
      "microphoneWorks": null
    },
    "verdict": "PASS"
  },
  "architectureSpecific": {
    "externalMonitor": "not_tested",
    "bluetooth": "not_tested"
  },
  "issues": [],
  "duration": 900
}
```

### E. Related Tasks

- **Task 9.1**: ✅ Implement getDisplayMedia audio capture
- **Task 9.2**: ✅ Detect Screen Recording permission status
- **Task 9.3**: ✅ Guide user to System Settings if permission denied
- **Task 9.4**: ✅ Implement microphone fallback
- **Task 9.5**: 🔄 Test on Intel Mac, M1, M2, M3 (THIS TASK)
- **Task 9.6**: ⏳ Handle external monitors and Bluetooth audio
- **Task 9.7**: ⏳ Create permission request flow UI

---

## Contact and Support

**Test Coordinator**: [Name]  
**Email**: [Email]  
**Slack Channel**: #audio-testing  
**Issue Tracker**: [Link to issue tracker]

---

**Document Version**: 1.0  
**Last Updated**: 2024-01-15  
**Next Review**: After test completion
