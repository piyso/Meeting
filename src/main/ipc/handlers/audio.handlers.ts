/**
 * Audio IPC Handlers
 *
 * Handles all audio-related IPC requests from the renderer process.
 * Implements audio capture, device enumeration, and pre-flight testing.
 */

import os from 'os'
import { app, ipcMain, powerSaveBlocker } from 'electron'
import { Logger } from '../../services/Logger'

const log = Logger.create('AudioHandlers')

import {
  getAudioPipelineService,
  isSystemAudioCaptureSupported,
} from '../../services/AudioPipelineService'
import { getDiagnosticLogger } from '../../services/DiagnosticLogger'
import { broadcastToWindows, getMainAppWindow } from '../windows'
import { finalizeMeeting } from './meeting.handlers'
import { getDatabaseService } from '../../services/DatabaseService'
import { emitWebhookEvent, hasWebhookSubscribers } from '../../services/WebhookDispatchService'
import type {
  IPCResponse,
  StartAudioCaptureParams,
  StopAudioCaptureParams,
  AudioCaptureStatus,
  PreFlightTestResult,
} from '../../../types/ipc'

// Local state for first-chunk logging
let hasLoggedFirstChunk = false
// Issue 19: powerSaveBlocker ID for active recording
let sleepBlockerId: number | null = null

/**
 * Things held for the duration of a recording: the sleep blocker, the dock
 * badge / taskbar indicator and (Windows) a raised process priority.
 *
 * They follow the pipeline's own lifecycle events rather than individual IPC
 * handlers. A recording can end through meeting:stop, the widget, a duration
 * limit or app quit; when the release lived in the audio:stopCapture handler
 * alone, the normal Stop button (meeting:stop) never released any of them —
 * the machine was kept awake and the dock kept its recording badge until the
 * app was quit.
 */
function acquireRecordingResources(): void {
  if (sleepBlockerId === null) {
    sleepBlockerId = powerSaveBlocker.start('prevent-app-suspension')
    log.info(`powerSaveBlocker started (id: ${sleepBlockerId})`)
  }
  // Raising priority needs no privilege on Windows; on macOS/Linux it requires
  // root and would only log a failure for every recording.
  if (process.platform === 'win32') {
    try {
      os.setPriority(os.constants.priority.PRIORITY_ABOVE_NORMAL)
    } catch (e) {
      log.debug('Could not elevate process priority:', e)
    }
  }
  try {
    if (process.platform === 'darwin') app.dock?.setBadge('●')
    if (process.platform === 'win32') {
      getMainAppWindow()?.setProgressBar(1, { mode: 'indeterminate' })
    }
  } catch {
    /* non-critical */
  }
}

function releaseRecordingResources(): void {
  if (sleepBlockerId !== null) {
    try {
      powerSaveBlocker.stop(sleepBlockerId)
      log.info(`powerSaveBlocker stopped (id: ${sleepBlockerId})`)
    } catch (e) {
      log.debug('powerSaveBlocker stop failed:', e)
    }
    sleepBlockerId = null
  }
  if (process.platform === 'win32') {
    try {
      os.setPriority(os.constants.priority.PRIORITY_NORMAL)
    } catch {
      /* ignore */
    }
  }
  try {
    if (process.platform === 'darwin') app.dock?.setBadge('')
    if (process.platform === 'win32') getMainAppWindow()?.setProgressBar(-1)
  } catch {
    /* non-critical */
  }
}

/** Webhook: a meeting's audio has started to arrive. */
function announceMeetingStarted(meetingId: string | null): void {
  if (!meetingId || !hasWebhookSubscribers('meeting.started')) return
  try {
    const meeting = getDatabaseService().getMeeting(meetingId)
    if (!meeting) return
    emitWebhookEvent('meeting.started', {
      meetingId,
      title: meeting.title,
      startTime: meeting.start_time,
    })
  } catch (err) {
    log.debug('meeting.started webhook skipped:', err)
  }
}

/** Webhook: transcription of a finished recording is complete. */
function announceTranscriptReady(meetingId: string): void {
  if (!hasWebhookSubscribers('transcript.ready')) return
  try {
    const db = getDatabaseService()
    const meeting = db.getMeeting(meetingId)
    if (!meeting) return
    const segments = db.getTranscripts(meetingId)
    if (segments.length === 0) return
    emitWebhookEvent('transcript.ready', {
      meetingId,
      title: meeting.title,
      segmentCount: segments.length,
      // Times are seconds from the start of the meeting
      segments: segments.map(segment => ({
        start: segment.start_time,
        end: segment.end_time,
        speaker: segment.speaker_name ?? null,
        text: segment.text,
      })),
    })
  } catch (err) {
    log.debug('transcript.ready webhook skipped:', err)
  }
}

