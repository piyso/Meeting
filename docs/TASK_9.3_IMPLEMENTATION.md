# Task 9.3 Implementation: Screen Recording Permission Dialog

## Overview

Implemented a user-friendly dialog component to guide macOS users when Screen Recording permission is denied. The dialog provides clear instructions, a quick action button to open System Settings, and fallback options.

## Files Created

### 1. `src/renderer/components/ScreenRecordingPermissionDialog.tsx`

React component that displays when Screen Recording permission is denied on macOS.

**Features:**

- Clear explanation of why permission is needed
- Step-by-step instructions to grant permission
- "Open System Settings" button that directly opens macOS System Settings
- Two fallback options:
  - Use Microphone (captures user's voice only)
  - Use Cloud Transcription (requires internet)
- "Why This Permission?" information section
- Links to documentation and Apple Support
- Consistent styling with StereoMixErrorDialog
- Full dark mode support
- Responsive design for different screen sizes

### 2. `src/renderer/components/ScreenRecordingPermissionDialog.css`

Styling for the dialog component with:

- Modern, clean design
- Consistent with StereoMixErrorDialog styling
- Dark mode support
- Responsive layout
- Accessible color contrast

### 3. Updated `src/types/ipc.ts`

Added `ScreenRecordingGuidance` interface:

```typescript
export interface ScreenRecordingGuidance {
  title: string
  steps: string[]
  link?: string
}
```

Updated `ElectronAPI` interface to include:

- `audio.getScreenRecordingPermission()` - Returns permission status and guidance
- `audio.openScreenRecordingSettings()` - Opens macOS System Settings
- `shell.openExternal(url)` - Opens external URLs in default browser

### 4. Updated `electron/preload.ts`

Added shell API for opening external URLs:

```typescript
shell: {
  openExternal: (url: string) => Promise<IPCResponse<void>>
}
```

### 5. Updated `src/main/ipc/handlers/audio.handlers.ts`

Added `shell:openExternal` IPC handler with URL validation:

- Only allows HTTP and HTTPS URLs
- Prevents security issues from malicious URLs
- Returns success/error response

## Usage Example

```typescript
import React, { useState } from 'react'
import { ScreenRecordingPermissionDialog } from './components/ScreenRecordingPermissionDialog'
import type { ScreenRecordingGuidance } from '../types/ipc'

export const AudioCapture: React.FC = () => {
  const [showDialog, setShowDialog] = useState(false)
  const [guidance, setGuidance] = useState<ScreenRecordingGuidance | null>(null)

  const checkPermission = async () => {
    const result = await window.electronAPI.audio.getScreenRecordingPermission()

    if (result.success && result.data.status === 'denied' && result.data.guidance) {
      setGuidance(result.data.guidance)
      setShowDialog(true)
    }
  }

  const handleUseMicrophone = () => {
    setShowDialog(false)
    // Switch to microphone capture
    console.log('Switching to microphone capture')
  }

  const handleUseCloud = () => {
    setShowDialog(false)
    // Switch to cloud transcription
    console.log('Switching to cloud transcription')
  }

  return (
    <div>
      <button onClick={checkPermission}>Start Recording</button>

      {showDialog && guidance && (
        <ScreenRecordingPermissionDialog
          guidance={guidance}
          onClose={() => setShowDialog(false)}
          onUseMicrophone={handleUseMicrophone}
          onUseCloud={handleUseCloud}
        />
      )}
    </div>
  )
}
```

## Integration with Audio Pipeline

The dialog should be shown when:

1. User attempts to start recording
2. Screen Recording permission is denied
3. `AudioPipelineService.getScreenRecordingGuidance()` returns status 'denied'

Example integration:

```typescript
// In your audio capture component
const startRecording = async () => {
  try {
    const result = await window.electronAPI.audio.startCapture({
      meetingId: currentMeetingId,
      preferredSource: 'system',
    })

    if (!result.success && result.error?.code === 'PERMISSION_DENIED') {
      // Get guidance from the service
      const guidanceResult = await window.electronAPI.audio.getScreenRecordingPermission()

      if (guidanceResult.success && guidanceResult.data.guidance) {
        setGuidance(guidanceResult.data.guidance)
        setShowPermissionDialog(true)
      }
    }
  } catch (error) {
    console.error('Failed to start recording:', error)
  }
}
```

## Testing Checklist

- [x] Component renders correctly
- [x] "Open System Settings" button calls IPC handler
- [x] "Use Microphone" button triggers callback
- [x] "Use Cloud Transcription" button triggers callback
- [x] Close button dismisses dialog
- [x] External links open in browser
- [x] Dark mode styling works
- [x] Responsive layout on different screen sizes
- [ ] Test on macOS with permission denied (requires macOS machine)
- [ ] Verify System Settings opens to correct panel
- [ ] Test fallback options work correctly

## Design Decisions

1. **Consistent Styling**: Used the same design pattern as `StereoMixErrorDialog` for consistency across the app.

2. **Clear Explanation**: Added "Why This Permission?" section to explain that macOS requires Screen Recording permission for system audio capture, and that the app only captures audio, not screen visuals.

3. **Multiple Options**: Provided three paths forward:
   - Grant permission (recommended)
   - Use microphone (fallback)
   - Use cloud transcription (fallback)

4. **Security**: Added URL validation in the shell handler to only allow HTTP/HTTPS URLs.

5. **Documentation Links**: Included links to both app documentation and Apple's official support article.

## Next Steps

1. Integrate the dialog into the main audio capture flow
2. Test on macOS with permission denied
3. Add analytics to track how often users encounter this dialog
4. Consider adding a "Don't show again" option for users who prefer microphone capture
5. Add telemetry to understand which fallback option users choose most often

## Related Tasks

- Task 9.1: Implement getDisplayMedia audio capture ✅
- Task 9.2: Detect Screen Recording permission status ✅
- Task 9.3: Guide user to System Settings if permission denied ✅ (This task)
- Task 9.4: Implement microphone fallback (Next)
- Task 9.5: Test on Intel Mac, M1, M2, M3 (Pending)

## Notes

- The dialog is macOS-specific and should only be shown on macOS systems
- The `x-apple.systempreferences:` URL scheme works on macOS 13+ (Ventura and later)
- For older macOS versions, the URL may need to be adjusted
- The component is fully typed with TypeScript for type safety
- All IPC handlers return `IPCResponse<T>` for consistent error handling
