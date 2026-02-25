# Task 9.2 Implementation: Screen Recording Permission Detection

## Overview

Implemented Screen Recording permission detection for macOS audio capture using Electron's `systemPreferences.getMediaAccessStatus('screen')` API. This enables the application to check permission status before attempting audio capture and provide appropriate user guidance.

## Implementation Details

### 1. AudioPipelineService Updates

Added three key methods to `src/main/services/AudioPipelineService.ts`:

#### `getScreenRecordingPermissionStatus(): string`

- Uses `systemPreferences.getMediaAccessStatus('screen')` on macOS
- Returns permission status: `'not-determined'`, `'denied'`, `'granted'`, or `'not-applicable'` (non-macOS)
- Handles errors gracefully, returning `'unknown'` if check fails

```typescript
public getScreenRecordingPermissionStatus(): string {
  const isMacOS = process.platform === 'darwin'

  if (!isMacOS) {
    return 'not-applicable'
  }

  try {
    const status = systemPreferences.getMediaAccessStatus('screen')
    console.log('Screen Recording permission status:', status)
    return status
  } catch (error) {
    console.error('Failed to check Screen Recording permission:', error)
    return 'unknown'
  }
}
```

#### `hasScreenRecordingPermission(): boolean`

- Convenience method that returns `true` if permission is granted or not applicable
- Used for quick permission checks before capture

#### `getScreenRecordingGuidance()`

- Returns detailed guidance based on current permission status
- Provides user-friendly messages and step-by-step instructions
- Includes deep link to System Settings for easy access

**Permission States Handled:**

1. **granted**: Confirms system audio is available
2. **denied**: Provides steps to grant permission in System Settings
3. **not-determined**: Explains that macOS will prompt when recording starts
4. **not-applicable**: For non-macOS platforms

### 2. IPC Handlers

Added two new IPC handlers in `src/main/ipc/handlers/audio.handlers.ts`:

#### `audio:getScreenRecordingPermission`

- Returns permission status, message, and guidance
- Called by renderer to check permission before starting capture

```typescript
ipcMain.handle('audio:getScreenRecordingPermission', async () => {
  const guidance = audioPipeline.getScreenRecordingGuidance()
  return {
    success: true,
    data: guidance,
  }
})
```

#### `audio:openScreenRecordingSettings`

- Opens macOS System Settings to Screen Recording privacy panel
- Uses deep link: `x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture`

### 3. Preload API

Updated `electron/preload.ts` to expose new methods:

```typescript
audio: {
  // ... existing methods
  getScreenRecordingPermission: () => ipcRenderer.invoke('audio:getScreenRecordingPermission'),
  openScreenRecordingSettings: () => ipcRenderer.invoke('audio:openScreenRecordingSettings'),
}
```

### 4. Type Definitions

Added `AudioChunk` interface to `src/types/ipc.ts`:

```typescript
export interface AudioChunk {
  data: Float32Array
  timestamp: number
  sampleRate: number
}
```

Updated `AudioCaptureStatus` to include:

- `meetingId: string | null`
- `duration: number`
- `chunksReceived: number`

### 5. Permission Check Before Capture

Updated `startCapture()` method to check permission before initializing capture session:

```typescript
public async startCapture(meetingId: string, deviceId?: string): Promise<void> {
  const isMacOS = process.platform === 'darwin'

  if (isMacOS) {
    const permissionStatus = this.getScreenRecordingPermissionStatus()

    if (permissionStatus === 'denied') {
      const guidance = this.getScreenRecordingGuidance()
      throw new Error(`Screen Recording permission denied. ${guidance.message}`)
    }

    if (permissionStatus === 'not-determined') {
      console.log('Permission will be requested when getDisplayMedia is called')
    }
  }

  // Initialize capture session...
}
```

## Permission States and User Experience

### State 1: not-determined

**When**: First time user starts recording
**Behavior**: macOS will show system permission dialog when `getDisplayMedia()` is called
**User Action**: Click "Allow" in system dialog

### State 2: denied

**When**: User previously denied permission or disabled it in System Settings
**Behavior**: App detects denial and shows error with guidance
**User Action**:

1. Click "Open System Settings" button
2. Navigate to Privacy & Security > Screen Recording
3. Enable PiyAPI Notes
4. Restart app

### State 3: granted

**When**: Permission already granted
**Behavior**: Audio capture proceeds normally
**User Action**: None required

## Frontend Integration

Frontend can now check permission status before starting a meeting:

