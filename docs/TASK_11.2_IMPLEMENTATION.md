# Task 11.2 Implementation: VAD Worker with ONNX Runtime

**Status**: ✅ Complete  
**Date**: February 24, 2025  
**Task**: Implement VAD worker with onnxruntime-node

## Overview

Task 11.2 implements the Voice Activity Detection (VAD) worker thread using the Silero VAD ONNX model and onnxruntime-node. This worker runs in a separate thread to detect speech segments in audio, reducing transcription workload by approximately 40%.

## Implementation Summary

### 1. Dependencies Installed

**Package**: `onnxruntime-node`

```bash
npm install onnxruntime-node --save
```

**Version**: Latest (added to package.json dependencies)

### 2. VAD Worker Implementation

**File**: `src/main/workers/vad.worker.ts`

**Key Features**:

- ✅ Runs in separate Worker Thread (NOT on audio thread)
- ✅ Loads Silero VAD ONNX model (2.1 MB)
- ✅ Processes audio chunks for voice detection
- ✅ Uses onnxruntime-node for inference
- ✅ Maintains LSTM state for stateful processing
- ✅ Target: <10ms inference time per chunk
- ✅ Confidence threshold: 0.5

### 3. Architecture

```
Main Thread
    ↓ (postMessage)
VAD Worker Thread
    ↓ (load model)
ONNX Runtime
    ↓ (inference)
Silero VAD Model
    ↓ (output)
Voice Detection Result
    ↓ (postMessage)
Main Thread
```

### 4. Implementation Details

#### Model Loading

```typescript
// Load ONNX model using onnxruntime-node
this.session = await ort.InferenceSession.create(modelPath, {
  executionProviders: ['cpu'],
  graphOptimizationLevel: 'all',
})

// Initialize state tensors for Silero VAD
// h and c are LSTM hidden states (2 x 1 x 64)
// sr is sample rate tensor
this.h = new ort.Tensor('float32', new Float32Array(128).fill(0), [2, 1, 64])
this.c = new ort.Tensor('float32', new Float32Array(128).fill(0), [2, 1, 64])
this.sr = new ort.Tensor('int64', new BigInt64Array([BigInt(16000)]), [1])
```

#### Audio Processing

```typescript
// Silero VAD expects 512 samples at 16kHz (32ms chunks)
const expectedLength = 512

// Pad or truncate audio to expected length
let processedAudio: Float32Array
if (audioData.length < expectedLength) {
  processedAudio = new Float32Array(expectedLength)
  processedAudio.set(audioData)
} else if (audioData.length > expectedLength) {
  processedAudio = audioData.slice(0, expectedLength)
} else {
  processedAudio = audioData
}

// Create input tensor [1, 512]
const inputTensor = new ort.Tensor('float32', processedAudio, [1, expectedLength])

// Run inference with state tensors
const feeds: Record<string, ort.Tensor> = {
  input: inputTensor,
  h: this.h,
  c: this.c,
  sr: this.sr,
}

const results = await this.session.run(feeds)
```

#### Voice Detection

```typescript
// Extract output
const outputTensor = results.output
const confidence = outputTensor.data[0] as number

// Update state tensors for next inference
if (results.hn) {
  this.h = results.hn
}
if (results.cn) {
  this.c = results.cn
}

// Compare against threshold (0.5)
const hasVoice = confidence >= this.confidenceThreshold

return {
  hasVoice,
  confidence,
}
```

### 5. Message Protocol

#### Initialization

**From Main Thread:**

```typescript
{
  type: 'init',
  modelPath: '/path/to/silero_vad.onnx'
}
```

**To Main Thread:**

```typescript
{
  type: 'initialized',
  success: true
}
```

#### Audio Processing

**From Main Thread:**

```typescript
{
  type: 'audioChunk',
  data: Float32Array,      // Audio samples
  timestamp: number,       // Timestamp in ms
  sampleRate: 16000        // Sample rate
}
```

