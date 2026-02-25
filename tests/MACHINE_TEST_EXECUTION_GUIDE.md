# Machine-by-Machine Test Execution Guide

## Quick Reference for Task 8.6

This guide provides step-by-step instructions for executing audio capture tests on each of the 5 required Windows machines.

---

## Test Execution Workflow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Prepare Machine → 2. Run Tests → 3. Document Results    │
│                                                              │
│ For each of 5 machines:                                     │
│   • Setup environment                                        │
│   • Execute test suite                                       │
│   • Record observations                                      │
│   • Capture screenshots                                      │
│   • Export test data                                         │
└─────────────────────────────────────────────────────────────┘
```

---

## Machine 1: Standard Laptop (Realtek)

### Target Configuration

- **Audio Driver**: Realtek High Definition Audio
- **Typical Device**: Consumer laptop (Dell, HP, Lenovo, ASUS)
- **Expected Outcome**: Should work with Stereo Mix

### Setup Steps

1. **Verify Hardware**

   ```bash
   # Open Device Manager
   devmgmt.msc

   # Navigate to: Sound, video and game controllers
   # Verify: "Realtek High Definition Audio" or similar
   ```

2. **Check Driver Version**
   - Right-click audio device → Properties
   - Driver tab → Note driver version
   - Update if version < 6.0.9000

3. **Enable Stereo Mix**
   - Right-click speaker icon → Sounds
   - Recording tab → Right-click → Show Disabled Devices
   - Enable "Stereo Mix" if present

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
- [ ] Verify "Stereo Mix" appears in device list
- [ ] Open YouTube, play test video
- [ ] Click "Start Recording"
- [ ] Observe audio level indicators (should show activity)
- [ ] Record for 30 seconds
- [ ] Stop recording
- [ ] Check audio metrics: RMS > 0.01, Variance > 0.0001

### Expected Results

- ✅ System audio detected
- ✅ Stereo Mix available
- ✅ Audio captured successfully
- ✅ Quality: GOOD

### If Test Fails

1. Check if Stereo Mix is truly enabled
2. Verify system volume > 50%
3. Test microphone fallback
4. Document specific error message

### Documentation

Complete Machine 1 section in `TEST_RESULTS_TEMPLATE.md`

---

## Machine 2: Desktop with Dedicated Sound Card

### Target Configuration

- **Audio Driver**: Creative Sound Blaster, ASUS Xonar, or similar
- **Typical Device**: Gaming desktop or workstation
- **Expected Outcome**: Should work with advanced features

### Setup Steps

1. **Verify Sound Card**

   ```bash
   # Open Device Manager
   devmgmt.msc

   # Check for dedicated sound card
   # Examples: "Sound Blaster Z", "ASUS Xonar", "Creative AE-5"
   ```

2. **Check Manufacturer Software**
   - Open sound card control panel (Creative, ASUS, etc.)
   - Verify recording devices are enabled
   - Check for "What U Hear" or "Stereo Mix" equivalent

3. **Configure Recording Device**
   - Some sound cards use different names:
     - Creative: "What U Hear"
     - ASUS: "Stereo Mix"
     - Generic: "System Audio"

### Test Execution

```bash
cd piyapi-notes
npm run start
```

### Test Checklist

- [ ] Application launches
- [ ] Check audio device enumeration
- [ ] Look for sound card-specific recording device
- [ ] Test with YouTube audio
- [ ] Verify audio capture works
- [ ] Test with different audio sources (Spotify, local media)
- [ ] Check for audio enhancements interference

### Expected Results

- ✅ Dedicated sound card detected
- ✅ Recording device available (What U Hear / Stereo Mix)
- ✅ High-quality audio capture
- ✅ Quality: GOOD to EXCELLENT

### Special Considerations

- Sound card software may interfere
- Audio enhancements might need to be disabled
- Multiple recording devices may be available

### If Test Fails

1. Check sound card control panel settings
2. Disable audio enhancements
3. Try different recording device names
4. Update sound card drivers

### Documentation

Complete Machine 2 section in `TEST_RESULTS_TEMPLATE.md`

---

## Machine 3: USB Audio Interface

### Target Configuration

- **Audio Driver**: Focusrite Scarlett, Behringer, PreSonus, or similar
- **Typical Device**: Professional audio interface
- **Expected Outcome**: May require specific configuration

### Setup Steps

1. **Connect USB Interface**
   - Connect USB audio interface
   - Wait for Windows to install drivers
   - Verify device appears in Device Manager

2. **Install Manufacturer Drivers**
   - Download latest drivers from manufacturer website
   - Install ASIO drivers if available
   - Restart computer after installation

3. **Configure Audio Interface**
   - Open manufacturer control panel (Focusrite Control, etc.)
   - Set sample rate to 48kHz or 44.1kHz
   - Enable loopback/monitoring if available

4. **Set as Default Device**
   - Right-click speaker icon → Sounds
   - Playback tab → Set USB interface as default
   - Recording tab → Verify interface appears

### Test Execution

```bash
cd piyapi-notes
npm run start
```

### Test Checklist

- [ ] USB interface detected by application
- [ ] Check for loopback/monitoring option
- [ ] Test system audio capture
- [ ] If system audio fails, test microphone input
- [ ] Verify sample rate compatibility (16kHz)
- [ ] Check for driver-specific issues
- [ ] Test with professional audio software running

### Expected Results

- ⚠️ System audio may not work (no Stereo Mix)
- ✅ Microphone fallback should work
- ✅ High-quality audio from microphone
- ⚠️ May require manual configuration

### Special Considerations

- USB interfaces often don't support Stereo Mix
- Loopback feature may be available (check manufacturer docs)
- ASIO drivers may conflict with standard Windows audio
- Sample rate conversion may be needed

### If Test Fails

1. Check if loopback feature is available
2. Test with microphone input directly
3. Verify USB connection is stable
4. Check for driver conflicts
5. Try different USB port

### Documentation

Complete Machine 3 section in `TEST_RESULTS_TEMPLATE.md`

---

## Machine 4: High-End Motherboard Audio

### Target Configuration

- **Audio Driver**: ASUS SupremeFX, MSI Audio Boost, Gigabyte AMP-UP
- **Typical Device**: Gaming motherboard with premium audio
- **Expected Outcome**: Should work with enhanced features

### Setup Steps

1. **Verify Motherboard Audio**

   ```bash
   # Open Device Manager
   devmgmt.msc

   # Look for branded audio:
   # "ASUS SupremeFX", "MSI Audio Boost", "Realtek (with branding)"
   ```

2. **Install Audio Software**
   - Install motherboard manufacturer's audio software
   - Examples: ASUS Sonic Studio, MSI Nahimic, Gigabyte Audio Center
   - Configure audio profiles

3. **Check Audio Enhancements**
   - Right-click speaker icon → Sounds
   - Playback tab → Properties → Enhancements
   - Note which enhancements are enabled
   - Consider disabling for testing

### Test Execution

```bash
cd piyapi-notes
npm run start
```

### Test Checklist

- [ ] Application detects premium audio hardware
- [ ] Check for multiple recording devices
- [ ] Test with audio enhancements enabled
- [ ] Test with audio enhancements disabled
- [ ] Verify Stereo Mix availability
- [ ] Test audio quality with gaming audio
- [ ] Check for software conflicts

### Expected Results

- ✅ Premium audio detected
- ✅ Stereo Mix available
- ✅ High-quality capture
- ⚠️ May have software conflicts

### Special Considerations

- Audio software may create virtual devices
- Multiple recording options may be available
- Audio enhancements can interfere with capture
- Gaming profiles may affect audio routing

### If Test Fails

1. Disable audio enhancement software
2. Try with manufacturer software closed
3. Test with different audio profiles
4. Check for exclusive mode conflicts

### Documentation

Complete Machine 4 section in `TEST_RESULTS_TEMPLATE.md`

---

## Machine 5: Budget/Generic Configuration

### Target Configuration

- **Audio Driver**: Generic Windows audio driver or basic Realtek
- **Typical Device**: Budget laptop or basic desktop
- **Expected Outcome**: Basic functionality, may need fallback

### Setup Steps

1. **Verify Audio Hardware**

   ```bash
   # Open Device Manager
   devmgmt.msc

   # Check audio device:
   # May show "High Definition Audio Device" (generic)
   # Or basic "Realtek Audio"
   ```

2. **Check Driver Status**
   - Verify driver is installed and working
   - May be using Microsoft's generic driver
   - Update via Windows Update if possible

3. **Test Basic Audio**
   - Play test sound in Windows
   - Verify speakers/headphones work
   - Check microphone if available

### Test Execution

```bash
cd piyapi-notes
npm run start
```

### Test Checklist

- [ ] Application launches on limited hardware
- [ ] Check audio device detection
- [ ] Test for Stereo Mix (may not be available)
- [ ] Test microphone fallback immediately
- [ ] Verify fallback notification displays
- [ ] Check audio quality with fallback
- [ ] Monitor resource usage (RAM, CPU)

### Expected Results

- ⚠️ Stereo Mix may not be available
- ✅ Microphone fallback should work
- ⚠️ Audio quality may be lower
- ✅ Application should handle gracefully

### Special Considerations

- Limited audio features expected
- Fallback mechanism is critical here
- May have older/generic drivers
- Resource constraints possible

### If Test Fails

1. Verify microphone is working in Windows
2. Check microphone permissions
3. Test with external USB microphone
4. Document as candidate for cloud transcription

### Documentation

Complete Machine 5 section in `TEST_RESULTS_TEMPLATE.md`

---

## Data Collection for Each Machine

### Required Information

For every machine, collect:

```markdown
## Machine [X] Data Collection

