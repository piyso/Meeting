/**
 * Stereo Mix Error Dialog Component
 *
 * Displays user-friendly error message and step-by-step guidance when Stereo Mix is not enabled.
 * Provides options to:
 * 1. Open Windows Sound settings
 * 2. Use microphone fallback
 * 3. Use cloud transcription
 */

import React from 'react'
import type { StereoMixGuidance } from '../../types/ipc'
import { Button } from './ui/Button'
import { IconButton } from './ui/IconButton'

import { rendererLog } from '../utils/logger'
const log = rendererLog.create('StereoMix')

interface StereoMixErrorDialogProps {
  guidance: StereoMixGuidance
  onClose: () => void
  onUseMicrophone: () => void
  onUseCloud: () => void
}

export const StereoMixErrorDialog: React.FC<StereoMixErrorDialogProps> = ({
  guidance,
  onClose,
  onUseMicrophone,
  onUseCloud,
}) => {
  const handleOpenSettings = async () => {
    try {
      const result = await window.electronAPI?.audio?.openSoundSettings()
      if (result.success) {
        log.info('Opened Windows Sound settings')
      } else {
        log.error('Failed to open Sound settings:', result.error)
      }
    } catch (error) {
      log.error('Error opening Sound settings:', error)
    }
  }

  return (
    <div className="stereo-mix-error-dialog-overlay">
      <div className="stereo-mix-error-dialog">
        {/* Header */}
        <div className="dialog-header flex justify-between items-center mb-4">
          <h2>⚠️ System Audio Not Available</h2>
          <IconButton
            icon={<span style={{ fontSize: 16 }}>✕</span>}
            onClick={onClose}
            tooltip="Close"
            aria-label="Close"
          />
        </div>

        {/* Error Message */}
        <div className="dialog-content">
          <p className="error-message">
            Stereo Mix is not enabled on your Windows system. To capture system audio (like meeting
            audio from Zoom, Teams, or Google Meet), you need to enable Stereo Mix in Windows Sound
            settings.
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
          <div className="action-section mt-6">
            <Button
              variant="primary"
              onClick={handleOpenSettings}
              className="w-full justify-center"
            >
              🔊 Open Windows Sound Settings
            </Button>
            <p className="help-text mt-2 text-sm">
              This will open Windows Sound settings where you can enable Stereo Mix.
            </p>
          </div>

          {/* Fallback Options */}
          <div className="fallback-section">
            <h3>Alternative Options</h3>
            <div className="fallback-options">
              {guidance.fallbackOptions?.map((option, index) => (
                <div key={index} className="fallback-option">
                  <h4>
                    {option.type === 'microphone'
                      ? '🎤 Use Microphone'
                      : '☁️ Use Cloud Transcription'}
                  </h4>
                  <p className="text-sm mb-4">{option.description}</p>
                  <Button
                    variant="secondary"
                    onClick={option.type === 'microphone' ? onUseMicrophone : onUseCloud}
                    className="w-full justify-center"
                  >
                    {option.type === 'microphone' ? 'Use Microphone' : 'Use Cloud Transcription'}
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Documentation and Video Tutorial Links */}
          <div className="resources-section">
            <h3>Need More Help?</h3>
            <div className="resource-links flex gap-4 mt-4 mb-2">
              <Button
                variant="ghost"
                className="resource-link text-[var(--color-violet)]"
                onClick={() => {
                  // Open the comprehensive documentation
                  window.electronAPI.shell?.openExternal(
                    'https://docs.bluearkive.com/enable-stereo-mix'
                  )
                }}
              >
                📖 View Complete Guide
              </Button>
              {guidance.videoTutorialUrl && (
                <a
                  href={guidance.videoTutorialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="resource-link"
                >
                  📺 Watch Video Tutorial
                </a>
              )}
            </div>
            <p className="help-text">
              For detailed troubleshooting, screenshots, and alternative solutions, see our complete
              guide.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
