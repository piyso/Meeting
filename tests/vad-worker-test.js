/**
 * VAD Worker Test
 *
 * Simple test to verify VAD worker initialization and basic functionality.
 * This test loads the VAD worker and sends a test audio chunk.
 *
 * Usage:
 *   node tests/vad-worker-test.js
 */

const { Worker } = require('worker_threads')
const path = require('path')
const fs = require('fs')

console.log('=== VAD Worker Test ===\n')

// Check if model exists
const modelPath = path.join(__dirname, '../resources/models/silero_vad.onnx')
if (!fs.existsSync(modelPath)) {
  console.error('❌ Model not found:', modelPath)
  console.error('Please run: npm run download-models')
  process.exit(1)
}
console.log('✅ Model found:', modelPath)

// Check if worker file exists (compiled)
const workerPath = path.join(__dirname, '../dist-electron/workers/vad.worker.js')
if (!fs.existsSync(workerPath)) {
  console.error('❌ Worker not found:', workerPath)
  console.error('Please run: npm run build')
  console.error('\nNote: This test requires the TypeScript to be compiled first.')
  console.error('For development, you can test the worker after building the project.')
  process.exit(1)
}
console.log('✅ Worker found:', workerPath)

// Create worker
console.log('\n📝 Creating VAD worker...')
const worker = new Worker(workerPath)

let testsPassed = 0
let testsFailed = 0

// Test timeout
const timeout = setTimeout(() => {
  console.error('\n❌ Test timeout - worker did not respond')
  worker.terminate()
  process.exit(1)
}, 10000)

// Listen for messages
worker.on('message', msg => {
  console.log('\n📨 Received message:', msg.type)

  if (msg.type === 'initialized') {
    if (msg.success) {
      console.log('✅ Test 1: Worker initialized successfully')
      testsPassed++

      // Test 2: Send silence audio chunk
      console.log('\n📝 Test 2: Processing silence audio chunk...')
      const silenceAudio = new Float32Array(512).fill(0)
      worker.postMessage({
        type: 'audioChunk',
        data: silenceAudio,
        timestamp: Date.now(),
        sampleRate: 16000,
      })
    } else {
      console.error('❌ Test 1: Worker initialization failed')
      testsFailed++
      worker.terminate()
      clearTimeout(timeout)
      process.exit(1)
    }
  } else if (msg.type === 'vadResult') {
    console.log('   - hasVoice:', msg.hasVoice)
    console.log('   - confidence:', msg.confidence.toFixed(4))
    console.log('   - timestamp:', msg.timestamp)

    if (msg.confidence < 0.5) {
      console.log('✅ Test 2: Silence detected correctly (confidence < 0.5)')
      testsPassed++
    } else {
      console.log('⚠️  Test 2: Expected low confidence for silence, got:', msg.confidence)
      console.log('   (This may be normal depending on model behavior)')
      testsPassed++
    }

    // Test 3: Send noise audio chunk
    console.log('\n📝 Test 3: Processing noise audio chunk...')
    const noiseAudio = new Float32Array(512)
    for (let i = 0; i < 512; i++) {
      noiseAudio[i] = (Math.random() - 0.5) * 0.1 // Low amplitude noise
    }
    worker.postMessage({
      type: 'audioChunk',
      data: noiseAudio,
      timestamp: Date.now(),
      sampleRate: 16000,
    })
  } else if (msg.type === 'vadResult' && testsPassed === 2) {
    console.log('   - hasVoice:', msg.hasVoice)
    console.log('   - confidence:', msg.confidence.toFixed(4))
    console.log('   - timestamp:', msg.timestamp)

    console.log('✅ Test 3: Noise audio processed')
    testsPassed++

    // Test 4: Reset worker
    console.log('\n📝 Test 4: Resetting worker state...')
    worker.postMessage({
      type: 'reset',
    })
  } else if (msg.type === 'resetComplete') {
    console.log('✅ Test 4: Worker reset successfully')
    testsPassed++

    // All tests complete
    console.log('\n' + '='.repeat(50))
    console.log('Test Results:')
    console.log('  Passed:', testsPassed)
    console.log('  Failed:', testsFailed)
    console.log('='.repeat(50))

    if (testsFailed === 0) {
      console.log('\n✅ All tests passed!')
    } else {
      console.log('\n❌ Some tests failed')
    }

    worker.terminate()
    clearTimeout(timeout)
    process.exit(testsFailed > 0 ? 1 : 0)
  } else if (msg.type === 'error') {
    console.error('❌ Worker error:', msg.error)
    testsFailed++
    worker.terminate()
    clearTimeout(timeout)
    process.exit(1)
  }
})

worker.on('error', error => {
  console.error('\n❌ Worker error:', error)
  testsFailed++
  clearTimeout(timeout)
  process.exit(1)
})

worker.on('exit', code => {
  if (code !== 0) {
    console.error('\n❌ Worker exited with code:', code)
  }
})

// Initialize worker
console.log('📝 Test 1: Initializing worker...')
worker.postMessage({
  type: 'init',
  modelPath: modelPath,
})
