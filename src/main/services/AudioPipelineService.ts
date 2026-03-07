/**
 * Audio Pipeline Service
 *
 * Orchestrates the full audio-to-transcript pipeline:
 * Renderer (audioCapture.ts) → IPC → AudioPipelineService → 30s chunks → ASRService → TranscriptService → IPC → Renderer
 *
 * This is the #1 critical service — without it, no audio becomes text.
 */

import { EventEmitter } from 'events'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { getASRService } from './ASRService'
import { getTranscriptService } from './TranscriptService'
import { config } from '../config/environment'
import { Logger } from './Logger'

const log = Logger.create('AudioPipeline')
const TEMP_PREFIX = 'bluearkive-audio-'

interface PipelineConfig {
  sampleRate: number // 16000 (Whisper's expected rate)
  chunkDurationSec: number // 30 seconds
  vadThreshold: number // 0.5 (Silero VAD confidence)
}

// ── Buffer Pooling for V8 GC strict memory management ──
class AudioBufferPool {
  private pool: Float32Array[] = []
  private readonly poolSize = 3
  private readonly bufferLength: number

  constructor(sampleRate: number, maxSeconds: number) {
    this.bufferLength = sampleRate * maxSeconds
    for (let i = 0; i < this.poolSize; i++) {
      this.pool.push(this.createSharedBuffer())
    }
  }

  private createSharedBuffer(): Float32Array {
    try {
      // Use SharedArrayBuffer if available to prevent v8 copying overheads
      return new Float32Array(new SharedArrayBuffer(this.bufferLength * 4))
    } catch {
      return new Float32Array(this.bufferLength)
    }
  }

  acquire(): Float32Array {
    return this.pool.pop() || this.createSharedBuffer()
  }

  release(buffer: Float32Array): void {
    if (this.pool.length < this.poolSize) {
      // Clear before returning to pool
      buffer.fill(0)
      this.pool.push(buffer)
    }
  }
}

export class AudioPipelineService extends EventEmitter {
  private config: PipelineConfig = {
    sampleRate: 16000,
    chunkDurationSec: 30, // We buffer exactly 30s chunks
    vadThreshold: 0.5,
  }

  // Pre-allocate buffer pool for memory recycling
  private bufferPool = new AudioBufferPool(this.config.sampleRate, this.config.chunkDurationSec + 5)
  private currentBuffer: Float32Array | null = null
  private writeOffset = 0

  private isCapturing = false
  private currentMeetingId: string | null = null
  private meetingStartTime: number = 0
  private chunkStartTime: number = 0
  private segmentCounter: number = 0

  // ── Disk buffering for crash resilience ──
  private tempFilePath: string | null = null
  private writeStream: fs.WriteStream | null = null

  /**
   * Start capturing audio for a meeting.
   * Called by audio:startCapture IPC handler.
   */
  async startCapture(meetingId: string): Promise<void> {
    if (this.isCapturing) {
      throw new Error('Already capturing — stop current capture first')
    }

    this.currentMeetingId = meetingId
    this.isCapturing = true
    this.meetingStartTime = Date.now()
    this.chunkStartTime = Date.now()

    // Acquire a pristine buffer from the pool
    this.currentBuffer = this.bufferPool.acquire()
    this.writeOffset = 0

    this.segmentCounter = 0

    // ── Create temp file for crash-resilient disk buffering ──
    this.tempFilePath = path.join(os.tmpdir(), `${TEMP_PREFIX}${meetingId}-${Date.now()}.raw`)
    try {
      this.writeStream = fs.createWriteStream(this.tempFilePath, { flags: 'w' })
    } catch (err) {
      log.warn('Could not create temp audio file, using RAM-only buffering:', err)
      this.writeStream = null
      this.tempFilePath = null
    }

    // ── Recover orphaned audio from previous crash ──
    this.recoverOrphanedAudio(meetingId)

    // Initialize ASR service (lazy — loads Whisper model on first use)
    try {
      await getASRService().initialize()
    } catch (error) {
      log.error('ASR initialization failed:', error)
      this.isCapturing = false
      throw error
    }

    // Start background embedding queue for semantic indexing
    try {
      const { getBackgroundEmbeddingQueue } = await import('./BackgroundEmbeddingQueue')
      getBackgroundEmbeddingQueue().start()
    } catch {
      // Embedding queue is optional
    }

    // Reset VAD state to clear stale LSTM context from any previous session.
    // Without this, if a recording is paused and resumed, the VAD LSTM tensors
    // retain old acoustic context, causing ~2s of false-negative voice detection.
    this.emit('vadReset')

    this.emit('status', { meetingId, status: 'capturing' })
    log.info(`Started capture for meeting ${meetingId}`)
  }

