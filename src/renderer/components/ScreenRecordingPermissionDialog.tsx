/**
 * Screen Recording Permission Dialog Component
 *
 * Displays user-friendly error message and step-by-step guidance when Screen Recording permission is denied on macOS.
 * Provides options to:
 * 1. Open macOS System Settings to grant permission
 * 2. Use microphone fallback
 * 3. Use cloud transcription
 */

import React from 'react'
import type { ScreenRecordingGuidance } from '../../types/ipc'
import './ScreenRecordingPermissionDialog.css'

import { rendererLog } from '../utils/logger'
const log = rendererLog.create('ScreenRecPerm')

interface ScreenRecordingPermissionDialogProps {
  guidance: ScreenRecordingGuidance
  onClose: () => void
  onUseMicrophone: () => void
  onUseCloud: () => void
}

export const ScreenRecordingPermissionDialog: React.FC<ScreenRecordingPermissionDialogProps> = ({
  guidance,
  onClose,
  onUseMicrophone,
  onUseCloud,
}) => {
  const handleOpenSettings = async () => {
    try {
      const result = await window.electronAPI?.audio?.openScreenRecordingSettings()
      if (result.success) {
        log.info('Opened macOS System Settings for Screen Recording')
      } else {
        log.error('Failed to open System Settings:', result.error)
      }
    } catch (error) {
      log.error('Error opening System Settings:', error)
    }
  }

  return (
    <div className="screen-recording-dialog-overlay">
      <div className="screen-recording-dialog">
        {/* Header */}
        <div className="dialog-header">
          <h2>🔒 Screen Recording Permission Required</h2>
          <button className="close-button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {/* Error Message */}
        <div className="dialog-content">
          <p className="error-message">
            BlueArkive needs Screen Recording permission to capture system audio from your meetings
            (Zoom, Teams, Google Meet, etc.). This permission allows the app to record audio from
            your computer's output, not your screen visuals.
          </p>

          {/* Step-by-Step Guide */}
          <div className="guidance-section">
            <h3>{guidance.title}</h3>
            <ol className="steps-list">
              {guidance.steps.map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ol>
          </div>

          {/* Quick Action Button */}
          <div className="action-section">
            <button className="primary-button" onClick={handleOpenSettings}>
              ⚙️ Open System Settings
            </button>
            <p className="help-text">
              This will open macOS System Settings where you can grant Screen Recording permission.
            </p>
          </div>

          {/* Fallback Options */}
          <div className="fallback-section">
            <h3>Alternative Options</h3>
            <div className="fallback-options">
              <div className="fallback-option">
                <h4>🎤 Use Microphone</h4>
                <p>
                  Record audio from your microphone instead of system audio. You'll capture your
                  voice but not the audio from other participants.
                </p>
                <button className="secondary-button" onClick={onUseMicrophone}>
                  Use Microphone
                </button>
              </div>

              <div className="fallback-option">
                <h4>☁️ Use Cloud Transcription</h4>
                <p>
                  Use cloud-based transcription service. Requires internet connection and may incur
                  costs depending on your plan.
                </p>
                <button className="secondary-button" onClick={onUseCloud}>
                  Use Cloud Transcription
                </button>
              </div>
            </div>
          </div>

          {/* Why This Permission Section */}
          <div className="info-section">
            <h3>Why This Permission?</h3>
            <p>
              macOS requires Screen Recording permission for apps to capture system audio. This is a
              security feature to protect your privacy. BlueArkive only captures audio, not screen
              visuals, and all data stays on your device unless you enable cloud sync.
            </p>
          </div>

          {/* Resources Section */}
          <div className="resources-section">
            <h3>Need More Help?</h3>
            <div className="resource-links">
              <button
                className="resource-link"
                onClick={() => {
                  window.electronAPI.shell?.openExternal(
                    'https://docs.bluearkive.com/macos-screen-recording-permission'
                  )
                }}
              >
                📖 View Complete Guide
              </button>
              <button
                className="resource-link"
                onClick={() => {
                  window.electronAPI.shell?.openExternal(
                    'https://support.apple.com/guide/mac-help/control-access-to-screen-recording-mchld6aa7d23/mac'
                  )
                }}
              >
                🍎 Apple Support Article
              </button>
            </div>
            <p className="help-text">
              For detailed troubleshooting and screenshots, see our complete guide or Apple's
              official documentation.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
