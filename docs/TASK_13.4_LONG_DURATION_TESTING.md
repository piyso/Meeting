# Task 13.4: Long-Duration Audio Capture Testing

## Overview

This document describes the long-duration testing strategy for audio capture stability. The tests validate that the audio capture system can run for extended periods without crashes or memory leaks.

## Test Durations

1. **60 minutes (1 hour)** - Basic stability test
2. **120 minutes (2 hours)** - Extended stability test
3. **480 minutes (8 hours)** - Full workday simulation

## Pass Criteria

For each test duration, the following criteria must be met:

- ✅ **No crashes** - Process must remain running for entire duration
- ✅ **No memory leaks** - RAM growth must be <10% per hour
- ✅ **Functional audio capture** - Audio capture must remain operational throughout

## Test Script

The automated test script is located at `tests/long-duration-audio-test.js`.

### Usage

```bash
# Run 60-minute test
node tests/long-duration-audio-test.js 60

# Run 120-minute test
node tests/long-duration-audio-test.js 120

# Run 480-minute test (8 hours)
node tests/long-duration-audio-test.js 480
```

### What the Script Does

1. **Starts a mock audio capture process** - Simulates audio buffer allocation and management
2. **Samples memory every 10 seconds** - Tracks RAM usage over time
3. **Logs progress** - Shows elapsed time, current memory, and growth rate
4. **Detects crashes** - Monitors process exit codes
5. **Calculates growth rate** - Computes memory growth per hour
6. **Generates report** - Saves detailed results to JSON file

### Output

The script produces:

- **Console output** - Real-time progress with memory statistics
- **JSON results file** - Detailed test results in `tests/results/long-duration-test-{duration}min-{timestamp}.json`

Example console output:

```
================================================================================
Long-Duration Audio Capture Test
================================================================================
Duration: 60 minutes
Platform: darwin arm64
Total RAM: 16.0 GB
Sample Interval: 10 seconds
Results File: tests/results/long-duration-test-60min-2026-02-24T15-30-00.json
================================================================================

Mock app started with PID: 12345
Starting memory sampling...

[0.0m] Memory: 45.2 MB (baseline)
[0.2m] Memory: 45.8 MB (+0.6 MB, +1.3%, 390.0%/hour)
[0.3m] Memory: 46.1 MB (+0.9 MB, +2.0%, 400.0%/hour)
...
[59.8m] Memory: 48.3 MB (+3.1 MB, +6.9%, 6.9%/hour)

================================================================================
Stopping test...
================================================================================

Test Summary:
--------------------------------------------------------------------------------
Status: completed
Duration: 60 minutes
Samples Collected: 360
Errors: 0

Baseline Memory: 45.2 MB
Final Memory: 48.3 MB
Total Growth: 3.1 MB (6.9%)
Growth Rate: 6.9%/hour

Result: ✅ PASSED
Reason: All criteria met
--------------------------------------------------------------------------------
Results saved to: tests/results/long-duration-test-60min-2026-02-24T15-30-00.json
================================================================================
```

## Manual Testing with Real App

For production validation, test with the actual Electron app:

### 1. Build the app

```bash
npm run build
```

### 2. Launch the app

```bash
# macOS
open dist-electron/mac/PiyAPI\ Notes.app

# Windows
start dist-electron/win-unpacked/PiyAPI\ Notes.exe
```

### 3. Start a meeting

- Click "Start Meeting"
- Enable audio capture
- Let it run for the test duration

### 4. Monitor memory usage

**macOS:**

```bash
# Get PID
ps aux | grep "PiyAPI Notes"

# Monitor memory every 10 seconds
while true; do
  ps -o rss=,vsz= -p <PID> | awk '{printf "RSS: %.1f MB, VSZ: %.1f MB\n", $1/1024, $2/1024}'
  sleep 10
done
```

**Windows:**

```powershell
# Monitor memory every 10 seconds
while ($true) {
  Get-Process "PiyAPI Notes" | Select-Object Name, @{Name="Memory(MB)";Expression={$_.WorkingSet64/1MB}}
  Start-Sleep -Seconds 10
}
```

### 5. Record observations

Document:

- Start time and end time
- Initial memory usage
- Final memory usage
- Memory growth rate (%/hour)
- Any crashes or errors
- Audio capture functionality throughout

## Expected Results

### Memory Growth Patterns

**Healthy pattern:**

- Initial spike during model loading (first 1-2 minutes)
- Gradual stabilization
- Growth rate <10%/hour after stabilization
- No sudden spikes or drops

**Unhealthy pattern:**

- Continuous linear growth >10%/hour
- Sudden memory spikes
- Process crashes
- Audio capture stops working

### Typical Memory Usage

Based on hardware tier:

- **High tier (16GB RAM)**: 1.5GB (Whisper turbo) + 2.2GB (Qwen 3B) = ~3.7GB baseline
- **Mid tier (12GB RAM)**: 300MB (Moonshine) + 2.2GB (Qwen 3B) = ~2.5GB baseline
- **Low tier (8GB RAM)**: 300MB (Moonshine) + 1.1GB (Qwen 1.5B) = ~1.4GB baseline

Growth should be <10% of baseline per hour.

## Troubleshooting

### High Memory Growth

If memory growth exceeds 10%/hour:

1. **Check for buffer leaks** - Ensure audio buffers are properly released
2. **Review VAD worker** - Verify worker threads clean up resources
3. **Inspect transcript storage** - Check if transcripts are accumulating in memory
4. **Profile with DevTools** - Use Chrome DevTools memory profiler

### Process Crashes

If process crashes during test:

1. **Check error logs** - Review `tests/results/` for error details
2. **Inspect crash dumps** - Look for segmentation faults or out-of-memory errors
3. **Reduce buffer sizes** - Try smaller audio chunk sizes
4. **Test with shorter durations** - Isolate the failure point

### Audio Capture Stops

If audio capture stops working:

1. **Check device availability** - Verify audio devices are still connected
2. **Review fallback chain** - Ensure fallback logic is working
3. **Inspect worker threads** - Check if workers are still responsive
4. **Test manual restart** - Try stopping and restarting capture

## Test Results Template

Use this template to document test results:

```markdown
## Test Results: {Duration} Minutes

**Date:** {Date}
**Platform:** {Platform}
**Hardware Tier:** {High/Mid/Low}
**Total RAM:** {X} GB

### Results

- **Status:** {Passed/Failed}
- **Duration:** {X} minutes
- **Baseline Memory:** {X} MB
- **Final Memory:** {X} MB
- **Total Growth:** {X} MB ({X}%)
- **Growth Rate:** {X}%/hour
- **Crashes:** {0 or description}
- **Errors:** {0 or description}

### Observations

{Any notable observations during the test}

### Conclusion

{Pass/Fail with reasoning}
```

## Next Steps

After completing all three test durations:

1. **Document results** - Create summary report with all test results
2. **Proceed to Task 13.5** - Verify no memory leaks with detailed profiling
3. **Update Task 13.6** - Document any failure modes discovered
4. **Evaluate Task 13.7** - Determine if critical gate criteria are met

## References

- Audio Pipeline Service: `src/main/services/AudioPipelineService.ts`
- VAD Worker: `src/main/workers/vad.worker.ts`
- Memory Management: `docs/TASK_10.5_MEMORY_MANAGEMENT.md`
- Diagnostic Logging: `docs/TASK_12.6_DIAGNOSTIC_LOGGING.md`
