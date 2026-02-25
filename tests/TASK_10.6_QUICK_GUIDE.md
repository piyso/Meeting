# Task 10.6: CPU Stress Test - Quick Guide

## Quick Start

1. **Open test page:**

   ```bash
   open tests/verify-cpu-stress.html
   ```

2. **Grant microphone permission**

3. **Click "Run CPU Stress Test"**

4. **Speak continuously for 60 seconds**

5. **Review results**

## What to Expect

### Phase 1: Baseline (0-30s)

- Normal audio recording
- No CPU stress
- Speak into microphone

### Phase 2: Stress (30-60s)

- 4 CPU workers start
- Browser may freeze (expected!)
- Keep speaking
- Audio should continue capturing

## Pass Criteria

✅ **PASS** if:

- 0 dropouts detected
- Timing jitter < 100ms
- 2 chunks received (1 per phase)

❌ **FAIL** if:

- Dropouts detected
- Chunks missing
- High jitter (> 100ms)

## Test Results

### Example PASS Result

```
✅ OVERALL: PASS - No audio glitches detected under CPU stress

Metrics:
  Total chunks: 2
  Total dropouts: 0
  Max timing jitter: 0.045s
```

### Example FAIL Result

```
❌ OVERALL: FAIL - Audio dropouts detected
   2 dropout(s) occurred during stress phase

Metrics:
  Total chunks: 1
  Total dropouts: 2
  Max timing jitter: 3.245s
```

## Troubleshooting

### Browser Freezes

**Expected!** The CPU stress workload is designed to saturate the CPU. The browser may become temporarily unresponsive, but audio capture should continue on the dedicated audio thread.

### No Chunks Received

**Problem:** Microphone not working

**Solution:**

1. Check microphone permission
2. Verify microphone is connected
3. Test microphone in system settings

### Dropouts Detected

**Problem:** AudioWorklet isolation not working

**Solution:**

1. Use Chrome/Edge (best AudioWorklet support)
2. Close other applications
3. Check browser console for errors

## What This Test Validates

- ✅ **Requirement 1.3:** AudioWorklet runs on dedicated audio thread
- ✅ **Design Principle:** AudioWorklet prevents glitches
- ✅ **Task 10.6:** No dropouts under CPU load

## Technical Details

### CPU Stress Workload

- 4 Web Worker threads
- Prime number generation (up to 10,000)
- Matrix multiplication (100×100)
- Continuous loop to saturate CPU

### Metrics Tracked

| Metric          | Description           | Pass Criteria |
| --------------- | --------------------- | ------------- |
| Chunks Received | Total audio chunks    | > 0 per phase |
| Dropouts        | Gaps in chunk timing  | 0             |
| Avg Interval    | Time between chunks   | ~30 seconds   |
| Timing Jitter   | Consistency of timing | < 100ms       |
| Sample Rate     | Audio sample rate     | 16,000 Hz     |

### Why This Matters

AudioWorklet runs on a **dedicated audio thread** separate from the main JavaScript thread. This ensures:

- Audio processing continues even when main thread is blocked
- No glitches during CPU-intensive tasks (transcription, LLM, etc.)
- Reliable audio capture for long meetings (up to 180 minutes)

## Next Steps

After Task 10.6 passes:

1. ✅ Task 10.6 complete
2. 🔄 Proceed to Task 11.1: Download Silero VAD ONNX model
3. 📋 Continue with VAD Worker implementation

## Files

- `tests/verify-cpu-stress.html` - Test UI
- `tests/verify-cpu-stress.js` - Test implementation
- `docs/TASK_10.6_IMPLEMENTATION.md` - Full documentation
- `tests/TASK_10.6_QUICK_GUIDE.md` - This guide

## Support

If the test fails:

1. Check browser console for errors
2. Review `docs/TASK_10.6_IMPLEMENTATION.md` for troubleshooting
3. Verify AudioWorklet is supported in your browser
4. Test on different hardware if available

---

**Task 10.6 Status:** ✅ Complete  
**Next Task:** 11.1 Download Silero VAD ONNX model
