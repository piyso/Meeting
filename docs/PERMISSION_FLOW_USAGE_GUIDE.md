# Permission Flow Usage Guide

## Quick Start

This guide shows you how to integrate the permission request flow into your audio capture workflow.

## Basic Integration (3 Steps)

### Step 1: Import Components

```typescript
import { PermissionRequestFlow } from './components/PermissionRequestFlow'
import { ScreenRecordingPermissionDialog } from './components/ScreenRecordingPermissionDialog'
```

### Step 2: Add State

```typescript
const [showPermissionFlow, setShowPermissionFlow] = useState(false)
const [showPermissionDialog, setShowPermissionDialog] = useState(false)
const [guidance, setGuidance] = useState<ScreenRecordingGuidance | null>(null)
```

### Step 3: Check Permission Before Recording

```typescript
const startRecording = async () => {
  // Only check on macOS
  if (window.electronAPI?.platform === 'darwin') {
    const result = await window.electronAPI.audio.getScreenRecordingPermission()

    if (result.success && result.data) {
      const { status, guidance } = result.data

      // Show appropriate UI based on status
      if (status === 'not-determined') {
        setShowPermissionFlow(true)
        return
      }

      if (status === 'denied') {
        setGuidance(guidance)
        setShowPermissionDialog(true)
        return
      }
    }
  }

  // Permission granted or not applicable - start capture
  await startCapture()
}
```

### Step 4: Render Components

```typescript
return (
  <div>
    <button onClick={startRecording}>Start Recording</button>

    {/* Permission Request Flow (not-determined state) */}
    {showPermissionFlow && (
      <PermissionRequestFlow
        onGranted={() => {
          setShowPermissionFlow(false)
          startCapture('system')
        }}
        onSkip={() => {
          setShowPermissionFlow(false)
          startCapture('microphone')
        }}
        onClose={() => setShowPermissionFlow(false)}
      />
    )}

    {/* Permission Dialog (denied state) */}
    {showPermissionDialog && guidance && (
      <ScreenRecordingPermissionDialog
        guidance={guidance}
        onClose={() => setShowPermissionDialog(false)}
        onUseMicrophone={() => {
          setShowPermissionDialog(false)
          startCapture('microphone')
        }}
        onUseCloud={() => {
          setShowPermissionDialog(false)
          startCapture('cloud')
        }}
      />
    )}
  </div>
)
```

## Complete Example

See `src/renderer/components/AudioCaptureWithPermissions.tsx` for a complete, production-ready example.

## Testing

Use `PermissionFlowDemo` component to test the UI without triggering actual audio capture:

```typescript
import { PermissionFlowDemo } from './components/PermissionFlowDemo'

// In your app
<PermissionFlowDemo />
```

## Permission States

| State          | Component                       | User Action                    |
| -------------- | ------------------------------- | ------------------------------ |
| not-determined | PermissionRequestFlow           | Grant or Skip                  |
| denied         | ScreenRecordingPermissionDialog | Enable in Settings or Fallback |
| granted        | None (auto-proceed)             | N/A                            |
| not-applicable | None (auto-proceed)             | N/A                            |
| unknown        | PermissionRequestFlow (error)   | Retry                          |

## User Flow Diagram

```
User clicks "Start Recording"
         |
         v
    Is macOS? ----No----> Start capture
         |
        Yes
         |
         v
Check permission status
         |
         +-- not-determined --> PermissionRequestFlow
         |                            |
         |                            +-- Grant --> Open Settings --> User enables --> Start capture
         |                            |
         |                            +-- Skip --> Start microphone capture
         |
         +-- denied --> ScreenRecordingPermissionDialog
         |                     |
         |                     +-- Open Settings --> User enables --> Start capture
         |                     |
         |                     +-- Use Microphone --> Start microphone capture
         |                     |
         |                     +-- Use Cloud --> Start cloud transcription
         |
         +-- granted --> Start capture
```

## Customization

### Change Button Text

Edit the component files to customize button text:

```typescript
// In PermissionRequestFlow.tsx
<button className="primary-button" onClick={handleRequestPermission}>
  Grant Permission // Change this
</button>
```

### Change Colors

Edit the CSS files to customize colors:

```css
/* In PermissionRequestFlow.css */
.primary-button {
  background-color: #2563eb; /* Change this */
}
```

### Add Analytics

Add tracking to callbacks:

```typescript
<PermissionRequestFlow
  onGranted={() => {
    analytics.track('permission_granted')
    startCapture('system')
  }}
  onSkip={() => {
    analytics.track('permission_skipped')
    startCapture('microphone')
  }}
  onClose={() => {
    analytics.track('permission_flow_closed')
  }}
/>
```

## Troubleshooting

### Dialog doesn't show

- Check that `window.electronAPI.audio` is available
- Verify IPC handlers are registered
- Check console for errors

### System Settings doesn't open

- Verify macOS version (13+ recommended)
- Check IPC handler for `audio:openScreenRecordingSettings`
- Try manual URL: `x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture`

### Permission status always "unknown"

- Check that `systemPreferences.getMediaAccessStatus('screen')` is available
- Verify running on macOS
- Check AudioPipelineService implementation

## Best Practices

1. **Always check permission before capture**: Don't assume permission is granted
2. **Provide fallback options**: Always offer microphone or cloud alternatives
3. **Clear messaging**: Explain why permission is needed
4. **Test on macOS**: Permission flow is macOS-specific
5. **Handle errors gracefully**: Show error messages, allow retry
6. **Track analytics**: Understand user behavior (grant vs skip rates)

## Resources

- [Implementation Documentation](./TASK_9.7_IMPLEMENTATION.md)
- [Task Summary](./TASK_9.7_SUMMARY.md)
- [Apple Support: Screen Recording Permission](https://support.apple.com/guide/mac-help/control-access-to-screen-recording-mchld6aa7d23/mac)

## Support

For issues or questions:

1. Check the implementation documentation
2. Review the integration example
3. Test with the demo component
4. Check console for errors
5. Verify IPC handlers are working
