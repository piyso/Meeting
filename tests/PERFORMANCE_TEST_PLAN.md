# Performance Test Plan - PiyAPI Notes

**Date**: 2026-02-25  
**Status**: READY TO EXECUTE  
**Phase**: Phase 7 - Performance Profiling (Task 34)

---

## Overview

This document outlines comprehensive performance tests for PiyAPI Notes to ensure the app meets all performance targets before beta launch.

---

## Performance Targets

### Critical Targets (Must Pass)

| Metric            | Target | Maximum | Current |
| ----------------- | ------ | ------- | ------- |
| RAM Usage (60min) | <5GB   | <6GB    | TBD     |
| CPU Usage (avg)   | <40%   | <60%    | TBD     |
| Transcription Lag | <5s    | <10s    | TBD     |
| Search Latency    | <50ms  | <100ms  | TBD     |
| App Startup Time  | <2s    | <3s     | TBD     |
| Note Expansion    | <3s    | <5s     | TBD     |

### Stretch Targets (Nice to Have)

| Metric                | Target | Notes                |
| --------------------- | ------ | -------------------- |
| RAM Usage (180min)    | <5.5GB | Memory leak check    |
| CPU Usage (peak)      | <70%   | During transcription |
| Search (100 meetings) | <30ms  | FTS5 optimization    |
| Model Load Time       | <500ms | Lazy loading         |

---

## Test Suite 1: Memory Profiling (Task 34.1-34.2)

### Test 1.1: 60-Minute Meeting RAM Usage

**Objective**: Verify RAM stays <6GB during 60-minute meeting

**Setup**:

- Clean system (restart before test)
- Close all other applications
- Monitor RAM every 10 seconds

**Steps**:

1. Launch app
2. Record baseline RAM usage
3. Start meeting
4. Record RAM every 10 seconds for 60 minutes
5. Stop meeting
6. Record final RAM usage
7. Wait 5 minutes
8. Record RAM after cleanup

**Data Collection**:

```javascript
// tests/memory-profiling-60min.js
const measurements = []
setInterval(() => {
  const usage = process.memoryUsage()
  measurements.push({
    timestamp: Date.now(),
    heapUsed: usage.heapUsed / 1024 / 1024, // MB
    heapTotal: usage.heapTotal / 1024 / 1024,
    external: usage.external / 1024 / 1024,
    rss: usage.rss / 1024 / 1024,
  })
}, 10000) // Every 10 seconds
```

**Analysis**:

- Plot RAM usage over time
- Calculate average RAM
- Calculate peak RAM
- Calculate RAM growth rate (MB/hour)
- Identify memory leaks (sustained growth)

**Pass Criteria**:

- ✅ Peak RAM <6GB
- ✅ Average RAM <5GB
- ✅ RAM growth <10% per hour
- ✅ No sustained memory leaks

---

### Test 1.2: 180-Minute Meeting RAM Usage

**Objective**: Verify no memory leaks over 3 hours

**Setup**:

- Same as Test 1.1
- Monitor for 180 minutes

**Steps**:

1. Launch app
2. Start meeting
3. Record RAM every 10 seconds for 180 minutes
4. Stop meeting
5. Analyze data

**Analysis**:

- Plot RAM usage over time
- Calculate linear regression (RAM growth rate)
- Identify memory leak patterns
- Check for sawtooth pattern (GC working)

**Pass Criteria**:

- ✅ RAM growth <10% per hour
- ✅ Peak RAM <6GB
- ✅ No sustained linear growth
- ✅ GC cycles visible in plot

**Memory Leak Detection**:

```javascript
// Calculate RAM growth rate
const growthRate = (finalRAM - initialRAM) / durationHours
if (growthRate > 100) {
  // >100MB/hour
  console.warn('Potential memory leak detected')
}
```

---

### Test 1.3: Memory Leak Identification

**Objective**: Identify source of memory leaks (if any)

**Tools**:

- Chrome DevTools (Heap Snapshot)
- Node.js `--inspect` flag
- `heapdump` module

**Steps**:

1. Launch app with `--inspect` flag
2. Open Chrome DevTools
3. Take heap snapshot at start
4. Run meeting for 60 minutes
5. Take heap snapshot at end
6. Compare snapshots
7. Identify retained objects
8. Trace object references

**Common Leak Sources**:

- Event listeners not removed
- Timers not cleared
- Circular references
- Large arrays not cleared
- Worker threads not terminated

**Fix Actions**:

- Remove event listeners on cleanup
- Clear timers on component unmount
- Break circular references
- Implement object pooling
- Terminate workers properly