### Hardware Details

- **Manufacturer**: [Dell, HP, Custom Build, etc.]
- **Model**: [Specific model number]
- **CPU**: [Intel Core i5-8250U, AMD Ryzen 5 3600, etc.]
- **RAM**: [8GB DDR4, 16GB DDR4, etc.]
- **Audio Chipset**: [Realtek ALC892, Creative SB-Z, etc.]

### Driver Information

- **Driver Name**: [Exact name from Device Manager]
- **Driver Version**: [e.g., 6.0.9319.1]
- **Driver Date**: [Date from driver properties]
- **Manufacturer Software**: [ASUS Sonic Studio, etc.]

### Operating System

- **OS Version**: [Windows 10 Pro 21H2, Windows 11 Home 22H2]
- **Build Number**: [e.g., 19044.1234]
- **Language**: [English, etc.]
- **Updates**: [Fully updated / Pending updates]

### Audio Configuration

- **Stereo Mix Available**: [YES / NO]
- **Alternative Names**: [What U Hear, System Audio, etc.]
- **Default Playback Device**: [Device name]
- **Default Recording Device**: [Device name]
- **Audio Enhancements**: [Enabled / Disabled]

### Test Results

- **System Audio Test**: [PASS / FAIL]
- **Microphone Fallback**: [PASS / FAIL / NOT TESTED]
- **Overall Verdict**: [✅ PASS / ⚠️ PARTIAL / ❌ FAIL]

