/**
 * Audio IPC Handlers
 *
 * Handles all audio-related IPC requests from the renderer process.
 * Implements audio capture, device enumeration, and pre-flight testing.
 */

import { ipcMain } from 'electron'
import { Logger } from '../../services/Logger'

const log = Logger.create('AudioHandlers')

import { getAudioPipelineService } from '../../services/AudioPipelineService'
import { getDiagnosticLogger } from '../../services/DiagnosticLogger'
import type {
  IPCResponse,
  StartAudioCaptureParams,
  StopAudioCaptureParams,
  AudioCaptureStatus,
  PreFlightTestResult,
} from '../../../types/ipc'

// Local state for first-chunk logging
let hasLoggedFirstChunk = false

/**
 * Register all audio-related IPC handlers
 */
export function registerAudioHandlers(): void {
  const audioPipeline = getAudioPipelineService()

  // Handle audio chunks from renderer
  ipcMain.on(
    'audio:chunk',
    (
      _event,
      chunk: {
        data: Float32Array
        sampleRate: number
        timestamp: number
      }
    ) => {
      // Convert raw audio data to Float32Array if needed
      const audioChunk =
        chunk.data instanceof Float32Array ? chunk.data : new Float32Array(chunk.data)

      // Log first chunk for debugging
      if (!hasLoggedFirstChunk) {
        log.info('📥 First audio chunk received:')
        log.info(`   Sample rate: ${chunk.sampleRate}Hz`)
        log.info(`   Chunk size: ${chunk.data.length} samples`)
        log.info(`   Duration: ${(chunk.data.length / chunk.sampleRate).toFixed(2)}s`)

        if (chunk.sampleRate === 16000) {
          log.info('✅ Audio is correctly configured for 16kHz (Whisper requirement)')
        } else {
          log.warn(
            `⚠️  Audio sample rate is ${chunk.sampleRate}Hz, expected 16000Hz for Whisper. ` +
              `Transcription may require resampling.`
          )
        }

        hasLoggedFirstChunk = true
      }

      // Forward to AudioPipelineService
      audioPipeline.processAudioChunk(audioChunk)
    }
  )

  // List available audio devices
  ipcMain.handle('audio:listDevices', async (): Promise<IPCResponse<unknown>> => {
    try {
      const devices = await audioPipeline.enumerateAudioSources()

      return {
        success: true,
        data: devices,
      }
    } catch (error) {
      log.error('Failed to list audio devices:', error)
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
    async (_event, params: StartAudioCaptureParams): Promise<IPCResponse<AudioCaptureStatus>> => {
      try {
        // Reset first-chunk logging flag for new capture session
        hasLoggedFirstChunk = false

        await audioPipeline.startCapture(params.meetingId)

        const status = audioPipeline.getStatus()

        return {
          success: true,
          data: {
            isCapturing: status.isCapturing,
            meetingId: status.meetingId,
            deviceId: null,
            duration: status.elapsedTime,
            chunksReceived: status.totalSegments,
          },
        }
      } catch (error) {
        log.error('Failed to start audio capture:', error)
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
    async (_event, _params: StopAudioCaptureParams): Promise<IPCResponse<void>> => {
      try {
        await audioPipeline.stopCapture()

        return {
          success: true,
          data: undefined,
        }
      } catch (error) {
        log.error('Failed to stop audio capture:', error)
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
      const status = audioPipeline.getStatus()

      return {
        success: true,
        data: {
          isCapturing: status.isCapturing,
          meetingId: status.meetingId,
          deviceId: null,
          duration: status.elapsedTime,
          chunksReceived: status.totalSegments,
        },
      }
    } catch (error) {
      log.error('Failed to get audio status:', error)
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
      // Check available audio devices
      const devices = await audioPipeline.enumerateAudioSources()
      const systemAudioAvailable = devices.some(d => d.kind === 'system' && d.isAvailable)
      const microphoneAvailable = devices.some(d => d.kind === 'input' && d.isAvailable)

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
      // Map service return shape { link } → StereoMixGuidance { settingsLink }
      const rawGuidance = !systemAudioAvailable ? audioPipeline.getStereoMixGuidance() : null
      const guidance = rawGuidance
        ? { title: rawGuidance.title, steps: rawGuidance.steps, settingsLink: rawGuidance.link }
        : undefined

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

      log.info('Pre-flight test result:', result)

      return {
        success: true,
        data: result,
      }
    } catch (error) {
      log.error('Failed to run pre-flight test:', error)
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
        await shell.openExternal(
          'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
        )
        log.info('Opened macOS Screen Recording settings')
      } else if (platform === 'win32') {
        await shell.openExternal('ms-settings:sound')
        log.info('Opened Windows Sound settings')
      } else {
        log.warn('Platform not supported for automatic settings opening:', platform)
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
      log.error('Failed to open Sound settings:', error)
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
        const permissionStatus = audioPipeline.getScreenRecordingPermissionStatus()
        const isGranted = permissionStatus === 'granted'

        const guidance = !isGranted
          ? {
              title: 'Enable Screen Recording Permission',
              steps: [
                'Open System Settings → Privacy & Security → Screen Recording',
                'Find BlueArkive in the list',
                'Toggle it ON',
                'Restart the application',
              ],
              link: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
            }
          : undefined

        return {
          success: true,
          data: {
            status: permissionStatus,
            message: isGranted
              ? 'Screen Recording permission is granted'
              : 'Screen Recording permission is required for system audio capture',
            guidance,
          },
        }
      } catch (error) {
        log.error('Failed to get Screen Recording permission status:', error)
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

      await shell.openExternal(
        'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
      )

      log.info('Opened macOS Screen Recording settings')

      return {
        success: true,
        data: undefined,
      }
    } catch (error) {
      log.error('Failed to open Screen Recording settings:', error)
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

      log.info('Opened external URL:', url)

      return {
        success: true,
        data: undefined,
      }
    } catch (error) {
      log.error('Failed to open external URL:', error)
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

  // Start system audio test — stub until AudioPipelineService implements test methods
  ipcMain.handle(
    'audio:startSystemAudioTest',
    async (): Promise<
      IPCResponse<{
        success: boolean
        message: string
        requiresUserAction: boolean
      }>
    > => {
      return {
        success: true,
        data: {
          success: true,
          message: 'System audio test not yet implemented',
          requiresUserAction: false,
        },
      }
    }
  )

  // Stop system audio test — stub
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
      return {
        success: true,
        data: {
          success: true,
          audioDetected: false,
          maxLevel: 0,
          duration: 0,
          message: 'System audio test not yet implemented',
        },
      }
    }
  )

  // Get system audio test status — stub
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
      return {
        success: true,
        data: null,
      }
    }
  )

  // Start microphone test — stub
  ipcMain.handle(
    'audio:startMicrophoneTest',
    async (): Promise<
      IPCResponse<{
        success: boolean
        message: string
        requiresUserAction: boolean
      }>
    > => {
      return {
        success: true,
        data: {
          success: true,
          message: 'Microphone test not yet implemented',
          requiresUserAction: false,
        },
      }
    }
  )

  // Stop microphone test — stub
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
      return {
        success: true,
        data: {
          success: true,
          audioDetected: false,
          maxLevel: 0,
          duration: 0,
          message: 'Microphone test not yet implemented',
        },
      }
    }
  )

  // Get microphone test status — stub
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
      return {
        success: true,
        data: null,
      }
    }
  )

  // Task 12.6: Export diagnostic logs
  ipcMain.handle('audio:exportDiagnostics', async (): Promise<IPCResponse<string>> => {
    try {
      const logger = getDiagnosticLogger()
      const exportPath = await logger.exportLogs()

      log.info('Exported diagnostics to:', exportPath)

      return {
        success: true,
        data: exportPath,
      }
    } catch (error) {
      log.error('Failed to export diagnostics:', error)
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
      log.error('Failed to get diagnostics path:', error)
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
        log.error('Failed to get diagnostics stats:', error)
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

      log.info('Cleared diagnostic logs')

      return {
        success: true,
        data: undefined,
      }
    } catch (error) {
      log.error('Failed to clear diagnostics:', error)
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

      log.info('Opened diagnostics folder:', logDir)

      return {
        success: true,
        data: undefined,
      }
    } catch (error) {
      log.error('Failed to open diagnostics folder:', error)
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

  // Task 13.2: Start capture with automatic fallback chain — stub
  ipcMain.handle(
    'audio:startCaptureWithFallback',
    async (
      _event,
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
        // For now, delegate to basic startCapture
        hasLoggedFirstChunk = false
        await audioPipeline.startCapture(params.meetingId)

        return {
          success: true,
          data: {
            success: true,
            source: params.preferredSource || 'system',
            message: 'Capture started',
            requiresUserAction: false,
          },
        }
      } catch (error) {
        log.error('Failed to start capture with fallback:', error)
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

  // Task 13.2: Handle capture fallback during active recording — stub
  ipcMain.handle(
    'audio:handleCaptureFallback',
    async (
      _event,
      _params: {
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
      return {
        success: true,
        data: {
          success: false,
          newSource: null,
          message: 'Capture fallback not yet implemented',
        },
      }
    }
  )
}
