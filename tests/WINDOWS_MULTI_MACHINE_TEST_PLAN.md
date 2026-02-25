# Windows Multi-Machine Audio Capture Test Plan

## Task 8.6: Test on 5+ Windows Machines with Different Drivers

**Objective**: Validate audio capture implementation across diverse Windows hardware configurations to ensure >80% success rate.

**Status**: Ready for execution (Audio capture implementation complete - Tasks 8.1-8.5)

---

## Test Overview

### Purpose

This test validates that the PiyAPI Notes audio capture system works reliably across different Windows machines with varying audio drivers, hardware configurations, and Windows versions.

### Success Criteria

- **Target Success Rate**: ≥80% of machines successfully capture audio
- **Pass Conditions**: System audio OR microphone fallback works
- **Documentation**: All failures documented with mitigation strategies

### Test Scope

- **Minimum Machines**: 5 different Windows machines
- **Driver Diversity**: Realtek, Focusrite, USB audio interfaces, high-end motherboard audio
- **Windows Versions**: Windows 10 and Windows 11
- **Audio Configurations**: Built-in audio, USB interfaces, Bluetooth devices

---

## Required Test Machines

### Machine Profile Requirements

#### Machine 1: Standard Laptop (Realtek)

- **Type**: Consumer laptop
- **Audio Driver**: Realtek High Definition Audio
- **OS**: Windows 10 or 11
- **Purpose**: Test most common consumer audio configuration
- **Expected Result**: Should work with Stereo Mix enabled

#### Machine 2: Desktop with Dedicated Sound Card

- **Type**: Desktop PC
- **Audio Driver**: Creative Sound Blaster, ASUS Xonar, or similar
- **OS**: Windows 10 or 11
- **Purpose**: Test dedicated audio hardware
- **Expected Result**: Should work with advanced audio features

#### Machine 3: USB Audio Interface

- **Type**: Any machine with USB audio interface
- **Audio Driver**: Focusrite Scarlett, Behringer, PreSonus, or similar
- **OS**: Windows 10 or 11
- **Purpose**: Test professional audio hardware
- **Expected Result**: May require specific driver configuration

#### Machine 4: High-End Motherboard Audio

- **Type**: Gaming/enthusiast desktop
- **Audio Driver**: ASUS SupremeFX, MSI Audio Boost, Gigabyte AMP-UP
- **OS**: Windows 10 or 11
- **Purpose**: Test premium integrated audio
- **Expected Result**: Should work with enhanced audio features

#### Machine 5: Budget/Generic Configuration

- **Type**: Budget laptop or desktop
- **Audio Driver**: Generic Windows audio driver
- **OS**: Windows 10 or 11
- **Purpose**: Test minimal audio configuration
- **Expected Result**: Basic functionality, may need fallback

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

- [ ] Audio drivers are up to date
- [ ] System audio is working (play test sound)
- [ ] Volume is set to 50% or higher
- [ ] No other applications are using audio exclusively
- [ ] Windows audio enhancements are disabled (for consistent testing)

### 3. Document Machine Configuration

For each machine, record:

```markdown
## Machine [X] Configuration

**Hardware:**

- CPU: [Model and generation]
- RAM: [Amount and type]
- Audio Chipset: [Manufacturer and model]
- Audio Driver: [Name and version]
- Additional Audio Devices: [USB interfaces, Bluetooth, etc.]

**Software:**

- OS: [Windows version and build]
- OS Language: [Language setting]
- Audio Enhancements: [Enabled/Disabled]
- Privacy Settings: [Microphone access status]

**Network:**

- Internet Connection: [Available/Not available]
- Firewall Status: [Active/Inactive]
```

---

## Test Procedure

### Phase 1: System Audio Capture Test

#### Step 1: Launch Application

```bash
npm run start
```

#### Step 2: Open Audio Settings

1. Navigate to Settings → Audio
2. Verify audio source enumeration displays
3. Check for "System Audio" or "Stereo Mix" options

#### Step 3: Test System Audio Capture

1. Open YouTube or media player in browser
2. Play audio content (music or speech)
3. In PiyAPI Notes, click "Start Recording"
4. Observe audio level indicators
5. Record for 30 seconds
6. Stop recording

#### Step 4: Verify Capture Quality

1. Check audio waveform visualization
2. Verify RMS values > 0.01
3. Verify variance > 0.0001
4. Play back captured audio (if implemented)

#### Step 5: Document Results

Record:

- [ ] System audio detected: YES / NO
- [ ] Stereo Mix available: YES / NO
- [ ] Audio captured successfully: YES / NO
- [ ] Average RMS value: [value]
- [ ] Audio quality: GOOD / ACCEPTABLE / POOR
- [ ] Any errors or warnings: [description]

### Phase 2: Fallback Testing

#### Test Microphone Fallback

If system audio fails:

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

