# Task 9.6: External Audio Devices - Quick Reference

## Overview

Quick reference for external audio device support in PiyAPI Notes.

## Device Types

| Device Type      | Connection       | Latency  | Examples                         |
| ---------------- | ---------------- | -------- | -------------------------------- |
| Built-in         | Internal         | <50ms    | Built-in Speakers, Realtek Audio |
| External Monitor | HDMI/DisplayPort | <50ms    | LG HDMI Audio, Dell Monitor      |
| Bluetooth        | Wireless         | 50-200ms | AirPods, Bluetooth Speaker       |
| USB              | Wired            | <50ms    | USB DAC, USB Headphones          |

## API Quick Reference

### Enumerate Audio Devices

```typescript
const audioService = getAudioPipelineService()
const devices = await audioService.enumerateAudioSources()

// Each device has:
// - id: string
// - label: string
// - kind: 'system' | 'microphone'
// - isDefault: boolean
// - isAvailable: boolean
// - deviceType: 'built-in' | 'external-monitor' | 'bluetooth' | 'usb' | 'unknown'
// - connectionType: 'hdmi' | 'displayport' | 'bluetooth' | 'usb' | 'internal' | 'unknown'
```

### Get Detailed Device Info

```typescript
const info = await audioService.getDetailedDeviceInfo()

// Returns:
// - devices: AudioDevice[]
// - currentDevice?: AudioDevice
// - deviceSwitchCount: number
// - platform: string
// - recommendations: string[]
```

### Test Audio Device

```typescript
const result = await audioService.testAudioDevice(deviceId)

// Returns:
// - success: boolean
// - deviceInfo: AudioDevice | null
// - error?: string
// - latency?: number
```

### Handle Device Switch

```typescript
audioService.handleDeviceSwitch(newDevice)

// Logs device switch with timestamp
// Increments switch counter
// Updates current device
```

### Get Device Switch History

```typescript
const history = audioService.getDeviceSwitchHistory()

// Returns array of:
// - timestamp: number
// - from: string
// - to: string
```

## Platform Differences

### macOS

- Uses Screen Recording permission for system audio
- Reports single "System Audio" source
- Device switching handled by OS automatically
- No additional configuration needed

### Windows

- Uses WASAPI loopback or Stereo Mix
- Enumerates multiple audio sources
- Requires Stereo Mix to be enabled
- Device switching may require manual intervention

## Device Detection Patterns

### Bluetooth

Keywords: `airpods`, `bluetooth`, `wireless`, `bt`

### External Monitor

Keywords: `hdmi`, `display`, `monitor`, `lg`, `samsung`, `dell`, `hp`

### USB

Keywords: `usb`, `external`

### Built-in

Keywords: `built-in`, `internal`, `realtek`, `speakers`

## Common Issues

### macOS

**No audio captured**

- Check Screen Recording permission
- Restart application

**AirPods not working**

- Verify AirPods are connected
- Set as output device in System Settings

### Windows

**No audio captured**

- Enable Stereo Mix in Sound settings
- Set Stereo Mix as default recording device

**Bluetooth audio not working**

- Verify Bluetooth device is connected
- Set as output device in Settings

## Testing Checklist

- [ ] AirPods on macOS
- [ ] External monitor (HDMI) on macOS
- [ ] Device switching on macOS
- [ ] Bluetooth speaker on Windows
- [ ] External monitor (HDMI) on Windows
- [ ] Device switching on Windows
- [ ] USB audio device
- [ ] Device enumeration
- [ ] Detailed device info API
- [ ] Device testing API

## Files Modified

- `src/types/ipc.ts` - Added deviceType and connectionType fields
- `src/main/services/AudioPipelineService.ts` - Added device detection and switching support

## Files Created

- `docs/TASK_9.6_EXTERNAL_DEVICES.md` - Comprehensive documentation
- `tests/TASK_9.6_MANUAL_TEST_GUIDE.md` - Manual testing guide
- `src/main/services/__tests__/AudioPipelineService.externalDevices.test.ts` - Automated tests

## Next Steps

1. Run manual tests on macOS and Windows
2. Test with AirPods, external monitors, USB audio
3. Document any device-specific issues
4. Mark Task 9.6 as complete
5. Proceed to Task 9.7 (Permission request flow UI)
