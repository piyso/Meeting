/**

import { rendererLog } from './utils/logger'
const log = rendererLog.create('AudioCapture')
 * Audio Capture Module (Renderer Process)
 *
 * Handles AudioContext and AudioWorklet setup for audio capture.
 * This runs in the renderer process and communicates with the main process via IPC.
 *
 * Key features:
 * - Sets up AudioContext at 16kHz sample rate
 * - Loads and manages AudioWorklet processor
 * - Captures audio from desktopCapturer or getUserMedia
 * - Forwards audio chunks to main process for VAD processing
 */

/**
 * Audio capture manager
 */
class AudioCaptureManager {
  private audioContext: AudioContext | null = null
  private workletNode: AudioWorkletNode | null = null
  private mediaStream: MediaStream | null = null
  private sourceNode: MediaStreamAudioSourceNode | null = null
  private isCapturing: boolean = false

  /**
   * Start audio capture from system audio
   *
   * Platform-specific implementation:
   * - macOS: Uses getDisplayMedia with ScreenCaptureKit (Electron 25+)
   * - Windows: Uses desktopCapturer with WASAPI
   *
   * @param deviceId - Desktop capturer source ID (Windows) or null (macOS)
   * @param sampleRate - Sample rate (default 16000)
   * @param channelCount - Number of channels (default 1 for mono)
   * @param fallbackToMicrophone - Whether to fall back to microphone on failure (default true)
   */
  public async startSystemAudioCapture(
    deviceId: string,
    sampleRate: number = 16000,
    channelCount: number = 1,
    fallbackToMicrophone: boolean = true
  ): Promise<void> {
    try {
      if (this.isCapturing) {
        throw new Error('Audio capture already in progress')
      }

      // Detect platform
      const isMacOS = navigator.platform.toLowerCase().includes('mac')

      let stream: MediaStream

      if (isMacOS) {
        // macOS: Use getDisplayMedia with ScreenCaptureKit
        // This requires Screen Recording permission
        log.info('macOS detected: Using getDisplayMedia for system audio capture')
        stream = await this.startMacOSSystemAudioCapture()
      } else {
        // Windows: Use desktopCapturer with WASAPI
        log.info('Windows detected: Using desktopCapturer for system audio capture')
        stream = await this.startWindowsSystemAudioCapture(deviceId)
      }

      await this.setupAudioPipeline(stream, sampleRate, channelCount)

      log.info('System audio capture started')
    } catch (error) {
      log.error('Failed to start system audio capture:', error)

      // If fallback is enabled and error is permission-related, fall back to microphone
      if (fallbackToMicrophone && error instanceof Error) {
        if (
          error.name === 'NotAllowedError' ||
          error.message.includes('Screen Recording permission denied')
        ) {
          log.info('Falling back to microphone capture due to permission denial')
          try {
            await this.startMicrophoneCapture(sampleRate, channelCount)
            // Notify user about fallback
            if (window.electronAPI && window.electronAPI.ipcRenderer) {
              window.electronAPI.ipcRenderer.send('audio:fallbackUsed', {
                type: 'microphone',
                reason: 'Screen Recording permission denied',
              })
            }
            return
          } catch (micError) {
            log.error('Microphone fallback also failed:', micError)
            throw new Error(
              `System audio capture failed and microphone fallback failed: ${micError instanceof Error ? micError.message : 'Unknown error'}`
            )
          }
        }
      }

      throw error
    }
  }

