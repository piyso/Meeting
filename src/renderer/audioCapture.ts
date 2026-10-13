/**
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

import { rendererLog } from './utils/logger'
const log = rendererLog.create('AudioCapture')

/**
 * Audio capture manager
 */
class AudioCaptureManager {
  private audioContext: AudioContext | null = null
  private workletNode: AudioWorkletNode | null = null
  private mediaStream: MediaStream | null = null
  private sourceNode: MediaStreamAudioSourceNode | null = null
  /** The local microphone, mixed in while system audio is being captured. */
  private micStream: MediaStream | null = null
  private micSourceNode: MediaStreamAudioSourceNode | null = null
  private isCapturing: boolean = false

  // Coalescing: batch worklet quanta into one IPC message. Half a second keeps
  // IPC to 2 messages/s while letting the level meter and the main-process
  // buffer see audio promptly (3s bursts arrived exactly as large as the
  // receiving ring buffer and overflowed it).
  private chunkBuffer: Float32Array[] = []
  private chunkBufferLength: number = 0
  private chunkBufferTimestamp: number = 0
  private readonly COALESCE_SECONDS: number = 0.5

  // Worklet flush requests waiting for their acknowledgement
  private flushSeq = 0
  private pendingFlushes = new Map<number, () => void>()
  private static readonly WORKLET_FLUSH_TIMEOUT_MS = 250

  /** Why the last system-audio start fell back to the microphone (null if it did not) */
  private lastFallbackReason: string | null = null