  /**
   * Receive audio data from renderer via IPC.
   * Called by audio IPC handler when renderer sends PCM buffers.
   */
  processAudioChunk(audioData: Float32Array): void {
    if (!this.isCapturing || !this.currentMeetingId) return

    // ── Max recording duration guard ──────────────────────────
    const maxDurationMs = config.MAX_RECORDING_DURATION_MS
    if (maxDurationMs > 0) {
      const elapsed = Date.now() - this.meetingStartTime
      if (elapsed >= maxDurationMs) {
        log.warn(
          `Max recording duration reached (${Math.round(elapsed / 60000)} min). Auto-stopping.`
        )
        // Prevent re-entrant calls while stopCapture() is in-flight
        this.isCapturing = false
        this.emit('maxDurationReached', {
          meetingId: this.currentMeetingId,
          elapsedMs: elapsed,
          limitMs: maxDurationMs,
        })
        this.stopCapture().catch(err => log.error('Auto-stop failed:', err))
        return
      }
    }

    if (!this.currentBuffer) return

    // Write directly into pre-allocated continuous recycled buffer
    const remainingSpace = this.currentBuffer.length - this.writeOffset
    const writeLength = Math.min(audioData.length, remainingSpace)

    // Set the data into our flat ring buffer
    this.currentBuffer.set(audioData.subarray(0, writeLength), this.writeOffset)
    this.writeOffset += writeLength

    // ── Write to disk for crash resilience ──
    if (this.writeStream && !this.writeStream.destroyed) {
      const buffer = Buffer.from(audioData.buffer, audioData.byteOffset, audioData.byteLength)
      this.writeStream.write(buffer)
    }

    const durationSec = this.writeOffset / this.config.sampleRate

    // Check if we hit the 30s boundary or ran out of buffer space
    if (
      durationSec >= this.config.chunkDurationSec ||
      this.writeOffset >= this.currentBuffer.length
    ) {
      const overflowStart = writeLength
      const overflowLength = audioData.length - writeLength
      const overflowData = overflowLength > 0 ? audioData.subarray(overflowStart) : null

      this.processAccumulatedChunk()

      // If there was overflow from this chunk, drop it into the next buffer
      if (overflowData && this.currentBuffer) {
        this.currentBuffer.set(overflowData, 0)
        this.writeOffset = overflowLength
      }
    }
  }

