/**
 * Audio Setup Component
 *
 * Example component demonstrating how to use the StereoMixErrorDialog.
 * This component runs a pre-flight audio test and displays the error dialog
 * if Stereo Mix is not available.
 */

import React, { useState, useEffect } from 'react'
import { Button } from './ui/Button'
import { StereoMixErrorDialog } from './StereoMixErrorDialog'
import type { PreFlightTestResult } from '../../types/ipc'
import './StereoMixErrorDialog.css'

import { rendererLog } from '../utils/logger'
const log = rendererLog.create('AudioSetup')

export const AudioSetup: React.FC = () => {
  const [testResult, setTestResult] = useState<PreFlightTestResult | null>(null)
  const [showDialog, setShowDialog] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // Run pre-flight test on component mount
  useEffect(() => {
    runPreFlightTest()
  }, [])

  const runPreFlightTest = async () => {
    setIsLoading(true)
    try {
      const result = await window.electronAPI?.audio?.preFlightTest()
      if (result.success && result.data) {
        setTestResult(result.data)

        // Show dialog if system audio is not available
        if (!result.data.systemAudio.available && result.data.systemAudio.guidance) {
          setShowDialog(true)
        }
      } else {
        log.error('Pre-flight test failed:', result.error)
      }
    } catch (error) {
      log.error('Error running pre-flight test:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleUseMicrophone = async () => {
    log.info('User chose to use microphone')
    setShowDialog(false)
    // Update app settings to use microphone as audio source
    try {
      await window.electronAPI?.settings?.update({ key: 'audioSource', value: 'microphone' })
      await window.electronAPI?.settings?.update({
        key: 'systemAudioFallback',
        value: 'microphone',
      })
    } catch (err) {
      log.warn('Failed to save audio source setting:', err)
    }
  }

  const handleUseCloud = async () => {
    log.info('User chose to use cloud transcription')
    setShowDialog(false)
    // Update app settings to use cloud transcription as fallback
    try {
      await window.electronAPI?.settings?.update({ key: 'audioSource', value: 'cloud' })
      await window.electronAPI?.settings?.update({ key: 'systemAudioFallback', value: 'cloud' })
    } catch (err) {
      log.warn('Failed to save audio source setting:', err)
    }
  }

  const handleCloseDialog = () => {
    setShowDialog(false)
  }

  if (isLoading) {
    return (
      <div className="audio-setup">
        <p>Testing audio devices...</p>
      </div>
    )
  }

  if (!testResult) {
    return (
      <div className="audio-setup">
        <p>Failed to test audio devices</p>
        <Button variant="primary" onClick={runPreFlightTest} className="mt-4">
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="audio-setup">
      <h2>Audio Setup</h2>

      {/* System Audio Status */}
      <div className="audio-status">
        <h3>System Audio</h3>
        <p>
          Status:{' '}
          {testResult.systemAudio.available ? (
            <span className="status-success">✅ Available</span>
          ) : (
            <span className="status-error">❌ Not Available</span>
          )}
        </p>
        {testResult.systemAudio.error && (
          <p className="error-text">{testResult.systemAudio.error}</p>
        )}
      </div>

      {/* Microphone Status */}
      <div className="audio-status">
        <h3>Microphone</h3>
        <p>
          Status:{' '}
          {testResult.microphone.available ? (
            <span className="status-success">✅ Available</span>
          ) : (
            <span className="status-error">❌ Not Available</span>
          )}
        </p>
        {testResult.microphone.error && <p className="error-text">{testResult.microphone.error}</p>}
      </div>

      {/* Recommendation */}
      <div className="recommendation">
        <h3>Recommendation</h3>
        <p>
          We recommend using:{' '}
          <strong>
            {testResult.recommendation === 'system'
              ? 'System Audio (Stereo Mix)'
              : testResult.recommendation === 'microphone'
                ? 'Microphone'
                : 'Cloud Transcription'}
          </strong>
        </p>
      </div>

      {/* Show Dialog Button (for testing) */}
      {!testResult.systemAudio.available && testResult.systemAudio.guidance && (
        <Button variant="primary" onClick={() => setShowDialog(true)} className="mt-4">
          Show Setup Guide
        </Button>
      )}

      {/* Stereo Mix Error Dialog */}
      {showDialog && testResult.systemAudio.guidance && (
        <StereoMixErrorDialog
          guidance={testResult.systemAudio.guidance}
          onClose={handleCloseDialog}
          onUseMicrophone={handleUseMicrophone}
          onUseCloud={handleUseCloud}
        />
      )}
    </div>
  )
}