---

## Test Suite 2: CPU Profiling (Task 34.3)

### Test 2.1: CPU Usage During Transcription

**Objective**: Verify CPU <60% average during transcription

**Setup**:

- Monitor CPU every 10 seconds
- Test on minimum spec hardware (i5 8th gen)

**Steps**:

1. Launch app
2. Start meeting
3. Play audio continuously
4. Record CPU every 10 seconds for 60 minutes
5. Stop meeting
6. Analyze data

**Data Collection**:

```javascript
// tests/cpu-profiling.js
const os = require('os')
const measurements = []

setInterval(() => {
  const cpus = os.cpus()
  const avgLoad =
    cpus.reduce((sum, cpu) => {
      const total = Object.values(cpu.times).reduce((a, b) => a + b)
      const idle = cpu.times.idle
      return sum + (1 - idle / total)
    }, 0) / cpus.length

  measurements.push({
    timestamp: Date.now(),
    cpuUsage: avgLoad * 100,
  })
}, 10000)
```

**Analysis**:

- Plot CPU usage over time
- Calculate average CPU
- Calculate peak CPU
- Identify CPU spikes
- Correlate with transcription events

**Pass Criteria**:

- ✅ Average CPU <60%
- ✅ Target CPU <40%
- ✅ Peak CPU <80%
- ✅ No sustained 100% CPU

---

### Test 2.2: CPU Profiling with Chrome DevTools

**Objective**: Identify CPU bottlenecks

**Tools**:

- Chrome DevTools Performance tab
- Node.js `--prof` flag
- `clinic.js` profiler

**Steps**:

1. Launch app with profiling enabled
2. Start meeting
3. Record CPU profile for 5 minutes
4. Stop recording
5. Analyze flame graph
6. Identify hot functions
7. Optimize bottlenecks

**Common Bottlenecks**:

- Synchronous file I/O
- Inefficient algorithms (O(n²))
- Excessive DOM manipulation
- Unoptimized loops
- Blocking operations

**Optimization Actions**:

- Use async I/O
- Optimize algorithms
- Batch DOM updates
- Use Web Workers for heavy computation
- Implement debouncing/throttling

---

## Test Suite 3: Startup Performance (Task 34.4)

### Test 3.1: App Startup Time

**Objective**: Verify app starts in <3s

**Setup**:

- Cold start (app not in memory)
- Measure from launch to ready

**Steps**:

1. Close app completely
2. Clear system cache (optional)
3. Launch app
4. Measure time to "ready" state
5. Repeat 10 times
6. Calculate average startup time

**Measurement Points**:

- `t0`: App launch
- `t1`: Main process ready
- `t2`: Renderer process ready
- `t3`: Database connected
- `t4`: UI rendered
- `t5`: App ready for user input

**Data Collection**:

```javascript
// src/main/index.ts
const startupMetrics = {
  launch: Date.now(),
  mainReady: 0,
  rendererReady: 0,
  dbConnected: 0,
  uiRendered: 0,
  appReady: 0,
}

// Record each milestone
app.on('ready', () => {
  startupMetrics.mainReady = Date.now()
})

// ... record other milestones

// Calculate total startup time
const totalStartupTime = startupMetrics.appReady - startupMetrics.launch
console.log(`Startup time: ${totalStartupTime}ms`)
```

**Pass Criteria**:

- ✅ Average startup time <3s
- ✅ Target startup time <2s
- ✅ 90th percentile <3.5s

**Optimization Actions**:

- Lazy load non-critical modules
- Defer database initialization
- Use code splitting
- Optimize bundle size
- Implement splash screen

---

## Test Suite 4: Search Performance (Task 34.5)

### Test 4.1: FTS5 Search Latency

**Objective**: Verify search <100ms with 100 meetings

**Setup**:

- Create 100 meetings
- Each meeting has 10-20 transcript segments
- Total: 1000-2000 segments

**Steps**:

1. Open search (Cmd+Shift+K)
2. Search for "budget"
3. Measure search time (start to results displayed)
4. Repeat 100 times
5. Calculate average, median, p95, p99
6. Test various query types:
   - Single word: "budget"
   - Multiple words: "budget planning"
   - Phrase: "Q1 2026"
   - Wildcard: "budg\*"

**Data Collection**:

