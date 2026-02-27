/**
 * Audio Capture Component with Permission Flow Integration
 *
 * Example component demonstrating how to integrate the PermissionRequestFlow
 * into the audio capture workflow.
 *
 * Task 9.7: Integration example for permission request flow UI
 */

import React, { useState, useEffect } from 'react'
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

  const checkPermissionStatus = async () => {
    try {
      const result = await window.electronAPI.audio.getScreenRecordingPermission()

      if (result.success && result.data) {
        setPermissionStatus(result.data.status as PermissionStatus)

        if (result.data.guidance) {
          setGuidance(result.data.guidance)
        }
      }
    } catch (error) {
      log.error('Error checking permission:', error)
    }
  }

  const startCapture = async (mode: 'system' | 'microphone' | 'cloud' = 'system') => {
    // If trying to use system audio, check permission first
    if (mode === 'system') {
      const isMacOS = window.electronAPI?.platform === 'darwin'

      if (isMacOS) {
        await checkPermissionStatus()

        // If permission not granted, show permission flow
        if (permissionStatus === 'not-determined') {
          setShowPermissionFlow(true)
          return
        }

        if (permissionStatus === 'denied') {
          setShowPermissionDialog(true)
          return
        }
      }
    }

    // Start capture with the specified mode
    try {
      setIsCapturing(true)
      setCaptureMode(mode)

      const result = await window.electronAPI.audio.startCapture({
        meetingId,
        fallbackToMicrophone: mode === 'microphone',
      })

      if (result.success) {
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
      const result = await window.electronAPI.audio.stopCapture({ meetingId })

      if (result.success) {
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
              <strong>Status:</strong> {isCapturing ? 'Recording' : 'Stopped'}
            </p>
            <p>
              <strong>Permission:</strong> {permissionStatus}
            </p>
          </div>
        </div>

        <div className="button-group">
          {!isCapturing ? (
            <>
              <button className="start-button" onClick={() => startCapture('system')}>
                Start Recording
              </button>
              <button className="start-button-alt" onClick={() => startCapture('microphone')}>
                Start with Microphone
              </button>
            </>
          ) : (
            <button className="stop-button" onClick={stopCapture}>
              Stop Recording
            </button>
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
