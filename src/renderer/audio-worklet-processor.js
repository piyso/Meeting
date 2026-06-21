/**
 * Audio Worklet Processor
 *
 * This processor runs on the audio rendering thread (separate from main thread)
 * to capture and process audio in real-time without blocking.
 *
 * Key features:
 * - Runs on dedicated audio thread (prevents glitches)
 * - Processes audio in 128-sample frames
 * - Forwards audio chunks to main thread for VAD processing
 * - Implements zero-allocation Float32Array buffering to minimize GC churn
 */

/* global sampleRate, currentTime */

class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()

    // Target buffer size for 10-second chunks at 16kHz
    // 16000 samples/sec * 10 sec = 160,000 samples
    this.targetBufferSize = 16000 * 10

    // Pre-allocated Float32Array buffer to avoid GC churn
    this.buffer = new Float32Array(this.targetBufferSize)
    this.bufferIndex = 0

    // Track if we've logged the sample rate (only log once)
    this.hasLoggedSampleRate = false

    // Listen for messages from main thread
    this.port.onmessage = event => {
      if (event.data.type === 'reset') {
        this.bufferIndex = 0
      }
    }
  }

  /**
   * Process audio samples
   * Called automatically by the audio system for each 128-sample frame
   *
   * @param {Float32Array[][]} inputs - Input audio data [channel][sample]
   * @param {Float32Array[][]} _outputs - Output audio data (unused)
   * @param {Object} _parameters - Audio parameters (unused)
   * @returns {boolean} - true to keep processor alive
   */
  process(inputs, _outputs, _parameters) {
    // Log sample rate on first process call to verify 16kHz configuration
    if (!this.hasLoggedSampleRate) {
      this.port.postMessage({
        type: 'sampleRateInfo',
        sampleRate: sampleRate,
        message: `AudioWorklet processor running at ${sampleRate}Hz (expected 16000Hz for Whisper)`,
      })
      this.hasLoggedSampleRate = true
    }

    // Get the first input channel (mono)
    const input = inputs[0]

    if (!input || input.length === 0) {
      return true // Keep processor alive even with no input
    }

    // Get the first channel (we're working with mono audio)
    const channelData = input[0]

    if (!channelData || channelData.length === 0) {
      return true
    }

    // Add samples to buffer
    for (let i = 0; i < channelData.length; i++) {
      this.buffer[this.bufferIndex++] = channelData[i]

      // Check if we've accumulated enough samples for a chunk
      if (this.bufferIndex >= this.targetBufferSize) {
        // Extract chunk. We MUST copy it because this.buffer is reused.
        const chunk = new Float32Array(this.buffer)

        // Send chunk to main thread
        this.port.postMessage({
          type: 'audioChunk',
          data: chunk,
          timestamp: currentTime,
          sampleRate: sampleRate,
        })

        // Reset buffer index for next chunk
        this.bufferIndex = 0
      }
    }

    return true // Keep processor alive
  }
}

// Register the processor
registerProcessor('audio-capture-processor', AudioCaptureProcessor)

