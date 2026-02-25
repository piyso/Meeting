# Task 13.5: Memory Leak Verification

## Overview

This document describes the memory leak verification process for the audio capture system. The verification uses statistical analysis and pattern detection to identify memory leaks.

## Verification Approach

### 1. Automated Testing

The automated test script (`tests/memory-leak-verification.js`) performs:

- **High-frequency sampling** - Memory sampled every 5 seconds for detailed analysis
- **Statistical analysis** - Linear regression to detect growth patterns
- **Pattern detection** - Identifies leak patterns (linear, gradual, stable, fluctuating)
- **Stability analysis** - Calculates coefficient of variation and detects spikes

### 2. Analysis Metrics

#### Leak Detection Metrics

- **Growth Rate** - Memory growth per hour (%)
- **R-squared** - Correlation coefficient for linear growth (0-1)
- **Pattern** - Detected memory pattern:
  - `linear_growth` - Continuous linear growth (R² > 0.8, growth > 10%/h)
  - `gradual_growth` - Slow growth (R² > 0.6, growth > 5%/h)
  - `stable` - Stable memory usage (growth < 1%/h)
  - `fluctuating` - Variable memory usage

#### Stability Metrics

- **Mean** - Average memory usage
- **Standard Deviation** - Memory usage variability
- **Coefficient of Variation (CV)** - Normalized variability (%)
- **Spikes** - Number of outliers (> 2σ from mean)
- **Stable** - CV < 10% and spikes < 5% of samples

## Pass Criteria

A system passes memory leak verification if:

1. ✅ **No leak detected** - `hasLeak: false`
2. ✅ **Stable memory** - `isStable: true`
3. ✅ **Growth rate < 10%/hour** - `growthPercentPerHour < 10`

## Usage

### Run Automated Test

```bash
# Run 30-minute verification (recommended)
node tests/memory-leak-verification.js 30

# Run 60-minute verification (thorough)
node tests/memory-leak-verification.js 60
```

### Example Output

```
================================================================================
Memory Leak Verification Test
================================================================================
Duration: 30 minutes
Platform: darwin arm64
Total RAM: 16.0 GB
Sample Interval: 5 seconds
Results File: tests/results/memory-leak-verification-30min-2026-02-24T15-30-00.json
================================================================================

Mock app started with PID: 12345
Starting memory profiling...

[0.0m] RSS: 45.2 MB, VSZ: 2048.5 MB
[0.1m] RSS: 45.8 MB, VSZ: 2048.5 MB
[1.0m] RSS: 46.1 MB, VSZ: 2048.5 MB | Pattern: stable, Growth: 5.4%/h, Stable: Yes
[2.0m] RSS: 46.3 MB, VSZ: 2048.5 MB | Pattern: stable, Growth: 4.8%/h, Stable: Yes
...
[29.9m] RSS: 47.8 MB, VSZ: 2048.5 MB | Pattern: stable, Growth: 3.2%/h, Stable: Yes

================================================================================
Analyzing results...
================================================================================

Memory Leak Analysis:
--------------------------------------------------------------------------------
Status: completed
Duration: 30 minutes
Samples: 360

Memory Usage:
  Baseline: 45.2 MB
  Final: 47.8 MB
  Growth: 2.6 MB (5.8%)

Leak Detection:
  Pattern: stable
  Has Leak: No
  Confidence: 85%
  Growth Rate: 3.2%/hour
  R-squared: 0.156

Stability Analysis:
  Mean: 46.5 MB
  Std Dev: 0.8 MB
  CV: 1.7%
  Spikes: 0
  Stable: Yes

Result: ✅ PASSED
Reason: No memory leaks detected
--------------------------------------------------------------------------------
Results saved to: tests/results/memory-leak-verification-30min-2026-02-24T15-30-00.json
================================================================================
```

## Manual Verification with DevTools

For detailed heap analysis, use Chrome DevTools:

### 1. Enable DevTools in Electron

Add to `electron/main.ts`:

```typescript
mainWindow.webContents.openDevTools()
```

### 2. Take Heap Snapshots

1. Open DevTools → Memory tab
2. Select "Heap snapshot"
3. Click "Take snapshot" (baseline)
4. Start audio capture
5. Wait 10 minutes
6. Take another snapshot
7. Compare snapshots

### 3. Analyze Heap Growth

Look for:

- **Detached DOM nodes** - Indicates UI memory leaks
- **Growing arrays** - Indicates buffer accumulation
- **Retained closures** - Indicates event listener leaks
- **Large objects** - Indicates model/buffer retention

### 4. Identify Leak Sources

Common leak sources in audio capture:

- **Audio buffers not released** - Check AudioWorklet cleanup
- **Worker threads not terminated** - Check worker lifecycle
- **Event listeners not removed** - Check IPC handler cleanup
- **Transcripts accumulating in memory** - Check database writes

## Memory Profiling Tools

### macOS

**Instruments (Xcode)**

```bash
# Launch Instruments
instruments -t "Allocations" -D trace.trace -l 60000 "PiyAPI Notes.app"

# Analyze trace file
open trace.trace
```

**Activity Monitor**

```bash
# Monitor memory in real-time
open -a "Activity Monitor"
# Filter by "PiyAPI Notes"
```

### Windows

**Performance Monitor**

```powershell
# Start performance monitor
perfmon

# Add counters:
# - Process > Private Bytes > PiyAPI Notes
# - Process > Working Set > PiyAPI Notes
```