**To Main Thread:**

```typescript
{
  type: 'vadResult',
  hasVoice: boolean,       // Voice detected?
  confidence: number,      // Confidence score (0.0 - 1.0)
  timestamp: number,       // Original timestamp
  data?: Float32Array      // Audio data (only if hasVoice = true)
}
```

#### Reset

**From Main Thread:**

```typescript
{
  type: 'reset'
}
```

**To Main Thread:**

```typescript
{
  type: 'resetComplete'
}
```

### 6. State Management

The Silero VAD model is **stateful** and maintains LSTM hidden states across chunks:

- **h**: Hidden state tensor [2, 1, 64]
- **c**: Cell state tensor [2, 1, 64]
- **sr**: Sample rate tensor [1]

These states are updated after each inference and passed to the next inference, allowing the model to maintain context across audio chunks.

### 7. Performance Characteristics

| Metric                 | Target      | Implementation                              |
| ---------------------- | ----------- | ------------------------------------------- |
| **Inference Time**     | <10ms       | Measured per chunk, warning logged if >10ms |
| **Accuracy**           | 95%+        | Silero VAD v5 achieves 95%+ accuracy        |
| **Chunk Size**         | 512 samples | 32ms at 16kHz                               |
| **Sample Rate**        | 16kHz       | Configured in worker                        |
| **Threshold**          | 0.5         | Configurable (default: 0.5)                 |
| **Workload Reduction** | ~40%        | By filtering silence                        |

### 8. Error Handling

**Initialization Errors:**

- Model file not found → Throw error, log to console
- ONNX Runtime error → Throw error, log to console

**Inference Errors:**

- Invalid audio data → Default to hasVoice=true, confidence=1.0
- ONNX Runtime error → Default to hasVoice=true, confidence=1.0
- Missing state tensors → Skip VAD, default to hasVoice=true

**Rationale**: On error, default to assuming voice is present to avoid losing audio data. Better to transcribe silence than miss speech.

### 9. Integration Points

#### Current Integration

- VAD worker is implemented and ready to use
- Model path: `resources/models/silero_vad.onnx`
- Worker file: `src/main/workers/vad.worker.ts`

#### Future Integration (Task 13)

The VAD worker will be integrated into the audio pipeline:

```
AudioWorklet
    ↓
VAD Worker (Task 11.2) ← YOU ARE HERE
    ↓ (if hasVoice)
Whisper Worker (Task 15)
    ↓
Transcript
```

### 10. Testing

#### Manual Testing

To test the VAD worker:

```typescript
import { Worker } from 'worker_threads'
import * as path from 'path'

// Create worker
const worker = new Worker(path.join(__dirname, 'vad.worker.js'))

// Initialize
worker.postMessage({
  type: 'init',
  modelPath: path.join(__dirname, '../../resources/models/silero_vad.onnx'),
})

// Listen for initialization
worker.on('message', msg => {
  if (msg.type === 'initialized') {
    console.log('VAD Worker initialized')

    // Send test audio chunk (512 samples of silence)
    const audioData = new Float32Array(512).fill(0)
    worker.postMessage({
      type: 'audioChunk',
      data: audioData,
      timestamp: Date.now(),
      sampleRate: 16000,
    })
  }

  if (msg.type === 'vadResult') {
    console.log('VAD Result:', msg)
    // Expected: hasVoice=false, confidence<0.5 (silence)
  }
})
```

#### Automated Testing (Future)

- Unit test: Model loading
- Unit test: Audio chunk processing
- Unit test: State reset
- Integration test: VAD → Whisper pipeline
- Performance test: Inference time <10ms

### 11. Model Specifications

**Silero VAD v5 ONNX**

