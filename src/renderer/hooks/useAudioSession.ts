import { useState, useCallback } from 'react'

import { rendererLog } from '../utils/logger'
const log = rendererLog.create('AudioSession')

export type CaptureMode = 'system' | 'microphone' | 'cloud'
export type PermissionStatus =
  | 'not-determined'
  | 'denied'
  | 'granted'
  | 'not-applicable'
  | 'unknown'

export function useAudioSession(meetingId: string | null) {
  const [isCapturing, setIsCapturing] = useState(false)
  const [captureMode, setCaptureMode] = useState<CaptureMode>('system')
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('unknown')
  const [guidance, setGuidance] = useState<any | null>(null)

  const checkPermissionStatus = useCallback(async () => {
    try {
      const result = await window.electronAPI.audio.getScreenRecordingPermission()
      if (result.success && result.data) {
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

  const startCapture = useCallback(
    async (mode: CaptureMode = 'system'): Promise<boolean> => {
      if (!meetingId) return false

      // Check permission for system mode on Mac
      if (mode === 'system') {
        const isMacOS = window.electronAPI?.platform === 'darwin'
        if (isMacOS) {
          const status = await checkPermissionStatus()
          if (status === 'not-determined' || status === 'denied') {
            return false // Flow will be handled by UI observing permissionStatus
          }
        }
      }

      try {
        setIsCapturing(true)
        setCaptureMode(mode)

        const result = await window.electronAPI.audio.startCapture({
          meetingId,
          fallbackToMicrophone: mode === 'microphone',
        })

        if (!result.success) {
          setIsCapturing(false)
          throw new Error(result.error?.message || 'Failed to start capture')
        }
        return true
      } catch (error) {
        log.error('Error starting capture:', error)
        setIsCapturing(false)
        throw error
      }
    },
    [meetingId, checkPermissionStatus]
  )

  const stopCapture = useCallback(async () => {
    if (!meetingId) return
    try {
      const result = await window.electronAPI.audio.stopCapture({ meetingId })
      if (result.success) {
        setIsCapturing(false)
      }
    } catch (error) {
      log.error('Error stopping capture:', error)
    }
  }, [meetingId])

  return {
    isCapturing,
    captureMode,
    permissionStatus,
    guidance,
    checkPermissionStatus,
    startCapture,
    stopCapture,
    setPermissionStatus, // To override from UI
  }
}
