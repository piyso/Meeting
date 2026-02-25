# Task 12.6: Save Test Results for Diagnostics

**Status:** ✅ Complete  
**Date:** 2024  
**Spec:** PiyAPI Notes - Pre-Flight Audio Test (Task 12)

## Overview

Implemented a comprehensive diagnostic logging system that saves audio test results to files for support troubleshooting. The system automatically logs test results, system information, device details, and errors to help diagnose audio capture issues.

## Implementation Summary

### 1. DiagnosticLogger Service (`src/main/services/DiagnosticLogger.ts`)

Created a singleton service that manages diagnostic logging with the following features:

**Core Features:**

- Logs test results with timestamps
- Captures platform and system information
- Records audio device details
- Tracks error messages and stack traces
- Implements log rotation to prevent excessive disk usage
- Stores logs in user-accessible location

**Log Management:**

- Maximum log file size: 10MB
- Maximum log files kept: 5 (oldest deleted automatically)
- Log location: `{userData}/logs/diagnostics.log`
- Log format: JSON lines (one entry per line)

**API Methods:**

- `logAudioTestResult(diagnostic)` - Log complete audio test results
- `logError(error, context)` - Log error information
- `logInfo(message, data)` - Log general information
- `logDeviceInfo(devices)` - Log audio device information
- `exportLogs()` - Export all logs as single JSON file
- `clearLogs()` - Clear all diagnostic logs
- `getLogStats()` - Get statistics about logs
- `getLogDirectory()` - Get path to log directory

### 2. AudioPipelineService Integration

Added `saveDiagnostics()` method to AudioPipelineService that collects and logs:

**System Information:**

- Operating system and version
- Architecture (x64, arm64, etc.)
- Total and free memory

**Audio Test Results:**

- System audio availability and test status
- Microphone availability and test status
- Recommendation (system/microphone/cloud)
- Error messages if any

**Audio Levels:**

- Maximum audio level detected during system audio test
- Maximum audio level detected during microphone test

**Device Information:**

- List of available audio devices
- Device switch history
- Current device configuration

### 3. IPC Handlers (`src/main/ipc/handlers/audio.handlers.ts`)

Added IPC handlers for diagnostic management:

- `audio:exportDiagnostics` - Export logs to JSON file
- `audio:getDiagnosticsPath` - Get log directory path
- `audio:getDiagnosticsStats` - Get log statistics
- `audio:clearDiagnostics` - Clear all logs
- `audio:openDiagnosticsFolder` - Open logs folder in file explorer

**Integration with Pre-Flight Test:**

- Automatically saves diagnostics after each pre-flight test
- Logs are saved even if test fails
- Errors during logging are caught and logged separately

### 4. UI Integration (`src/renderer/components/AudioTestUI.tsx`)

Added diagnostic export section to the test results display:

**UI Elements:**

- "Export Diagnostics" button - Exports logs to JSON file
- "View Logs Folder" button - Opens logs folder in file explorer
- Informational text explaining diagnostic logging

**User Experience:**

- Section appears after test completes
- Clear explanation of what diagnostics are for
- Easy access to export and view logs
- Alert shows export file path on success

### 5. TypeScript Types (`src/types/ipc.ts`)

Added type definitions for diagnostic methods:

```typescript
audio: {
  // ... existing methods ...
  exportDiagnostics: () => Promise<IPCResponse<string>>
  getDiagnosticsPath: () => Promise<IPCResponse<string>>
  getDiagnosticsStats: () =>
    Promise<
      IPCResponse<{
        totalFiles: number
        totalSize: string
        oldestLog: string | null
        newestLog: string | null
      }>
    >
  clearDiagnostics: () => Promise<IPCResponse<void>>
  openDiagnosticsFolder: () => Promise<IPCResponse<void>>
}
```

### 6. Preload Script (`electron/preload.ts`)

Exposed diagnostic methods to renderer process through secure context bridge.

## Diagnostic Data Structure

### AudioTestDiagnostic Interface

```typescript
interface AudioTestDiagnostic {
  timestamp: string
  platform: string
  systemInfo: {
    os: string
    osVersion: string
    arch: string
    totalMemory: string
    freeMemory: string
  }
  systemAudio: {
    available: boolean
    tested: boolean
    error?: string
    deviceInfo?: AudioDevice
  }
  microphone: {
    available: boolean
    tested: boolean
    error?: string
    deviceInfo?: AudioDevice
  }
  recommendation: string
  audioLevels?: {
    systemAudioMaxLevel?: number
    microphoneMaxLevel?: number
  }
  deviceSwitchHistory?: Array<{
    from: string
    to: string
    timestamp: number
  }>
}
```

### Log Entry Format

```json
{
  "timestamp": "2024-01-15T10:30:45.123Z",
  "type": "test_result",
  "platform": "darwin",
  "data": {
    "timestamp": "2024-01-15T10:30:45.123Z",
    "platform": "darwin",
    "systemInfo": {
      "os": "darwin",
      "osVersion": "23.2.0",
      "arch": "arm64",
      "totalMemory": "16.00 GB",
      "freeMemory": "8.50 GB"
    },
    "systemAudio": {
      "available": false,
      "tested": true,
      "error": "System audio not available. Screen Recording permission required.",
      "deviceInfo": null
    },
    "microphone": {
      "available": true,
      "tested": true,
      "deviceInfo": {
        "id": "microphone-default",
        "label": "Default Microphone",
        "kind": "microphone"
      }
    },
    "recommendation": "microphone",
    "audioLevels": {
      "microphoneMaxLevel": 0.75
    }
  }
}
```