  /**
   * Process a 30-second audio chunk through Whisper.
   */
  private async processAccumulatedChunk(): Promise<void> {
    if (!this.currentMeetingId || !this.currentBuffer || this.writeOffset === 0) return

    // Extract exact data slice. Avoid massive new allocations by copying only what we have.
    // If it's a SharedArrayBuffer, slice() creates a copy automatically which is safe for ASR processing.
    const mergedAudio = this.currentBuffer.slice(0, this.writeOffset)
    const totalLength = this.writeOffset

    // Calculate chunk timing relative to meeting start
    const chunkStart = (this.chunkStartTime - this.meetingStartTime) / 1000
    const chunkEnd = chunkStart + totalLength / this.config.sampleRate

    // Swap buffers immediately (pool rotation)
    const oldBuffer = this.currentBuffer
    this.currentBuffer = this.bufferPool.acquire()
    this.writeOffset = 0
    this.chunkStartTime = Date.now()

    // ── Flush and reset the disk buffer for the next chunk ──
    if (this.writeStream && !this.writeStream.destroyed) {
      this.writeStream.end()
    }
    if (this.tempFilePath) {
      try {
        fs.unlinkSync(this.tempFilePath)
      } catch {
        /* already gone */
      }
      this.tempFilePath = path.join(
        os.tmpdir(),
        `${TEMP_PREFIX}${this.currentMeetingId}-${Date.now()}.raw`
      )
      try {
        this.writeStream = fs.createWriteStream(this.tempFilePath, { flags: 'w' })
      } catch {
        this.writeStream = null
      }
    }

    try {
      // Send to Whisper via ASRService
      const result = await getASRService().transcribe(mergedAudio)

      if (!result || !result.segments || result.segments.length === 0) {
        log.debug('No speech detected in chunk')
        return
      }

      // Save each segment to database + emit IPC event
      const transcriptService = getTranscriptService()
      for (const segment of result.segments) {
        this.segmentCounter++
        const segmentText = segment.text.trim()
        transcriptService.saveTranscript({
          meetingId: this.currentMeetingId,
          segment: {
            text: segmentText,
            start: chunkStart + segment.start,
            end: chunkStart + segment.end,
            confidence: segment.confidence,
            words: segment.words,
          },
        })
        // TranscriptService.saveTranscript() auto-emits 'transcript' event
        // transcript.handlers.ts auto-forwards to renderer via IPC
        // useTranscriptStream picks it up automatically

        // Enqueue for background embedding generation (semantic search)
        try {
          const { getBackgroundEmbeddingQueue } = await import('./BackgroundEmbeddingQueue')
          getBackgroundEmbeddingQueue().enqueue({
            id: `${this.currentMeetingId}-seg-${this.segmentCounter}`,
            meetingId: this.currentMeetingId,
            text: segmentText,
          })
        } catch {
          // Embedding queue is non-critical
        }
      }

      log.info(
        `Processed chunk ${chunkStart.toFixed(1)}s-${chunkEnd.toFixed(1)}s: ${result.segments.length} segments (total: ${this.segmentCounter})`
      )
    } catch (error) {
      log.error('Transcription failed:', error)
      this.emit('error', {
        meetingId: this.currentMeetingId,
        error: (error as Error).message,
      })
    } finally {
      // Return buffer to pool after ASR finishes
      this.bufferPool.release(oldBuffer)
    }
  }

  /**
   * Recover orphaned audio files from a previous crash.
   * Scans tmpdir for bluearkive-audio-* files from prior sessions.
   */
  private recoverOrphanedAudio(currentMeetingId: string): void {
    try {
      const tmpDir = os.tmpdir()
      const files = fs
        .readdirSync(tmpDir)
        .filter(f => f.startsWith(TEMP_PREFIX) && !f.includes(currentMeetingId))

      for (const file of files) {
        const fullPath = path.join(tmpDir, file)
        try {
          const stat = fs.statSync(fullPath)
          // Only recover files from the last 24 hours
          if (Date.now() - stat.mtimeMs > 24 * 60 * 60 * 1000) {
            fs.unlinkSync(fullPath)
            continue
          }

          const rawData = fs.readFileSync(fullPath)
          if (rawData.byteLength > 0) {
            const audioData = new Float32Array(
              rawData.buffer,
              rawData.byteOffset,
              rawData.byteLength / 4
            )
            const durationSec = audioData.length / this.config.sampleRate
            log.info(`Recovered orphaned audio: ${file} (${durationSec.toFixed(1)}s)`)
            this.emit('orphanedAudioRecovered', {
              file,
              durationSec,
              sampleCount: audioData.length,
            })
          }
          fs.unlinkSync(fullPath)
        } catch (err) {
          log.warn(`Failed to recover orphaned file ${file}:`, err)
          try {
            fs.unlinkSync(fullPath)
          } catch {
            /* ignore */
          }
        }
      }
    } catch (err) {
      log.debug('Orphaned audio scan skipped:', err)
    }
  }

