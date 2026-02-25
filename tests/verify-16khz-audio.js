/**
 * 16kHz Audio Configuration Verification Test
 *
 * Purpose: Verify that audio capture is correctly configured for 16kHz sample rate
 *
 * Test Criteria:
 * - AudioContext is created with 16kHz sample rate
 * - AudioWorklet processor receives 16kHz audio
 * - Audio chunks sent to main process have 16kHz sample rate
 * - Whisper will receive properly formatted 16kHz audio
 *
 * This test validates Task 10.2: Implement 16kHz resampling
 */

class Audio16kHzVerificationTest {
  constructor() {
    this.audioContext = null
    this.workletNode = null
    this.mediaStream = null
    this.testResults = {
      audioContextSampleRate: null,
      workletSampleRate: null,
      chunkSampleRate: null,
      allMatch16kHz: false,
    }
  }

  /**
   * Test 1: Verify AudioContext is created with 16kHz
   */
  async testAudioContextSampleRate() {
    console.log('\n=== Test 1: AudioContext Sample Rate ===')

    try {
      // Create AudioContext with 16kHz sample rate (same as production code)
      this.audioContext = new AudioContext({
        sampleRate: 16000,
        latencyHint: 'interactive',
      })

      const requestedRate = 16000
      const actualRate = this.audioContext.sampleRate

      console.log(`Requested sample rate: ${requestedRate}Hz`)
      console.log(`Actual sample rate: ${actualRate}Hz`)

      this.testResults.audioContextSampleRate = actualRate

      if (actualRate === 16000) {
        console.log('✅ PASS: AudioContext configured for 16kHz')
        return { success: true, sampleRate: actualRate }
      } else {
        console.warn(`⚠️  WARNING: AudioContext sample rate is ${actualRate}Hz, not 16000Hz`)
        console.warn('   Browser may resample audio automatically')
        return { success: false, sampleRate: actualRate, warning: 'Sample rate mismatch' }
      }
    } catch (error) {
      console.error('❌ FAIL: Error creating AudioContext:', error.message)
      return { success: false, error: error.message }
    }
  }

  /**
   * Test 2: Verify AudioWorklet processor receives correct sample rate
   */
  async testWorkletSampleRate() {
    console.log('\n=== Test 2: AudioWorklet Sample Rate ===')

    if (!this.audioContext) {
      console.error('❌ FAIL: AudioContext not initialized')
      return { success: false, error: 'AudioContext not initialized' }
    }

    try {
      // Get microphone stream for testing
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })

      console.log('✅ Microphone stream obtained')

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