## Log Rotation Strategy

1. **Size-Based Rotation:**
   - When current log file reaches 10MB, it's rotated
   - Rotated files are renamed with timestamp: `diagnostics-2024-01-15T10-30-45-123Z.log`
   - Original file is cleared and starts fresh

2. **File Limit:**
   - Maximum 5 log files kept
   - Oldest files are deleted when limit is reached
   - Ensures disk space doesn't grow unbounded

3. **Automatic Cleanup:**
   - Rotation happens automatically on next write after size limit
   - No user intervention required
   - Logs are always accessible

## Export Format

Exported logs are saved as a single JSON file with metadata:

```json
{
  "exportedAt": "2024-01-15T10:35:00.000Z",
  "systemInfo": {
    "os": "darwin",
    "osVersion": "23.2.0",
    "arch": "arm64",
    "totalMemory": "16.00 GB",
    "freeMemory": "8.50 GB",
    "cpus": 8,
    "cpuModel": "Apple M4"
  },
  "totalEntries": 15,
  "logs": [
    // Array of all log entries
  ]
}
```

## Usage Examples

### For Users

1. **Run Audio Test:**
   - Click "Test Audio Capture" button
   - Test results are automatically saved to logs

2. **Export Diagnostics:**
   - After test completes, click "Export Diagnostics"
   - File is saved to `{userData}/logs/exports/diagnostics-export-{timestamp}.json`
   - Alert shows the file path

3. **View Logs Folder:**
   - Click "View Logs Folder" button
   - File explorer opens to logs directory
   - Can manually inspect or share log files

### For Support

1. **Request Diagnostics:**
   - Ask user to click "Export Diagnostics"
   - User sends the exported JSON file
   - File contains complete test history and system info

2. **Analyze Logs:**
   - Open exported JSON file
   - Check `systemInfo` for hardware details
   - Review `logs` array for test results
   - Look for error patterns in failed tests

3. **Troubleshoot Issues:**
   - Check if system audio is available
   - Verify microphone detection
   - Review audio levels to confirm capture
   - Check device switch history for instability

## Benefits

1. **Automated Logging:**
   - No manual steps required
   - Logs saved automatically after each test
   - Captures all relevant information

2. **Support Troubleshooting:**
   - Complete diagnostic information in one file
   - Easy to share with support team
   - Helps identify platform-specific issues

3. **Privacy-Friendly:**
   - Logs stored locally by default
   - User controls when to export/share
   - Can clear logs at any time

4. **Resource-Efficient:**
   - Automatic log rotation prevents disk bloat
   - Minimal performance impact
   - Logs compressed as JSON

5. **Developer-Friendly:**
   - Structured JSON format
   - Easy to parse and analyze
   - Includes timestamps for correlation

## Files Modified

1. **Created:**
   - `src/main/services/DiagnosticLogger.ts` - Core logging service
   - `docs/TASK_12.6_DIAGNOSTIC_LOGGING.md` - This documentation

2. **Modified:**
   - `src/main/services/AudioPipelineService.ts` - Added saveDiagnostics method
   - `src/main/ipc/handlers/audio.handlers.ts` - Added diagnostic IPC handlers
   - `src/renderer/components/AudioTestUI.tsx` - Added export UI
   - `src/renderer/components/AudioTestUI.css` - Added diagnostic section styles
   - `electron/preload.ts` - Exposed diagnostic methods
   - `src/types/ipc.ts` - Added diagnostic type definitions

## Testing Recommendations

1. **Test Log Creation:**
   - Run audio test multiple times
   - Verify logs are created in `{userData}/logs/`
   - Check log file format is valid JSON

2. **Test Log Rotation:**
   - Create large log file (>10MB)
   - Trigger rotation by running more tests
   - Verify old logs are rotated with timestamps
   - Verify oldest logs are deleted when limit reached

3. **Test Export:**
   - Click "Export Diagnostics" button
   - Verify export file is created
   - Check export file contains all log entries
   - Verify system info is included

4. **Test Clear:**
   - Create some logs
   - Call clearDiagnostics
   - Verify all log files are deleted

5. **Test Open Folder:**
   - Click "View Logs Folder" button
   - Verify file explorer opens to correct directory

## Next Steps

Task 12.6 is now complete. This completes the entire Pre-Flight Audio Test section (Task 12).

**Next Task:** Task 13 - Audio Capture Integration

- Integrate all audio components
- Implement fallback chain
- Test end-to-end audio capture

## Notes

- Diagnostic logging is automatic and requires no user configuration
- Logs are stored in the standard Electron userData directory
- Log rotation ensures disk space is managed automatically
- Export feature makes it easy to share diagnostics with support
- All diagnostic operations are non-blocking and don't affect test performance