```typescript
// Check permission status
const response = await window.electronAPI.audio.getScreenRecordingPermission()

if (response.success) {
  const { status, message, guidance } = response.data

  if (status === 'denied') {
    // Show error dialog with guidance
    showPermissionError(message, guidance)
  } else if (status === 'not-determined') {
    // Show info: "macOS will prompt for permission"
    showPermissionInfo(message)
  } else if (status === 'granted') {
    // Proceed with recording
    startRecording()
  }
}

// Open System Settings if needed
await window.electronAPI.audio.openScreenRecordingSettings()
```

## Testing Recommendations

### Manual Testing on macOS

1. **Test not-determined state**:
   - Fresh install or reset permissions: `tccutil reset ScreenCapture`
   - Start recording
   - Verify system dialog appears
   - Grant permission
   - Verify recording works

2. **Test denied state**:
   - Deny permission in system dialog OR disable in System Settings
   - Start recording
   - Verify error message with guidance appears
   - Click "Open System Settings"
   - Verify System Settings opens to correct panel
   - Enable permission
   - Restart app
   - Verify recording works

3. **Test granted state**:
   - With permission already granted
   - Start recording
   - Verify no permission prompts
   - Verify audio capture works

### Automated Testing

```typescript
describe('Screen Recording Permission', () => {
  it('should detect permission status on macOS', () => {
    const service = getAudioPipelineService()
    const status = service.getScreenRecordingPermissionStatus()
    expect(['not-determined', 'denied', 'granted']).toContain(status)
  })

  it('should return not-applicable on non-macOS', () => {
    // Mock process.platform
    const status = service.getScreenRecordingPermissionStatus()
    expect(status).toBe('not-applicable')
  })

  it('should provide guidance for denied permission', () => {
    const guidance = service.getScreenRecordingGuidance()
    expect(guidance.status).toBe('denied')
    expect(guidance.guidance.steps).toHaveLength(6)
    expect(guidance.guidance.link).toContain('Privacy_ScreenCapture')
  })
})
```

## Files Modified

1. **src/main/services/AudioPipelineService.ts**
   - Added `getScreenRecordingPermissionStatus()`
   - Added `hasScreenRecordingPermission()`
   - Added `getScreenRecordingGuidance()`
   - Updated `startCapture()` to check permission
   - Updated `enumerateAudioSources()` to reflect permission status

2. **src/main/ipc/handlers/audio.handlers.ts**
   - Added `audio:getScreenRecordingPermission` handler
   - Added `audio:openScreenRecordingSettings` handler

3. **electron/preload.ts**
   - Added `getScreenRecordingPermission()` to audio API
   - Added `openScreenRecordingSettings()` to audio API

4. **src/types/ipc.ts**
   - Added `AudioChunk` interface
   - Updated `AudioCaptureStatus` interface

## API Reference

### Main Process

```typescript
// Get permission status
const status = audioPipeline.getScreenRecordingPermissionStatus()
// Returns: 'not-determined' | 'denied' | 'granted' | 'not-applicable' | 'unknown'

// Check if permission is granted
const hasPermission = audioPipeline.hasScreenRecordingPermission()
// Returns: boolean

// Get user guidance
const guidance = audioPipeline.getScreenRecordingGuidance()
// Returns: { status, message, guidance?: { title, steps, link } }
```

### Renderer Process

```typescript
// Check permission via IPC
const response = await window.electronAPI.audio.getScreenRecordingPermission()
// Returns: IPCResponse<{ status, message, guidance? }>

// Open System Settings
await window.electronAPI.audio.openScreenRecordingSettings()
```

## Next Steps (Task 9.3)

1. Create permission request UI component
2. Add "Open System Settings" button to error dialogs
3. Show permission status indicator in settings
4. Add permission check to pre-flight test
5. Test on multiple macOS versions (11-14)

## Compliance

- ✅ Uses `systemPreferences.getMediaAccessStatus('screen')`
- ✅ Handles all three permission states: 'not-determined', 'denied', 'granted'
- ✅ Provides user guidance for each state
- ✅ Checks permission before attempting capture
- ✅ Opens System Settings with deep link
- ✅ Type-safe IPC communication
- ✅ Error handling for permission check failures

## Status

**Task 9.2: COMPLETE** ✅

Screen Recording permission detection is fully implemented and ready for frontend integration. The app can now detect permission status, provide appropriate guidance, and prevent capture attempts when permission is denied.