```javascript
// tests/search-performance.js
const searchTimes = []

for (let i = 0; i < 100; i++) {
  const start = performance.now()
  const results = await search('budget')
  const end = performance.now()
  searchTimes.push(end - start)
}

const avg = searchTimes.reduce((a, b) => a + b) / searchTimes.length
const p95 = searchTimes.sort()[Math.floor(searchTimes.length * 0.95)]
const p99 = searchTimes.sort()[Math.floor(searchTimes.length * 0.99)]

console.log(`Average: ${avg}ms, P95: ${p95}ms, P99: ${p99}ms`)
```

**Pass Criteria**:

- ✅ Average search time <100ms
- ✅ Target search time <50ms
- ✅ P95 <150ms
- ✅ P99 <200ms

**Optimization Actions**:

- Optimize FTS5 queries
- Add indexes
- Use query caching
- Implement result pagination
- Optimize database schema

---

### Test 4.2: Search Scalability

**Objective**: Verify search scales to 1000 meetings

**Setup**:

- Create 1000 meetings
- Each meeting has 10-20 transcript segments
- Total: 10,000-20,000 segments

**Steps**:

1. Search for "budget"
2. Measure search time
3. Compare with 100 meetings
4. Calculate scalability factor

**Analysis**:

- Plot search time vs. number of meetings
- Calculate O(n) complexity
- Verify FTS5 index is used

**Pass Criteria**:

- ✅ Search time <200ms with 1000 meetings
- ✅ Linear or sub-linear scaling
- ✅ FTS5 index used (verify with EXPLAIN QUERY PLAN)

---

## Test Suite 5: Note Expansion Performance

### Test 5.1: Note Expansion Latency

**Objective**: Verify note expansion <5s

**Setup**:

- Test on minimum spec hardware
- Test with Qwen 2.5 3B model

**Steps**:

1. Create note: "Budget cuts"
2. Press Ctrl+Enter
3. Measure time from keypress to expansion displayed
4. Repeat 20 times
5. Calculate average, median, p95

**Measurement Points**:

- `t0`: Ctrl+Enter pressed
- `t1`: Request sent to LLM
- `t2`: First token received (TTFT)
- `t3`: Full response received
- `t4`: UI updated

**Data Collection**:

```javascript
// tests/note-expansion-performance.js
const expansionTimes = []

for (let i = 0; i < 20; i++) {
  const start = performance.now()
  await expandNote('Budget cuts')
  const end = performance.now()
  expansionTimes.push(end - start)
}

const avg = expansionTimes.reduce((a, b) => a + b) / expansionTimes.length
console.log(`Average expansion time: ${avg}ms`)
```

**Pass Criteria**:

- ✅ Average expansion time <5s
- ✅ Target expansion time <3s
- ✅ TTFT <200ms
- ✅ P95 <7s

**Optimization Actions**:

- Use streaming responses
- Optimize prompt length
- Reduce context window
- Use faster model (if available)
- Implement caching

---

## Test Suite 6: Database Performance

### Test 6.1: Insert Performance

**Objective**: Verify insert performance >10,000 inserts/second

**Setup**:

- Empty database
- Batch insert 100,000 transcript segments

**Steps**:

1. Prepare 100,000 transcript segments
2. Insert in batches of 1000
3. Measure time for each batch
4. Calculate inserts/second

**Data Collection**:

```javascript
// tests/database-insert-performance.js
const start = Date.now()
for (let i = 0; i < 100; i++) {
  const batch = generateTranscripts(1000)
  await db.insertTranscripts(batch)
}
const end = Date.now()
const duration = (end - start) / 1000 // seconds
const insertsPerSecond = 100000 / duration
console.log(`Inserts/second: ${insertsPerSecond}`)
```

**Pass Criteria**:

- ✅ >10,000 inserts/second
- ✅ Target: >50,000 inserts/second
- ✅ No performance degradation over time

---

### Test 6.2: WAL File Size Monitoring

**Objective**: Verify WAL file doesn't grow unbounded

**Setup**:

- Monitor WAL file size during 60-minute meeting
- Check checkpoint strategy

**Steps**:

1. Start meeting
2. Monitor WAL file size every minute
3. Verify checkpoints occur
4. Verify WAL file size stays <100MB
5. Stop meeting
6. Verify TRUNCATE checkpoint occurs

**Pass Criteria**:

- ✅ WAL file size <100MB during meeting
- ✅ Checkpoints occur every 10 minutes
- ✅ TRUNCATE checkpoint on meeting end
- ✅ WAL file size <10MB after checkpoint

---

## Test Suite 7: Network Performance

### Test 7.1: Sync Latency

**Objective**: Verify sync completes within 30 seconds

**Setup**:

- Create meeting with 100 transcript segments
- Measure sync time

**Steps**:

1. Create meeting
2. Add 100 transcript segments
3. Trigger sync
4. Measure time to sync completion
5. Repeat 10 times