  public getLastFallbackReason(): string | null {
    return this.lastFallbackReason
  }

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
  ): Promise<'system' | 'microphone'> {
    this.lastFallbackReason = null
    // Checked outside the try block: "already capturing" must never trigger
    // the microphone fallback below.
    if (this.isCapturing) {
      throw new Error('Audio capture already in progress')
    }
    try {
      // Loopback audio through getDisplayMedia. Electron's API docs describe
      // `audio: 'loopback'` as Windows-only, but Chromium also implements it
      // on macOS 13+ (ScreenCaptureKit, under the Screen Recording
      // permission; Core Audio taps from Electron 39). Whether a given
      // machine delivers it is found out by asking — any failure falls back
      // to the microphone below, with the real reason.
      log.info('Using getDisplayMedia loopback for system audio capture')
      let stream: MediaStream
      if (window.electronAPI?.platform === 'darwin') {
        stream = await this.startLoopbackAudioCapture()
      } else {
        // Windows/Linux: fall back to the legacy desktopCapturer constraint
        // if this build rejects the loopback request.
        try {
          stream = await this.startLoopbackAudioCapture()
        } catch (loopbackError) {
          log.warn('Loopback capture failed, trying desktopCapturer source:', loopbackError)
          stream = await this.startWindowsSystemAudioCapture(deviceId)
        }
      }

      await this.setupAudioPipeline(stream, sampleRate, channelCount)

      // System audio is what the *other* participants say. Without the
      // microphone the person running the app is missing from their own
      // meeting's transcript.
      await this.addMicrophoneToMix()

      log.info('System audio capture started')
      return 'system'
    } catch (error) {
      log.error('Failed to start system audio capture:', error)

      // G1: Fall back to microphone on ANY error when fallback is enabled.
      // Previously only triggered on NotAllowedError (macOS permission denial).
      // Windows WASAPI failures throw generic Error or NotFoundError — must catch all.
      if (fallbackToMicrophone && error instanceof Error) {
        log.info(`Falling back to microphone capture (reason: ${error.name}: ${error.message})`)
        try {
          await this.startMicrophoneCapture(sampleRate, channelCount)
          // Notify main process about fallback
          if (window.electronAPI?.ipcRenderer) {
            window.electronAPI.ipcRenderer.send('audio:fallbackUsed', {
              type: 'microphone',
              reason: error.message,
            })
          }
          this.lastFallbackReason = error.message
          return 'microphone'
        } catch (micError) {
          log.error('Microphone fallback also failed:', micError)
          throw new Error(
            `System audio capture failed and microphone fallback failed: ${micError instanceof Error ? micError.message : 'Unknown error'}`
          )
        }
      }

      throw error
    }
  }

  /**
   * Mix the local microphone into a running system-audio capture.
   *
   * Best effort: if the microphone cannot be opened (no device, permission
   * denied) the recording carries on with system audio alone.
   *
   * Echo: with loudspeakers the microphone also hears the far end. Browser
   * echo cancellation only removes audio this page plays, so some doubling is
   * possible; a headset avoids it.
   */
  private async addMicrophoneToMix(): Promise<void> {
    if (!this.audioContext || !this.workletNode) return
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      })
      // The capture may have been stopped while the device was opening.
      if (!this.audioContext || !this.workletNode || !this.isCapturing) {
        micStream.getTracks().forEach(track => track.stop())
        return
      }
      this.micStream = micStream
      this.micSourceNode = this.audioContext.createMediaStreamSource(micStream)
      // Two sources into one input are summed by the audio graph.
      this.micSourceNode.connect(this.workletNode)
      log.info('Microphone mixed into system audio capture')
    } catch (error) {
      log.warn('Microphone not added to system audio capture:', error)
    }
  }

  /**
   * Capture system (loopback) audio through getDisplayMedia.
   *
   * Chromium rejects a display-media request without video, and Electron
   * rejects every request unless the main process has registered a handler
   * (electron/main.ts: setDisplayMediaRequestHandler). That handler answers
   * with the primary screen plus loopback audio; the video track is dropped
   * here immediately — nothing is ever read from the screen.
   *
   * macOS requires Screen Recording permission (System Settings > Privacy &
   * Security) and macOS 13 or later for loopback audio.
   *
   * @returns MediaStream containing only the system-audio track
   */
  private async startLoopbackAudioCapture(): Promise<MediaStream> {
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true })
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

    for (const track of stream.getVideoTracks()) {
      track.stop()
      stream.removeTrack(track)
    }

    // Verify we got an audio track
    const audioTracks = stream.getAudioTracks()
    if (audioTracks.length === 0) {
      stream.getTracks().forEach(track => track.stop())
      throw new Error('System audio is not available from screen capture on this system')
    }

    const firstTrack = audioTracks[0]
    log.info('System audio stream obtained:', {
      audioTracks: audioTracks.length,
      trackLabel: firstTrack?.label,
      trackSettings: firstTrack?.getSettings(),
    })

    return stream
  }

  /**
   * Start Windows system audio capture using desktopCapturer
   *
   * Uses WASAPI loopback to capture system audio.
   *
   * @param deviceId - Desktop capturer source ID
   * @returns MediaStream with audio track
   */
  private async startWindowsSystemAudioCapture(_deviceId: string): Promise<MediaStream> {
    try {
      // Issue 13: Get a valid chromeMediaSourceId from the main process via desktopCapturer
      const sources = await window.electronAPI?.desktopCapturerSources()
      if (!sources || sources.length === 0) {
        throw new Error('No desktop capturer sources found for system audio')
      }
      // Use the first screen source — its ID is required for chromeMediaSourceId
      const firstSource = sources[0]
      if (!firstSource) {
        throw new Error('Desktop capturer returned empty sources')
      }
      const sourceId = firstSource.id

      log.info(`Using desktop capturer source: ${sourceId}`)

      // Get media stream from desktopCapturer with valid source ID
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // @ts-expect-error - Electron-specific constraint
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
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
        // 'explicit' makes the graph down-mix every source to `channelCount`
        // (mono). With the default ('max') a stereo source stays stereo and the
        // processor, which reads channel 0, silently dropped the right channel.
        channelCountMode: 'explicit',
        channelInterpretation: 'speakers',
      })

      // Listen for audio chunks from worklet
      this.workletNode.port.onmessage = event => {
        if (event.data.type === 'audioChunk') {
          this.handleAudioChunk(event.data)
        } else if (event.data.type === 'flushed') {
          this.pendingFlushes.get(event.data.id)?.()
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

      // Handle track ended (e.g. bluetooth disconnect)
      stream.getTracks().forEach(track => {
        track.onended = () => {
          log.warn(`Audio track ended unexpectedly: ${track.kind} - ${track.label}`)
          if (this.isCapturing) {
            log.info('Attempting to reconnect audio capture...')
            if (window.electronAPI?.ipcRenderer) {
              window.electronAPI.ipcRenderer.send('audio:fallbackUsed', {
                type: 'microphone',
                reason: 'track_ended',
              })
            }
            this.cleanup().then(() => {
              this.startMicrophoneCapture(sampleRate, channelCount).catch(err => {
                log.error('Failed to reconnect via microphone:', err)
              })
            })
          }
        }
      })

      log.info('Audio pipeline setup complete')
    } catch (error) {
      await this.cleanup()
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
    if (this.chunkBufferLength === 0) {
      this.chunkBufferTimestamp = data.timestamp
    }

    this.chunkBuffer.push(data.data)
    this.chunkBufferLength += data.data.length

    // Coalesce to reduce main-thread CPU spikes from IPC traffic
    if (this.chunkBufferLength >= data.sampleRate * this.COALESCE_SECONDS) {
      this.flushAudioBuffer(data.sampleRate)
    }
  }

  /**
   * Flush accumulated audio buffer to main process
   */
  private flushAudioBuffer(sampleRate?: number): void {
    if (this.chunkBufferLength === 0) return

    // OPT-15: Send raw Float32Array via ipcRenderer.send — Electron's structured clone
    // handles TypedArrays natively without copying. The original code used Array.from()
    // which converted Float32Array → regular number[], doubling memory and creating
    // ~288MB/hour of GC churn during recording. This avoids that overhead.
    //
    // NOTE: ipcRenderer.postMessage's transfer only supports MessagePort[], NOT
    // ArrayBuffer[], so zero-copy transfer is not available in Electron IPC.
    const coalesced = new Float32Array(this.chunkBufferLength)
    let offset = 0
    for (const chunk of this.chunkBuffer) {
      coalesced.set(chunk, offset)
      offset += chunk.length
    }

    if (window.electronAPI?.ipcRenderer) {
      window.electronAPI?.ipcRenderer?.send('audio:chunk', {
        data: coalesced,
        timestamp: this.chunkBufferTimestamp,
        sampleRate: sampleRate ?? 16000,
      })
    }

    this.chunkBuffer = []
    this.chunkBufferLength = 0
  }

  /**
   * Ask the worklet for the samples it is still holding and wait until they
   * have arrived. Without this, stopping or pausing cut off whatever the
   * worklet had not yet posted. Resolves after a short timeout if the worklet
   * does not answer, so a stop can never hang on it.
   */
  private flushWorklet(): Promise<void> {
    const node = this.workletNode
    if (!node) return Promise.resolve()
    return new Promise(resolve => {
      const id = ++this.flushSeq
      const done = () => {
        clearTimeout(timer)
        this.pendingFlushes.delete(id)
        resolve()
      }
      const timer = setTimeout(done, AudioCaptureManager.WORKLET_FLUSH_TIMEOUT_MS)
      this.pendingFlushes.set(id, done)
      try {
        node.port.postMessage({ type: 'flush', id })
      } catch {
        done()
      }
    })
  }

  /**
   * Pause capture: suspends the audio graph, so nothing is read from the
   * device (or sent to the main process) until resume(). Audio captured up to
   * this point is delivered first.
   */
  public async pause(): Promise<void> {
    if (!this.isCapturing || !this.audioContext) return
    await this.flushWorklet()
    this.flushAudioBuffer(this.audioContext.sampleRate)
    if (this.audioContext.state === 'running') await this.audioContext.suspend()
  }

  /** Resume capture after pause() */
  public async resume(): Promise<void> {
    if (!this.isCapturing || !this.audioContext) return
    if (this.audioContext.state === 'suspended') await this.audioContext.resume()
  }

  /**
   * Stop audio capture
   */
  public async stopCapture(): Promise<void> {
    try {
      await this.cleanup()
      log.info('Audio capture stopped')
    } catch (error) {
      log.error('Failed to stop audio capture:', error)
      throw error
    }
  }

  /**
   * Clean up audio resources
   */
  private async cleanup(): Promise<void> {
    // Deliver everything captured so far before tearing the graph down: first
    // the samples still inside the worklet, then the coalescing buffer.
    await this.flushWorklet()
    this.flushAudioBuffer(this.audioContext?.sampleRate)

    // Stop media stream tracks
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop())
      this.mediaStream = null
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach(track => track.stop())
      this.micStream = null
    }

    // Disconnect and clean up nodes
    if (this.sourceNode) {
      this.sourceNode.disconnect()
      this.sourceNode = null
    }
    if (this.micSourceNode) {
      this.micSourceNode.disconnect()
      this.micSourceNode = null
    }

    if (this.workletNode) {
      this.workletNode.disconnect()
      this.workletNode.port.close()
      this.workletNode = null
    }

    // Close audio context — await to ensure resources are released before re-init
    if (this.audioContext) {
      try {
        await this.audioContext.close()
      } catch {
        // AudioContext may already be closed
      }
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
  const unsub1 = window.electronAPI?.ipcRenderer?.on(
    'audio:startCapture',
    (_event: unknown, data: unknown) => {
      const params = data as {
        deviceId: string
        sampleRate: number
        channelCount: number
        fallbackToMicrophone?: boolean
      }
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

  const unsub2 = window.electronAPI?.ipcRenderer?.on(
    'audio:startMicrophoneCapture',
    (_event: unknown, data: unknown) => {
      const params = data as { sampleRate: number; channelCount: number }
      audioCaptureManager
        .startMicrophoneCapture(params.sampleRate, params.channelCount)
        .catch(error => {
          log.error('Failed to start microphone capture:', error)
        })
    }
  )

  const unsub3 = window.electronAPI?.ipcRenderer?.on('audio:stopCapture', () => {
    audioCaptureManager.stopCapture().catch(error => {
      log.error('Failed to stop audio capture:', error)
    })
  })

  // Cleanup listeners on page unload to prevent leaks during HMR/reload
  const cleanup = () => {
    unsub1?.()
    unsub2?.()
    unsub3?.()
  }
  window.addEventListener('beforeunload', cleanup, { once: true })

  // Vite HMR cleanup — prevents listener duplication during dev
  if (import.meta.hot) {
    import.meta.hot.dispose(cleanup)
  }
}

export { audioCaptureManager }
export default audioCaptureManager
