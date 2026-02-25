# Shared Types

This directory contains TypeScript type definitions shared across main, renderer, and workers.

## Type Categories

### Data Models

- **Meeting** - Meeting metadata and state
- **Transcript** - Transcript segments with timestamps
- **Note** - User notes (original + expanded)
- **Entity** - Extracted entities (people, dates, amounts)

### IPC Contracts

- **IPCChannels** - Type-safe IPC channel definitions
- **IPCMessages** - Message payloads for IPC

### Worker Messages

- **AudioWorkerMessage** - Audio pipeline messages
- **VADWorkerMessage** - VAD worker messages
- **WhisperWorkerMessage** - Whisper worker messages
- **Phi3WorkerMessage** - Phi-3 worker messages

### Configuration

- **AudioCaptureConfig** - Audio capture settings
- **TranscriptionConfig** - Whisper configuration
- **NoteExpansionConfig** - Phi-3 configuration
- **SyncConfig** - Sync engine settings
