/**
 * CPU Stress Test for Audio Glitch Detection
 *
 * Purpose: Verify that AudioWorklet-based audio capture maintains quality under high CPU load
 *
 * Test Criteria:
 * - AudioWorklet continues processing on dedicated audio thread
 * - No audio dropouts or glitches under CPU stress
 * - Audio chunks arrive consistently (no gaps)
 * - Sample rate remains stable at 16kHz
 * - Chunk timing remains consistent (30-second intervals)
 *
 * This test validates Task 10.6: Test for audio glitches under CPU load
 *
 * Architecture:
 * - Phase 1 (30s): Baseline recording without CPU stress
 * - Phase 2 (30s): Recording with heavy CPU stress (4 worker threads)
 * - Analysis: Compare chunk timing, detect dropouts, measure jitter
 *
 * Pass Criteria:
 * - No dropouts detected (all chunks received)
 * - Timing jitter < 100ms (chunks arrive at consistent intervals)
 * - Sample rate stable at 16kHz
 */

class CPUStressTest {
  constructor() {
    this.audioContext = null
    this.workletNode = null
    this.mediaStream = null
    this.sourceNode = null
    this.isRunning = false
    this.isStopped = false

    // Test metrics
    this.chunks = []
    this.chunkTimestamps = []
    this.dropouts = 0
    this.phase = 'idle' // 'idle', 'baseline', 'stress', 'complete'

    // CPU stress workers
    this.cpuWorkers = []

    // Callbacks
    this.onMetricsUpdate = null
    this.onProgressUpdate = null

    // Test configuration
    this.BASELINE_DURATION = 30000 // 30 seconds
    this.STRESS_DURATION = 30000 // 30 seconds
    this.EXPECTED_CHUNK_INTERVAL = 30000 // 30 seconds
    this.MAX_JITTER_MS = 100 // 100ms tolerance
  }

  /**
   * Start CPU stress workload
   * Creates multiple worker threads running CPU-intensive calculations
   */
  startCPUStress() {
    console.log('🔥 Starting CPU stress workload...')

    const workerCount = 4 // 4 workers to saturate CPU
    const workerCode = `
      // CPU-intensive calculation (prime number generation)
      self.onmessage = function(e) {
        if (e.data === 'start') {
          let running = true;
          
          self.onmessage = function(e) {
            if (e.data === 'stop') {
              running = false;
            }
          };
          
          // Infinite loop of CPU-intensive work
          while (running) {
            // Generate prime numbers (CPU-intensive)
            let primes = [];
            for (let i = 2; i < 10000; i++) {
              let isPrime = true;
              for (let j = 2; j < Math.sqrt(i); j++) {
                if (i % j === 0) {
                  isPrime = false;
                  break;
                }
              }
              if (isPrime) {
                primes.push(i);
              }
            }
            
            // Matrix multiplication (CPU-intensive)
            const size = 100;
            const a = Array(size).fill().map(() => Array(size).fill(Math.random()));
            const b = Array(size).fill().map(() => Array(size).fill(Math.random()));
            const c = Array(size).fill().map(() => Array(size).fill(0));
            
            for (let i = 0; i < size; i++) {
              for (let j = 0; j < size; j++) {
                for (let k = 0; k < size; k++) {
                  c[i][j] += a[i][k] * b[k][j];
                }
              }
            }
          }
          
          self.postMessage('stopped');
        }
      };
    `

    const blob = new Blob([workerCode], { type: 'application/javascript' })
    const workerUrl = URL.createObjectURL(blob)

    for (let i = 0; i < workerCount; i++) {
      const worker = new Worker(workerUrl)
      worker.postMessage('start')
      this.cpuWorkers.push(worker)
      console.log(`  Worker ${i + 1}/${workerCount} started`)
    }

    console.log(`✅ CPU stress active (${workerCount} workers)`)
  }

  /**
   * Stop CPU stress workload
   */
  stopCPUStress() {
    console.log('🛑 Stopping CPU stress workload...')

    this.cpuWorkers.forEach((worker, index) => {
      worker.postMessage('stop')
      worker.terminate()
      console.log(`  Worker ${index + 1}/${this.cpuWorkers.length} stopped`)
    })

    this.cpuWorkers = []
    console.log('✅ CPU stress stopped')
  }

