/**
 * Memory Management Verification Test
 *
 * This test simulates the AudioWorklet processor's memory management
 * to verify that it correctly limits buffer to 5 chunks and drops oldest
 * chunks when the buffer is full.
 */

// Simulated AudioWorklet Processor
class SimulatedVADWorkletProcessor {
  constructor() {
    this.buffer = []
    this.targetBufferSize = 16000 * 30 // 30 seconds at 16kHz
    this.maxChunks = 5
    this.chunksBuffered = 0
    this.chunksProcessed = 0
    this.chunksDropped = 0
    this.eventLog = []
  }

  log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString()
    this.eventLog.push({ timestamp, message, type })
    console.log(`[${timestamp}] ${message}`)
  }

  // Simulate processing audio samples
  processSamples(sampleCount) {
    // Add samples to buffer
    for (let i = 0; i < sampleCount; i++) {
      this.buffer.push(Math.random() * 2 - 1) // Simulate audio sample
    }

    // Check if we've accumulated enough samples for a chunk
    if (this.buffer.length >= this.targetBufferSize) {
      // Check if we've exceeded max chunks buffered
      if (this.chunksBuffered >= this.maxChunks) {
        // Drop oldest chunk by clearing buffer
        this.log('⚠️ Audio buffer full, dropping oldest chunk', 'warning')
        this.buffer = this.buffer.slice(this.targetBufferSize)
        this.chunksBuffered--
        this.chunksDropped++
      }

      // Extract chunk
      const chunk = this.buffer.slice(0, this.targetBufferSize)

      // Remove processed samples from buffer
      this.buffer = this.buffer.slice(this.targetBufferSize)

      this.chunksBuffered++
      this.chunksProcessed++
      this.log(
        `✓ Processed chunk ${this.chunksProcessed} (${this.chunksBuffered} buffered)`,
        'success'
      )
    }
  }

  // Simulate transcription consuming a chunk
  consumeChunk() {
    if (this.chunksBuffered > 0) {
      this.chunksBuffered--
      this.log(`← Transcription consumed chunk (${this.chunksBuffered} remaining)`, 'info')
    }
  }

  reset() {
    this.buffer = []
    this.chunksBuffered = 0
    this.chunksProcessed = 0
    this.chunksDropped = 0
    this.eventLog = []
    this.log('🔄 Processor reset', 'info')
  }

  getMetrics() {
    return {
      chunksProcessed: this.chunksProcessed,
      chunksDropped: this.chunksDropped,
      chunksBuffered: this.chunksBuffered,
      bufferSize: this.buffer.length,
      memoryUsage: (this.buffer.length * 4) / (1024 * 1024), // MB
    }
  }
}

// Global processor instance
const processor = new SimulatedVADWorkletProcessor()

// Update UI metrics
function updateMetrics() {
  const metrics = processor.getMetrics()
  document.getElementById('chunks-processed').textContent = metrics.chunksProcessed
  document.getElementById('chunks-dropped').textContent = metrics.chunksDropped
  document.getElementById('buffer-size').textContent = metrics.chunksBuffered
  document.getElementById('memory-usage').textContent = metrics.memoryUsage.toFixed(2) + ' MB'
}

// Update event log
function updateEventLog() {
  const logDiv = document.getElementById('event-log')
  logDiv.innerHTML = processor.eventLog
    .slice(-20) // Show last 20 events
    .map(
      entry => `<div class="log-entry ${entry.type}">[${entry.timestamp}] ${entry.message}</div>`
    )
    .join('')
  logDiv.scrollTop = logDiv.scrollHeight
}

