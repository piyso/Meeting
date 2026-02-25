# Task 11.1 Quick Reference: Silero VAD Model

## ✅ Status: Complete

## Quick Facts

- **Model**: Silero VAD v5 ONNX
- **Size**: 2.1 MB
- **Location**: `resources/models/silero_vad.onnx`
- **Purpose**: Voice Activity Detection (filters silence, saves 40% CPU)

## Quick Download

```bash
# Option 1: Bash script
./scripts/download-models.sh

# Option 2: Node.js script
node scripts/download-models.js

# Option 3: Manual curl
curl -L -o resources/models/silero_vad.onnx \
  "https://huggingface.co/onnx-community/silero-vad/resolve/main/onnx/model.onnx"
```

## Quick Verify

```bash
ls -lh resources/models/silero_vad.onnx
# Expected: ~2.1M
```

## Model Specs

| Property     | Value                   |
| ------------ | ----------------------- |
| Sample Rates | 8kHz, 16kHz             |
| Input Size   | 512 samples (16kHz)     |
| Output       | Voice probability (0-1) |
| Threshold    | 0.5                     |
| Inference    | <10ms per chunk         |
| Accuracy     | 95%+                    |

## Files Created

```
resources/models/
├── README.md              ✅ Model documentation
└── silero_vad.onnx        ✅ VAD model (2.1 MB)

scripts/
├── download-models.sh     ✅ Bash download script
└── download-models.js     ✅ Node.js download script

docs/
├── TASK_11.1_IMPLEMENTATION.md    ✅ Full implementation guide
└── TASK_11.1_QUICK_REFERENCE.md   ✅ This file
```

## Next Task

**Task 11.2**: Implement VAD worker with onnxruntime-node

- Install `onnxruntime-node`
- Create Worker Thread
- Load model
- Process audio chunks
- Forward voice segments

## Links

- [Full Implementation Guide](./TASK_11.1_IMPLEMENTATION.md)
- [Model Documentation](../resources/models/README.md)
- [Official Silero VAD](https://github.com/snakers4/silero-vad)