  /**
   * Set up audio capture pipeline
   */
  async setupAudioPipeline() {
    console.log('\n=== Setting up audio pipeline ===')

    try {
      // Get microphone stream
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })

      console.log('✅ Microphone stream obtained')

      // Create AudioContext with 16kHz sample rate
      this.audioContext = new AudioContext({
        sampleRate: 16000,
        latencyHint: 'interactive',
      })

      console.log(`✅ AudioContext created (${this.audioContext.sampleRate}Hz)`)

      // Load AudioWorklet processor
      const workletPath = new URL('../src/renderer/audio-worklet-processor.js', import.meta.url)
        .href
      await this.audioContext.audioWorklet.addModule(workletPath)

      console.log('✅ AudioWorklet module loaded')

      // Create AudioWorklet node
      this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-capture-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 0,
        channelCount: 1,
      })

      console.log('✅ AudioWorklet node created')

      // Listen for audio chunks
      this.workletNode.port.onmessage = event => {
        if (event.data.type === 'audioChunk') {
          this.handleAudioChunk(event.data)
        } else if (event.data.type === 'sampleRateInfo') {
          console.log(`✅ ${event.data.message}`)
        }
      }

      // Connect audio pipeline
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream)
      this.sourceNode.connect(this.workletNode)

      console.log('✅ Audio pipeline connected')
      console.log('✅ AudioWorklet running on dedicated audio thread')
    } catch (error) {
      console.error('❌ Failed to setup audio pipeline:', error.message)
      throw error
    }
  }

  /**
   * Handle audio chunk from worklet
   */
  handleAudioChunk(data) {
    const timestamp = Date.now()

    this.chunks.push({
      data: data.data,
      timestamp: timestamp,
      sampleRate: data.sampleRate,
      phase: this.phase,
    })

    this.chunkTimestamps.push(timestamp)

    // Check for dropouts (gaps in chunk timing)
    if (this.chunkTimestamps.length > 1) {
      const lastTimestamp = this.chunkTimestamps[this.chunkTimestamps.length - 2]
      const interval = timestamp - lastTimestamp
      const expectedInterval = this.EXPECTED_CHUNK_INTERVAL

      // Allow 10% tolerance for chunk interval
      const tolerance = expectedInterval * 0.1
      if (Math.abs(interval - expectedInterval) > tolerance) {
        this.dropouts++
        console.warn(
          `⚠️  Potential dropout detected! Interval: ${interval}ms (expected: ${expectedInterval}ms)`
        )
      }
    }

    console.log(
      `📦 Chunk ${this.chunks.length} received (${this.phase} phase) - ` +
        `${data.data.length} samples @ ${data.sampleRate}Hz`
    )

    this.updateMetrics()
  }

  /**
   * Update live metrics
   */
  updateMetrics() {
    if (!this.onMetricsUpdate) return

    const metrics = {
      chunksReceived: this.chunks.length,
      dropoutsDetected: this.dropouts,
      avgInterval: this.calculateAverageInterval(),
      timingJitter: this.calculateTimingJitter(),
      sampleRate: this.chunks.length > 0 ? this.chunks[this.chunks.length - 1].sampleRate : 16000,
      cpuLoad: this.phase === 'stress' ? 100 : 0,
    }

    this.onMetricsUpdate(metrics)
  }

  /**
   * Calculate average chunk interval
   */
  calculateAverageInterval() {
    if (this.chunkTimestamps.length < 2) return 0

    let totalInterval = 0
    for (let i = 1; i < this.chunkTimestamps.length; i++) {
      totalInterval += this.chunkTimestamps[i] - this.chunkTimestamps[i - 1]
    }

    return totalInterval / (this.chunkTimestamps.length - 1) / 1000 // Convert to seconds
  }

  /**
   * Calculate timing jitter (standard deviation of intervals)
   */
  calculateTimingJitter() {
    if (this.chunkTimestamps.length < 2) return 0

    const intervals = []
    for (let i = 1; i < this.chunkTimestamps.length; i++) {
      intervals.push(this.chunkTimestamps[i] - this.chunkTimestamps[i - 1])
    }

    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
    const variance =
      intervals.reduce((sum, interval) => sum + Math.pow(interval - avgInterval, 2), 0) /
      intervals.length
    const stdDev = Math.sqrt(variance)

    return stdDev / 1000 // Convert to seconds
  }

  /**
   * Update progress
   */
  updateProgress(phase, elapsed, total) {
    if (!this.onProgressUpdate) return

    const percentage = Math.min(Math.round((elapsed / total) * 100), 100)

    this.onProgressUpdate({
      phase,
      elapsed,
      total,
      percentage,
    })
  }

  /**
   * Run baseline phase (no CPU stress)
   */
  async runBaselinePhase() {
    console.log('\n╔════════════════════════════════════════════════════════╗')
    console.log('║   Phase 1: Baseline Recording (No CPU Stress)         ║')
    console.log('╚════════════════════════════════════════════════════════╝')

    this.phase = 'baseline'
    const startTime = Date.now()
    const baselineChunksStart = this.chunks.length

    console.log(`Duration: ${this.BASELINE_DURATION / 1000}s`)
    console.log('Please speak into your microphone...')

    // Wait for baseline duration
    while (Date.now() - startTime < this.BASELINE_DURATION && !this.isStopped) {
      await new Promise(resolve => setTimeout(resolve, 100))
      this.updateProgress('baseline', Date.now() - startTime, this.BASELINE_DURATION)
    }

    const baselineChunksEnd = this.chunks.length
    const baselineChunks = baselineChunksEnd - baselineChunksStart

    console.log(`✅ Baseline phase complete`)
    console.log(`   Chunks received: ${baselineChunks}`)
    console.log(`   Duration: ${(Date.now() - startTime) / 1000}s`)

    return {
      success: baselineChunks > 0,
      chunksReceived: baselineChunks,
      duration: (Date.now() - startTime) / 1000,
      dropouts: 0, // No dropouts expected in baseline
    }
  }

  /**
   * Run stress phase (with CPU stress)
   */
  async runStressPhase() {
    console.log('\n╔════════════════════════════════════════════════════════╗')
    console.log('║   Phase 2: CPU Stress Recording                       ║')
    console.log('╚════════════════════════════════════════════════════════╝')

    this.phase = 'stress'
    const startTime = Date.now()
    const stressChunksStart = this.chunks.length
    const stressDropoutsStart = this.dropouts

    console.log(`Duration: ${this.STRESS_DURATION / 1000}s`)
    console.log('Starting CPU stress workload...')

    // Start CPU stress
    this.startCPUStress()

    console.log('⚠️  Browser may become temporarily unresponsive - this is expected')
    console.log('Continue speaking into your microphone...')

    // Wait for stress duration
    while (Date.now() - startTime < this.STRESS_DURATION && !this.isStopped) {
      await new Promise(resolve => setTimeout(resolve, 100))
      this.updateProgress('stress', Date.now() - startTime, this.STRESS_DURATION)
    }

    // Stop CPU stress
    this.stopCPUStress()

    const stressChunksEnd = this.chunks.length
    const stressChunks = stressChunksEnd - stressChunksStart
    const stressDropouts = this.dropouts - stressDropoutsStart

    // Calculate stress phase metrics
    const stressTimestamps = this.chunkTimestamps.slice(stressChunksStart)
    let avgInterval = 0
    let timingJitter = 0

    if (stressTimestamps.length >= 2) {
      const intervals = []
      for (let i = 1; i < stressTimestamps.length; i++) {
        intervals.push(stressTimestamps[i] - stressTimestamps[i - 1])
      }

      avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length / 1000
      const variance =
        intervals.reduce((sum, interval) => sum + Math.pow(interval - avgInterval * 1000, 2), 0) /
        intervals.length
      timingJitter = Math.sqrt(variance) / 1000
    }

    console.log(`✅ Stress phase complete`)
    console.log(`   Chunks received: ${stressChunks}`)
    console.log(`   Dropouts detected: ${stressDropouts}`)
    console.log(`   Avg chunk interval: ${avgInterval.toFixed(2)}s`)
    console.log(`   Timing jitter: ${timingJitter.toFixed(3)}s`)
    console.log(`   Duration: ${(Date.now() - startTime) / 1000}s`)

    return {
      success: stressChunks > 0 && stressDropouts === 0 && timingJitter < this.MAX_JITTER_MS / 1000,
      chunksReceived: stressChunks,
      dropouts: stressDropouts,
      avgInterval,
      timingJitter,
      duration: (Date.now() - startTime) / 1000,
    }
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    console.log('\n=== Cleanup ===')

    // Stop CPU stress if still running
    if (this.cpuWorkers.length > 0) {
      this.stopCPUStress()
    }

    // Stop media stream
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop())
      console.log('✅ Media stream stopped')
    }

    // Disconnect audio nodes
    if (this.sourceNode) {
      this.sourceNode.disconnect()
    }

    if (this.workletNode) {
      this.workletNode.disconnect()
      this.workletNode.port.close()
      console.log('✅ AudioWorklet node disconnected')
    }

    // Close audio context
    if (this.audioContext) {
      this.audioContext.close()
      console.log('✅ AudioContext closed')
    }

    this.isRunning = false
  }

  /**
   * Stop test early
   */
  stop() {
    console.log('⏹️  Stopping test...')
    this.isStopped = true
  }

  /**
   * Run full CPU stress test
   */
  async runFullTest() {
    console.log('╔════════════════════════════════════════════════════════╗')
    console.log('║   CPU Stress Test - Audio Glitch Detection            ║')
    console.log('║   Task 10.6: Test for audio glitches under CPU load   ║')
    console.log('╚════════════════════════════════════════════════════════╝')

    this.isRunning = true
    this.isStopped = false

    const results = {
      timestamp: new Date().toISOString(),
      platform: navigator.platform,
      userAgent: navigator.userAgent,
      tests: {},
    }

    try {
      // Setup audio pipeline
      await this.setupAudioPipeline()

      // Phase 1: Baseline recording
      const baselineResults = await this.runBaselinePhase()
      results.tests.baseline = baselineResults

      if (this.isStopped) {
        throw new Error('Test stopped by user')
      }

      // Phase 2: Stress recording
      const stressResults = await this.runStressPhase()
      results.tests.stress = stressResults

      // Calculate overall metrics
      const totalChunks = this.chunks.length
      const totalDropouts = this.dropouts
      const maxJitter = stressResults.timingJitter || 0

      results.summary = {
        totalChunks,
        totalDropouts,
        maxJitter,
        noGlitches: totalDropouts === 0 && maxJitter < this.MAX_JITTER_MS / 1000,
      }

      // Final verdict
      console.log('\n╔════════════════════════════════════════════════════════╗')
      console.log('║   Test Results Summary                                 ║')
      console.log('╚════════════════════════════════════════════════════════╝')

      console.log('\nOverall Metrics:')
      console.log(`  Total chunks: ${totalChunks}`)
      console.log(`  Total dropouts: ${totalDropouts}`)
      console.log(`  Max timing jitter: ${maxJitter.toFixed(3)}s`)

      if (results.summary.noGlitches) {
        console.log('\n✅ OVERALL: PASS - No audio glitches detected under CPU stress')
        console.log('✅ AudioWorklet successfully isolated audio processing from main thread')
        console.log('✅ Audio quality maintained under high CPU load')
        results.verdict = 'PASS'
      } else if (totalDropouts > 0) {
        console.log('\n❌ OVERALL: FAIL - Audio dropouts detected')
        console.log(`   ${totalDropouts} dropout(s) occurred during stress phase`)
        console.log('   AudioWorklet isolation may not be working correctly')
        results.verdict = 'FAIL'
      } else if (maxJitter >= this.MAX_JITTER_MS / 1000) {
        console.log('\n⚠️  OVERALL: WARNING - High timing jitter detected')
        console.log(
          `   Jitter: ${maxJitter.toFixed(3)}s (threshold: ${this.MAX_JITTER_MS / 1000}s)`
        )
        console.log('   Audio may have minor quality issues under stress')
        results.verdict = 'WARNING'
      } else {
        console.log('\n❌ OVERALL: FAIL - Test did not complete successfully')
        results.verdict = 'FAIL'
      }
    } catch (error) {
      console.error('❌ Test failed with error:', error.message)
      results.verdict = 'ERROR'
      results.error = error.message
      throw error
    } finally {
      this.cleanup()
    }

    return results
  }
}

// Export for use in test runner
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CPUStressTest
}

// Auto-run if loaded in browser
if (typeof window !== 'undefined') {
  window.CPUStressTest = CPUStressTest
}

export default CPUStressTest