  /**
   * Start macOS system audio capture using getDisplayMedia
   *
   * Uses ScreenCaptureKit API (Electron 25+) to capture system audio.
   * Requires Screen Recording permission in System Settings.
   *
   * @returns MediaStream with audio track
   */
  private async startMacOSSystemAudioCapture(): Promise<MediaStream> {
    try {
      // Use getDisplayMedia to capture system audio
      // Request audio only, no video
      const stream = await navigator.mediaDevices.getDisplayMedia({
        audio: {
          // Request system audio
          systemAudio: 'include',
          // Suppress local audio (don't capture microphone)
          suppressLocalAudioPlayback: false,
        } as MediaTrackConstraints,
        video: false, // Audio only, no video
      })

      // Verify we got an audio track
      const audioTracks = stream.getAudioTracks()
      if (audioTracks.length === 0) {
        throw new Error('No audio track in media stream')
      }

      const firstTrack = audioTracks[0]
      log.info('macOS system audio stream obtained:', {
        audioTracks: audioTracks.length,
        trackLabel: firstTrack?.label,
        trackSettings: firstTrack?.getSettings(),
      })

      return stream
    } catch (error) {
      // Handle permission errors
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          throw new Error(
            'Screen Recording permission denied. Please grant permission in System Settings > Privacy & Security > Screen Recording.'
          )
        } else if (error.name === 'NotFoundError') {
          throw new Error('No audio source found. Please ensure system audio is available.')
        }
      }
      throw error
    }
  }

  /**
   * Start Windows system audio capture using desktopCapturer
   *
   * Uses WASAPI loopback to capture system audio.
   *
   * @param deviceId - Desktop capturer source ID
   * @returns MediaStream with audio track
   */
  private async startWindowsSystemAudioCapture(deviceId: string): Promise<MediaStream> {
    try {
      // Get media stream from desktopCapturer
      // Note: The actual desktopCapturer call happens in main process
      // We use getUserMedia with chromeMediaSourceId constraint
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // @ts-expect-error - Electron-specific constraint
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: deviceId,
          },
        },
        video: false,
      })

      log.info('Windows system audio stream obtained')

      return stream
    } catch (error) {
      log.error('Failed to get Windows system audio stream:', error)
      throw error
    }
  }

  /**
   * Start audio capture from microphone
   *
   * @param sampleRate - Sample rate (default 16000)
   * @param channelCount - Number of channels (default 1 for mono)
   */
  public async startMicrophoneCapture(
    sampleRate: number = 16000,
    channelCount: number = 1
  ): Promise<void> {
    try {
      if (this.isCapturing) {
        throw new Error('Audio capture already in progress')
      }

      // Get microphone stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate,
          channelCount,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      })

      await this.setupAudioPipeline(stream, sampleRate, channelCount)

      log.info('Microphone capture started')
    } catch (error) {
      log.error('Failed to start microphone capture:', error)
      throw error
    }
  }

  /**
   * Set up audio processing pipeline
   *
   * @param stream - Media stream to process
   * @param sampleRate - Sample rate
   * @param channelCount - Number of channels
   */
  private async setupAudioPipeline(
    stream: MediaStream,
    sampleRate: number,
    channelCount: number
  ): Promise<void> {
    try {
      this.mediaStream = stream

      // Create AudioContext with specified sample rate
      // Note: Browser may not honor the exact sample rate, but will resample if needed
      this.audioContext = new AudioContext({
        sampleRate,
        latencyHint: 'interactive',
      })

      // Verify the actual sample rate being used
      const actualSampleRate = this.audioContext.sampleRate
      log.info(`AudioContext created:`)
      log.info(`  Requested sample rate: ${sampleRate}Hz`)
      log.info(`  Actual sample rate: ${actualSampleRate}Hz`)

      if (actualSampleRate !== sampleRate) {
        log.warn(
          `⚠️  AudioContext sample rate mismatch! Requested ${sampleRate}Hz but got ${actualSampleRate}Hz. ` +
            `Audio will be resampled by the browser.`
        )
      } else {
        log.info(
          `✅ AudioContext configured for ${sampleRate}Hz (optimized for speech recognition)`
        )
      }

      // Create source node from media stream
      this.sourceNode = this.audioContext.createMediaStreamSource(stream)

      // Load AudioWorklet processor
      const workletPath = new URL('./audio-worklet-processor.js', import.meta.url).href
      await this.audioContext.audioWorklet.addModule(workletPath)

      // Create AudioWorklet node
      this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-capture-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 0,
        channelCount,
      })

      // Listen for audio chunks from worklet
      this.workletNode.port.onmessage = event => {
        if (event.data.type === 'audioChunk') {
          this.handleAudioChunk(event.data)
        } else if (event.data.type === 'sampleRateInfo') {
          // Log sample rate verification from AudioWorklet
          log.info(`✅ ${event.data.message}`)
          if (event.data.sampleRate !== sampleRate) {
            log.warn(
              `⚠️  Sample rate mismatch in AudioWorklet! Expected ${sampleRate}Hz but got ${event.data.sampleRate}Hz`
            )
          }
        }
      }

      // Connect nodes
      this.sourceNode.connect(this.workletNode)

      this.isCapturing = true

      log.info('Audio pipeline setup complete')
    } catch (error) {
      this.cleanup()
      throw error
    }
  }

  /**
   * Handle audio chunk from worklet
   *
   * @param data - Audio chunk data
   */
  private handleAudioChunk(data: {
    type: string
    data: Float32Array
    timestamp: number
    sampleRate: number
  }): void {
    // Send chunk to main process via IPC
    // Note: Float32Array needs to be converted to regular array for IPC
    if (window.electronAPI?.ipcRenderer) {
      window.electronAPI.ipcRenderer.send('audio:chunk', {
        data: Array.from(data.data),
        timestamp: data.timestamp,
        sampleRate: data.sampleRate,
      })
    }
  }

  /**
   * Stop audio capture
   */
  public async stopCapture(): Promise<void> {
    try {
      this.cleanup()
      log.info('Audio capture stopped')
    } catch (error) {
      log.error('Failed to stop audio capture:', error)
      throw error
    }
  }

  /**
   * Clean up audio resources
   */
  private cleanup(): void {
    // Stop media stream tracks
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop())
      this.mediaStream = null
    }

    // Disconnect and clean up nodes
    if (this.sourceNode) {
      this.sourceNode.disconnect()
      this.sourceNode = null
    }

    if (this.workletNode) {
      this.workletNode.disconnect()
      this.workletNode.port.close()
      this.workletNode = null
    }

    // Close audio context
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }

    this.isCapturing = false
  }

  /**
   * Get capture status
   */
  public getStatus(): { isCapturing: boolean } {
    return {
      isCapturing: this.isCapturing,
    }
  }
}

// Create singleton instance
const audioCaptureManager = new AudioCaptureManager()

// Listen for IPC messages from main process
if (typeof window !== 'undefined' && window.electronAPI?.ipcRenderer) {
  window.electronAPI.ipcRenderer.on(
    'audio:startCapture',
    (
      _event: unknown,
      params: {
        deviceId: string
        sampleRate: number
        channelCount: number
        fallbackToMicrophone?: boolean
      }
    ) => {
      audioCaptureManager
        .startSystemAudioCapture(
          params.deviceId,
          params.sampleRate,
          params.channelCount,
          params.fallbackToMicrophone ?? true
        )
        .catch(error => {
          log.error('Failed to start system audio capture:', error)
        })
    }
  )

  window.electronAPI.ipcRenderer.on(
    'audio:startMicrophoneCapture',
    (_event: unknown, params: { sampleRate: number; channelCount: number }) => {
      audioCaptureManager
        .startMicrophoneCapture(params.sampleRate, params.channelCount)
        .catch(error => {
          log.error('Failed to start microphone capture:', error)
        })
    }
  )

  window.electronAPI.ipcRenderer.on('audio:stopCapture', () => {
    audioCaptureManager.stopCapture().catch(error => {
      log.error('Failed to stop audio capture:', error)
    })
  })
}

export default audioCaptureManager
