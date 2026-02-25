# Task 14.1 Quick Reference: Whisper Turbo Model Download

## Quick Start

Download the Whisper Turbo model for high-tier transcription (16GB+ RAM):

```bash
# Automatic download (recommended)
node scripts/download-models.js
```

That's it! The script will download the 1.6GB model to `resources/models/ggml-large-v3-turbo.bin`.

## What You Get

- **Model**: Whisper Turbo (ggml-large-v3-turbo.bin)
- **Size**: ~1.6GB
- **Performance**: 51.8x real-time (30s audio → 0.58s)
- **Accuracy**: Best (5-7% WER, equivalent to Whisper Large V3)
- **Use Case**: High tier machines (16GB+ RAM)

## Hardware Requirements

### High Tier (Whisper Turbo)

- **RAM**: 16GB+ total system RAM
- **Free RAM**: At least 6GB free during transcription
- **Disk Space**: 2GB free for model storage
- **CPU**: Modern multi-core processor (4+ cores recommended)

### Mid/Low Tier (Moonshine Base - Task 14.2)

- **RAM**: 8-12GB total system RAM
- **Model**: Moonshine Base (300MB) - to be added
- **Performance**: 290x real-time (even faster!)

## Download Options

### Option 1: Node.js Script (Recommended)

```bash
node scripts/download-models.js
```

**Advantages**:

- Cross-platform (Windows, macOS, Linux)
- Progress indicator
- Automatic verification
- Handles redirects

### Option 2: Bash Script (macOS/Linux)

```bash
bash scripts/download-models.sh
```

**Advantages**:

- Native shell script
- Uses curl/wget
- Interactive prompts

### Option 3: Manual Download

If scripts fail, download manually:

1. **URL**: https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin
2. **Save to**: `resources/models/ggml-large-v3-turbo.bin`
3. **Verify**: File should be ~1.6GB

## Verification

Check if the model downloaded correctly:

```bash
# Check file exists and size
ls -lh resources/models/ggml-large-v3-turbo.bin

# Expected output:
# -rw-r--r--  1 user  staff   1.6G  Feb 24 15:30 ggml-large-v3-turbo.bin
```

## What Happens Next

After downloading:

1. **First Launch**: App detects your hardware tier (High/Mid/Low)
2. **High Tier (16GB+)**: Uses Whisper Turbo automatically
3. **Mid/Low Tier (8-12GB)**: Uses Moonshine Base (Task 14.2)
4. **Transcription**: Model loads on first meeting, stays loaded during recording

## Performance Expectations

### Whisper Turbo (High Tier)

- **10-second chunk**: ~0.2 seconds processing
- **30-second chunk**: ~0.58 seconds processing
- **Real-time lag**: <2 seconds
- **Accuracy**: Best (5-7% WER)

### Moonshine Base (Mid/Low Tier)

- **10-second chunk**: ~34ms processing
- **Real-time lag**: <0.5 seconds
- **Accuracy**: Good (12% WER)

## Troubleshooting

### Download Fails

**Problem**: Script fails to download

**Solutions**:

1. Check internet connection (1.6GB download)
2. Try manual download (see Option 3 above)
3. Check disk space (need 2GB free)
4. Verify HuggingFace is accessible

### Model Not Found

**Problem**: App can't find the model

**Solutions**:

1. Verify file exists: `ls resources/models/ggml-large-v3-turbo.bin`
2. Check file size: Should be ~1.6GB
3. Re-run download script
4. Check file permissions (should be readable)

### Out of Memory

**Problem**: App crashes during transcription

**Solutions**:

1. Check total RAM: Need 16GB+ for Whisper Turbo
2. Close other applications
3. Use Moonshine Base instead (300MB RAM)
4. Enable cloud transcription (Deepgram API)

## Next Steps

After Task 14.1:

1. **Task 14.2**: Download Moonshine Base model (mid/low tier)
2. **Task 15**: Implement ASR worker with model selection
3. **Task 16**: Implement hardware tier detection

## Files Modified

- ✅ `scripts/download-models.js` - Added Whisper Turbo download
- ✅ `scripts/download-models.sh` - Added Whisper Turbo download
- ✅ `resources/models/README.md` - Documented Whisper Turbo
- ✅ `docs/TASK_14.1_WHISPER_TURBO_SETUP.md` - Full documentation
- ✅ `docs/TASK_14.1_QUICK_REFERENCE.md` - This file

## Resources

- **Full Documentation**: `docs/TASK_14.1_WHISPER_TURBO_SETUP.md`
- **Model README**: `resources/models/README.md`
- **Design Document**: `.kiro/specs/piyapi-notes/design.md`
- **Tasks**: `.kiro/specs/piyapi-notes/tasks.md`

## Status

✅ **Task 14.1 Complete**

Infrastructure is ready. Users should run `node scripts/download-models.js` to download the model.