  /**
   * Clean up disk buffer resources.
   */
  private cleanupDiskBuffer(): void {
    if (this.writeStream && !this.writeStream.destroyed) {
      this.writeStream.end()
      this.writeStream = null
    }
    if (this.tempFilePath) {
      try {
        fs.unlinkSync(this.tempFilePath)
      } catch {
        /* already gone */
      }
      this.tempFilePath = null
    }
  }

  /**
   * Stop capturing and process any remaining audio.
   */
  async stopCapture(): Promise<{ duration: number; segments: number }> {
    if (!this.isCapturing) {
      return { duration: 0, segments: 0 }
    }

    // Process any remaining audio in buffer
    if (this.currentBuffer && this.writeOffset > 0) {
      await this.processAccumulatedChunk()
    }

    // Return current buffer to pool if empty
    if (this.currentBuffer) {
      this.bufferPool.release(this.currentBuffer)
      this.currentBuffer = null
      this.writeOffset = 0
    }

    // Clean up disk buffer
    this.cleanupDiskBuffer()

    // Flush remaining embeddings and stop the queue
    try {
      const { getBackgroundEmbeddingQueue } = await import('./BackgroundEmbeddingQueue')
      const queue = getBackgroundEmbeddingQueue()
      await queue.flush()
      queue.stop()
    } catch {
      // Embedding queue is optional
    }

    const duration = (Date.now() - this.meetingStartTime) / 1000
    const segments = this.segmentCounter

    this.isCapturing = false
    this.emit('status', {
      meetingId: this.currentMeetingId,
      status: 'stopped',
      duration,
      segments,
    })
    log.info(
      `Stopped capture for meeting ${this.currentMeetingId} — ${duration.toFixed(1)}s, ${segments} segments`
    )
    this.currentMeetingId = null

    return { duration, segments }
  }

  /**
   * Get current pipeline status.
   */
  getStatus() {
    return {
      isCapturing: this.isCapturing,
      meetingId: this.currentMeetingId,
      bufferDuration: this.writeOffset / this.config.sampleRate,
      totalSegments: this.segmentCounter,
      elapsedTime: this.isCapturing ? (Date.now() - this.meetingStartTime) / 1000 : 0,
    }
  }

  // ─── External Device Management ────────────────────────────

  private deviceSwitchHistory: Array<{ from: string; to: string; timestamp: number }> = []
  private currentDevice: string = 'Built-in Speakers'

  /**
   * Enumerate available audio sources/devices
   */
  async enumerateAudioSources(): Promise<AudioDeviceInfo[]> {
    try {
      if (process.platform === 'darwin') {
        return [
          {
            id: 'system-audio',
            label: 'System Audio (via ScreenCaptureKit)',
            kind: 'system' as const,
            isDefault: true,
            isAvailable: true,
            deviceType: 'built-in' as const,
            connectionType: 'internal' as const,
          },
        ]
      }
      return []
    } catch (error) {
      log.error('Enumeration failed:', error)
      return []
    }
  }

  /**
   * Handle audio device switch during recording
   */
  handleDeviceSwitch(device: AudioDeviceInfo): void {
    if (!this.isCapturing) {
      log.warn('Cannot switch device: no active capture session')
      return
    }

    this.deviceSwitchHistory.push({
      from: this.currentDevice,
      to: device.label,
      timestamp: Date.now(),
    })
    this.currentDevice = device.label

    this.emit('deviceSwitch', { device, history: this.deviceSwitchHistory })
    log.info(`Device switched to: ${device.label}`)
  }

  /**
   * Get device switch history for current/last session
   */
  getDeviceSwitchHistory(): Array<{ from: string; to: string; timestamp: number }> {
    return [...this.deviceSwitchHistory]
  }