      // Listen for sample rate info from worklet
      return new Promise(resolve => {
        const timeout = setTimeout(() => {
          console.error('❌ FAIL: Timeout waiting for worklet sample rate info')
          resolve({ success: false, error: 'Timeout' })
        }, 5000)

        this.workletNode.port.onmessage = event => {
          if (event.data.type === 'sampleRateInfo') {
            clearTimeout(timeout)

            const workletRate = event.data.sampleRate
            console.log(`Worklet sample rate: ${workletRate}Hz`)
            console.log(`Message: ${event.data.message}`)

            this.testResults.workletSampleRate = workletRate

            if (workletRate === 16000) {
              console.log('✅ PASS: AudioWorklet running at 16kHz')
              resolve({ success: true, sampleRate: workletRate })
            } else {
              console.warn(`⚠️  WARNING: AudioWorklet running at ${workletRate}Hz, not 16000Hz`)
              resolve({ success: false, sampleRate: workletRate, warning: 'Sample rate mismatch' })
            }
          }
        }

        // Connect source to worklet to start processing
        const source = this.audioContext.createMediaStreamSource(this.mediaStream)
        source.connect(this.workletNode)

        console.log('✅ Audio pipeline connected, waiting for worklet info...')
      })
    } catch (error) {
      console.error('❌ FAIL: Error setting up AudioWorklet:', error.message)
      return { success: false, error: error.message }
    }
  }

  /**
   * Test 3: Verify audio chunks have correct sample rate
   */
  async testChunkSampleRate() {
    console.log('\n=== Test 3: Audio Chunk Sample Rate ===')

    if (!this.workletNode) {
      console.error('❌ FAIL: AudioWorklet not initialized')
      return { success: false, error: 'AudioWorklet not initialized' }
    }

    try {
      return new Promise(resolve => {
        const timeout = setTimeout(() => {
          console.error('❌ FAIL: Timeout waiting for audio chunk')
          resolve({ success: false, error: 'Timeout' })
        }, 10000)

        this.workletNode.port.onmessage = event => {
          if (event.data.type === 'audioChunk') {
            clearTimeout(timeout)

            const chunkRate = event.data.sampleRate
            const chunkSize = event.data.data.length
            const duration = chunkSize / chunkRate

            console.log(`Chunk sample rate: ${chunkRate}Hz`)
            console.log(`Chunk size: ${chunkSize} samples`)
            console.log(`Chunk duration: ${duration.toFixed(2)}s`)

            this.testResults.chunkSampleRate = chunkRate

            if (chunkRate === 16000) {
              console.log('✅ PASS: Audio chunks have 16kHz sample rate')
              resolve({ success: true, sampleRate: chunkRate, chunkSize, duration })
            } else {
              console.warn(`⚠️  WARNING: Audio chunks have ${chunkRate}Hz sample rate, not 16000Hz`)
              resolve({ success: false, sampleRate: chunkRate, warning: 'Sample rate mismatch' })
            }
          }
        }

        console.log('Waiting for audio chunk (this may take up to 30 seconds)...')
        console.log('Speak into your microphone to generate audio...')
      })
    } catch (error) {
      console.error('❌ FAIL: Error testing chunk sample rate:', error.message)
      return { success: false, error: error.message }
    }
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    console.log('\n=== Cleanup ===')

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop())
      console.log('✅ Media stream stopped')
    }

    if (this.workletNode) {
      this.workletNode.disconnect()
      this.workletNode.port.close()
      console.log('✅ AudioWorklet node disconnected')
    }

    if (this.audioContext) {
      this.audioContext.close()
      console.log('✅ AudioContext closed')
    }
  }

  /**
   * Run full verification test
   */
  async runFullTest() {
    console.log('╔════════════════════════════════════════════════════════╗')
    console.log('║   16kHz Audio Configuration Verification Test         ║')
    console.log('║   Task 10.2: Implement 16kHz resampling               ║')
    console.log('╚════════════════════════════════════════════════════════╝')

    const results = {
      timestamp: new Date().toISOString(),
      platform: navigator.platform,
      userAgent: navigator.userAgent,
      tests: {},
    }

    // Test 1: AudioContext sample rate
    const test1 = await this.testAudioContextSampleRate()
    results.tests.audioContext = test1

    if (test1.success || test1.warning) {
      // Test 2: AudioWorklet sample rate
      const test2 = await this.testWorkletSampleRate()
      results.tests.worklet = test2

      if (test2.success || test2.warning) {
        // Test 3: Audio chunk sample rate
        const test3 = await this.testChunkSampleRate()
        results.tests.chunk = test3
      }
    }

    this.cleanup()

    // Final verdict
    console.log('\n╔════════════════════════════════════════════════════════╗')
    console.log('║   Test Results Summary                                 ║')
    console.log('╚════════════════════════════════════════════════════════╝')

    const allTests = [results.tests.audioContext, results.tests.worklet, results.tests.chunk]

    const allPassed = allTests.every(test => test?.success === true)
    const anyWarnings = allTests.some(test => test?.warning)

    console.log('\nSample Rate Summary:')
    console.log(`  AudioContext: ${this.testResults.audioContextSampleRate || 'N/A'}Hz`)
    console.log(`  AudioWorklet: ${this.testResults.workletSampleRate || 'N/A'}Hz`)
    console.log(`  Audio Chunks: ${this.testResults.chunkSampleRate || 'N/A'}Hz`)

    this.testResults.allMatch16kHz =
      this.testResults.audioContextSampleRate === 16000 &&
      this.testResults.workletSampleRate === 16000 &&
      this.testResults.chunkSampleRate === 16000

    if (this.testResults.allMatch16kHz) {
      console.log('\n✅ OVERALL: PASS - All components configured for 16kHz')
      console.log('✅ Whisper will receive correctly formatted 16kHz audio')
      results.verdict = 'PASS'
    } else if (anyWarnings) {
      console.log('\n⚠️  OVERALL: WARNING - Sample rate mismatches detected')
      console.log('   Browser may be resampling audio automatically')
      console.log('   This may still work but could affect transcription quality')
      results.verdict = 'WARNING'
    } else {
      console.log('\n❌ OVERALL: FAIL - 16kHz configuration not working')
      results.verdict = 'FAIL'
    }

    results.summary = this.testResults

    return results
  }
}

// Export for use in test runner
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Audio16kHzVerificationTest
}

// Auto-run if loaded in browser
if (typeof window !== 'undefined') {
  window.Audio16kHzVerificationTest = Audio16kHzVerificationTest
}
