/**
 * Audio VAD Worklet Processor
 *
 * This processor runs on the audio rendering thread (separate from main thread)
 * to capture audio and forward it to the VAD (Voice Activity Detection) worker.
 *
 * Architecture:
 * - Runs on dedicated audio thread (prevents glitches)
 * - Processes audio in 128-sample frames at 16kHz
 * - Forwards audio chunks to main thread via port.postMessage
 * - Main thread forwards to VAD Worker Thread for speech detection
 *
 * Key features:
 * - 16kHz mono audio processing
 * - Real-time audio chunk forwarding
 * - Memory-efficient buffering
 * - No blocking operations on audio thread
 *
 * Requirements:
 * - Requirement 1.3: Use AudioWorkletNode API (not deprecated ScriptProcessorNode)
 * - Requirement 1.4: Process audio through VAD to detect speech segments
 * - Requirement 1.5: VAD runs in separate Worker Thread
 * - Requirement 1.8: Support 16kHz sample rate
 */

// AudioWorklet ambient types — these globals are provided by the AudioWorklet scope
declare class AudioWorkletProcessor {
  readonly port: MessagePort
  constructor()
}

declare function registerProcessor(
  name: string,
  processorCtor: new () => AudioWorkletProcessor
): void

declare const currentTime: number
declare const sampleRate: number

/**
 * VAD Worklet Processor
 *
 * Captures audio from the audio capture stream and forwards it to the main thread
 * for VAD processing. This processor runs on the audio rendering thread.
 */
class VADWorkletProcessor extends AudioWorkletProcessor {
  private buffer: number[]
  private readonly targetBufferSize: number
  private readonly maxChunks: number
  private chunksBuffered: number

  constructor() {
    super()

    // Buffer to accumulate audio samples
    this.buffer = []

    // Target buffer size for 30-second chunks at 16kHz
    // Task 10.4: Implement 30-second chunking
    // 16000 samples/sec * 30 sec = 480,000 samples
    this.targetBufferSize = 16000 * 30

    // Maximum number of chunks to buffer (5 chunks = 2.5 minutes)
    // Prevents OOM on long meetings
    this.maxChunks = 5
    this.chunksBuffered = 0

    // Listen for messages from main thread
    this.port.onmessage = (event: MessageEvent) => {
      if (event.data.type === 'reset') {
        this.buffer = []
        this.chunksBuffered = 0
      }
    }
  }

  /**
   * Process audio samples
   *
   * Called automatically by the audio system for each 128-sample frame.
   * This method MUST be fast and non-blocking to prevent audio glitches.
   *
   * @param inputs - Input audio data [channel][sample]
   * @param _outputs - Output audio data (unused)
   * @param _parameters - Audio parameters (unused)
   * @returns true to keep processor alive
   */
  process(
    inputs: Float32Array[][],
    _outputs: Float32Array[][],
    _parameters: Record<string, Float32Array>
  ): boolean {
    // Get the first input channel (mono)
    const input = inputs[0]

    if (!input || input.length === 0) {
      return true // Keep processor alive even with no input
    }

    // Get the first channel (we're working with mono audio at 16kHz)
    const channelData = input[0]

    if (!channelData || channelData.length === 0) {
      return true
    }

    // Add samples to buffer
    // Note: We accumulate samples until we have enough for a chunk
    for (let i = 0; i < channelData.length; i++) {
      this.buffer.push(channelData[i] ?? 0)
    }

    // Check if we've accumulated enough samples for a chunk
    if (this.buffer.length >= this.targetBufferSize) {
      // Check if we've exceeded max chunks buffered
      if (this.chunksBuffered >= this.maxChunks) {
        // Drop oldest chunk by clearing buffer
        // This prevents memory overflow on long meetings
        this.port.postMessage({
          type: 'warning',
          message: 'Audio buffer full, dropping oldest chunk',
        })
        this.buffer = this.buffer.slice(this.targetBufferSize)
        this.chunksBuffered--
      }

      // Extract chunk
      const chunk = new Float32Array(this.buffer.slice(0, this.targetBufferSize))

      // Remove processed samples from buffer
      this.buffer = this.buffer.slice(this.targetBufferSize)

      // Forward audio chunk to main thread
      // Main thread will forward this to the VAD Worker Thread
      this.port.postMessage({
        type: 'audioChunk',
        data: chunk,
        timestamp: currentTime,
        sampleRate: sampleRate,
      })

      this.chunksBuffered++
    }

    return true // Keep processor alive
  }
}

// Register the processor
// This makes the processor available as 'vad-worklet' in AudioWorkletNode
registerProcessor('vad-worklet', VADWorkletProcessor)
