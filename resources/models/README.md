# AI Models Directory

This directory contains the AI models used by PiyAPI Notes for transcription and note expansion.

## Directory Structure

```
resources/models/
├── README.md                      # This file
├── moonshine-base.onnx            # Moonshine Base ASR model (~250MB)
├── moonshine-preprocess.onnx      # Moonshine preprocessor (~10MB)
├── moonshine-checksums.json       # SHA-256 checksums for verification
├── ggml-turbo.bin                 # Whisper turbo model (~1.6GB)
├── whisper-checksums.json         # SHA-256 checksums for verification
└── .gitignore                     # Ignore model files in git
```

## Models

### 1. Moonshine Base (ONNX)

**Purpose:** Speech recognition for mid/low-tier hardware

**Files:**

- `moonshine-base.onnx` (~250MB)
- `moonshine-preprocess.onnx` (~10MB)

**Specs:**

- Speed: 290x real-time (10s → 34ms)
- RAM: ~300MB
- WER: 12%
- Language: English only
- Best for: 8-12GB RAM systems

**Source:** https://huggingface.co/UsefulSensors/moonshine

**Download:**

```bash
node scripts/download-moonshine-model.js
```

### 2. Whisper Turbo (GGML)

**Purpose:** Speech recognition for high-tier hardware

**Files:**

- `ggml-turbo.bin` (~1.6GB)

**Specs:**

- Speed: 51.8x real-time (30s → 0.58s)
- RAM: ~1.5GB
- WER: 8%
- Language: Multilingual (99 languages)
- Best for: 16GB+ RAM systems

**Source:** https://huggingface.co/ggerganov/whisper.cpp

**Download:**

```bash
node scripts/download-whisper-turbo.js
```

## Hardware Tier Strategy

| Tier | RAM   | ASR Model              | LLM Model         | Total RAM |
| ---- | ----- | ---------------------- | ----------------- | --------- |
| High | 16GB+ | Whisper turbo (1.5GB)  | Qwen 3B (2.2GB)   | 3.7GB     |
| Mid  | 12GB  | Moonshine Base (300MB) | Qwen 3B (2.2GB)   | 2.5GB     |
| Low  | 8GB   | Moonshine Base (300MB) | Qwen 1.5B (1.1GB) | 1.4GB     |

## Model Selection Logic

The app automatically selects the appropriate model based on available RAM:

```typescript
function selectASRModel(): 'whisper-turbo' | 'moonshine-base' {
  const totalRAM = os.totalmem() / 1024 / 1024 / 1024 // GB

  if (totalRAM >= 16) {
    return 'whisper-turbo' // High tier
  } else {
    return 'moonshine-base' // Mid/Low tier
  }
}
```

## First Launch Download

On first launch, the app:

1. Detects hardware tier (high/mid/low)
2. Downloads appropriate ASR model
3. Shows progress indicator
4. Verifies model integrity (SHA-256 checksum)
5. Stores model in this directory

## Model Verification

Models are verified using SHA-256 checksums:

```bash
# Verify Moonshine Base
sha256sum moonshine-base.onnx
sha256sum moonshine-preprocess.onnx

# Verify Whisper turbo
sha256sum ggml-turbo.bin
```

Checksums are stored in:

- `moonshine-checksums.json`
- `whisper-checksums.json`

## Storage Requirements

| Model          | Disk Space | RAM Usage                       |
| -------------- | ---------- | ------------------------------- |
| Moonshine Base | ~260MB     | ~300MB                          |
| Whisper turbo  | ~1.6GB     | ~1.5GB                          |
| Both           | ~1.86GB    | N/A (only one loaded at a time) |

## Git Ignore

Model files are excluded from git to keep repository size small:

```gitignore
# AI Models (downloaded on first launch)
*.onnx
*.bin
*.ggml
*-checksums.json
```

Users download models on first launch instead of bundling them in the app.

## Troubleshooting

### Models Not Found

**Symptom:** Error: "Model file not found"

**Solutions:**

1. Run download script: `node scripts/download-moonshine-model.js`
2. Check this directory exists: `ls resources/models/`
3. Verify file permissions
4. Re-download if corrupted

### Checksum Mismatch

**Symptom:** Error: "Checksum verification failed"

**Solutions:**

1. Delete corrupted file
2. Re-run download script
3. Check internet connection during download
4. Verify disk space available

### Out of Disk Space

**Symptom:** Download fails with "ENOSPC" error

**Solutions:**

1. Free up disk space (need ~2GB)
2. Delete old model files if upgrading
3. Use cloud transcription instead

## Manual Download

If automatic download fails, download manually:

### Moonshine Base

1. Download from: https://huggingface.co/UsefulSensors/moonshine/tree/main/onnx
2. Files needed:
   - `base.onnx` → rename to `moonshine-base.onnx`
   - `preprocess.onnx` → rename to `moonshine-preprocess.onnx`
3. Place in this directory

### Whisper Turbo

1. Download from: https://huggingface.co/ggerganov/whisper.cpp/tree/main
2. File needed: `ggml-turbo.bin`
3. Place in this directory

## Model Updates

When updating models:

1. Download new version
2. Verify checksum
3. Replace old file
4. Update checksum file
5. Test with sample audio
6. Document changes in changelog

## Performance Monitoring

Track model performance:

```typescript
interface ModelMetrics {
  modelName: string
  inferenceTime: number // ms
  audioLength: number // seconds
  realTimeFactor: number // audioLength / (inferenceTime / 1000)
  memoryUsage: number // MB
  accuracy: number // WER %
}
```

## References

- Moonshine: https://github.com/usefulsensors/moonshine
- Whisper.cpp: https://github.com/ggerganov/whisper.cpp
- ONNX Runtime: https://onnxruntime.ai/
- Hardware Tier Detection: `docs/TASK_16.1-16.6_HARDWARE_TIER_DETECTION.md`
