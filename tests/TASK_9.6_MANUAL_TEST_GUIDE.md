# Task 9.6: Manual Testing Guide for External Audio Devices

## Overview

This guide provides step-by-step instructions for manually testing external monitor and Bluetooth audio device support in PiyAPI Notes.

## Test Date

**To be executed:** After Task 9.6 implementation

## Prerequisites

### Hardware Requirements

**Minimum Test Setup:**

- 1 computer (macOS or Windows)
- 1 Bluetooth audio device (AirPods, Bluetooth speaker, or headphones)
- 1 external monitor with HDMI or DisplayPort audio support

**Recommended Test Setup:**

- 1 macOS computer (Intel or Apple Silicon)
- 1 Windows computer
- 1 pair of AirPods or AirPods Pro
- 1 Bluetooth speaker
- 1 external monitor with HDMI audio
- 1 external monitor with DisplayPort audio
- 1 USB audio device (optional)

### Software Requirements

- PiyAPI Notes application installed
- macOS: Screen Recording permission granted
- Windows: Stereo Mix enabled
- Audio test files or YouTube videos for testing

## Test Scenarios

### Test 1: AirPods on macOS

**Objective:** Verify system audio capture works with AirPods connected

**Steps:**

1. Connect AirPods to Mac
2. Set AirPods as audio output device (System Settings → Sound → Output)
3. Launch PiyAPI Notes
4. Check Screen Recording permission status
5. Start a new meeting
6. Play audio (YouTube video or music)
7. Verify audio is being captured
8. Stop the meeting

**Expected Results:**

- ✅ AirPods appear as audio output device
- ✅ Screen Recording permission is granted
- ✅ Audio capture starts successfully
- ✅ System audio is captured through Screen Recording
- ✅ No configuration needed
- ✅ Audio quality is acceptable (slight latency is normal)

**Pass Criteria:**

- Audio is captured without errors
- Transcription works (if ASR is implemented)
- No crashes or freezes

**Notes:**

- Bluetooth latency: ~150ms (acceptable for meeting transcription)
- Audio quality depends on Bluetooth codec (AAC preferred)

---

### Test 2: External Monitor (HDMI) on macOS

**Objective:** Verify system audio capture works with HDMI monitor audio

**Steps:**

1. Connect external monitor via HDMI
2. Set monitor as audio output device (System Settings → Sound → Output)
3. Verify monitor appears in audio output list
4. Launch PiyAPI Notes
5. Start a new meeting
6. Play audio through HDMI monitor
7. Verify audio is being captured
8. Stop the meeting

**Expected Results:**

- ✅ HDMI monitor appears as audio output device
- ✅ Audio capture works automatically
- ✅ No additional configuration needed
- ✅ Low latency (<50ms)

**Pass Criteria:**

- Audio is captured without errors
- No audio dropouts
- Monitor audio works seamlessly

**Notes:**

- macOS handles HDMI audio automatically
- No need to detect specific device type

---

### Test 3: Device Switching on macOS

**Objective:** Verify audio capture continues when switching output devices

**Steps:**

1. Launch PiyAPI Notes
2. Start a new meeting with built-in speakers
3. Play audio for 30 seconds
4. Switch to AirPods (System Settings → Sound → Output)
5. Continue playing audio for 30 seconds
6. Switch to HDMI monitor
7. Continue playing audio for 30 seconds
8. Stop the meeting
9. Check device switch history

**Expected Results:**

- ✅ Audio capture continues without interruption
- ✅ All device switches are logged
- ✅ Device switch timestamps are recorded
- ✅ No audio dropouts during switches
- ✅ Switch count is accurate

**Pass Criteria:**

- Audio capture never stops
- All switches are logged correctly
- No errors or warnings

**Notes:**

- macOS handles device switching automatically
- Application should log switches for diagnostics

---

### Test 4: Bluetooth Speaker on Windows

**Objective:** Verify system audio capture works with Bluetooth speaker

**Steps:**

1. Connect Bluetooth speaker to Windows PC
2. Set speaker as audio output device (Settings → Sound → Output)
3. Enable Stereo Mix (Sound settings → Recording → Show Disabled Devices → Enable Stereo Mix)
4. Set Stereo Mix as default recording device
5. Launch PiyAPI Notes
6. Start a new meeting
7. Play audio through Bluetooth speaker
8. Verify audio is being captured
9. Stop the meeting

**Expected Results:**

- ✅ Bluetooth speaker appears as audio output device
- ✅ Stereo Mix is enabled and set as default
- ✅ Audio capture works through Stereo Mix
- ✅ Device type detected as "bluetooth"
- ✅ Connection type detected as "bluetooth"

**Pass Criteria:**

- Audio is captured without errors
- Device classification is correct
- Latency is acceptable (~150ms)

**Notes:**

- Windows requires Stereo Mix to be enabled
- Some Bluetooth devices may have higher latency

---

### Test 5: External Monitor (HDMI) on Windows

