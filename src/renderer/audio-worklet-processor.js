/**
 * Audio Worklet Processor
 *
 * This processor runs on the audio rendering thread (separate from main thread)
 * to capture and process audio in real-time without blocking.
 *
 * Key features:
 * - Runs on dedicated audio thread (prevents glitches)
 * - Processes audio in 128-sample frames
 * - Forwards half-second audio chunks to the main thread
 * - Hands over the partial chunk on request ('flush'), so stopping or pausing
 *   does not lose the tail of the recording
 * - Implements zero-allocation Float32Array buffering to minimize GC churn
 */

/* global sampleRate, currentTime */

class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()

    // Half-second chunks at the context's real rate. This used to be ten
    // seconds: a recording shorter than that produced no audio at all, and
    // every stop discarded whatever was still buffered (up to ten seconds).
    this.targetBufferSize = Math.max(128, Math.round(sampleRate * 0.5))

    // Pre-allocated Float32Array buffer to avoid GC churn
    this.buffer = new Float32Array(this.targetBufferSize)
    this.bufferIndex = 0

    // Track if we've logged the sample rate (only log once)
    this.hasLoggedSampleRate = false

    // Listen for messages from main thread
    this.port.onmessage = event => {
      const type = event.data && event.data.type
      if (type === 'reset') {
        this.bufferIndex = 0
      } else if (type === 'flush') {
        // Hand over what is buffered, then acknowledge, so the caller can tear
        // the graph down knowing the audio has been delivered.
        this.postBuffered()
        this.port.postMessage({ type: 'flushed', id: event.data.id })
      }
    }
  }

  /** Send the buffered samples (a copy — the buffer is reused) and start over. */
  postBuffered() {
    if (this.bufferIndex === 0) return
    this.port.postMessage({
      type: 'audioChunk',
      data: this.buffer.slice(0, this.bufferIndex),
      timestamp: currentTime,
      sampleRate: sampleRate,
    })
    this.bufferIndex = 0
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
        message: `AudioWorklet processor running at ${sampleRate}Hz (expected 16000Hz for speech recognition)`,
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
        this.postBuffered()
      }
    }

    return true // Keep processor alive
  }
}

// Register the processor
registerProcessor('audio-capture-processor', AudioCaptureProcessor)
