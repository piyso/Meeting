# Windows Audio Capture Test Guide

## Overview

This guide provides instructions for testing Windows audio capture functionality across different hardware configurations and audio drivers.

**Test Objective**: Validate that PiyAPI Notes can capture system audio on at least 80% of Windows machines with different audio drivers.

## Test Requirements

### Hardware Requirements
Test on 5 different Windows machines with varying configurations:

1. **Machine 1**: Standard laptop with Realtek audio driver
2. **Machine 2**: Desktop with dedicated sound card (e.g., Creative Sound Blaster)
3. **Machine 3**: Laptop with USB audio interface (e.g., Focusrite Scarlett)
4. **Machine 4**: Desktop with high-end motherboard audio (e.g., ASUS SupremeFX)
5. **Machine 5**: Budget laptop with generic audio driver

### Software Requirements
- Windows 10 or Windows 11
- Node.js 18+ installed
- Electron (will be installed via npm)
- YouTube or any media player for audio playback

## Test Setup

### 1. Install Dependencies

```bash
npm install electron
```

### 2. Create Test Runner

Create a file `tests/run-audio-test.js`:

```javascript
const { app, BrowserWindow } = require('electron');
const AudioCaptureTest = require('./audio-capture-test');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('tests/test-page.html');
  mainWindow.webContents.openDevTools();
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
```

### 3. Create Test HTML Page

Create a file `tests/test-page.html`:

```html
<!DOCTYPE html>
<html>
<head>
  <title>Audio Capture Test</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      padding: 20px;
      background: #1e1e1e;
      color: #d4d4d4;
    }
    .container {
      max-width: 1000px;
      margin: 0 auto;
    }
    h1 {
      color: #4ec9b0;
    }
    button {
      background: #0e639c;
      color: white;
      border: none;
      padding: 12px 24px;
      font-size: 16px;
      cursor: pointer;
      border-radius: 4px;
      margin: 10px 5px;
    }
    button:hover {
      background: #1177bb;
    }
    button:disabled {
      background: #555;
      cursor: not-allowed;
    }
    #output {
      background: #252526;
      padding: 20px;
      border-radius: 4px;
      font-family: 'Consolas', 'Courier New', monospace;
      font-size: 14px;
      white-space: pre-wrap;
      max-height: 600px;
      overflow-y: auto;
      margin-top: 20px;
    }
    .instructions {
      background: #2d2d30;
      padding: 15px;
      border-left: 4px solid #4ec9b0;
      margin: 20px 0;
    }
    .warning {
      background: #2d2d30;
      padding: 15px;
      border-left: 4px solid #ce9178;
      margin: 20px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎤 Windows Audio Capture Test</h1>
    
    <div class="instructions">
      <h3>Test Instructions:</h3>
      <ol>
        <li>Click "Run Full Test" button below</li>
        <li>When prompted, open YouTube and play any video with audio</li>
        <li>Keep the audio playing for the entire test duration (10 seconds)</li>
        <li>Observe the console output for test results</li>
      </ol>
    </div>

    <div class="warning">
      <strong>⚠️ Important:</strong> Make sure your system audio is not muted and volume is at a reasonable level (50%+).
    </div>

    <div>
      <button id="runTest">Run Full Test</button>
      <button id="clearOutput">Clear Output</button>
      <button id="exportResults">Export Results</button>
    </div>

    <div id="output"></div>
  </div>

  <script>
    const AudioCaptureTest = require('./audio-capture-test');
    const fs = require('fs');
    const path = require('path');

    const outputDiv = document.getElementById('output');
    const runTestBtn = document.getElementById('runTest');
    const clearOutputBtn = document.getElementById('clearOutput');
    const exportResultsBtn = document.getElementById('exportResults');

    let testResults = null;

    // Override console.log to display in UI
    const originalLog = console.log;
    console.log = function(...args) {
      originalLog.apply(console, args);
      const message = args.join(' ');
      outputDiv.textContent += message + '\n';
      outputDiv.scrollTop = outputDiv.scrollHeight;
    };

    const originalError = console.error;
    console.error = function(...args) {
      originalError.apply(console, args);
      const message = '❌ ERROR: ' + args.join(' ');
      outputDiv.textContent += message + '\n';
      outputDiv.scrollTop = outputDiv.scrollHeight;
    };

    runTestBtn.addEventListener('click', async () => {
      runTestBtn.disabled = true;
      outputDiv.textContent = '';
      
      const tester = new AudioCaptureTest();
      testResults = await tester.runFullTest();
      
      runTestBtn.disabled = false;
      exportResultsBtn.disabled = false;
    });

    clearOutputBtn.addEventListener('click', () => {
      outputDiv.textContent = '';
    });

    exportResultsBtn.addEventListener('click', () => {
      if (!testResults) {
        alert('No test results to export. Run the test first.');
        return;
      }

      const resultsDir = path.join(__dirname, 'results');
      if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir, { recursive: true });
      }

      const filename = `audio-test-${Date.now()}.json`;
      const filepath = path.join(resultsDir, filename);
      
      fs.writeFileSync(filepath, JSON.stringify(testResults, null, 2));
      
      alert(`Results exported to: ${filepath}`);
      console.log(`\n✅ Results saved to: ${filepath}`);
    });

    exportResultsBtn.disabled = true;
  </script>
</body>
</html>
```

## Running the Tests

### Step 1: Run Test on Each Machine

On each test machine, execute:

