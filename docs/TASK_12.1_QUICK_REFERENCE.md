# Task 12.1 Quick Reference

## What Was Implemented

✅ **Audio Test UI Component** with:

- Test Audio Capture button
- Real-time audio level meter
- Visual test phase indicators
- Comprehensive test results display
- Platform-specific guidance

## Files Created

```
src/renderer/components/
├── AudioTestUI.tsx          # Main audio test component
├── AudioTestUI.css          # Styling for audio test UI
├── Settings.tsx             # Settings page with audio test
└── Settings.css             # Settings page styling

docs/
├── TASK_12.1_AUDIO_TEST_UI.md      # Full documentation
└── TASK_12.1_QUICK_REFERENCE.md    # This file
```

## Files Modified

```
src/renderer/
├── App.tsx                  # Added navigation and settings view
└── App.css                  # Added navigation and button styles
```

## How to Use

### For Users

1. Launch the application
2. Click "Settings" in the navigation bar (or "Test Audio Capture" on home)
3. Click "Test Audio Capture" button
4. Watch the real-time audio level meter
5. Review test results
6. Follow guidance if issues detected

### For Developers

```typescript
import { AudioTestUI } from './components/AudioTestUI'

// Basic usage
<AudioTestUI />

// With callback
<AudioTestUI
  onTestComplete={(result) => {
    console.log('Test completed:', result)
  }}
/>

// In settings page
<AudioTestUI showInSettings={true} />
```

## Component Props

```typescript
interface AudioTestUIProps {
  onTestComplete?: (result: PreFlightTestResult) => void
  showInSettings?: boolean // Adjusts styling for settings context
}
```

## IPC Integration

The component uses these IPC methods:

```typescript
// Run pre-flight test
window.electronAPI.audio.preFlightTest()

// Listen to audio events
window.electronAPI.on.audioEvent(callback)

// Open system settings
window.electronAPI.audio.openSoundSettings()
window.electronAPI.audio.openScreenRecordingSettings()
```

## Visual Features

### Audio Level Meter

- **Green** (0-40%): Normal audio levels
- **Orange** (40-70%): Moderate levels
- **Red** (70-100%): High levels
- Animated shimmer effect
- Real-time updates at 60fps

### Test Phases

1. **System Audio Testing** - Tests system audio capture
2. **Microphone Testing** - Tests microphone capture
3. **Complete** - Shows results and recommendations

### Results Display

- ✅ Available / ❌ Not Available indicators
- Error messages with details
- Recommendation for best audio source
- Platform-specific setup guidance

## Platform-Specific Behavior

### Windows

- Tests Stereo Mix availability
- Provides Stereo Mix enablement guide
- "Open Sound Settings" button

### macOS

- Tests Screen Recording permission
- Provides permission grant guide
- "Open System Settings" button

## Styling

### CSS Classes

```css
.audio-test-ui              /* Main container */
.audio-test-header          /* Title and description */
.audio-test-actions         /* Button container */
.btn-test-audio            /* Primary test button */
.audio-level-meter         /* Level meter container */
.meter-bar                 /* Progress bar */
.meter-fill                /* Animated fill */
.test-phase-indicator      /* Phase steps */
.audio-test-results        /* Results container */
.result-item               /* Individual result */
.result-recommendation     /* Recommendation box */
.result-guidance           /* Setup guidance */
```

### Dark Mode

- Automatically adapts to system preference
- Uses `@media (prefers-color-scheme: dark)`
- All colors adjusted for dark backgrounds

### Responsive

- Desktop: Full layout
- Tablet (< 768px): Stacked layout
- Mobile: Single column, full-width buttons

## Testing Checklist

### Manual Testing

- [ ] Button click starts test
- [ ] Audio level meter appears and updates
- [ ] Test phases transition correctly
- [ ] Results display after completion
- [ ] "Test Again" resets state
- [ ] Error messages display correctly
- [ ] Settings button opens system settings
- [ ] Dark mode works correctly
- [ ] Responsive layout works on mobile

### Platform Testing

- [ ] Windows: Stereo Mix detection works
- [ ] Windows: Sound settings opens
- [ ] macOS: Permission detection works
- [ ] macOS: System Settings opens

## Known Issues

1. **Audio Level Updates**: Currently simulated - needs AudioPipelineService implementation
2. **Pre-Flight Test**: Uses stubbed IPC handlers - needs full backend
3. **Device Selection**: Only tests default devices currently

## Next Steps

To complete the full audio test functionality:

1. **Task 12.2**: Implement system audio testing in AudioPipelineService
2. **Task 12.3**: Implement microphone testing in AudioPipelineService
3. **Task 12.4**: Connect real-time audio level reporting
4. **Task 12.5**: Enhance platform-specific guidance
5. **Task 12.6**: Add test result persistence to database

## Related Documentation

- [Full Implementation Guide](./TASK_12.1_AUDIO_TEST_UI.md)
- [IPC Architecture](../src/main/IPC_ARCHITECTURE.md)
- [Audio Implementation](../src/main/services/AUDIO_IMPLEMENTATION.md)
- [Design Document](../.kiro/specs/piyapi-notes/design.md)

## Quick Commands

```bash
# Run type check
npm run type-check

# Run linter
npm run lint

# Start dev server
npm run dev

# Build for production
npm run build
```

## Support

For issues or questions:

1. Check [TASK_12.1_AUDIO_TEST_UI.md](./TASK_12.1_AUDIO_TEST_UI.md)
2. Review [IPC_ARCHITECTURE.md](../src/main/IPC_ARCHITECTURE.md)
3. Check existing audio components in `src/renderer/components/`