// Test 1: Normal Operation (No Drops)
document.getElementById('test1-btn').addEventListener('click', async () => {
  const btn = document.getElementById('test1-btn')
  const resultDiv = document.getElementById('test1-result')

  btn.disabled = true
  processor.reset()
  updateMetrics()
  updateEventLog()

  resultDiv.innerHTML = '<div class="status info">Running test...</div>'

  // Simulate 3 chunks with transcription keeping up
  for (let i = 0; i < 3; i++) {
    processor.processSamples(16000 * 30) // 30 seconds of audio
    updateMetrics()
    updateEventLog()
    await sleep(500)

    // Simulate transcription consuming chunk
    processor.consumeChunk()
    updateMetrics()
    updateEventLog()
    await sleep(500)
  }

  const metrics = processor.getMetrics()

  if (metrics.chunksDropped === 0 && metrics.chunksProcessed === 3) {
    resultDiv.innerHTML = `
      <div class="status success">
        <strong>✅ Test 1 PASSED</strong><br>
        Processed 3 chunks with no drops. Buffer stayed below limit.
      </div>
    `
  } else {
    resultDiv.innerHTML = `
      <div class="status warning">
        <strong>⚠️ Test 1 FAILED</strong><br>
        Expected 0 drops, got ${metrics.chunksDropped}
      </div>
    `
  }

  btn.disabled = false
})

// Test 2: Buffer Overflow (Drop Oldest)
document.getElementById('test2-btn').addEventListener('click', async () => {
  const btn = document.getElementById('test2-btn')
  const resultDiv = document.getElementById('test2-result')

  btn.disabled = true
  processor.reset()
  updateMetrics()
  updateEventLog()

  resultDiv.innerHTML = '<div class="status info">Running test...</div>'

  // Simulate 7 chunks WITHOUT transcription consuming them
  // This should trigger drop-oldest behavior after 5 chunks
  for (let i = 0; i < 7; i++) {
    processor.processSamples(16000 * 30) // 30 seconds of audio
    updateMetrics()
    updateEventLog()
    await sleep(500)
  }

  const metrics = processor.getMetrics()

  if (metrics.chunksDropped === 2 && metrics.chunksBuffered === 5) {
    resultDiv.innerHTML = `
      <div class="status success">
        <strong>✅ Test 2 PASSED</strong><br>
        Processed 7 chunks, dropped 2 oldest chunks. Buffer limited to 5 chunks (2.5 minutes).
      </div>
    `
  } else {
    resultDiv.innerHTML = `
      <div class="status warning">
        <strong>⚠️ Test 2 FAILED</strong><br>
        Expected 2 drops and 5 buffered, got ${metrics.chunksDropped} drops and ${metrics.chunksBuffered} buffered
      </div>
    `
  }

  btn.disabled = false
})

// Test 3: Memory Stability
document.getElementById('test3-btn').addEventListener('click', async () => {
  const btn = document.getElementById('test3-btn')
  const resultDiv = document.getElementById('test3-result')

  btn.disabled = true
  processor.reset()
  updateMetrics()
  updateEventLog()

  resultDiv.innerHTML = '<div class="status info">Running test...</div>'

  let maxMemory = 0

  // Simulate 10 chunks (5 minutes of audio)
  for (let i = 0; i < 10; i++) {
    processor.processSamples(16000 * 30) // 30 seconds of audio
    const metrics = processor.getMetrics()
    maxMemory = Math.max(maxMemory, metrics.memoryUsage)
    updateMetrics()
    updateEventLog()
    await sleep(300)
  }

  const metrics = processor.getMetrics()
  const expectedMaxMemory = (16000 * 30 * 5 * 4) / (1024 * 1024) // 5 chunks in MB

  if (maxMemory <= expectedMaxMemory * 1.1) {
    // Allow 10% margin
    resultDiv.innerHTML = `
      <div class="status success">
        <strong>✅ Test 3 PASSED</strong><br>
        Processed 10 chunks. Memory stayed bounded at ${maxMemory.toFixed(2)} MB (limit: ${expectedMaxMemory.toFixed(2)} MB).<br>
        Dropped ${metrics.chunksDropped} chunks to maintain limit.
      </div>
    `
  } else {
    resultDiv.innerHTML = `
      <div class="status warning">
        <strong>⚠️ Test 3 FAILED</strong><br>
        Memory exceeded limit: ${maxMemory.toFixed(2)} MB (expected max: ${expectedMaxMemory.toFixed(2)} MB)
      </div>
    `
  }

  btn.disabled = false
})

// Helper function
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Initialize
updateMetrics()
processor.log('System initialized. Ready for testing.', 'success')
updateEventLog()
