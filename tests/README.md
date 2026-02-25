# PiyAPI Notes - Audio Capture Test Suite

This directory contains validation tests for Windows audio capture functionality as part of Phase 0 (Pre-Development Validation) of the PiyAPI Notes project.

## Overview

**Task 1.1**: Test Windows audio capture on 5 machines with different audio drivers

**Objective**: Validate that PiyAPI Notes can capture system audio on at least 80% of Windows machines with varying hardware configurations.

## Quick Start

### Prerequisites

1. **Node.js 18+** installed
2. **Windows 10 or Windows 11** operating system
3. **5 different test machines** with varying audio drivers:
   - Realtek audio (common in laptops)
   - Dedicated sound card (e.g., Creative Sound Blaster)
   - USB audio interface (e.g., Focusrite Scarlett)
   - High-end motherboard audio (e.g., ASUS SupremeFX)
   - Budget/generic audio driver

### Installation

```bash
cd tests
npm install
```

### Running Tests

```bash
npm test
```

Or directly with Electron:

```bash
npx electron run-audio-test.js
```

## Test Procedure

### Step 1: Setup Test Machine

1. Ensure audio drivers are up to date
2. Verify system audio is working (play a YouTube video)
3. Check that volume is set to 50% or higher
4. Close other applications that might use the microphone

### Step 2: Run Test

1. Execute `npm test` in the tests directory
2. The test window will open automatically
3. Click the "Run Full Test" button
4. Follow on-screen instructions:
   - Open YouTube in a browser
   - Play any video with audio
   - Keep audio playing for 10 seconds

### Step 3: Review Results

The test will display real-time output showing:

- Audio source enumeration results
- System audio capture status
- Byte stream analysis (RMS values, variance)
- Overall verdict (PASS / PARTIAL_PASS / FAIL)

### Step 4: Export Results

1. Click "Export Results" button
2. Results will be saved to `tests/results/audio-test-[hostname]-[timestamp].json`
3. Document findings in `tests/results/TEST_RESULTS.md`

### Step 5: Repeat for All Machines

Repeat Steps 1-4 on all 5 test machines.

## Test Files

```
tests/
├── README.md                                    # This file
├── package.json                                 # NPM dependencies
├── audio-capture-test.js                        # Main test script
├── run-audio-test.js                            # Electron test runner
├── test-page.html                               # Test UI
├── AUDIO_CAPTURE_TEST_GUIDE.md                  # Detailed test guide
├── WINDOWS_MULTI_MACHINE_TEST_PLAN.md           # Task 8.6 comprehensive plan
├── MACHINE_TEST_EXECUTION_GUIDE.md              # Machine-by-machine execution guide
├── TASK_8.6_QUICK_CHECKLIST.md                  # One-page quick reference
└── results/
    ├── TEST_RESULTS_TEMPLATE.md                 # Template for documenting results
    ├── TASK_8.6_TEST_RESULTS.md                 # Task 8.6 specific results template
    └── [generated test results]                 # JSON files from test runs
```

## Understanding Test Results

### Pass Criteria

A test **PASSES** when:

- ✅ System audio sources are detected (Stereo Mix, System Audio, etc.)
- ✅ Audio byte stream shows variance (variance > 0.0001)
- ✅ Audio is present (max RMS > 0.01)
- ✅ Console displays changing byte stream values

### Partial Pass Criteria

A test **PARTIALLY PASSES** when:

- ⚠️ System audio capture fails
- ✅ Microphone fallback works successfully
- ✅ Audio is captured via microphone

### Fail Criteria

A test **FAILS** when:

- ❌ No system audio sources detected
- ❌ Microphone fallback also fails
- ❌ No audio captured at all

### Audio Metrics Explained

- **RMS (Root Mean Square)**: Measure of audio signal strength
  - Values near 0: No audio or very quiet
  - Values > 0.01: Audio is present
  - Typical range: 0.02 - 0.10 for normal audio

- **Variance**: Measure of how much the audio signal changes
  - Low variance (<0.0001): Static/silent audio
  - High variance (>0.0001): Dynamic audio (speech, music)

- **dB (Decibels)**: Logarithmic measure of audio level
  - -∞ dB: Silence
  - -40 dB: Very quiet
  - -20 dB: Quiet
  - -10 dB: Normal
  - 0 dB: Maximum

## Common Issues and Solutions

### Issue 1: "No system audio sources found"

**Cause**: Stereo Mix is disabled in Windows

**Solution**:

1. Right-click speaker icon in taskbar
2. Select "Sounds" → "Recording" tab
3. Right-click empty space → "Show Disabled Devices"
4. Right-click "Stereo Mix" → "Enable"
5. Re-run test

### Issue 2: "Permission denied" error

**Cause**: Windows Privacy Settings blocking microphone access

**Solution**:

1. Open Windows Settings
2. Go to Privacy & Security → Microphone
3. Enable "Let apps access your microphone"
4. Enable for Electron app
5. Re-run test

### Issue 3: "No audio detected" (RMS near zero)

**Cause**: Audio not playing or volume too low

**Solution**:

1. Verify YouTube video is actually playing
2. Check system volume (should be >50%)
3. Unmute audio if muted
4. Try different audio source
5. Re-run test

### Issue 4: Electron fails to start

**Cause**: Missing dependencies or incompatible Electron version

**Solution**:

```bash
rm -rf node_modules package-lock.json
npm install
npm test
```