### Phase 3: Error Handling Test

#### Test Stereo Mix Disabled Scenario

1. Disable Stereo Mix in Windows Sound settings
2. Attempt to start recording
3. Verify error message displays
4. Verify guidance is provided
5. Follow guidance to enable Stereo Mix
6. Retry recording

Document:

- [ ] Error detected correctly: YES / NO
- [ ] Error message clear and helpful: YES / NO
- [ ] Guidance accurate: YES / NO
- [ ] Recovery successful: YES / NO

#### Test Permission Denied Scenario

1. Revoke microphone permission in Windows Privacy Settings
2. Attempt to start recording
3. Verify permission request displays
4. Grant permission
5. Retry recording

Document:

- [ ] Permission error detected: YES / NO
- [ ] Permission request clear: YES / NO
- [ ] Recovery successful: YES / NO

### Phase 4: Stress Testing

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

- System audio captured successfully
- Audio quality meets requirements (RMS > 0.01, variance > 0.0001)
- No errors or warnings
- User experience smooth

#### ⚠️ PARTIAL PASS

- System audio failed BUT microphone fallback worked
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

- **Audio Driver**: [Name and version]
- **OS**: [Windows version]
- **Test Date**: [YYYY-MM-DD]
- **Tester**: [Name]

### Test Results

**Overall Verdict**: [✅ PASS / ⚠️ PARTIAL PASS / ❌ FAIL]

**System Audio Test**

- Stereo Mix Available: [YES / NO]
- System Audio Captured: [YES / NO]
- Audio Quality: [GOOD / ACCEPTABLE / POOR]
- Average RMS: [value]
- Variance: [value]

**Fallback Test**

- Fallback Triggered: [YES / NO / N/A]
- Microphone Works: [YES / NO / N/A]
- Fallback Quality: [GOOD / ACCEPTABLE / POOR / N/A]

**Error Handling**

- Stereo Mix Error Handled: [YES / NO / N/A]
- Permission Error Handled: [YES / NO / N/A]
- User Guidance Helpful: [YES / NO / N/A]

**Stress Test**

- 60-Minute Test: [PASS / FAIL / NOT TESTED]
- RAM Stable: [YES / NO / NOT TESTED]
- CPU Acceptable: [YES / NO / NOT TESTED]

### Issues Encountered

[Describe any issues, errors, or unexpected behavior]

### Mitigation Strategies

[Document workarounds or solutions found]

### Screenshots

- [ ] Audio settings screenshot
- [ ] Recording in progress screenshot
- [ ] Error messages (if any)
- [ ] Windows audio configuration

### Recommendations

[Suggestions for improving compatibility with this configuration]
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
| ≥80%         | ✅ Proceed to next task (8.7)                           |
| 70-79%       | ⚠️ Review failures, implement fixes, retest             |
| <70%         | ❌ Major revision needed, consider alternative approach |

---

## Common Issues and Solutions

### Issue 1: Stereo Mix Not Available

**Symptoms:**

- No "Stereo Mix" or "System Audio" in device list
- Only microphone devices shown

**Diagnosis:**

```javascript
// Check if Stereo Mix is disabled
const sources = await desktopCapturer.getSources({ types: ['audio'] })
const hasStereoMix = sources.some(
  s => s.name.toLowerCase().includes('stereo mix') || s.name.toLowerCase().includes('system audio')
)
```

**Solutions:**

1. **Enable Stereo Mix**:
   - Right-click speaker icon → Sounds
   - Recording tab → Right-click → Show Disabled Devices
   - Enable "Stereo Mix"

2. **Alternative**: Use microphone fallback
3. **Alternative**: Recommend cloud transcription

**Implementation Status**: ✅ Handled in Task 8.4

### Issue 2: Permission Denied

**Symptoms:**

- `NotAllowedError` when calling `getUserMedia()`
- Permission prompt not showing

**Diagnosis:**

```javascript
// Check microphone permission status
const permissionStatus = await navigator.permissions.query({ name: 'microphone' })
console.log('Permission:', permissionStatus.state) // 'granted', 'denied', 'prompt'
```

**Solutions:**

1. **Windows Privacy Settings**:
   - Settings → Privacy & Security → Microphone
   - Enable "Let apps access your microphone"
   - Enable for specific app

2. **Browser Permissions** (if using Electron):
   - Check Electron permission handlers
   - Implement proper permission request flow

**Implementation Status**: ✅ Handled in Task 8.5

### Issue 3: Low Audio Quality

**Symptoms:**

- RMS values < 0.01
- High noise floor
- Distorted audio

**Diagnosis:**

```javascript
// Analyze audio quality
const rms = calculateRMS(audioBuffer)
const snr = calculateSNR(audioBuffer)
console.log('RMS:', rms, 'SNR:', snr)
```

**Solutions:**

