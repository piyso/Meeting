# Audio Pipeline Service Implementation

## Task 8.1: Desktop Capturer Audio Enumeration

### Implementation Summary

This implementation provides the foundation for Windows system audio capture using Electron's `desktopCapturer` API.

### Files Created

1. **src/main/services/AudioPipelineService.ts**
   - Singleton service for managing audio capture operations
   - Implements audio source enumeration using `desktopCapturer.getSources()`
   - Provides methods for detecting system audio and microphone devices
   - Includes Stereo Mix availability detection for Windows

2. **src/main/ipc/handlers/audio.handlers.ts**
   - IPC handlers for audio operations
   - Implements `audio:listDevices` - Lists all available audio sources
   - Implements `audio:preFlightTest` - Tests audio device availability
   - Stubs for `audio:startCapture`, `audio:stopCapture`, `audio:getStatus` (to be implemented in subsequent tasks)

3. **src/main/ipc/setup.ts** (updated)
   - Registered audio handlers in the IPC setup

### Key Features

#### 1. Audio Source Enumeration

```typescript
const service = getAudioPipelineService()
const devices = await service.enumerateAudioSources()
```

- Uses `desktopCapturer.getSources()` with types `['screen', 'window']`
- Filters for screen sources that can capture system audio
- Returns array of `AudioDevice` objects with:
  - `id`: Unique device identifier
  - `label`: Human-readable device name
  - `kind`: 'system' or 'microphone'
  - `isDefault`: Whether it's the default device
  - `isAvailable`: Whether the device is currently available

#### 2. Stereo Mix Detection

```typescript
const available = await service.isStereoMixAvailable()
```

- Checks if system audio capture is available
- On Windows, this indicates if Stereo Mix or similar is enabled
- Returns boolean indicating availability

#### 3. Default Device Detection

```typescript
const systemDevice = await service.getDefaultSystemAudioDevice()
const micDevice = await service.getDefaultMicrophoneDevice()
```

- Gets the first available system audio device
- Gets the first available microphone device
- Returns `AudioDevice | null`

#### 4. Pre-Flight Testing

```typescript
// Via IPC from renderer
const result = await window.electronAPI.audio.preFlightTest()
```

- Tests both system audio and microphone availability
- Provides recommendations: 'system', 'microphone', or 'cloud'
- Returns detailed test results with error messages

### IPC API

#### List Audio Devices

```typescript
const response = await window.electronAPI.audio.listDevices()
if (response.success) {
  console.log('Available devices:', response.data)
}
```

#### Pre-Flight Test

```typescript
const response = await window.electronAPI.audio.preFlightTest()
if (response.success) {
  const { systemAudio, microphone, recommendation } = response.data
  console.log('System audio available:', systemAudio.available)
  console.log('Microphone available:', microphone.available)
  console.log('Recommendation:', recommendation)
}
```

### Testing

#### Manual Testing

1. **Test Audio Enumeration**
   - Open Electron DevTools console
   - Run: `await window.electronAPI.audio.listDevices()`
   - Verify: Should return list of screen sources

2. **Test Pre-Flight**
   - Run: `await window.electronAPI.audio.preFlightTest()`
   - Verify: Should show system audio and microphone availability
   - On Windows without Stereo Mix: Should recommend microphone or cloud

3. **Test on Different Platforms**
   - Windows: Should detect screen sources for system audio
   - macOS: Should detect screen sources (requires Screen Recording permission)
   - Linux: Should detect screen sources

#### Expected Behavior

**Windows (with Stereo Mix enabled):**

```json
{
  "success": true,
  "data": [
    {
      "id": "screen:0:0",
      "label": "Entire Screen (System Audio)",
      "kind": "system",
      "isDefault": false,
      "isAvailable": true
    }
  ]
}
```

**Windows (without Stereo Mix):**

```json
{
  "success": true,
  "data": []
}
```

**Pre-Flight Test Result:**

```json
{
  "success": true,
  "data": {
    "systemAudio": {
      "available": true,
      "tested": true
    },
    "microphone": {
      "available": true,
      "tested": true
    },
    "recommendation": "system"
  }
}
```

### Implementation Notes

1. **desktopCapturer API Limitation**
   - `desktopCapturer.getSources()` only supports `['screen', 'window']` types
   - There is no 'audio' type in the current Electron API
   - We enumerate screen sources which can capture system audio via WASAPI on Windows

2. **Platform-Specific Behavior**
   - **Windows**: Screen capture includes system audio via WASAPI loopback
   - **macOS**: Requires Screen Recording permission for system audio
   - **Linux**: Varies by desktop environment and PulseAudio/PipeWire setup

3. **Stereo Mix Detection**
   - On Windows, Stereo Mix must be enabled in Sound settings
   - The service checks for system audio availability
   - If unavailable, the app will fall back to microphone capture

4. **Future Tasks**
   - Task 8.2: Detect Stereo Mix availability (partially implemented)
   - Task 8.3: Implement actual audio capture via WASAPI
   - Task 8.4: Handle "Stereo Mix not enabled" error with user guidance
   - Task 8.5: Implement microphone fallback
   - Task 8.6: Test on multiple Windows machines
   - Task 8.7: Create user guidance for enabling Stereo Mix

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Renderer Process                         │
│  window.electronAPI.audio.listDevices()                     │
│  window.electronAPI.audio.preFlightTest()                   │
└────────────────────────┬────────────────────────────────────┘
                         │ IPC
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                      Main Process                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  audio.handlers.ts                                    │  │
│  │  - audio:listDevices                                  │  │
│  │  - audio:preFlightTest                                │  │
│  │  - audio:startCapture (stub)                          │  │
│  │  - audio:stopCapture (stub)                           │  │
│  │  - audio:getStatus (stub)                             │  │
│  └────────────────────┬─────────────────────────────────┘  │
│                       │                                      │
│                       ▼                                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  AudioPipelineService                                 │  │
│  │  - enumerateAudioSources()                            │  │
│  │  - isStereoMixAvailable()                             │  │
│  │  - getDefaultSystemAudioDevice()                      │  │
│  │  - getDefaultMicrophoneDevice()                       │  │
│  └────────────────────┬─────────────────────────────────┘  │
│                       │                                      │
│                       ▼                                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Electron desktopCapturer API                         │  │
│  │  desktopCapturer.getSources({ types: ['screen'] })   │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Next Steps

1. **Task 8.2**: Implement Stereo Mix detection with better heuristics
2. **Task 8.3**: Implement actual audio capture using AudioWorklet
3. **Task 8.4**: Add user guidance UI for enabling Stereo Mix
4. **Task 8.5**: Implement microphone fallback logic
5. **Task 8.6**: Test on multiple Windows machines with different audio drivers
6. **Task 8.7**: Create comprehensive user documentation

### Related Requirements

- **Requirement 1.1**: Audio capture from system output and microphone
- **Requirement 1.2**: Platform-specific APIs (WASAPI for Windows)
- **Requirement 1.9**: Error handling with specific error messages
- **Requirement 1.10**: Pre-flight audio test
- **Requirement 1.12**: Fallback chain implementation