### Metrics

- **Average RMS**: [e.g., 0.0234]
- **Max RMS**: [e.g., 0.0456]
- **Variance**: [e.g., 0.000234]
- **Test Duration**: [e.g., 30 seconds]

### Issues Encountered

[Detailed description of any problems]

### Screenshots Captured

- [ ] Device Manager - Audio devices
- [ ] Windows Sound settings - Recording tab
- [ ] Application - Audio settings screen
- [ ] Application - Recording in progress
- [ ] Error messages (if any)

### Notes

[Any additional observations or comments]
```

---

## Test Execution Timeline

### Recommended Schedule

**Day 1: Machines 1-2**

- Morning: Machine 1 (Standard Laptop)
  - Setup: 30 minutes
  - Testing: 1 hour
  - Documentation: 30 minutes
- Afternoon: Machine 2 (Dedicated Sound Card)
  - Setup: 30 minutes
  - Testing: 1 hour
  - Documentation: 30 minutes

**Day 2: Machines 3-4**

- Morning: Machine 3 (USB Audio Interface)
  - Setup: 45 minutes (driver installation)
  - Testing: 1.5 hours (more complex)
  - Documentation: 30 minutes
- Afternoon: Machine 4 (High-End Motherboard)
  - Setup: 30 minutes
  - Testing: 1 hour
  - Documentation: 30 minutes

**Day 3: Machine 5 + Analysis**

- Morning: Machine 5 (Budget Configuration)
  - Setup: 30 minutes
  - Testing: 1 hour
  - Documentation: 30 minutes
- Afternoon: Results Analysis
  - Compile all results
  - Calculate success rate
  - Identify patterns
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

# Rebuild native modules
npm run rebuild

# Check Node.js version
node --version  # Should be 18+

# Check for port conflicts
netstat -ano | findstr :3000
```

### Problem: No Audio Devices Detected

**Solutions:**

1. Check Device Manager for audio devices
2. Restart Windows Audio service:
   ```bash
   net stop audiosrv
   net start audiosrv
   ```
3. Reinstall audio drivers
4. Check Windows Privacy Settings

### Problem: Stereo Mix Not Available

**Solutions:**

1. Show disabled devices in Sound settings
2. Check manufacturer's audio software
3. Look for alternative names (What U Hear, etc.)
4. Update audio drivers
5. Accept microphone fallback as valid result

### Problem: Poor Audio Quality

**Solutions:**

1. Increase system volume to 70-80%
2. Disable audio enhancements
3. Check for background noise
4. Verify sample rate settings
5. Test with different audio source

### Problem: Permission Errors

**Solutions:**

1. Windows Settings → Privacy → Microphone → Enable
2. Run application as administrator (test only)
3. Check antivirus/firewall settings
4. Verify Electron permissions

---

## Post-Test Checklist

After completing all 5 machines:

- [ ] All test results documented
- [ ] Screenshots collected and organized
- [ ] Success rate calculated
- [ ] Failure modes analyzed
- [ ] Recommendations written
- [ ] Results compiled in TEST_RESULTS_TEMPLATE.md
- [ ] Task 8.6 marked as complete in tasks.md
- [ ] Team notified of results
- [ ] Decision made: Proceed / Fix / Pivot

---

## Success Criteria Summary

### Minimum Requirements

- ✅ 5 different machines tested
- ✅ At least 3 different audio driver types
- ✅ Both Windows 10 and Windows 11 tested
- ✅ Success rate ≥ 80% (4 out of 5 machines)

### Quality Requirements

- ✅ All results documented thoroughly
- ✅ Screenshots captured for each machine
- ✅ Failure modes identified and analyzed
- ✅ Mitigation strategies documented

### Deliverables

- ✅ Completed TEST_RESULTS_TEMPLATE.md
- ✅ Test data JSON files for each machine
- ✅ Screenshots folder with organized images
- ✅ Recommendations document
- ✅ Updated tasks.md with results

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

---

**Document Version**: 1.0  
**Created**: 2024-01-15  
**Purpose**: Task 8.6 Execution Guide