/**
 * Register all audio-related IPC handlers
 */
export function registerAudioHandlers(): void {
  const audioPipeline = getAudioPipelineService()

  // Forward pipeline lifecycle to the renderer. The renderer has always
  // subscribed to 'event:audioEvent' / 'event:error', but nothing sent them —
  // so a failing transcription was invisible to the user.
  const broadcast = broadcastToWindows
  audioPipeline.on('status', (event: { meetingId: string | null; status: string }) => {
    switch (event.status) {
      case 'capturing':
        acquireRecordingResources()
        if (event.meetingId) {
          broadcast('event:audioEvent', { type: 'started', meetingId: event.meetingId })
        }
        break

      case 'stopping':
        // Every way a recording can end passes through here — the Stop button
        // (meeting:stop), the widget (audio:stopCapture), a duration limit and
        // app quit. Close the meeting and tell the windows now; the pipeline
        // may still spend a while transcribing what is queued.
        if (event.meetingId) {
          try {
            finalizeMeeting(event.meetingId)
          } catch (err) {
            log.warn('Could not close meeting at capture stop:', err)
          }
          broadcast('event:audioEvent', { type: 'stopped', meetingId: event.meetingId })
        }
        break

      case 'stopped':
        // Queued transcription has finished (or timed out): let the machine
        // sleep again — unless another recording started while this one was
        // still being transcribed.
        if (!audioPipeline.getStatus().isCapturing) releaseRecordingResources()
        if (event.meetingId) announceTranscriptReady(event.meetingId)
        break
    }
  })
  // One notice per minute at most — a failing model fails every 30s chunk.
  let lastTranscriptionErrorAt = 0
  audioPipeline.on('pipelineError', (event: { meetingId: string | null; error: string }) => {
    getDiagnosticLogger().logError(
      new Error(`Transcription error: ${event.error}`),
      event.meetingId ?? undefined
    )
    const now = Date.now()
    if (now - lastTranscriptionErrorAt < 60_000) return
    lastTranscriptionErrorAt = now
    broadcast('event:error', {
      code: 'TRANSCRIPTION_FAILED',
      message: `Transcription is not working: ${event.error}`,
      timestamp: now,
      context: { meetingId: event.meetingId },
    })
  })

  // Handle audio chunks from renderer
  // OPT-15: Renderer sends raw Float32Array (structured clone handles it natively)
  ipcMain.on(
    'audio:chunk',
    (
      _event,
      chunk: {
        data: Float32Array | number[]
        sampleRate: number
        timestamp: number
      }
    ) => {
      // A throw inside an ipcMain.on listener is an uncaught exception in the
      // main process, so reject malformed messages instead of dereferencing them.
      if (!chunk || chunk.data == null) return

      // Structured clone may deserialize Float32Array as a regular object on some
      // Electron versions, so always ensure we have a proper Float32Array
      const audioChunk =
        chunk.data instanceof Float32Array ? chunk.data : new Float32Array(chunk.data)
      if (audioChunk.length === 0) return

      // Log first chunk for debugging
      if (!hasLoggedFirstChunk) {
        log.info('📥 First audio chunk received:')
        log.info(`   Sample rate: ${chunk.sampleRate}Hz`)
        log.info(`   Chunk size: ${audioChunk.length} samples`)
        log.info(`   Duration: ${(audioChunk.length / chunk.sampleRate).toFixed(2)}s`)

        if (chunk.sampleRate === 16000) {
          log.info('✅ Audio is correctly configured for 16kHz (Whisper requirement)')
        } else {
          log.warn(
            `⚠️  Audio sample rate is ${chunk.sampleRate}Hz, expected 16000Hz for Whisper. ` +
              `Transcription may require resampling.`
          )
        }

        hasLoggedFirstChunk = true

        // Audio is really arriving: this is the moment the meeting has started
        // for anyone listening on a webhook (a capture that never delivers
        // audio is torn down and its meeting removed).
        announceMeetingStarted(audioPipeline.getStatus().meetingId)
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

        // The sleep blocker, dock badge and priority are taken by the pipeline's
        // 'capturing' event (see acquireRecordingResources).
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

  // Issue 13: Get desktop capturer sources for WASAPI system audio on Windows
  ipcMain.handle('desktop-capturer-sources', async () => {
    try {
      const { desktopCapturer } = await import('electron')
      const sources = await desktopCapturer.getSources({ types: ['screen'] })
      return sources.map(s => ({ id: s.id, name: s.name }))
    } catch (error) {
      log.error('Failed to get desktop capturer sources:', error)
      return []
    }
  })

  // G1: Listen for fallback telemetry from renderer (audioCapture.ts sends this when
  // system audio fails and microphone fallback is used)
  ipcMain.on('audio:fallbackUsed', (_event, data: { type: string; reason: string }) => {
    log.warn(`Audio fallback triggered: ${data.type} (reason: ${data.reason})`)
    getDiagnosticLogger().logInfo(`Audio fallback to ${data.type}: ${data.reason}`)
  })

  // Stop audio capture
  ipcMain.handle(
    'audio:stopCapture',
    async (_event, _params: StopAudioCaptureParams): Promise<IPCResponse<void>> => {
      try {
        // Closing the meeting and releasing the sleep blocker / dock badge are
        // driven by the pipeline's 'stopping' and 'stopped' events.
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

  // I1 fix: Pause audio capture — renderer calls this via useAudioSession.pauseCapture()
  ipcMain.handle('audio:pauseCapture', async (): Promise<IPCResponse<void>> => {
    try {
      // Set paused flag on pipeline — it will stop processing chunks but keep resources alive
      audioPipeline.pause?.()
      log.info('Audio capture paused')
      return { success: true, data: undefined }
    } catch (error) {
      log.error('Failed to pause audio capture:', error)
      return {
        success: false,
        error: {
          code: 'AUDIO_PAUSE_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: Date.now(),
        },
      }
    }
  })

  // I1 fix: Resume audio capture — renderer calls this via useAudioSession.resumeCapture()
  ipcMain.handle('audio:resumeCapture', async (): Promise<IPCResponse<void>> => {
    try {
      audioPipeline.resume?.()
      log.info('Audio capture resumed')
      return { success: true, data: undefined }
    } catch (error) {
      log.error('Failed to resume audio capture:', error)
      return {
        success: false,
        error: {
          code: 'AUDIO_RESUME_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: Date.now(),
        },
      }
    }
  })

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

      // Get Stereo Mix guidance if system audio is not available (a Windows
      // remedy; macOS is fixed through the Screen Recording permission).
      // Map service return shape { link } → StereoMixGuidance { settingsLink }
      const rawGuidance =
        !systemAudioAvailable && process.platform === 'win32'
          ? audioPipeline.getStereoMixGuidance()
          : null
      const guidance = rawGuidance
        ? { title: rawGuidance.title, steps: rawGuidance.steps, settingsLink: rawGuidance.link }
        : undefined

      const result: PreFlightTestResult = {
        systemAudio: {
          available: systemAudioAvailable,
          tested: true,
          error: systemAudioAvailable
            ? undefined
            : process.platform === 'win32'
              ? 'System audio not available. Stereo Mix may be disabled in Windows Sound settings.'
              : isSystemAudioCaptureSupported()
                ? 'System audio needs Screen Recording permission (System Settings → Privacy & Security).'
                : "Recording the computer's audio is not available on this system.",
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

        // G11: On Windows, WASAPI loopback needs no permission — return clear message
        if (permissionStatus === 'not-applicable') {
          return {
            success: true,
            data: {
              status: 'granted',
              message: 'System audio capture is available (no special permission required)',
            },
          }
        }

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

  // Open platform-appropriate audio/recording settings
  ipcMain.handle('audio:openScreenRecordingSettings', async (): Promise<IPCResponse<void>> => {
    try {
      const { shell } = await import('electron')

      if (process.platform === 'darwin') {
        await shell.openExternal(
          'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
        )
        log.info('Opened macOS Screen Recording settings')
      } else if (process.platform === 'win32') {
        // G3: Windows — open microphone privacy settings (closest equivalent)
        await shell.openExternal('ms-settings:privacy-microphone')
        log.info('Opened Windows Microphone Privacy settings')
      } else {
        log.warn('No platform-specific settings URI for:', process.platform)
      }

      return {
        success: true,
        data: undefined,
      }
    } catch (error) {
      log.error('Failed to open audio settings:', error)
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

  // I8: shell:openExternal moved to shell.handlers.ts

  // ─── G4: Audio Test Handlers ─────────────────────────────────
  // Tracks peak/RMS audio levels during a short diagnostic test session.

  const audioTests: Map<string, { startTime: number; maxLevel: number; audioDetected: boolean }> =
    new Map()

  // Start system audio test
  ipcMain.handle(
    'audio:startSystemAudioTest',
    async (): Promise<
      IPCResponse<{ success: boolean; message: string; requiresUserAction: boolean }>
    > => {
      try {
        if (audioTests.has('system')) {
          return {
            success: true,
            data: {
              success: true,
              message: 'System audio test already running',
              requiresUserAction: false,
            },
          }
        }
        audioTests.set('system', { startTime: Date.now(), maxLevel: 0, audioDetected: false })

        // Request the renderer to start capturing system audio for test
        const win = getMainAppWindow()
        if (win) {
          win.webContents.send('audio:testStart', { type: 'system' })
        }

        return {
          success: true,
          data: {
            success: true,
            message: 'System audio test started — play some audio to verify capture',
            requiresUserAction: true,
          },
        }
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'SYSTEM_AUDIO_TEST_FAILED',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: Date.now(),
          },
        }
      }
    }
  )

  // Stop system audio test
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
      const test = audioTests.get('system')
      audioTests.delete('system')

      const win = getMainAppWindow()
      if (win) {
        win.webContents.send('audio:testStop', { type: 'system' })
      }

      if (!test) {
        return {
          success: true,
          data: {
            success: true,
            audioDetected: false,
            maxLevel: 0,
            duration: 0,
            message: 'No active test',
          },
        }
      }

      const duration = (Date.now() - test.startTime) / 1000
      return {
        success: true,
        data: {
          success: true,
          audioDetected: test.audioDetected,
          maxLevel: test.maxLevel,
          duration,
          message: test.audioDetected
            ? `Audio detected! Peak level: ${(test.maxLevel * 100).toFixed(1)}%`
            : 'No audio detected — check your audio output device',
        },
      }
    }
  )

  // Get system audio test status
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
      const test = audioTests.get('system')
      if (!test) return { success: true, data: null }
      return {
        success: true,
        data: {
          isActive: true,
          audioDetected: test.audioDetected,
          maxLevel: test.maxLevel,
          duration: (Date.now() - test.startTime) / 1000,
        },
      }
    }
  )

  // Start microphone test
  ipcMain.handle(
    'audio:startMicrophoneTest',
    async (): Promise<
      IPCResponse<{ success: boolean; message: string; requiresUserAction: boolean }>
    > => {
      try {
        if (audioTests.has('microphone')) {
          return {
            success: true,
            data: {
              success: true,
              message: 'Microphone test already running',
              requiresUserAction: false,
            },
          }
        }
        audioTests.set('microphone', { startTime: Date.now(), maxLevel: 0, audioDetected: false })

        const win = getMainAppWindow()
        if (win) {
          win.webContents.send('audio:testStart', { type: 'microphone' })
        }

        return {
          success: true,
          data: {
            success: true,
            message: 'Microphone test started — speak to verify capture',
            requiresUserAction: true,
          },
        }
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'MIC_TEST_FAILED',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: Date.now(),
          },
        }
      }
    }
  )

  // Stop microphone test
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
      const test = audioTests.get('microphone')
      audioTests.delete('microphone')

      const win = getMainAppWindow()
      if (win) {
        win.webContents.send('audio:testStop', { type: 'microphone' })
      }

      if (!test) {
        return {
          success: true,
          data: {
            success: true,
            audioDetected: false,
            maxLevel: 0,
            duration: 0,
            message: 'No active test',
          },
        }
      }

      const duration = (Date.now() - test.startTime) / 1000
      return {
        success: true,
        data: {
          success: true,
          audioDetected: test.audioDetected,
          maxLevel: test.maxLevel,
          duration,
          message: test.audioDetected
            ? `Microphone working! Peak level: ${(test.maxLevel * 100).toFixed(1)}%`
            : 'No audio detected — check your microphone',
        },
      }
    }
  )

  // Get microphone test status
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
      const test = audioTests.get('microphone')
      if (!test) return { success: true, data: null }
      return {
        success: true,
        data: {
          isActive: true,
          audioDetected: test.audioDetected,
          maxLevel: test.maxLevel,
          duration: (Date.now() - test.startTime) / 1000,
        },
      }
    }
  )

  // G4: Receive audio level updates from renderer during test sessions
  ipcMain.on(
    'audio:testLevel',
    (_event, data: { type: 'system' | 'microphone'; level: number }) => {
      const test = audioTests.get(data.type)
      if (test) {
        if (data.level > test.maxLevel) test.maxLevel = data.level
        if (data.level > 0.01) test.audioDetected = true
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
