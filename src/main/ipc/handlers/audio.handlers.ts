/**
 * Audio IPC Handlers
 *
 * Handles all audio-related IPC requests from the renderer process.
 * Implements audio capture, device enumeration, and pre-flight testing.
 */

import { ipcMain } from 'electron'
import { getAudioPipelineService } from '../../services/AudioPipelineService'
import { getDiagnosticLogger } from '../../services/DiagnosticLogger'
import type {
  IPCResponse,
  AudioDevice,
  StartAudioCaptureParams,
  StopAudioCaptureParams,
  AudioCaptureStatus,
  PreFlightTestResult,
} from '../../../types/ipc'

/**
 * Register all audio-related IPC handlers
 */
export function registerAudioHandlers(): void {
  const audioPipeline = getAudioPipelineService()

  // Handle audio chunks from renderer
  ipcMain.on(
    'audio:chunk',
    (_event, chunk: { data: number[]; timestamp: number; sampleRate: number }) => {
      // Convert array back to Float32Array
      const audioChunk = {
        data: new Float32Array(chunk.data),
        timestamp: chunk.timestamp,
        sampleRate: chunk.sampleRate,
      }

      // Log first chunk to verify 16kHz audio is being received
      if (!audioPipeline.hasLoggedFirstChunk) {
        console.log('✅ First audio chunk received:')
        console.log(`   Sample rate: ${chunk.sampleRate}Hz`)
        console.log(`   Chunk size: ${chunk.data.length} samples`)
        console.log(`   Duration: ${(chunk.data.length / chunk.sampleRate).toFixed(2)}s`)

        if (chunk.sampleRate === 16000) {
          console.log('✅ Audio is correctly configured for 16kHz (Whisper requirement)')
        } else {
          console.warn(
            `⚠️  Audio sample rate is ${chunk.sampleRate}Hz, expected 16000Hz for Whisper. ` +
              `Transcription may require resampling.`
          )
        }

        audioPipeline.hasLoggedFirstChunk = true
      }

      // Process test audio chunk if test session is active (Task 12.2)
      audioPipeline.processTestAudioChunk(audioChunk)

      // Forward to AudioPipelineService which will forward to VAD Worker
      audioPipeline.handleAudioChunk(audioChunk)
    }
  )

  // List available audio devices
  ipcMain.handle('audio:listDevices', async (): Promise<IPCResponse<AudioDevice[]>> => {
    try {
      const devices = await audioPipeline.enumerateAudioSources()

      return {
        success: true,
        data: devices,
      }
    } catch (error) {
      console.error('Failed to list audio devices:', error)
      return {
        success: false,
        error: {
          code: 'AUDIO_LIST_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
          details: error instanceof Error ? error.stack : undefined,
          timestamp: Date.now(),
        },
      }
    }
  })

  // Start audio capture
  ipcMain.handle(
    'audio:startCapture',
    async (event, params: StartAudioCaptureParams): Promise<IPCResponse<AudioCaptureStatus>> => {
      try {
        const result = await audioPipeline.startCapture(
          params.meetingId,
          params.deviceId,
          params.fallbackToMicrophone
        )

        const status = audioPipeline.getCaptureStatus()

        // If fallback was used, send notification to renderer
        if (result.usedFallback) {
          event.sender.send('audio:fallbackNotification', {
            type: 'microphone',
            message: 'Using microphone instead of system audio',
            details:
              'Grant Screen Recording permission in System Settings for system audio capture',
          })
        }

        return {
          success: true,
          data: status,
        }
      } catch (error) {
        console.error('Failed to start audio capture:', error)
        return {
          success: false,
          error: {
            code: 'AUDIO_START_FAILED',
            message: error instanceof Error ? error.message : 'Unknown error',
            details: error instanceof Error ? error.stack : undefined,
            timestamp: Date.now(),
          },
        }
      }
    }
  )

  // Stop audio capture
  ipcMain.handle(
    'audio:stopCapture',
    async (_event, params: StopAudioCaptureParams): Promise<IPCResponse<void>> => {
      try {
        await audioPipeline.stopCapture(params.meetingId)

        return {
          success: true,
          data: undefined,
        }
      } catch (error) {
        console.error('Failed to stop audio capture:', error)
        return {
          success: false,
          error: {
            code: 'AUDIO_STOP_FAILED',
            message: error instanceof Error ? error.message : 'Unknown error',
            details: error instanceof Error ? error.stack : undefined,
            timestamp: Date.now(),
          },
        }
      }
    }
  )

  // Get audio capture status
  ipcMain.handle('audio:getStatus', async (): Promise<IPCResponse<AudioCaptureStatus>> => {
    try {
      const status = audioPipeline.getCaptureStatus()

      return {
        success: true,
        data: status,
      }
    } catch (error) {
      console.error('Failed to get audio status:', error)
      return {
        success: false,
        error: {
          code: 'AUDIO_STATUS_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
          details: error instanceof Error ? error.stack : undefined,
          timestamp: Date.now(),
        },
      }
    }
  })

  // Pre-flight audio test
  ipcMain.handle('audio:preFlightTest', async (): Promise<IPCResponse<PreFlightTestResult>> => {
    try {
      // Test system audio availability
      const systemAudioDevice = await audioPipeline.getDefaultSystemAudioDevice()
      const systemAudioAvailable = systemAudioDevice !== null

      // Test microphone availability
      const microphoneDevice = await audioPipeline.getDefaultMicrophoneDevice()
      const microphoneAvailable = microphoneDevice !== null

      // Determine recommendation based on availability
      let recommendation: 'system' | 'microphone' | 'cloud'
      if (systemAudioAvailable) {
        recommendation = 'system'
      } else if (microphoneAvailable) {
        recommendation = 'microphone'
      } else {
        recommendation = 'cloud'
      }

      // Get Stereo Mix guidance if system audio is not available
      const guidance = !systemAudioAvailable ? audioPipeline.getStereoMixGuidance() : undefined

      const result: PreFlightTestResult = {
        systemAudio: {
          available: systemAudioAvailable,
          tested: true,
          error: systemAudioAvailable
            ? undefined
            : 'System audio not available. Stereo Mix may be disabled in Windows Sound settings.',
          guidance,
        },
        microphone: {
          available: microphoneAvailable,
          tested: true,
          error: microphoneAvailable ? undefined : 'No microphone device found.',
        },
        recommendation,
      }

      console.log('Pre-flight test result:', result)

      // Task 12.6: Save diagnostic information
      await audioPipeline.saveDiagnostics({
        systemAudio: result.systemAudio,
        microphone: result.microphone,
        recommendation: result.recommendation,
      })

      return {
        success: true,
        data: result,
      }
    } catch (error) {
      console.error('Failed to run pre-flight test:', error)
      return {
        success: false,
        error: {
          code: 'PREFLIGHT_TEST_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
          details: error instanceof Error ? error.stack : undefined,
          timestamp: Date.now(),
        },
      }
    }
  })

  // Open Windows Sound settings or macOS Screen Recording settings
  ipcMain.handle('audio:openSoundSettings', async (): Promise<IPCResponse<void>> => {
    try {
      const { shell } = await import('electron')
      const os = await import('os')
      const platform = os.platform()

      if (platform === 'darwin') {
        // macOS: Open Screen Recording permission settings
        await shell.openExternal(
          'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
        )
        console.log('Opened macOS Screen Recording settings')
      } else if (platform === 'win32') {
        // Windows: Open Sound settings using ms-settings URI
        await shell.openExternal('ms-settings:sound')
        console.log('Opened Windows Sound settings')
      } else {
        // Linux or other platforms
        console.warn('Platform not supported for automatic settings opening:', platform)
        return {
          success: false,
          error: {
            code: 'PLATFORM_NOT_SUPPORTED',
            message: `Opening sound settings is not supported on ${platform}`,
            timestamp: Date.now(),
          },
        }
      }

      return {
        success: true,
        data: undefined,
      }
    } catch (error) {
      console.error('Failed to open Sound settings:', error)
      return {
        success: false,
        error: {
          code: 'OPEN_SETTINGS_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
          details: error instanceof Error ? error.stack : undefined,
          timestamp: Date.now(),
        },
      }
    }
  })

  // Get Screen Recording permission status (macOS)
  ipcMain.handle(
    'audio:getScreenRecordingPermission',
    async (): Promise<
      IPCResponse<{
        status: string
        message: string
        guidance?: {
          title: string
          steps: string[]
          link?: string
        }
      }>
    > => {
      try {
        const guidance = audioPipeline.getScreenRecordingGuidance()

        console.log('Screen Recording permission guidance:', guidance)

        return {
          success: true,
          data: guidance,
        }
      } catch (error) {
        console.error('Failed to get Screen Recording permission status:', error)
        return {
          success: false,
          error: {
            code: 'PERMISSION_CHECK_FAILED',
            message: error instanceof Error ? error.message : 'Unknown error',
            details: error instanceof Error ? error.stack : undefined,
            timestamp: Date.now(),
          },
        }
      }
    }
  )

  // Open macOS System Settings for Screen Recording permission
  ipcMain.handle('audio:openScreenRecordingSettings', async (): Promise<IPCResponse<void>> => {
    try {
      const { shell } = await import('electron')

      // Open macOS System Settings to Screen Recording privacy settings
      // This works on macOS 13+ (Ventura and later)
      await shell.openExternal(
        'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
      )

      console.log('Opened macOS Screen Recording settings')

      return {
        success: true,
        data: undefined,
      }
    } catch (error) {
      console.error('Failed to open Screen Recording settings:', error)
      return {
        success: false,
        error: {
          code: 'OPEN_SETTINGS_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
          details: error instanceof Error ? error.stack : undefined,
          timestamp: Date.now(),
        },
      }
    }
  })

  // General shell operations
  ipcMain.handle('shell:openExternal', async (_event, url: string): Promise<IPCResponse<void>> => {
    try {
      const { shell } = await import('electron')

      // Validate URL to prevent security issues
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        throw new Error('Invalid URL: Only HTTP and HTTPS URLs are allowed')
      }

      await shell.openExternal(url)

      console.log('Opened external URL:', url)

      return {
        success: true,
        data: undefined,
      }
    } catch (error) {
      console.error('Failed to open external URL:', error)
      return {
        success: false,
        error: {
          code: 'OPEN_EXTERNAL_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
          details: error instanceof Error ? error.stack : undefined,
          timestamp: Date.now(),
        },
      }
    }
  })

  // Start system audio test (Task 12.2)
  ipcMain.handle(
    'audio:startSystemAudioTest',
    async (): Promise<
      IPCResponse<{
        success: boolean
        message: string
        requiresUserAction: boolean
      }>
    > => {
      try {
        const result = await audioPipeline.startSystemAudioTest()

        console.log('System audio test started:', result)

        return {
          success: true,
          data: result,
        }
      } catch (error) {
        console.error('Failed to start system audio test:', error)
        return {
          success: false,
          error: {
            code: 'SYSTEM_AUDIO_TEST_START_FAILED',
            message: error instanceof Error ? error.message : 'Unknown error',
            details: error instanceof Error ? error.stack : undefined,
            timestamp: Date.now(),
          },
        }
      }
    }
  )

  // Stop system audio test (Task 12.2)
  ipcMain.handle(
    'audio:stopSystemAudioTest',
    async (): Promise<
      IPCResponse<{
        success: boolean
        audioDetected: boolean
        maxLevel: number
        duration: number
        message: string
      }>
    > => {
      try {
        const result = audioPipeline.stopSystemAudioTest()

        console.log('System audio test stopped:', result)

        return {
          success: true,
          data: result,
        }
      } catch (error) {
        console.error('Failed to stop system audio test:', error)
        return {
          success: false,
          error: {
            code: 'SYSTEM_AUDIO_TEST_STOP_FAILED',
            message: error instanceof Error ? error.message : 'Unknown error',
            details: error instanceof Error ? error.stack : undefined,
            timestamp: Date.now(),
          },
        }
      }
    }
  )

  // Get system audio test status (Task 12.2)
  ipcMain.handle(
    'audio:getSystemAudioTestStatus',
    async (): Promise<
      IPCResponse<{
        isActive: boolean
        audioDetected: boolean
        maxLevel: number
        duration: number
      } | null>
    > => {
      try {
        const status = audioPipeline.getTestSessionStatus()

        return {
          success: true,
          data: status,
        }
      } catch (error) {
        console.error('Failed to get system audio test status:', error)
        return {
          success: false,
          error: {
            code: 'SYSTEM_AUDIO_TEST_STATUS_FAILED',
            message: error instanceof Error ? error.message : 'Unknown error',
            details: error instanceof Error ? error.stack : undefined,
            timestamp: Date.now(),
          },
        }
      }
    }
  )

  // Start microphone test (Task 12.3)
  ipcMain.handle(
    'audio:startMicrophoneTest',
    async (): Promise<
      IPCResponse<{
        success: boolean
        message: string
        requiresUserAction: boolean
      }>
    > => {
      try {
        const result = await audioPipeline.startMicrophoneTest()

        console.log('Microphone test started:', result)

        return {
          success: true,
          data: result,
        }
      } catch (error) {
        console.error('Failed to start microphone test:', error)
        return {
          success: false,
          error: {
            code: 'MICROPHONE_TEST_START_FAILED',
            message: error instanceof Error ? error.message : 'Unknown error',
            details: error instanceof Error ? error.stack : undefined,
            timestamp: Date.now(),
          },
        }
      }
    }
  )

  // Stop microphone test (Task 12.3)
  ipcMain.handle(
    'audio:stopMicrophoneTest',
    async (): Promise<
      IPCResponse<{
        success: boolean
        audioDetected: boolean
        maxLevel: number
        duration: number
        message: string
      }>
    > => {
      try {
        const result = audioPipeline.stopMicrophoneTest()

        console.log('Microphone test stopped:', result)

        return {
          success: true,
          data: result,
        }
      } catch (error) {
        console.error('Failed to stop microphone test:', error)
        return {
          success: false,
          error: {
            code: 'MICROPHONE_TEST_STOP_FAILED',
            message: error instanceof Error ? error.message : 'Unknown error',
            details: error instanceof Error ? error.stack : undefined,
            timestamp: Date.now(),
          },
        }
      }
    }
  )

  // Get microphone test status (Task 12.3)
  ipcMain.handle(
    'audio:getMicrophoneTestStatus',
    async (): Promise<
      IPCResponse<{
        isActive: boolean
        audioDetected: boolean
        maxLevel: number
        duration: number
      } | null>
    > => {
      try {
        const status = audioPipeline.getMicrophoneTestStatus()

        return {
          success: true,
          data: status,
        }
      } catch (error) {
        console.error('Failed to get microphone test status:', error)
        return {
          success: false,
          error: {
            code: 'MICROPHONE_TEST_STATUS_FAILED',
            message: error instanceof Error ? error.message : 'Unknown error',
            details: error instanceof Error ? error.stack : undefined,
            timestamp: Date.now(),
          },
        }
      }
    }
  )

  // Task 12.6: Export diagnostic logs
  ipcMain.handle('audio:exportDiagnostics', async (): Promise<IPCResponse<string>> => {
    try {
      const logger = getDiagnosticLogger()
      const exportPath = await logger.exportLogs()

      console.log('Exported diagnostics to:', exportPath)

      return {
        success: true,
        data: exportPath,
      }
    } catch (error) {
      console.error('Failed to export diagnostics:', error)
      return {
        success: false,
        error: {
          code: 'EXPORT_DIAGNOSTICS_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
          details: error instanceof Error ? error.stack : undefined,
          timestamp: Date.now(),
        },
      }
    }
  })

  // Task 12.6: Get diagnostic log directory
  ipcMain.handle('audio:getDiagnosticsPath', async (): Promise<IPCResponse<string>> => {
    try {
      const logger = getDiagnosticLogger()
      const logDir = logger.getLogDirectory()

      return {
        success: true,
        data: logDir,
      }
    } catch (error) {
      console.error('Failed to get diagnostics path:', error)
      return {
        success: false,
        error: {
          code: 'GET_DIAGNOSTICS_PATH_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
          details: error instanceof Error ? error.stack : undefined,
          timestamp: Date.now(),
        },
      }
    }
  })

  // Task 12.6: Get diagnostic log statistics
  ipcMain.handle(
    'audio:getDiagnosticsStats',
    async (): Promise<
      IPCResponse<{
        totalFiles: number
        totalSize: string
        oldestLog: string | null
        newestLog: string | null
      }>
    > => {
      try {
        const logger = getDiagnosticLogger()
        const stats = logger.getLogStats()

        return {
          success: true,
          data: stats,
        }
      } catch (error) {
        console.error('Failed to get diagnostics stats:', error)
        return {
          success: false,
          error: {
            code: 'GET_DIAGNOSTICS_STATS_FAILED',
            message: error instanceof Error ? error.message : 'Unknown error',
            details: error instanceof Error ? error.stack : undefined,
            timestamp: Date.now(),
          },
        }
      }
    }
  )

  // Task 12.6: Clear diagnostic logs
  ipcMain.handle('audio:clearDiagnostics', async (): Promise<IPCResponse<void>> => {
    try {
      const logger = getDiagnosticLogger()
      logger.clearLogs()

      console.log('Cleared diagnostic logs')

      return {
        success: true,
        data: undefined,
      }
    } catch (error) {
      console.error('Failed to clear diagnostics:', error)
      return {
        success: false,
        error: {
          code: 'CLEAR_DIAGNOSTICS_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
          details: error instanceof Error ? error.stack : undefined,
          timestamp: Date.now(),
        },
      }
    }
  })

  // Task 12.6: Open diagnostic logs folder
  ipcMain.handle('audio:openDiagnosticsFolder', async (): Promise<IPCResponse<void>> => {
    try {
      const { shell } = await import('electron')
      const logger = getDiagnosticLogger()
      const logDir = logger.getLogDirectory()

      await shell.openPath(logDir)

      console.log('Opened diagnostics folder:', logDir)

      return {
        success: true,
        data: undefined,
      }
    } catch (error) {
      console.error('Failed to open diagnostics folder:', error)
      return {
        success: false,
        error: {
          code: 'OPEN_DIAGNOSTICS_FOLDER_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
          details: error instanceof Error ? error.stack : undefined,
          timestamp: Date.now(),
        },
      }
    }
  })

  // Task 13.2: Start capture with automatic fallback chain
  ipcMain.handle(
    'audio:startCaptureWithFallback',
    async (
      event,
      params: {
        meetingId: string
        preferredSource?: 'system' | 'microphone' | 'cloud'
      }
    ): Promise<
      IPCResponse<{
        success: boolean
        source: 'system' | 'microphone' | 'cloud' | null
        message: string
        requiresUserAction: boolean
        guidance?: {
          title: string
          steps: string[]
          link?: string
        }
      }>
    > => {
      try {
        const result = await audioPipeline.startCaptureWithFallback(
          params.meetingId,
          params.preferredSource || 'system',
          (fallbackInfo: any) => {
            // Send fallback notification to renderer
            event.sender.send('audio:fallbackOccurred', fallbackInfo)
          }
        )

        console.log('Capture with fallback result:', result)

        return {
          success: true,
          data: result,
        }
      } catch (error) {
        console.error('Failed to start capture with fallback:', error)
        return {
          success: false,
          error: {
            code: 'CAPTURE_WITH_FALLBACK_FAILED',
            message: error instanceof Error ? error.message : 'Unknown error',
            details: error instanceof Error ? error.stack : undefined,
            timestamp: Date.now(),
          },
        }
      }
    }
  )

  // Task 13.2: Handle capture fallback during active recording
  ipcMain.handle(
    'audio:handleCaptureFallback',
    async (
      event,
      params: {
        meetingId: string
        currentSource: 'system' | 'microphone'
      }
    ): Promise<
      IPCResponse<{
        success: boolean
        newSource: 'microphone' | 'cloud' | null
        message: string
      }>
    > => {
      try {
        const result = await audioPipeline.handleCaptureFallback(
          params.meetingId,
          params.currentSource,
          (fallbackInfo: any) => {
            // Send fallback notification to renderer
            event.sender.send('audio:fallbackOccurred', fallbackInfo)
          }
        )

        console.log('Capture fallback result:', result)

        return {
          success: true,
          data: result,
        }
      } catch (error) {
        console.error('Failed to handle capture fallback:', error)
        return {
          success: false,
          error: {
            code: 'HANDLE_CAPTURE_FALLBACK_FAILED',
            message: error instanceof Error ? error.message : 'Unknown error',
            details: error instanceof Error ? error.stack : undefined,
            timestamp: Date.now(),
          },
        }
      }
    }
  )
}