**Windows Performance Recorder**

```powershell
# Start recording
wpr -start GeneralProfile

# Stop recording after test
wpr -stop memory-profile.etl

# Analyze with Windows Performance Analyzer
wpa memory-profile.etl
```

### Linux

**Valgrind (Massif)**

```bash
# Run with Valgrind
valgrind --tool=massif --massif-out-file=massif.out ./piyapi-notes

# Visualize with massif-visualizer
massif-visualizer massif.out
```

**Heaptrack**

```bash
# Record heap allocations
heaptrack ./piyapi-notes

# Analyze results
heaptrack_gui heaptrack.piyapi-notes.*.gz
```

## Common Memory Leak Patterns

### 1. Buffer Accumulation

**Symptom:** Linear memory growth correlated with audio capture duration

**Cause:** Audio buffers not released after processing

**Fix:**

```typescript
// Bad: Buffers accumulate
const buffers: Float32Array[] = []
audioWorklet.onmessage = e => {
  buffers.push(e.data.buffer) // Never cleaned up
}

// Good: Buffers released
const bufferQueue: Float32Array[] = []
audioWorklet.onmessage = e => {
  bufferQueue.push(e.data.buffer)
  if (bufferQueue.length > MAX_QUEUE_SIZE) {
    bufferQueue.shift() // Release old buffers
  }
}
```

### 2. Event Listener Leaks

**Symptom:** Memory grows with each start/stop cycle

**Cause:** Event listeners not removed on cleanup

**Fix:**

```typescript
// Bad: Listeners accumulate
class AudioCapture {
  start() {
    ipcMain.on('audio-data', this.handleAudioData)
  }
}

// Good: Listeners removed
class AudioCapture {
  start() {
    ipcMain.on('audio-data', this.handleAudioData)
  }

  stop() {
    ipcMain.removeListener('audio-data', this.handleAudioData)
  }
}
```

### 3. Worker Thread Leaks

**Symptom:** Memory grows with each worker creation

**Cause:** Workers not terminated properly

**Fix:**

```typescript
// Bad: Workers not terminated
const worker = new Worker('vad.worker.js')

// Good: Workers terminated
const worker = new Worker('vad.worker.js')
// ... use worker ...
worker.terminate()
```

### 4. Closure Retention

**Symptom:** Large objects retained in closures

**Cause:** Closures capturing large contexts

**Fix:**

```typescript
// Bad: Closure captures large model
function createProcessor(model: LargeModel) {
  return (data: Buffer) => {
    // model is retained in closure
    return model.process(data)
  }
}

// Good: Weak reference or explicit cleanup
function createProcessor(modelRef: WeakRef<LargeModel>) {
  return (data: Buffer) => {
    const model = modelRef.deref()
    if (model) {
      return model.process(data)
    }
  }
}
```

## Troubleshooting

### High Memory Growth Detected

If growth rate > 10%/hour:

1. **Run with DevTools** - Take heap snapshots to identify leak source
2. **Check buffer management** - Verify audio buffers are released
3. **Review worker lifecycle** - Ensure workers are terminated
4. **Inspect event listeners** - Check for listener accumulation
5. **Profile with Instruments/Valgrind** - Use platform-specific tools

### Unstable Memory Pattern

If CV > 10% or many spikes:

1. **Check GC behavior** - May need manual GC triggers
2. **Review buffer sizes** - Large buffers cause spikes
3. **Inspect async operations** - Check for promise leaks
4. **Monitor system load** - External factors may affect stability

### False Positives

If test fails but no actual leak:

1. **Increase test duration** - 30 minutes may be too short
2. **Wait for GC** - Initial growth may stabilize
3. **Check baseline** - First sample may be during initialization
4. **Review R-squared** - Low R² indicates no linear growth

## Expected Memory Patterns

### Healthy Pattern

```
Memory (MB)
  50 |                    _______________
     |              _____/
  45 |        _____/
     |   ____/
  40 |__/
     +----------------------------------
     0    5    10   15   20   25   30 (min)
```

- Initial spike during model loading
- Stabilization after 2-5 minutes
- Flat or slight growth (<10%/h)

### Unhealthy Pattern (Linear Leak)

```
Memory (MB)
  60 |                              /
     |                          /
  50 |                      /
     |                  /
  40 |              /
     |          /
  30 |      /
     |  /
  20 |/
     +----------------------------------
     0    5    10   15   20   25   30 (min)
```

- Continuous linear growth
- No stabilization
- Growth rate > 10%/h

### Unhealthy Pattern (Gradual Leak)

```
Memory (MB)
  50 |                         ___---
     |                  ___---
  45 |           ___---
     |    ___---
  40 |---
     +----------------------------------
     0    5    10   15   20   25   30 (min)
```

- Slow but continuous growth
- Eventual stabilization unclear
- Growth rate 5-10%/h

## Next Steps

After verifying no memory leaks:

1. **Document findings** - Record test results and analysis
2. **Proceed to Task 13.6** - Document failure modes and mitigations
3. **Update architecture docs** - Document memory management strategy
4. **Continue to Task 13.7** - Evaluate critical gate criteria

## References

- Audio Pipeline Service: `src/main/services/AudioPipelineService.ts`
- VAD Worker: `src/main/workers/vad.worker.ts`
- Memory Management: `docs/TASK_10.5_MEMORY_MANAGEMENT.md`
- Long-Duration Testing: `docs/TASK_13.4_LONG_DURATION_TESTING.md`
