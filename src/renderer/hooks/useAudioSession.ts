import { useRecordingStore } from '../store/recordingStore'
import { useState, useCallback } from 'react'

import type { ScreenRecordingGuidance } from '../../types/ipc'

import { rendererLog } from '../utils/logger'
const log = rendererLog.create('AudioSession')

export type CaptureMode = 'system' | 'microphone' | 'cloud'
export type PermissionStatus =
  | 'not-determined'
  | 'denied'
  | 'granted'
  | 'not-applicable'
  | 'unknown'

/** What a successful start is actually recording from */
export interface CaptureStartResult {
  source: 'system' | 'microphone'
  /** Set when system audio was requested but the microphone is being used instead */
  fallbackReason?: string
}

const SAMPLE_RATE = 16000
const CHANNELS = 1

/** In mock mode there is no backend to receive audio — never open real devices. */
const isMockBackend = (): boolean =>
  (window as unknown as { __BLUEARKIVE_MOCK__?: boolean }).__BLUEARKIVE_MOCK__ === true

// Loaded on first use: the capture module is only needed once a recording starts.
const loadCaptureManager = async () => (await import('../audioCapture')).audioCaptureManager

/**
 * Stop the renderer-side device capture (releases the microphone / screen
 * audio stream and flushes buffered audio to the main process). Safe to call
 * when nothing is being captured.
 */
export async function stopDeviceCapture(): Promise<void> {
  if (isMockBackend()) return
  try {
    const manager = await loadCaptureManager()
    if (manager.getStatus().isCapturing) await manager.stopCapture()
  } catch (error) {
    log.error('Error releasing audio devices:', error)
  }
}

export function useAudioSession(meetingId: string | null) {
  const setRecordingStartTime = useRecordingStore(s => s.setRecordingStartTime)
  const [isCapturing, setIsCapturing] = useState(false)
  const [captureMode, setCaptureMode] = useState<CaptureMode>('system')
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('unknown')
  const [guidance, setGuidance] = useState<ScreenRecordingGuidance | null>(null)

  const checkPermissionStatus = useCallback(async () => {
    try {
      const result = await window.electronAPI?.audio?.getScreenRecordingPermission()
      if (result?.success && result.data) {
        setPermissionStatus(result.data.status as PermissionStatus)
        if (result.data.guidance) {
          setGuidance(result.data.guidance)
        }
        return result.data.status
      }
    } catch (error) {
      log.error('Error checking permission:', error)
    }
    return 'unknown'
  }, [])

  /**
   * Start recording: readies the transcription pipeline in the main process,
   * then opens the audio device in this window and streams it there.
   *
   * @param mode 'system' records what the computer plays (the other meeting
   *   participants); 'microphone' records the local microphone only.
   * @param options.fallbackToMicrophone when system audio cannot be captured
   *   (permission missing, unsupported OS), record the microphone instead.
   * @throws when no audio source could be opened — the pipeline is torn down
   *   again, so nothing is left half-started.
   */
  const startCapture = useCallback(
    async (
      mode: CaptureMode = 'system',
      options: { fallbackToMicrophone?: boolean } = {}
    ): Promise<CaptureStartResult | null> => {
      if (!meetingId) return null
      const fallbackToMicrophone = options.fallbackToMicrophone ?? true

      // Refresh the permission state for the UI. A missing permission no longer
      // aborts here: opening the device is what makes macOS show its prompt,
      // and the microphone fallback keeps the meeting recordable meanwhile.
      if (mode === 'system' && window.electronAPI?.platform === 'darwin') {
        void checkPermissionStatus()
      }

      setIsCapturing(true)
      setCaptureMode(mode)
      let pipelineStarted = false
      try {
        // "Already capturing" (a second start while one recording is live)
        // fails here — before anything of the live recording is touched.
        const result = await window.electronAPI?.audio?.startCapture({
          meetingId,
          fallbackToMicrophone: mode !== 'cloud' && fallbackToMicrophone,
        })
        if (!result?.success) {
          throw new Error(result?.error?.message || 'Failed to start capture')
        }
        pipelineStarted = true

        let started: CaptureStartResult = {
          source: mode === 'microphone' ? 'microphone' : 'system',
        }
        if (!isMockBackend()) {
          const manager = await loadCaptureManager()
          // A stream left over from an aborted start would block this one
          if (manager.getStatus().isCapturing) await manager.stopCapture()
          if (mode === 'microphone') {
            await manager.startMicrophoneCapture(SAMPLE_RATE, CHANNELS)
          } else {
            const source = await manager.startSystemAudioCapture(
              '',
              SAMPLE_RATE,
              CHANNELS,
              fallbackToMicrophone
            )
            started =
              source === 'microphone'
                ? { source, fallbackReason: manager.getLastFallbackReason() ?? undefined }
                : { source }
          }
        }

        // Record the start time globally so DynamicIsland timer works
        setRecordingStartTime(Date.now())
        return started
      } catch (error) {
        log.error('Error starting capture:', error)
        setIsCapturing(false)
        if (pipelineStarted) {
          // This attempt got as far as owning the pipeline: release whatever
          // device it opened and don't leave the main process "recording"
          // with no audio coming in. (If the pipeline never started, another
          // recording may own the device — leave it alone.)
          await stopDeviceCapture()
          await window.electronAPI?.audio?.stopCapture({ meetingId }).catch(() => undefined)
        }
        throw error
      }
    },
    [meetingId, checkPermissionStatus, setRecordingStartTime]
  )

  const stopCapture = useCallback(async () => {
    if (!meetingId) return
    // Release the device first so its last buffered audio reaches the pipeline
    await stopDeviceCapture()
    try {
      const result = await window.electronAPI?.audio?.stopCapture({ meetingId })
      if (result?.success) {
        setIsCapturing(false)
        setRecordingStartTime(null)
      }
    } catch (error) {
      log.error('Error stopping capture:', error)
    }
  }, [meetingId, setRecordingStartTime])

  const pauseCapture = useCallback(async () => {
    // Suspend the device first: that hands over the audio captured so far,
    // which the pipeline would drop if it were already paused.
    const manager = isMockBackend() ? null : await loadCaptureManager().catch(() => null)
    if (manager) {
      await manager.pause().catch(error => log.warn('Could not suspend audio device:', error))
    }
    const result = await window.electronAPI?.audio?.pauseCapture?.()
    if (result && !result.success) {
      await manager?.resume().catch(() => undefined)
      throw new Error(result.error?.message || 'Failed to pause capture')
    }
  }, [])

  const resumeCapture = useCallback(async () => {
    if (!isMockBackend()) {
      const manager = await loadCaptureManager()
      await manager.resume()
    }
    const result = await window.electronAPI?.audio?.resumeCapture?.()
    if (result && !result.success) {
      throw new Error(result.error?.message || 'Failed to resume capture')
    }
  }, [])

  return {
    isCapturing,
    captureMode,
    permissionStatus,
    guidance,
    checkPermissionStatus,
    startCapture,
    stopCapture,
    pauseCapture,
    resumeCapture,
    setPermissionStatus, // To override from UI
  }
}