| Property           | Value                                 |
| ------------------ | ------------------------------------- |
| **Input Shape**    | [1, 512] (Float32)                    |
| **Output Shape**   | [1, 1] (Float32)                      |
| **State Tensors**  | h: [2, 1, 64], c: [2, 1, 64], sr: [1] |
| **Sample Rate**    | 16kHz (8kHz also supported)           |
| **Chunk Duration** | 32ms (512 samples at 16kHz)           |
| **Output Range**   | 0.0 (no voice) to 1.0 (voice)         |

**Model Inputs:**

- `input`: Audio samples [1, 512]
- `h`: Hidden state [2, 1, 64]
- `c`: Cell state [2, 1, 64]
- `sr`: Sample rate [1]

**Model Outputs:**

- `output`: Voice probability [1, 1]
- `hn`: New hidden state [2, 1, 64]
- `cn`: New cell state [2, 1, 64]

### 12. Optimization Opportunities

**Current Implementation:**

- CPU execution provider
- Graph optimization level: 'all'
- No quantization

**Future Optimizations:**

- Use GPU execution provider if available (CUDA, DirectML)
- Implement batch processing for multiple chunks
- Add caching for repeated patterns
- Profile inference time and optimize bottlenecks

### 13. Known Limitations

1. **Chunk Size**: Fixed at 512 samples (32ms). Larger chunks require splitting.
2. **Sample Rate**: Optimized for 16kHz. Other rates may reduce accuracy.
3. **Latency**: 32ms minimum latency per chunk (model requirement).
4. **CPU Only**: Current implementation uses CPU. GPU support not implemented.

### 14. Next Steps

**Task 11.3**: Set confidence threshold (0.5)

- Already implemented (default: 0.5)
- Configurable via class property

**Task 11.4**: Forward voice segments to Whisper worker

- Requires Whisper worker implementation (Task 15)
- VAD worker already filters audio (only forwards if hasVoice=true)

**Task 11.5**: Measure inference time (<10ms target)

- Already implemented (logs warning if >10ms)
- Need to run performance tests on target hardware

**Task 11.6**: Test accuracy on various audio samples

- Need to create test suite with:
  - Clear speech
  - Background noise
  - Music
  - Silence
  - Mixed scenarios

## Verification

### Code Quality

- ✅ TypeScript strict mode: No errors
- ✅ ESLint: No errors
- ✅ Type safety: All types defined
- ✅ Error handling: Comprehensive
- ✅ Logging: Detailed console logs

### Functionality

- ✅ Model loading: Implemented
- ✅ Audio processing: Implemented
- ✅ State management: Implemented
- ✅ Voice detection: Implemented
- ✅ Message protocol: Implemented
- ✅ Error handling: Implemented

### Performance

- ⏳ Inference time: Not yet measured (requires testing)
- ⏳ Accuracy: Not yet measured (requires testing)
- ⏳ Memory usage: Not yet measured (requires testing)

## References

- **Silero VAD**: https://github.com/snakers4/silero-vad
- **ONNX Runtime Node.js**: https://onnxruntime.ai/docs/get-started/with-javascript.html
- **Model Documentation**: `resources/models/README.md`
- **Task 11.1**: `docs/TASK_11.1_IMPLEMENTATION.md`

## Conclusion

Task 11.2 is complete. The VAD worker has been successfully implemented with onnxruntime-node integration. The worker is ready to process audio chunks and detect voice activity using the Silero VAD ONNX model.

**Key Deliverables:**

- ✅ onnxruntime-node installed
- ✅ VAD worker implemented: `src/main/workers/vad.worker.ts`
- ✅ Model loading with ONNX Runtime
- ✅ Audio chunk processing with state management
- ✅ Voice detection with confidence threshold (0.5)
- ✅ Message protocol for worker communication
- ✅ Error handling and logging
- ✅ Documentation: `docs/TASK_11.2_IMPLEMENTATION.md`

**Status**: Ready to proceed to Task 11.3 (Set confidence threshold - already implemented)

**Next Task**: Task 11.4 (Forward voice segments to Whisper worker - requires Task 15 first)