**Objective:** Verify system audio capture works with HDMI monitor audio

**Steps:**

1. Connect external monitor via HDMI
2. Set monitor as audio output device (Settings → Sound → Output)
3. Verify Stereo Mix is enabled
4. Launch PiyAPI Notes
5. Enumerate audio devices (check console logs)
6. Verify device type is detected as "external-monitor"
7. Verify connection type is detected as "hdmi"
8. Start a new meeting
9. Play audio through HDMI monitor
10. Verify audio is being captured
11. Stop the meeting

**Expected Results:**

- ✅ HDMI monitor appears as audio output device
- ✅ Device type: "external-monitor"
- ✅ Connection type: "hdmi"
- ✅ Audio capture works through Stereo Mix
- ✅ Low latency (<50ms)

**Pass Criteria:**

- Device classification is correct
- Audio is captured without errors
- No audio dropouts

**Notes:**

- Windows requires Stereo Mix for system audio capture
- HDMI audio should have lower latency than Bluetooth

---

### Test 6: Device Switching on Windows

**Objective:** Verify device switching behavior on Windows

**Steps:**

1. Launch PiyAPI Notes
2. Start a new meeting with built-in speakers
3. Play audio for 30 seconds
4. Switch to Bluetooth speaker (Settings → Sound → Output)
5. Continue playing audio for 30 seconds
6. Switch to HDMI monitor
7. Continue playing audio for 30 seconds
8. Stop the meeting
9. Check device switch history

**Expected Results:**

- ⚠️ Audio capture may be interrupted during device switch
- ✅ Device switches are logged
- ✅ Audio capture resumes after switch
- ✅ Switch count is accurate

**Pass Criteria:**

- Device switches are logged correctly
- Audio capture resumes after switch
- No crashes or errors

**Notes:**

- Windows may require manual intervention for device switching
- Stereo Mix captures all system audio regardless of output device
- Some audio dropouts during switching are acceptable

---

### Test 7: USB Audio Device

**Objective:** Verify USB audio device support

**Steps:**

1. Connect USB audio device (DAC, headphones, or interface)
2. Set USB device as audio output device
3. Launch PiyAPI Notes
4. Enumerate audio devices
5. Verify device type is detected as "usb"
6. Start a new meeting
7. Play audio through USB device
8. Verify audio is being captured
9. Stop the meeting

**Expected Results:**

- ✅ USB device appears as audio output device
- ✅ Device type: "usb"
- ✅ Connection type: "usb"
- ✅ Audio capture works
- ✅ Low latency (<50ms)

**Pass Criteria:**

- Device classification is correct
- Audio is captured without errors
- No audio dropouts

**Notes:**

- USB audio devices should have excellent quality
- Some USB devices may require specific drivers

---

### Test 8: Device Enumeration

**Objective:** Verify all audio devices are enumerated correctly

**Steps:**

1. Connect multiple audio devices:
   - Built-in speakers
   - AirPods (Bluetooth)
   - External monitor (HDMI)
   - USB audio device (if available)
2. Launch PiyAPI Notes
3. Open developer console
4. Call `enumerateAudioSources()` API
5. Verify all devices are listed
6. Check device properties:
   - id
   - label
   - kind
   - isDefault
   - isAvailable
   - deviceType
   - connectionType

**Expected Results:**

- ✅ All connected devices are enumerated
- ✅ Each device has correct properties
- ✅ Device types are classified correctly
- ✅ Connection types are identified correctly
- ✅ Default device is marked correctly

**Pass Criteria:**

- All devices appear in the list
- Device classification is accurate
- No missing properties

**Notes:**

- macOS may show single "System Audio" source
- Windows should enumerate multiple sources

---

### Test 9: Detailed Device Information

**Objective:** Verify detailed device information API

**Steps:**

1. Connect multiple audio devices
2. Launch PiyAPI Notes
3. Open developer console
4. Call `getDetailedDeviceInfo()` API
5. Verify response contains:
   - devices array
   - currentDevice (if recording)
   - deviceSwitchCount
   - platform
   - recommendations array

**Expected Results:**

- ✅ All fields are present
- ✅ Devices array is populated
- ✅ Platform is correct (darwin/win32)
- ✅ Recommendations are relevant
- ✅ Device-specific recommendations are included

**Pass Criteria:**

- API returns complete information
- Recommendations are helpful
- No errors or missing data

**Notes:**

- Recommendations should be platform-specific
- Device-specific recommendations should appear when relevant

---

### Test 10: Device Testing API

**Objective:** Verify device testing functionality

**Steps:**

1. Connect multiple audio devices
2. Launch PiyAPI Notes
3. Open developer console
4. Get device list: `const devices = await enumerateAudioSources()`
5. Test each device: `await testAudioDevice(device.id)`
6. Verify response for each device:
   - success: boolean
   - deviceInfo: object or null
   - error: string (if failed)
   - latency: number (if successful)

**Expected Results:**

