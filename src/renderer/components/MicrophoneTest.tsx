/**
 * Microphone Test Component
 * Task 12.3: Test microphone capture
 *
 * Provides a guided test for microphone capture:
 * - Instructs user to speak into microphone
 * - Captures and analyzes audio in real-time
 * - Verifies audio is being captured
 * - Provides clear feedback and guidance
 */

import React, { useState, useEffect, useRef } from 'react'
import './MicrophoneTest.css'

import { rendererLog } from '../utils/logger'
const log = rendererLog.create('MicTest')

interface MicrophoneTestProps {
  onTestComplete?: (result: { success: boolean; audioDetected: boolean; maxLevel: number }) => void
}

export const MicrophoneTest: React.FC<MicrophoneTestProps> = ({ onTestComplete }) => {
  const [testPhase, setTestPhase] = useState<
    'idle' | 'instructions' | 'testing' | 'complete' | 'error'
  >('idle')
  const [audioLevel, setAudioLevel] = useState(0)
  const [audioDetected, setAudioDetected] = useState(false)
  const [maxLevel, setMaxLevel] = useState(0)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [testMessage, setTestMessage] = useState('')

  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const testStartTimeRef = useRef<number>(0)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTest()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startTest = async () => {
    setTestPhase('instructions')
    setError(null)
    setAudioDetected(false)
    setMaxLevel(0)
    setDuration(0)

    try {
      // Start microphone test session on backend
      const result = await window.electronAPI.audio.startMicrophoneTest()

      if (!result.success || !result.data) {
        throw new Error(result.error?.message || 'Failed to start microphone test')
      }

      setTestMessage(result.data.message)

      // Wait 3 seconds for user to read instructions
      await new Promise(resolve => setTimeout(resolve, 3000))

      // Start audio capture
      await startAudioCapture()

      setTestPhase('testing')
      testStartTimeRef.current = Date.now()

      // Start monitoring audio levels
      monitorAudioLevels()
    } catch (err) {
      log.error('Error starting microphone test:', err)
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
      setTestPhase('error')
    }
  }

  const startAudioCapture = async () => {
    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 16000,
        },
        video: false,
      })

      mediaStreamRef.current = stream

      // Create audio context and analyser
      const audioContext = new AudioContext({ sampleRate: 16000 })
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()

      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.8

      source.connect(analyser)

      audioContextRef.current = audioContext
      analyserRef.current = analyser

      log.info('✅ Microphone capture started')
    } catch (err) {
      log.error('Failed to start microphone capture:', err)
      throw new Error(
        'Failed to access microphone. Please ensure microphone permission is granted.'
      )
    }
  }

  const monitorAudioLevels = () => {
    if (!analyserRef.current) return

    const analyser = analyserRef.current
    const dataArray = new Uint8Array(analyser.frequencyBinCount)

    const updateLevel = () => {
      analyser.getByteFrequencyData(dataArray)

      // Calculate RMS level
      let sum = 0
      for (let i = 0; i < dataArray.length; i++) {
        const normalized = (dataArray[i] ?? 0) / 255
        sum += normalized * normalized
      }
      const rms = Math.sqrt(sum / dataArray.length)

      setAudioLevel(rms)

      // Update max level
      if (rms > maxLevel) {
        setMaxLevel(rms)
      }

      // Detect audio (threshold: 1%)
      if (rms > 0.01 && !audioDetected) {
        setAudioDetected(true)
        log.info('✅ Audio detected! Level:', Math.round(rms * 100) + '%')
      }

      // Update duration
      const elapsed = Date.now() - testStartTimeRef.current
      setDuration(elapsed)

      // Continue monitoring
      animationFrameRef.current = requestAnimationFrame(updateLevel)
    }

    updateLevel()
  }

  const stopTest = async () => {
    // Stop animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    // Stop media stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop())
      mediaStreamRef.current = null
    }

    // Close audio context
    if (audioContextRef.current) {
      await audioContextRef.current.close()
      audioContextRef.current = null
    }

    analyserRef.current = null

    // Stop backend test session
    try {
      const result = await window.electronAPI.audio.stopMicrophoneTest()

      if (result.success && result.data) {
        log.info('Microphone test stopped:', result.data)

        setTestPhase('complete')

        if (onTestComplete) {
          onTestComplete({
            success: result.data.audioDetected,
            audioDetected: result.data.audioDetected,
            maxLevel: result.data.maxLevel,
          })
        }
      }
    } catch (err) {
      log.error('Error stopping microphone test:', err)
    }
  }

  const resetTest = () => {
    setTestPhase('idle')
    setAudioLevel(0)
    setAudioDetected(false)
    setMaxLevel(0)
    setDuration(0)
    setError(null)
    setTestMessage('')
  }

  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000)
    return `${seconds}s`
  }

  return (
    <div className="microphone-test">
      <div className="test-header">
        <h3>🎤 Microphone Test</h3>
        <p className="test-description">
          Test your microphone to ensure you can record audio from your voice or other sounds.
        </p>
      </div>

      {/* Idle State */}
      {testPhase === 'idle' && (
        <div className="test-idle">
          <div className="test-instructions">
            <h4>Before you start:</h4>
            <ul>
              <li>Ensure your microphone is connected and enabled</li>
              <li>Grant microphone permission when prompted</li>
              <li>Be ready to speak into your microphone</li>
            </ul>
          </div>
          <button className="btn-start-test" onClick={startTest}>
            🎙️ Start Microphone Test
          </button>
        </div>
      )}

      {/* Instructions State */}
      {testPhase === 'instructions' && (
        <div className="test-instructions-phase">
          <div className="instruction-box">
            <div className="instruction-icon">🎤</div>
            <h4>Get Ready!</h4>
            <p>{testMessage}</p>
            <div className="countdown">Starting test in 3 seconds...</div>
          </div>
        </div>
      )}

      {/* Testing State */}
      {testPhase === 'testing' && (
        <div className="test-active">
          <div className="test-status">
            <div className="status-indicator">
              <span className="status-dot pulsing"></span>
              <span className="status-text">Testing Microphone...</span>
            </div>
            <div className="test-duration">Duration: {formatDuration(duration)}</div>
          </div>

          <div className="instruction-prompt">
            <h4>🗣️ Speak into your microphone now!</h4>
            <p>Say something like "Testing, one, two, three..."</p>
          </div>

          {/* Audio Level Meter */}
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
              {audioDetected ? (
                <span className="audio-detected">✅ Audio detected!</span>
              ) : (
                <span className="waiting">🔇 Waiting for audio...</span>
              )}
            </div>
          </div>

          {/* Peak Level */}
          <div className="peak-level">
            <span className="peak-label">Peak Level:</span>
            <span className="peak-value">{Math.round(maxLevel * 100)}%</span>
          </div>

          <button className="btn-stop-test" onClick={stopTest}>
            ⏹️ Stop Test
          </button>
        </div>
      )}

      {/* Complete State */}
      {testPhase === 'complete' && (
        <div className="test-complete">
          <div className={`result-box ${audioDetected ? 'success' : 'failure'}`}>
            <div className="result-icon">{audioDetected ? '✅' : '❌'}</div>
            <h4>{audioDetected ? 'Microphone Working!' : 'No Audio Detected'}</h4>
            <p>
              {audioDetected
                ? `Microphone audio was successfully captured. Peak level: ${Math.round(maxLevel * 100)}%`
                : 'No audio was detected during the test. Please check your microphone settings.'}
            </p>

            {!audioDetected && (
              <div className="troubleshooting">
                <h5>Troubleshooting:</h5>
                <ul>
                  <li>Ensure your microphone is connected and enabled</li>
                  <li>Check that microphone permission is granted in browser/system settings</li>
                  <li>Try selecting a different microphone in system settings</li>
                  <li>Increase the microphone volume in system settings</li>
                  <li>Test your microphone in another application to verify it works</li>
                </ul>
              </div>
            )}
          </div>

          <div className="test-actions">
            <button className="btn-test-again" onClick={resetTest}>
              🔄 Test Again
            </button>
          </div>
        </div>
      )}

      {/* Error State */}
      {testPhase === 'error' && error && (
        <div className="test-error">
          <div className="error-box">
            <div className="error-icon">⚠️</div>
            <h4>Test Failed</h4>
            <p className="error-message">{error}</p>
          </div>
          <button className="btn-try-again" onClick={resetTest}>
            🔄 Try Again
          </button>
        </div>
      )}
    </div>
  )
}