**Pass Criteria**:

- ✅ Average sync time <30s
- ✅ Target sync time <15s
- ✅ P95 <45s

---

## Test Suite 8: Automated Performance Benchmarking (Task 34.7-34.9)

### Test 8.1: CI Performance Benchmarks

**Objective**: Run performance benchmarks on every PR

**Setup**:

- GitHub Actions workflow
- Performance baseline stored in repo

**Workflow**:

```yaml
# .github/workflows/performance.yml
name: Performance Benchmarks

on: [pull_request]

jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Run benchmarks
        run: npm run benchmark
      - name: Compare with baseline
        run: npm run benchmark:compare
      - name: Fail if regression >10%
        run: npm run benchmark:check
```

**Benchmarks**:

- Startup time
- Search latency
- Insert performance
- Memory usage
- CPU usage

**Pass Criteria**:

- ✅ No regression >10% from baseline
- ✅ All benchmarks pass
- ✅ Performance trends tracked

---

### Test 8.2: Performance Dashboard

**Objective**: Track performance trends over time

**Setup**:

- Store benchmark results in database
- Create dashboard to visualize trends

**Metrics Tracked**:

- Startup time (by version)
- Search latency (by version)
- RAM usage (by version)
- CPU usage (by version)
- Database performance (by version)

**Alerts**:

- Alert if any metric regresses >10%
- Alert if trend shows degradation
- Alert if critical threshold exceeded

---

## Performance Optimization Checklist

### Memory Optimization

- [ ] Remove unused event listeners
- [ ] Clear timers on cleanup
- [ ] Implement object pooling
- [ ] Use WeakMap for caches
- [ ] Terminate workers properly
- [ ] Implement lazy loading
- [ ] Use pagination for large lists
- [ ] Optimize image sizes
- [ ] Use virtual scrolling

### CPU Optimization

- [ ] Use Web Workers for heavy computation
- [ ] Implement debouncing/throttling
- [ ] Optimize algorithms (avoid O(n²))
- [ ] Use async I/O
- [ ] Batch DOM updates
- [ ] Use requestAnimationFrame
- [ ] Optimize loops
- [ ] Use memoization
- [ ] Implement code splitting

### Database Optimization

- [ ] Add indexes
- [ ] Optimize queries
- [ ] Use prepared statements
- [ ] Implement query caching
- [ ] Use WAL mode
- [ ] Configure PRAGMA settings
- [ ] Implement connection pooling
- [ ] Use batch operations
- [ ] Optimize schema

### Network Optimization

- [ ] Implement request batching
- [ ] Use compression
- [ ] Implement caching
- [ ] Use CDN for static assets
- [ ] Optimize payload size
- [ ] Implement retry logic
- [ ] Use HTTP/2
- [ ] Implement prefetching

---

## Performance Test Report Template

```markdown
# Performance Test Report

**Date**: YYYY-MM-DD
**Version**: v1.0.0
**Hardware**: [Specs]

## Summary

| Metric      | Target | Actual | Status  |
| ----------- | ------ | ------ | ------- |
| RAM (60min) | <6GB   | 5.2GB  | ✅ PASS |
| CPU (avg)   | <60%   | 45%    | ✅ PASS |
| Search      | <100ms | 47ms   | ✅ PASS |
| Startup     | <3s    | 2.1s   | ✅ PASS |

## Detailed Results

### Memory Profiling

- Peak RAM: 5.2GB
- Average RAM: 4.8GB
- RAM growth: 8% per hour
- Memory leaks: None detected

### CPU Profiling

- Average CPU: 45%
- Peak CPU: 72%
- Bottlenecks: None identified

### Search Performance

- Average: 47ms
- P95: 89ms
- P99: 142ms

## Issues Found

1. **Issue #1**: RAM usage spikes at 45-minute mark
   - Severity: MEDIUM
   - Root cause: GC not triggered
   - Fix: Force GC after 40 minutes

## Recommendations

1. Implement manual GC trigger
2. Optimize transcription pipeline
3. Add performance monitoring

## Conclusion

✅ ALL PERFORMANCE TARGETS MET
```

---

## Next Steps

1. Execute all performance test suites
2. Analyze results
3. Identify bottlenecks
4. Implement optimizations
5. Re-test
6. Set up automated benchmarking
7. Create performance dashboard
8. Monitor trends over time

---

**Status**: READY TO EXECUTE  
**Estimated Time**: 1-2 weeks  
**Tools Required**: Chrome DevTools, Node.js profiler, clinic.js