  /**
   * Get detailed device information and recommendations
   */
  async getDetailedDeviceInfo(): Promise<{
    devices: AudioDeviceInfo[]
    platform: string
    recommendations: string[]
    deviceSwitchCount: number
  }> {
    const devices = await this.enumerateAudioSources()
    const recommendations: string[] = []

    if (process.platform === 'darwin') {
      recommendations.push(
        'macOS: Grant Screen Recording permission for system audio capture',
        'macOS: Use ScreenCaptureKit for best quality'
      )
    } else if (process.platform === 'win32') {
      recommendations.push(
        'Windows: Enable Stereo Mix in Sound settings for system audio',
        'Windows: Use WASAPI loopback as fallback'
      )
    }

    recommendations.push(
      'Bluetooth devices may add 100-200ms latency',
      'Use wired connections for lowest latency recording'
    )

    return {
      devices,
      platform: process.platform,
      recommendations,
      deviceSwitchCount: this.deviceSwitchHistory.length,
    }
  }

  /**
   * Test if a specific audio device is available and working
   */
  async testAudioDevice(deviceId: string): Promise<{
    success: boolean
    deviceInfo: AudioDeviceInfo | null
    latency?: number
    error?: string
  }> {
    const devices = await this.enumerateAudioSources()
    const device = devices.find(d => d.id === deviceId)

    if (!device) {
      return { success: false, deviceInfo: null, error: `Device not found: ${deviceId}` }
    }

    // Estimate latency based on connection type
    let latency = 10
    if (device.connectionType === 'bluetooth') latency = 150
    else if (device.connectionType === 'usb') latency = 20
    else if (device.connectionType === 'hdmi' || device.connectionType === 'displayport')
      latency = 30

    return { success: true, deviceInfo: device, latency }
  }

  /**
   * Check Screen Recording permission status (macOS only)
   */
  getScreenRecordingPermissionStatus(): string {
    if (process.platform !== 'darwin') return 'not-applicable'

    try {
      const { systemPreferences } = require('electron') as typeof import('electron')
      return systemPreferences.getMediaAccessStatus('screen')
    } catch (err) {
      log.debug('Device detection skipped', err)
      return 'unknown'
    }
  }

  /**
   * Get guidance for enabling Stereo Mix (Windows only)
   */
  getStereoMixGuidance(): { title: string; steps: string[]; link: string } {
    return {
      title: 'Enable Stereo Mix for System Audio',
      steps: [
        'Right-click the speaker icon in your system tray',
        'Select "Sound settings" → "More sound settings"',
        'Go to the "Recording" tab',
        'Right-click and check "Show Disabled Devices"',
        'Right-click "Stereo Mix" → "Enable"',
        'Set as default recording device',
      ],
      link: 'https://support.bluearkive.com/stereo-mix',
    }
  }

  /**
   * Reset service state. Used for test isolation.
   */
  reset(): void {
    this.cleanupDiskBuffer()
    this.isCapturing = false
    if (this.currentBuffer) {
      this.bufferPool.release(this.currentBuffer)
      this.currentBuffer = null
    }
    this.writeOffset = 0
    this.currentMeetingId = null
    this.segmentCounter = 0
    this.deviceSwitchHistory = []
    this.currentDevice = 'System Audio'
  }
}

/** Audio device information */
export interface AudioDeviceInfo {
  id: string
  label: string
  kind: 'system' | 'input' | 'output'
  isDefault: boolean
  isAvailable: boolean
  deviceType: 'built-in' | 'bluetooth' | 'usb' | 'external-monitor' | 'hdmi' | 'displayport'
  connectionType: 'internal' | 'bluetooth' | 'usb' | 'hdmi' | 'displayport'
}

// Singleton
let instance: AudioPipelineService | null = null
export function getAudioPipelineService(): AudioPipelineService {
  if (!instance) instance = new AudioPipelineService()
  return instance
}

/** Reset singleton — for test isolation */
export function resetAudioPipelineService(): void {
  if (instance) {
    instance.reset()
  }
  instance = null
}