```bash
cd tests
node run-audio-test.js
```

### Step 2: Follow Test Instructions

1. The test window will open
2. Click "Run Full Test"
3. Open YouTube in a browser and play audio
4. Wait for the test to complete (approximately 15 seconds)
5. Click "Export Results" to save the test results

### Step 3: Document Results

For each machine, record:

1. **Machine ID**: (e.g., "Machine 1 - Realtek Laptop")
2. **Hardware Details**:
   - CPU model
   - RAM amount
   - Audio driver name and version
3. **Test Verdict**: PASS / PARTIAL_PASS / FAIL
4. **Audio Method**: system_audio / microphone_fallback / none
5. **Failure Mode** (if applicable): Description of what failed

## Test Results Template

Create a file `tests/results/TEST_RESULTS.md`:

```markdown
# Audio Capture Test Results

## Test Date: [DATE]
## Tester: [NAME]

---

### Machine 1: [Description]

**Hardware:**
- CPU: Intel Core i5-8250U
- RAM: 8GB
- Audio Driver: Realtek High Definition Audio (v6.0.9319.1)
- OS: Windows 11 Pro

**Test Results:**
- Verdict: ✅ PASS
- Method: system_audio
- Average RMS: 0.0234
- Max RMS: 0.0456
- Variance: 0.000234

**Notes:**
- System audio captured successfully via Stereo Mix
- No issues detected

---

### Machine 2: [Description]

**Hardware:**
- CPU: AMD Ryzen 5 3600
- RAM: 16GB
- Audio Driver: Creative Sound Blaster Z (v1.02.08)
- OS: Windows 10 Pro

**Test Results:**
- Verdict: ⚠️ PARTIAL_PASS
- Method: microphone_fallback
- Failure Mode: Stereo Mix not available

**Notes:**
- System audio capture failed (no Stereo Mix detected)
- Microphone fallback worked successfully
- User would need to enable Stereo Mix manually

---

[Continue for all 5 machines...]

---

## Summary

**Total Machines Tested:** 5
**Passed (System Audio):** X
**Partial Pass (Microphone):** Y
**Failed:** Z

**Success Rate:** (X / 5) * 100 = XX%

**Target:** >80% success rate
**Result:** [PASS / FAIL]

## Failure Modes Identified

1. **Stereo Mix Disabled**: [Count] machines
   - Mitigation: Provide user guidance to enable Stereo Mix
   
2. **No System Audio Sources**: [Count] machines
   - Mitigation: Automatic fallback to microphone

3. **Permission Denied**: [Count] machines
   - Mitigation: Improve permission request flow

## Recommendations

Based on test results:

- [ ] Implement automatic Stereo Mix detection and guidance
- [ ] Improve microphone fallback UX
- [ ] Add pre-flight audio test to onboarding
- [ ] Consider cloud transcription for machines with audio capture issues
```

## Pass/Fail Criteria

### PASS Criteria
- Console shows changing byte stream when audio is playing
- RMS variance > 0.0001
- Max RMS > 0.01
- Success rate across all machines ≥ 80%

### FAIL Criteria
- No audio detected (max RMS < 0.01)
- No variance in byte stream (variance < 0.0001)
- Success rate < 80%

### Failure Actions
1. **Document failure mode**: Record exact error message and system configuration
2. **Test microphone fallback**: Verify microphone capture works as alternative
3. **Provide user guidance**: Create step-by-step instructions to fix the issue
4. **Consider cloud transcription**: Offer cloud-based transcription as fallback

## Common Issues and Solutions

### Issue 1: Stereo Mix Not Available
**Symptoms**: No system audio sources detected
**Solution**: 
1. Right-click speaker icon in taskbar
2. Select "Sounds" → "Recording" tab
3. Right-click empty space → "Show Disabled Devices"
4. Enable "Stereo Mix"

### Issue 2: Permission Denied
**Symptoms**: getUserMedia fails with NotAllowedError
**Solution**: Check Windows Privacy Settings → Microphone access

### Issue 3: No Audio Detected
**Symptoms**: RMS values near zero
**Solution**: 
1. Check system volume (should be >50%)
2. Verify audio is actually playing
3. Check if audio device is muted

## Next Steps After Testing

1. **Compile Results**: Aggregate all test results into summary document
2. **Calculate Success Rate**: (Passed machines / Total machines) * 100
3. **Analyze Failure Modes**: Identify common patterns in failures
4. **Update Architecture**: If success rate < 80%, adjust fallback strategy
5. **Create User Guidance**: Document solutions for common issues
6. **Proceed to Task 1.2**: Test macOS audio capture

## Files Generated

After testing, you should have:

```
tests/
├── audio-capture-test.js          # Test script
├── run-audio-test.js              # Electron runner
├── test-page.html                 # Test UI
├── AUDIO_CAPTURE_TEST_GUIDE.md    # This file
└── results/
    ├── TEST_RESULTS.md            # Summary of all tests
    ├── audio-test-1234567890.json # Machine 1 results
    ├── audio-test-1234567891.json # Machine 2 results
    ├── audio-test-1234567892.json # Machine 3 results
    ├── audio-test-1234567893.json # Machine 4 results
    └── audio-test-1234567894.json # Machine 5 results
```

## Support

If you encounter issues during testing:
1. Check the console output for detailed error messages
2. Verify all dependencies are installed correctly
3. Ensure Electron version is compatible (v25+)
4. Review the Common Issues section above