- ✅ Available devices return success: true
- ✅ Device info is populated
- ✅ Latency is estimated correctly:
  - Bluetooth: ~150ms
  - Wired: ~50ms
- ✅ Non-existent devices return success: false
- ✅ Error messages are descriptive

**Pass Criteria:**

- All available devices test successfully
- Latency estimates are reasonable
- Error handling works correctly

**Notes:**

- Latency values are estimates, not actual measurements
- Bluetooth devices should show higher latency

---

## Test Results Template

### Test Environment

**Date:** [Date]  
**Tester:** [Name]  
**Platform:** [macOS/Windows]  
**OS Version:** [Version]  
**PiyAPI Notes Version:** [Version]

### Devices Tested

- [ ] AirPods / AirPods Pro
- [ ] Bluetooth Speaker
- [ ] Bluetooth Headphones
- [ ] External Monitor (HDMI)
- [ ] External Monitor (DisplayPort)
- [ ] USB Audio Device
- [ ] Built-in Speakers

### Test Results

| Test # | Test Name                   | Status            | Notes |
| ------ | --------------------------- | ----------------- | ----- |
| 1      | AirPods on macOS            | ⬜ Pass / ⬜ Fail |       |
| 2      | HDMI Monitor on macOS       | ⬜ Pass / ⬜ Fail |       |
| 3      | Device Switching (macOS)    | ⬜ Pass / ⬜ Fail |       |
| 4      | Bluetooth Speaker (Windows) | ⬜ Pass / ⬜ Fail |       |
| 5      | HDMI Monitor (Windows)      | ⬜ Pass / ⬜ Fail |       |
| 6      | Device Switching (Windows)  | ⬜ Pass / ⬜ Fail |       |
| 7      | USB Audio Device            | ⬜ Pass / ⬜ Fail |       |
| 8      | Device Enumeration          | ⬜ Pass / ⬜ Fail |       |
| 9      | Detailed Device Info        | ⬜ Pass / ⬜ Fail |       |
| 10     | Device Testing API          | ⬜ Pass / ⬜ Fail |       |

### Issues Found

1. **Issue:** [Description]  
   **Severity:** Critical / High / Medium / Low  
   **Steps to Reproduce:** [Steps]  
   **Expected:** [Expected behavior]  
   **Actual:** [Actual behavior]

2. **Issue:** [Description]  
   **Severity:** Critical / High / Medium / Low  
   **Steps to Reproduce:** [Steps]  
   **Expected:** [Expected behavior]  
   **Actual:** [Actual behavior]

### Overall Assessment

**Pass Rate:** [X/10 tests passed]  
**Critical Issues:** [Number]  
**Recommendation:** ⬜ Ready for production / ⬜ Needs fixes / ⬜ Needs redesign

### Additional Notes

[Any additional observations, recommendations, or concerns]

---

## Troubleshooting

### macOS Issues

**Issue:** Screen Recording permission denied  
**Solution:** Open System Settings → Privacy & Security → Screen Recording → Enable PiyAPI Notes

**Issue:** No audio captured  
**Solution:** Verify Screen Recording permission is granted, restart application

**Issue:** AirPods not working  
**Solution:** Ensure AirPods are connected and set as output device in System Settings

### Windows Issues

**Issue:** Stereo Mix not available  
**Solution:** Right-click in Recording tab → Show Disabled Devices → Enable Stereo Mix

**Issue:** No audio captured  
**Solution:** Verify Stereo Mix is enabled and set as default recording device

**Issue:** Bluetooth audio not working  
**Solution:** Ensure Bluetooth device is connected and set as output device in Settings

### General Issues

**Issue:** Device not detected  
**Solution:** Reconnect device, restart application, check device drivers

**Issue:** Audio dropouts  
**Solution:** Check Bluetooth signal strength, verify cable connections, update drivers

**Issue:** High latency  
**Solution:** Use wired connection instead of Bluetooth, check system audio settings

---

## Success Criteria

Task 9.6 is considered complete when:

- ✅ All 10 test scenarios pass on both macOS and Windows
- ✅ Device type detection works correctly for all device types
- ✅ Device switching is logged and tracked
- ✅ Detailed device information API works correctly
- ✅ Device testing API works correctly
- ✅ No critical issues found
- ✅ Documentation is complete and accurate
- ✅ Pass rate ≥ 90% (9/10 tests)

---

## Next Steps

After completing manual testing:

1. Document all test results
2. Fix any critical or high-severity issues
3. Update documentation with any device-specific notes
4. Mark Task 9.6 as complete
5. Proceed to Task 9.7 (Permission request flow UI)

---

## References

- Task 9.6 Implementation: `docs/TASK_9.6_EXTERNAL_DEVICES.md`
- AudioPipelineService: `src/main/services/AudioPipelineService.ts`
- Type Definitions: `src/types/ipc.ts`
- Automated Tests: `src/main/services/__tests__/AudioPipelineService.externalDevices.test.ts`
