# Worker Threads

This directory contains worker thread implementations for CPU-intensive tasks.

## Workers

### VAD Worker

- **Purpose**: Voice Activity Detection
- **Model**: Silero VAD (<1MB ONNX)
- **Performance**: <10ms inference per chunk
- **Reduces**: Transcription workload by ~40%

### Whisper Worker

- **Purpose**: Audio transcription
- **Model**: distil-small.en (340MB, quantized q5_0)
- **Performance**: 6x real-time on M1, 3-4x on Intel
- **RAM**: ~1.2GB during transcription

### Phi-3 Worker

- **Purpose**: Note expansion via Ollama
- **Model**: phi3:mini (2.3GB)
- **Performance**: <3s for 500-token expansion
- **RAM**: ~2.3GB when loaded
- **Lazy Loading**: Loads on first use, unloads after 60s idle
