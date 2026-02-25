/**
 * Audio Test UI Component
 * Task 12.1: Create audio test UI
 *
 * Provides a comprehensive audio testing interface with:
 * - "Test Audio Capture" button
 * - Real-time audio level meter
 * - System audio and microphone testing
 * - Visual feedback and status indicators
 */

import React, { useState, useEffect, useRef } from 'react'
import type { PreFlightTestResult } from '../../types/ipc'
import { SystemAudioTest } from './SystemAudioTest'
import { MicrophoneTest } from './MicrophoneTest'
import './AudioTestUI.css'

interface AudioTestUIProps {
  onTestComplete?: (result: PreFlightTestResult) => void
  showInSettings?: boolean
}

export const AudioTestUI: React.FC<AudioTestUIProps> = ({
  onTestComplete,
  showInSettings = false,
}) => {
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<PreFlightTestResult | null>(null)
  const [audioLevel, setAudioLevel] = useState(0)
  const [testPhase, setTestPhase] = useState<'idle' | 'system' | 'microphone' | 'complete'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [showSystemAudioTest, setShowSystemAudioTest] = useState(false)
  const [showMicrophoneTest, setShowMicrophoneTest] = useState(false)

  const animationFrameRef = useRef<number>()
  const audioLevelUnsubscribeRef = useRef<(() => void) | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    const currentAnimationFrame = animationFrameRef.current
    const currentUnsubscribe = audioLevelUnsubscribeRef.current

    return () => {
      if (currentAnimationFrame) {
        cancelAnimationFrame(currentAnimationFrame)
      }
      if (currentUnsubscribe) {
        currentUnsubscribe()
      }
    }
  }, [])

  // Subscribe to audio level updates
  useEffect(() => {
    if (isTesting) {
      const unsubscribe = window.electronAPI.on.audioEvent(event => {
        if (event.type === 'level' && event.level) {
          setAudioLevel(event.level.level)
        }
      })
      audioLevelUnsubscribeRef.current = unsubscribe
      return () => {
        unsubscribe()
      }
    }
    return undefined
  }, [isTesting])

  const startAudioTest = async () => {
    setIsTesting(true)
    setError(null)
    setTestPhase('system')
    setAudioLevel(0)

    try {
      // Run pre-flight test
      const result = await window.electronAPI.audio.preFlightTest()

      if (result.success && result.data) {
        setTestResult(result.data)
        setTestPhase('complete')

        if (onTestComplete) {
          onTestComplete(result.data)
        }
      } else {
        setError(result.error?.message || 'Audio test failed')
        setTestPhase('idle')
      }
    } catch (err) {
      console.error('Error running audio test:', err)
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
      setTestPhase('idle')
    } finally {
      setIsTesting(false)
    }
  }

  const resetTest = () => {
    setTestResult(null)
    setTestPhase('idle')
    setAudioLevel(0)
    setError(null)
  }

  const getStatusIcon = (available: boolean, tested: boolean) => {
    if (!tested) return '⏳'
    return available ? '✅' : '❌'
  }

  const getStatusText = (available: boolean, tested: boolean) => {
    if (!tested) return 'Not tested'
    return available ? 'Working' : 'Failed'
  }

  const getStatusClass = (available: boolean, tested: boolean) => {
    if (!tested) return 'status-pending'
    return available ? 'status-success' : 'status-failed'
  }

  const getRecommendationText = (recommendation: string) => {
    switch (recommendation) {
      case 'system':
        return 'System Audio (Best quality)'
      case 'microphone':
        return 'Microphone (Fallback)'
      case 'cloud':
        return 'Cloud Transcription (Requires internet)'
      default:
        return 'Unknown'
    }
  }

  return (
    <div className={`audio-test-ui ${showInSettings ? 'in-settings' : ''}`}>
      <div className="audio-test-header">
        <h3>Audio Capture Test</h3>
        <p className="audio-test-description">
          Test your audio devices to ensure optimal recording quality
        </p>
        <div className="platform-indicator">
          <span className="platform-label">Platform:</span>
          <span className="platform-value">
            {process.platform === 'darwin'
              ? '🍎 macOS'
              : process.platform === 'win32'
                ? '🪟 Windows'
                : '🐧 Linux'}
          </span>
          <span className="platform-hint">
            {process.platform === 'darwin'
              ? '(Requires Screen Recording permission)'
              : process.platform === 'win32'
                ? '(Requires Stereo Mix enabled)'
                : '(System audio support varies)'}
          </span>
        </div>
      </div>

      {/* Test Button */}
      <div className="audio-test-actions">
        <button
          className="btn-test-audio"
          onClick={startAudioTest}
          disabled={isTesting}
          aria-label="Test audio capture"
        >
          {isTesting ? '🔄 Testing...' : '🎙️ Test Audio Capture'}
        </button>

        {testResult && (
          <button className="btn-reset" onClick={resetTest} aria-label="Reset test">
            🔄 Test Again
          </button>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="audio-test-error" role="alert">
          <span className="error-icon">⚠️</span>
          <span className="error-message">{error}</span>
        </div>
      )}

      {/* Audio Level Meter */}
      {isTesting && (
        <div className="audio-level-meter">
          <div className="meter-label">Audio Level</div>
          <div className="meter-container">
            <div className="meter-bar">
              <div
                className="meter-fill"
                style={{
                  width: `${audioLevel * 100}%`,
                  backgroundColor:
                    audioLevel > 0.7 ? '#f44336' : audioLevel > 0.4 ? '#ff9800' : '#4caf50',
                }}
                role="progressbar"
                aria-valuenow={audioLevel * 100}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
            <div className="meter-value">{Math.round(audioLevel * 100)}%</div>
          </div>
          <div className="meter-hint">
            {audioLevel > 0.1 ? '🎵 Audio detected' : '🔇 Speak or play audio...'}
          </div>
        </div>
      )}

      {/* Test Phase Indicator */}
      {isTesting && (
        <div className="test-phase-indicator">
          <div className={`phase-step ${testPhase === 'system' ? 'active' : ''}`}>
            <span className="phase-icon">🔊</span>
            <span className="phase-label">Testing System Audio</span>
          </div>
          <div className={`phase-step ${testPhase === 'microphone' ? 'active' : ''}`}>
            <span className="phase-icon">🎤</span>
            <span className="phase-label">Testing Microphone</span>
          </div>
        </div>
      )}

      {/* Test Results */}
      {testResult && testPhase === 'complete' && (
        <div className="audio-test-results">
          <h4>Test Results</h4>

          {/* System Audio Status */}
          <div
            className={`result-item ${getStatusClass(testResult.systemAudio.available, testResult.systemAudio.tested)}`}
          >
            <div className="result-header">
              <span className="result-icon">
                {getStatusIcon(testResult.systemAudio.available, testResult.systemAudio.tested)}
              </span>
              <span className="result-title">System Audio</span>
              <span
                className={`result-badge ${getStatusClass(testResult.systemAudio.available, testResult.systemAudio.tested)}`}
              >
                {getStatusText(testResult.systemAudio.available, testResult.systemAudio.tested)}
              </span>
            </div>
            {testResult.systemAudio.error && (
              <div className="result-error">
                <span className="error-icon">⚠️</span>
                <span>{testResult.systemAudio.error}</span>
              </div>
            )}
          </div>

          {/* Microphone Status */}
          <div
            className={`result-item ${getStatusClass(testResult.microphone.available, testResult.microphone.tested)}`}
          >
            <div className="result-header">
              <span className="result-icon">
                {getStatusIcon(testResult.microphone.available, testResult.microphone.tested)}
              </span>
              <span className="result-title">Microphone</span>
              <span
                className={`result-badge ${getStatusClass(testResult.microphone.available, testResult.microphone.tested)}`}
              >
                {getStatusText(testResult.microphone.available, testResult.microphone.tested)}
              </span>
            </div>
            {testResult.microphone.error && (
              <div className="result-error">
                <span className="error-icon">⚠️</span>
                <span>{testResult.microphone.error}</span>
              </div>
            )}
          </div>

          {/* Recommendation */}
          <div className="result-recommendation">
            <div className="recommendation-label">Recommended:</div>
            <div className="recommendation-value">
              {getRecommendationText(testResult.recommendation)}
            </div>
          </div>

          {/* Task 12.6: Diagnostic Export Section */}
          <div className="diagnostic-export-section">
            <h5>Diagnostic Logs</h5>
            <p className="diagnostic-description">
              Test results have been saved for troubleshooting. You can export or view the logs.
            </p>
            <div className="diagnostic-actions">
              <button
                className="btn-export-diagnostics"
                onClick={async () => {
                  try {
                    const result = await window.electronAPI.audio.exportDiagnostics()
                    if (result.success && result.data) {
                      alert(`Diagnostics exported to:\n${result.data}`)
                    } else {
                      alert('Failed to export diagnostics')
                    }
                  } catch (err) {
                    console.error('Failed to export diagnostics:', err)
                    alert('Failed to export diagnostics')
                  }
                }}
              >
                📦 Export Diagnostics
              </button>
              <button
                className="btn-open-diagnostics"
                onClick={async () => {
                  try {
                    await window.electronAPI.audio.openDiagnosticsFolder()
                  } catch (err) {
                    console.error('Failed to open diagnostics folder:', err)
                  }
                }}
              >
                📁 View Logs Folder
              </button>
            </div>
          </div>

          {/* Guidance for System Audio Issues */}
          {!testResult.systemAudio.available && testResult.systemAudio.guidance && (
            <div className="result-guidance">
              <h5>{testResult.systemAudio.guidance.title}</h5>
              <p className="guidance-description">
                {process.platform === 'darwin'
                  ? 'macOS requires Screen Recording permission to capture system audio. Follow these steps:'
                  : 'Windows requires Stereo Mix to be enabled for system audio capture. Follow these steps:'}
              </p>
              <ol className="guidance-steps">
                {testResult.systemAudio.guidance.steps.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
              <div className="guidance-actions">
                {testResult.systemAudio.guidance.settingsLink && (
                  <button
                    className="btn-open-settings"
                    onClick={async () => {
                      try {
                        await window.electronAPI.audio.openSoundSettings()
                      } catch (err) {
                        console.error('Failed to open settings:', err)
                      }
                    }}
                  >
                    ⚙️ Open Sound Settings
                  </button>
                )}
                {/* Task 12.2: Add button to test system audio capture */}
                <button
                  className="btn-test-system-audio"
                  onClick={() => setShowSystemAudioTest(true)}
                >
                  🔊 Test System Audio Capture
                </button>
                {/* Task 12.3: Add button to test microphone */}
                <button className="btn-test-microphone" onClick={() => setShowMicrophoneTest(true)}>
                  🎤 Test Microphone Capture
                </button>
              </div>
              {/* Show fallback options if available */}
              {testResult.systemAudio.guidance.fallbackOptions &&
                testResult.systemAudio.guidance.fallbackOptions.length > 0 && (
                  <div className="fallback-options">
                    <h6>Alternative Options:</h6>
                    <ul>
                      {testResult.systemAudio.guidance.fallbackOptions.map((option, index) => (
                        <li key={index}>
                          <strong>
                            {option.type === 'microphone' ? '🎤 Microphone' : '☁️ Cloud'}:
                          </strong>{' '}
                          {option.description}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
            </div>
          )}
        </div>
      )}

      {/* Task 12.2: System Audio Test Modal */}
      {showSystemAudioTest && (
        <div className="system-audio-test-modal">
          <div className="modal-overlay" onClick={() => setShowSystemAudioTest(false)} />
          <div className="modal-content">
            <button
              className="modal-close"
              onClick={() => setShowSystemAudioTest(false)}
              aria-label="Close"
            >
              ✕
            </button>
            <SystemAudioTest
              onTestComplete={result => {
                console.log('System audio test complete:', result)
                if (result.success) {
                  // Update test result to show system audio is working
                  if (testResult) {
                    setTestResult({
                      ...testResult,
                      systemAudio: {
                        ...testResult.systemAudio,
                        available: true,
                        tested: true,
                        error: undefined,
                      },
                      recommendation: 'system',
                    })
                  }
                }
                // Keep modal open to show results
              }}
            />
          </div>
        </div>
      )}

      {/* Task 12.3: Microphone Test Modal */}
      {showMicrophoneTest && (
        <div className="microphone-test-modal">
          <div className="modal-overlay" onClick={() => setShowMicrophoneTest(false)} />
          <div className="modal-content">
            <button
              className="modal-close"
              onClick={() => setShowMicrophoneTest(false)}
              aria-label="Close"
            >
              ✕
            </button>
            <MicrophoneTest
              onTestComplete={result => {
                console.log('Microphone test complete:', result)
                if (result.success) {
                  // Update test result to show microphone is working
                  if (testResult) {
                    setTestResult({
                      ...testResult,
                      microphone: {
                        ...testResult.microphone,
                        available: true,
                        tested: true,
                        error: undefined,
                      },
                    })
                  }
                }
                // Keep modal open to show results
              }}
            />
          </div>
        </div>
      )}

      {/* Instructions */}
      {!isTesting && !testResult && (
        <div className="audio-test-instructions">
          <h4>Before Testing:</h4>
          <ul>
            <li>Close other applications using your microphone</li>
            <li>Ensure your speakers or headphones are connected</li>
            <li>Have a YouTube video or audio file ready to play</li>
          </ul>
        </div>
      )}
    </div>
  )
}
