/**
 * Audio Capture Component with Permission Flow Integration
 *
 * Example component demonstrating how to integrate the PermissionRequestFlow
 * into the audio capture workflow.
 *
 * Task 9.7: Integration example for permission request flow UI
 */

import React, { useState, useEffect } from 'react'
import { Button } from './ui/Button'
import { PermissionRequestFlow } from './PermissionRequestFlow'
import { ScreenRecordingPermissionDialog } from './ScreenRecordingPermissionDialog'
import type { ScreenRecordingGuidance } from '../../types/ipc'

import { rendererLog } from '../utils/logger'
const log = rendererLog.create('AudioCapture')

type PermissionStatus = 'not-determined' | 'denied' | 'granted' | 'not-applicable' | 'unknown'

interface AudioCaptureWithPermissionsProps {
  meetingId: string
  onCaptureStarted: () => void
  onCaptureFailed: (error: string) => void
}

export const AudioCaptureWithPermissions: React.FC<AudioCaptureWithPermissionsProps> = ({
  meetingId,
  onCaptureStarted,
  onCaptureFailed,
}) => {
  const [showPermissionFlow, setShowPermissionFlow] = useState(false)
  const [showPermissionDialog, setShowPermissionDialog] = useState(false)
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('unknown')
  const [guidance, setGuidance] = useState<ScreenRecordingGuidance | null>(null)
  const [isCapturing, setIsCapturing] = useState(false)
  const [captureMode, setCaptureMode] = useState<'system' | 'microphone' | 'cloud'>('system')

  useEffect(() => {
    checkPermissionStatus()
  }, [])

  const checkPermissionStatus = async (): Promise<string> => {
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
  }

  const startCapture = async (mode: 'system' | 'microphone' | 'cloud' = 'system') => {
    // If trying to use system audio, check permission first
    if (mode === 'system') {
      const isMacOS = window.electronAPI?.platform === 'darwin'

      if (isMacOS) {
        // Use return value directly — React setState is async, so `permissionStatus`
        // state would still be stale at the if-checks below
        const currentStatus = await checkPermissionStatus()

        if (currentStatus === 'not-determined') {
          setShowPermissionFlow(true)
          return
        }

        if (currentStatus === 'denied') {
          setShowPermissionDialog(true)
          return
        }
      } else {
        // G2: Windows/Linux pre-flight — verify at least one audio device exists
        try {
          const devices = await navigator.mediaDevices.enumerateDevices()
          const hasAudioInput = devices.some(d => d.kind === 'audioinput')
          if (!hasAudioInput) {
            log.error('No audio input devices found')
            onCaptureFailed('No audio input devices found on this system')
            return
          }
        } catch (enumErr) {
          log.warn('Device enumeration failed (non-blocking):', enumErr)
        }
      }
    }

    // Start capture with the specified mode
    try {
      setIsCapturing(true)
      setCaptureMode(mode)

      const result = await window.electronAPI?.audio?.startCapture({
        meetingId,
        // G1-FIX: Was `mode === 'microphone'` — must enable fallback for system mode too
        fallbackToMicrophone: mode !== 'cloud',
      })

      if (result?.success) {
        onCaptureStarted()
      } else {
        throw new Error(result.error?.message || 'Failed to start capture')
      }
    } catch (error) {
      log.error('Error starting capture:', error)
      setIsCapturing(false)
      onCaptureFailed(error instanceof Error ? error.message : 'Unknown error')
    }
  }

  const handlePermissionGranted = async () => {
    // Permission granted, start system audio capture
    setShowPermissionFlow(false)
    await startCapture('system')
  }

  const handlePermissionSkipped = async () => {
    // User skipped, use microphone fallback
    setShowPermissionFlow(false)
    await startCapture('microphone')
  }

  const handleUseMicrophone = async () => {
    // User chose microphone fallback from dialog
    setShowPermissionDialog(false)
    await startCapture('microphone')
  }

  const handleUseCloud = async () => {
    // User chose cloud transcription
    setShowPermissionDialog(false)
    await startCapture('cloud')
  }

  const stopCapture = async () => {
    try {
      const result = await window.electronAPI?.audio?.stopCapture({ meetingId })

      if (result?.success) {
        setIsCapturing(false)
      }
    } catch (error) {
      log.error('Error stopping capture:', error)
    }
  }

  return (
    <div className="audio-capture-container">
      {/* Main UI */}
      <div className="capture-controls">
        <div className="status-section">
          <h3>Audio Capture Status</h3>
          <div className="status-info">
            <p>
              <strong>Mode:</strong> {captureMode}
            </p>
            <p>
              <strong>Status:</strong> {isCapturing ? 'Archiving' : 'Stopped'}
            </p>
            <p>
              <strong>Permission:</strong> {permissionStatus}
            </p>
          </div>
        </div>

        <div className="button-group flex gap-3 mt-4">
          {!isCapturing ? (
            <>
              <Button variant="primary" onClick={() => startCapture('system')}>
                Start Archiving
              </Button>
              <Button variant="secondary" onClick={() => startCapture('microphone')}>
                Start with Microphone
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={stopCapture}>
              Stop Archiving
            </Button>
          )}
        </div>

        <div className="info-section">
          <p className="info-text">
            {captureMode === 'system' && 'Capturing system audio from all meeting participants'}
            {captureMode === 'microphone' && 'Capturing audio from your microphone only'}
            {captureMode === 'cloud' && 'Using cloud transcription service'}
          </p>
        </div>
      </div>

      {/* Permission Request Flow (for not-determined state) */}
      {showPermissionFlow && (
        <PermissionRequestFlow
          onGranted={handlePermissionGranted}
          onSkip={handlePermissionSkipped}
          onClose={() => setShowPermissionFlow(false)}
        />
      )}

      {/* Permission Dialog (for denied state) */}
      {showPermissionDialog && guidance && (
        <ScreenRecordingPermissionDialog
          guidance={guidance}
          onClose={() => setShowPermissionDialog(false)}
          onUseMicrophone={handleUseMicrophone}
          onUseCloud={handleUseCloud}
        />
      )}
    </div>
  )
}