## Test Results Analysis

After testing all 5 machines, calculate the success rate:

```
Success Rate = (Passed + Partial Pass) / Total Machines × 100%
```

**Example**:

- Machine 1: PASS (system audio)
- Machine 2: PASS (system audio)
- Machine 3: PARTIAL_PASS (microphone fallback)
- Machine 4: PASS (system audio)
- Machine 5: FAIL (no audio)

Success Rate = (3 + 1) / 5 × 100% = **80%** ✅ TARGET MET

### Decision Gate

- **If success rate ≥ 80%**: ✅ Proceed to Phase 1 (Foundation)
- **If success rate < 80%**: ❌ Re-evaluate audio capture approach
  - Consider cloud-first architecture
  - Implement more robust fallback mechanisms
  - Extend testing to more machines
  - Adjust design document

## Failure Mode Documentation

For each failed test, document:

1. **Machine Configuration**:
   - CPU, RAM, audio driver details
   - Operating system version
   - Audio hardware (built-in, USB, etc.)

2. **Failure Details**:
   - Exact error message
   - What step failed (enumeration, capture, monitoring)
   - Audio metrics (RMS, variance)

3. **Mitigation Strategy**:
   - What fallback worked (if any)
   - User guidance needed
   - Potential code fixes

4. **Screenshots**:
   - Test results
   - Windows audio settings
   - Error messages

## Task 8.6: Multi-Machine Testing

**Status**: Ready for execution (Audio implementation complete)

Task 8.6 requires testing on 5+ Windows machines with different drivers to validate >80% success rate.

### Quick Start for Task 8.6

1. **Read the documentation**:
   - `TASK_8.6_QUICK_CHECKLIST.md` - One-page reference
   - `WINDOWS_MULTI_MACHINE_TEST_PLAN.md` - Comprehensive plan
   - `MACHINE_TEST_EXECUTION_GUIDE.md` - Step-by-step guide

2. **Prepare 5 machines**:
   - Machine 1: Standard laptop (Realtek)
   - Machine 2: Desktop with dedicated sound card
   - Machine 3: USB audio interface
   - Machine 4: High-end motherboard audio
   - Machine 5: Budget/generic configuration

3. **Execute tests**:
   - Follow MACHINE_TEST_EXECUTION_GUIDE.md for each machine
   - Document results in TASK_8.6_TEST_RESULTS.md
   - Capture screenshots for each machine

4. **Analyze results**:
   - Calculate success rate: (PASS + PARTIAL) / 5 × 100%
   - Target: ≥80%
   - Document failure modes and recommendations

### Test Documentation

- **WINDOWS_MULTI_MACHINE_TEST_PLAN.md**: Comprehensive test plan with detailed procedures, success criteria, and failure mode analysis
- **MACHINE_TEST_EXECUTION_GUIDE.md**: Machine-by-machine execution guide with specific instructions for each hardware type
- **TASK_8.6_TEST_RESULTS.md**: Results template with sections for each machine and overall analysis
- **TASK_8.6_QUICK_CHECKLIST.md**: One-page quick reference for rapid testing

### Expected Timeline

- Day 1: Machines 1-2 (4 hours)
- Day 2: Machines 3-4 (5 hours)
- Day 3: Machine 5 + Analysis (4 hours)
- **Total**: 2-3 days with buffer

## Next Steps

After completing Task 1.1:

1. ✅ Compile all test results into `TEST_RESULTS.md`
2. ✅ Calculate overall success rate
3. ✅ Analyze failure modes
4. ✅ Document mitigation strategies
5. ⏭️ Proceed to **Task 1.2**: Test macOS audio capture
6. ⏭️ Continue with remaining Phase 0 validation tasks

After completing Task 8.6:

1. ✅ Complete TASK_8.6_TEST_RESULTS.md with all machine data
2. ✅ Calculate success rate (target: ≥80%)
3. ✅ Analyze failure modes and patterns
4. ✅ Document recommendations
5. ⏭️ Proceed to **Task 8.7**: Create user guidance for enabling Stereo Mix
6. ⏭️ Continue with Phase 2 completion

## Support

If you encounter issues during testing:

1. Check the [AUDIO_CAPTURE_TEST_GUIDE.md](./AUDIO_CAPTURE_TEST_GUIDE.md) for detailed instructions
2. Review the "Common Issues and Solutions" section above
3. Check Electron DevTools console for detailed error messages
4. Verify all prerequisites are met
5. Ensure Electron version is compatible (v25+)

## Technical Details

### Audio Capture Pipeline

```
desktopCapturer → getUserMedia → AudioContext → AnalyserNode → Byte Stream Analysis
```

### Test Architecture

1. **Enumeration**: List all available audio sources using `desktopCapturer.getSources()`
2. **Capture**: Request audio stream using `getUserMedia()` with desktop audio constraints
3. **Analysis**: Use Web Audio API to analyze byte stream in real-time
4. **Validation**: Check RMS values and variance to confirm audio is captured
5. **Fallback**: If system audio fails, attempt microphone capture

### Technologies Used

- **Electron**: Desktop app framework
- **Web Audio API**: Audio processing and analysis
- **desktopCapturer**: Electron API for system audio capture
- **getUserMedia**: Browser API for media device access

## License

MIT License - See project root for details

## Authors

PiyAPI Notes Team

---

**Last Updated**: 2024
**Test Version**: 1.0.0