1. **Adjust Input Gain**:
   - Increase system volume to 70-80%
   - Adjust microphone boost in Windows

2. **Audio Enhancements**:
   - Disable Windows audio enhancements
   - Use raw audio input

3. **Sample Rate**:
   - Verify 16kHz sample rate
   - Check resampling quality

### Issue 4: Driver Compatibility

**Symptoms:**

- Audio device not detected
- Driver crashes
- Intermittent failures

**Diagnosis:**

```javascript
// Log driver information
const audioDevices = await navigator.mediaDevices.enumerateDevices()
audioDevices
  .filter(d => d.kind === 'audioinput')
  .forEach(device => {
    console.log('Device:', device.label, 'ID:', device.deviceId)
  })
```

**Solutions:**

1. **Update Drivers**:
   - Check manufacturer website
   - Use Windows Update
   - Install latest driver version

2. **Compatibility Mode**:
   - Run app in compatibility mode
   - Test with different Electron versions

3. **Alternative Drivers**:
   - Try generic Windows drivers
   - Test with ASIO drivers (if available)

---

## Failure Mode Analysis

### Critical Failures (Block Release)

- [ ] Audio capture fails on >20% of machines
- [ ] No fallback mechanism works
- [ ] Data loss or corruption
- [ ] Application crashes during recording

### Major Failures (Require Fix)

- [ ] Stereo Mix not detected on >50% of machines
- [ ] Poor audio quality on >30% of machines
- [ ] Permission errors not handled gracefully
- [ ] High resource usage (>6GB RAM or >40% CPU)

### Minor Failures (Document and Monitor)

- [ ] Specific driver incompatibilities
- [ ] UI/UX issues in error messages
- [ ] Performance variations across machines
- [ ] Edge cases in audio configuration

---

## Post-Test Actions

### 1. Compile Results

- [ ] Complete results template for all machines
- [ ] Calculate overall success rate
- [ ] Identify common failure patterns
- [ ] Document all workarounds

### 2. Update Documentation

- [ ] Update `AUDIO_IMPLEMENTATION.md` with findings
- [ ] Add troubleshooting section to user docs
- [ ] Create driver compatibility matrix
- [ ] Update FAQ with common issues

### 3. Code Improvements

- [ ] Implement fixes for identified issues
- [ ] Enhance error messages based on feedback
- [ ] Improve fallback chain reliability
- [ ] Add telemetry for audio issues (if applicable)

### 4. User Guidance

- [ ] Create video tutorial for Stereo Mix setup
- [ ] Write step-by-step troubleshooting guide
- [ ] Add in-app help for audio configuration
- [ ] Prepare support documentation

### 5. Decision Gate

- [ ] Review results with team
- [ ] Decide: Proceed / Fix and Retest / Pivot to Cloud
- [ ] Update project timeline if needed
- [ ] Communicate findings to stakeholders

---

## Test Execution Checklist

### Pre-Test

- [ ] All 5 machines identified and available
- [ ] Test environment prepared on each machine
- [ ] Application built and ready to test
- [ ] Documentation templates prepared
- [ ] Screen recording software ready (optional)

### During Test

- [ ] Follow test procedure systematically
- [ ] Document all observations in real-time
- [ ] Take screenshots of key moments
- [ ] Record any unexpected behavior
- [ ] Note user experience feedback

### Post-Test

- [ ] Complete results documentation
- [ ] Calculate success rate
- [ ] Analyze failure modes
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

### B. Windows Audio Architecture

```
Application Layer
    ↓
Electron desktopCapturer API
    ↓
Chromium Media Stack
    ↓
Windows Audio Session API (WASAPI)
    ↓
Audio Driver (Realtek, Creative, etc.)
    ↓
Audio Hardware
```

### C. Test Data Collection

For each test, collect:

```json
{
  "machineId": "machine-1",
  "timestamp": "2024-01-15T10:30:00Z",
  "hardware": {
    "cpu": "Intel Core i5-8250U",
    "ram": "8GB",
    "audioDriver": "Realtek HD Audio",
    "driverVersion": "6.0.9319.1"
  },
  "os": {
    "name": "Windows 11 Pro",
    "version": "22H2",
    "build": "22621.1000"
  },
  "testResults": {
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
  "issues": [],
  "duration": 900
}
```

### D. Related Tasks

- **Task 8.1**: ✅ Implement desktopCapturer audio enumeration
- **Task 8.2**: ✅ Detect Stereo Mix availability
- **Task 8.3**: ✅ Implement system audio capture via WASAPI
- **Task 8.4**: ✅ Handle "Stereo Mix not enabled" error
- **Task 8.5**: ✅ Implement microphone fallback
- **Task 8.6**: 🔄 Test on 5+ Windows machines (THIS TASK)
- **Task 8.7**: ⏳ Create user guidance for enabling Stereo Mix

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
