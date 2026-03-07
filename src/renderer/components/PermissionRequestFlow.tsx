/**
 * Permission Request Flow Component
 *
 * Comprehensive permission request flow for macOS Screen Recording permission.
 * Handles all permission states: not-determined, denied, granted
 * Provides clear explanation and "Skip" option to use microphone fallback.
 *
 * Task 9.7: Create permission request flow UI
 */

import React, { useState, useEffect } from 'react'
import './PermissionRequestFlow.css'

import { rendererLog } from '../utils/logger'
const log = rendererLog.create('PermFlow')

type PermissionStatus = 'not-determined' | 'denied' | 'granted' | 'not-applicable' | 'unknown'

interface PermissionRequestFlowProps {
  onGranted: () => void
  onSkip: () => void
  onClose: () => void
}

export const PermissionRequestFlow: React.FC<PermissionRequestFlowProps> = ({
  onGranted,
  onSkip,
  onClose,
}) => {
  const [status, setStatus] = useState<PermissionStatus>('unknown')
  const [isChecking, setIsChecking] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    checkPermissionStatus()
  }, [])

  useEffect(() => {
    if (status === 'granted') {
      onGranted()
      setTimeout(onClose, 1000)
    } else if (status === 'not-applicable') {
      onClose()
    }
  }, [status, onGranted, onClose])

  const checkPermissionStatus = async () => {
    setIsChecking(true)
    setError(null)

    try {
      const result = await window.electronAPI.audio.getScreenRecordingPermission()

      if (result.success && result.data) {
        setStatus(result.data.status as PermissionStatus)
      } else {
        setError(result.error?.message || 'Failed to check permission status')
        setStatus('unknown')
      }
    } catch (err) {
      log.error('Error checking permission:', err)
      setError('Failed to check permission status')
      setStatus('unknown')
    } finally {
      setIsChecking(false)
    }
  }

  const handleRequestPermission = async () => {
    try {
      // Open System Settings to request permission
      const result = await window.electronAPI.audio.openScreenRecordingSettings()

      if (result.success) {
        // Show message to user
        setStatus('denied') // Will show instructions
      } else {
        setError(result.error?.message || 'Failed to open System Settings')
      }
    } catch (err) {
      log.error('Error opening settings:', err)
      setError('Failed to open System Settings')
    }
  }

  const handleSkip = () => {
    onSkip()
    onClose()
  }

  const handleRetryCheck = () => {
    checkPermissionStatus()
  }

  // If checking, show loading state
  if (isChecking) {
    return (
      <div className="permission-flow-overlay">
        <div className="permission-flow-dialog">
          <div className="permission-flow-content">
            <div className="loading-spinner"></div>
            <p>Checking Screen Recording permission...</p>
          </div>
        </div>
      </div>
    )
  }
  // If granted, notify and close
  if (status === 'granted') {
    return (
      <div className="permission-flow-overlay">
        <div className="permission-flow-dialog">
          <div className="permission-flow-content">
            <div className="success-icon">✓</div>
            <h2>Permission Granted</h2>
            <p>Screen Recording permission is enabled. You can now capture system audio.</p>
          </div>
        </div>
      </div>
    )
  }

  // If not applicable (non-macOS), close immediately
  if (status === 'not-applicable') {
    return null
  }

  // Main permission request flow
  return (
    <div className="permission-flow-overlay">
      <div className="permission-flow-dialog">
        {/* Header */}
        <div className="permission-flow-header">
          <h2>🎙️ Enable System Audio Capture</h2>
          <button className="close-button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {/* Content */}
        <div className="permission-flow-content">
          {/* Error Message */}
          {error && (
            <div className="error-banner">
              <span className="error-icon">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* Permission Status Indicator */}
          <div className="permission-status">
            <div className={`status-indicator status-${status}`}>
              <span className="status-dot"></span>
              <span className="status-text">
                {status === 'not-determined' && 'Permission Not Requested'}
                {status === 'denied' && 'Permission Denied'}
                {status === 'unknown' && 'Permission Status Unknown'}
              </span>
            </div>
          </div>

          {/* Explanation */}
          <div className="explanation-section">
            <h3>Why This Permission?</h3>
            <p>
              BlueArkive needs Screen Recording permission to capture system audio from your
              meetings (Zoom, Teams, Google Meet, etc.). This allows the app to:
            </p>
            <ul className="benefits-list">
              <li>
                <span className="benefit-icon">🎧</span>
                <span>Capture audio from all meeting participants, not just your microphone</span>
              </li>
              <li>
                <span className="benefit-icon">📝</span>
                <span>Transcribe complete conversations for accurate meeting notes</span>
              </li>
              <li>
                <span className="benefit-icon">🔒</span>
                <span>Process everything locally - no screen visuals are captured or stored</span>
              </li>
            </ul>
            <p className="privacy-note">
              <strong>Privacy First:</strong> Despite the name "Screen Recording," we only capture
              audio. No screen visuals are recorded, and all processing happens on your device.
            </p>
          </div>

          {/* Instructions based on status */}
          {status === 'not-determined' && (
            <div className="instructions-section">
              <h3>How to Enable</h3>
              <ol className="steps-list">
                <li>Click "Grant Permission" below</li>
                <li>macOS will open System Settings</li>
                <li>Find "BlueArkive" in the list</li>
                <li>Toggle the switch to enable Screen Recording</li>
                <li>Return to this app and click "Check Again"</li>
              </ol>
            </div>
          )}

          {status === 'denied' && (
            <div className="instructions-section">
              <h3>Permission Currently Denied</h3>
              <ol className="steps-list">
                <li>Click "Open System Settings" below</li>
                <li>Navigate to Privacy & Security → Screen Recording</li>
                <li>Find "BlueArkive" in the list</li>
                <li>Toggle the switch to ON</li>
                <li>Return to this app and click "Check Again"</li>
                <li>You may need to restart the app for changes to take effect</li>
              </ol>
            </div>
          )}

          {/* Action Buttons */}
          <div className="action-buttons">
            {status === 'not-determined' && (
              <button className="primary-button" onClick={handleRequestPermission}>
                Grant Permission
              </button>
            )}

            {status === 'denied' && (
              <>
                <button className="primary-button" onClick={handleRequestPermission}>
                  Open System Settings
                </button>
                <button className="secondary-button" onClick={handleRetryCheck}>
                  Check Again
                </button>
              </>
            )}

            {status === 'unknown' && (
              <button className="secondary-button" onClick={handleRetryCheck}>
                Check Permission Status
              </button>
            )}
          </div>

          {/* Skip Option */}
          <div className="skip-section">
            <div className="divider">
              <span>OR</span>
            </div>
            <div className="skip-content">
              <h4>Skip and Use Microphone</h4>
              <p>
                You can skip this step and use your microphone instead. This will capture your voice
                but not the audio from other meeting participants.
              </p>
              <button className="skip-button" onClick={handleSkip}>
                Skip - Use Microphone Only
              </button>
            </div>
          </div>

          {/* Help Section */}
          <div className="help-section">
            <p className="help-text">
              Need help?{' '}
              <button
                className="help-link"
                onClick={() => {
                  window.electronAPI.shell?.openExternal(
                    'https://docs.bluearkive.com/macos-screen-recording-permission'
                  )
                }}
              >
                View detailed guide
              </button>{' '}
              or{' '}
              <button
                className="help-link"
                onClick={() => {
                  window.electronAPI.shell?.openExternal(
                    'https://support.apple.com/guide/mac-help/control-access-to-screen-recording-mchld6aa7d23/mac'
                  )
                }}
              >
                Apple Support
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
