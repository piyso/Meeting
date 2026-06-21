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
import { app } from 'electron'
import { getASRService } from './ASRService'
import { getTranscriptService } from './TranscriptService'
import { getDatabaseService } from './DatabaseService'
import { config } from '../config/environment'
import { Logger } from './Logger'

const log = Logger.create('AudioPipeline')
const TEMP_PREFIX = 'bluearkive-audio-'

// #11 fix: Cache dynamic imports to avoid re-resolving on hot path per-segment
let _embeddingQueueMod: typeof import('./BackgroundEmbeddingQueue') | null = null
let _cloudTranscriptionMod: typeof import('./CloudTranscriptionService') | null = null

// Issue 20: Use app userData cache instead of os.tmpdir() to avoid Windows Disk Cleanup
function getAudioCacheDir(): string {
  const cacheDir = path.join(app.getPath('userData'), 'cache', 'audio')
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true })
  }
  return cacheDir
}

interface PipelineConfig {
  sampleRate: number // 16000 (Whisper's expected rate)
  chunkDurationSec: number // 30 seconds
  vadThreshold: number // 0.5 (Silero VAD confidence)
}

/** 4.4 FIX: Named capture session for dual-source recording */
interface CaptureSession {
  name: string
  meetingId: string
  startTime: number
  segmentCount: number
}

// ── Ring Buffer for IPC Backpressure Management ──
// 4.1 FIX: Replaces unbuffered IPC sends with a coalescing ring buffer.
// Instead of ~100 IPC sends/sec (one per worklet chunk), we buffer 3s of audio
// and flush at 10 chunks/sec, reducing IPC overhead by 10×.
class AudioRingBuffer {
  private readonly buffer: Float32Array
  private writePos = 0
  private readPos = 0
  private readonly capacity: number

  constructor(sampleRate: number, durationSec: number) {
    this.capacity = sampleRate * durationSec
    this.buffer = new Float32Array(this.capacity)
  }

  get available(): number {
    return this.writePos - this.readPos
  }

  get remainingCapacity(): number {
    return this.capacity - this.available
  }

  write(data: Float32Array): number {
    const toWrite = Math.min(data.length, this.remainingCapacity)
    if (toWrite <= 0) return 0
    const writeIdx = this.writePos % this.capacity
    const firstPart = Math.min(toWrite, this.capacity - writeIdx)
    this.buffer.set(data.subarray(0, firstPart), writeIdx)
    if (firstPart < toWrite) {
      this.buffer.set(data.subarray(firstPart, toWrite), 0)
    }
    this.writePos += toWrite
    return toWrite
  }

  read(target: Float32Array): number {
    const toRead = Math.min(this.available, target.length)
    if (toRead <= 0) return 0
    const readIdx = this.readPos % this.capacity
    const firstPart = Math.min(toRead, this.capacity - readIdx)
    target.set(this.buffer.subarray(readIdx, readIdx + firstPart), 0)
    if (firstPart < toRead) {
      target.set(this.buffer.subarray(0, toRead - firstPart), firstPart)
    }
    this.readPos += toRead

    // Normalize positions to prevent integer overflow on long recordings.
    // At 16kHz, writePos reaches Number.MAX_SAFE_INTEGER after ~17,800 hours,
    // but normalizing early avoids subtle precision loss in modulo arithmetic.
    if (this.readPos >= this.capacity && this.writePos >= this.capacity) {
      this.writePos -= this.capacity
      this.readPos -= this.capacity
    }
    return toRead
  }

  reset(): void {
    this.writePos = 0
    this.readPos = 0
  }
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
  constructor() {
    super()
    // #13: Prevent MaxListenersExceeded warnings — pipeline emits to multiple subscribers
    this.setMaxListeners(20)
  }

  private config: PipelineConfig = {
    sampleRate: 16000,
    chunkDurationSec: 30, // We buffer exactly 30s chunks
    vadThreshold: 0.5,
  }

  // Pre-allocate buffer pool for memory recycling
  private bufferPool = new AudioBufferPool(this.config.sampleRate, this.config.chunkDurationSec + 5)
  private currentBuffer: Float32Array | null = null
  private writeOffset = 0

  // 4.1 FIX: Ring buffer for IPC backpressure — coalesces ~100 chunks/sec → 10 flushes/sec
  private ringBuffer = new AudioRingBuffer(this.config.sampleRate, 3) // 3s ring buffer
  private ringFlushTimer: ReturnType<typeof setInterval> | null = null
  private ringFlushBuffer = new Float32Array(Math.floor(this.config.sampleRate / 10)) // Pre-allocated 0.1s
  private static readonly RING_FLUSH_INTERVAL_MS = 100 // 10 flushes/sec

  // 4.2 FIX: RMS level tracking for audio-reactive widget feedback
  private currentRms: number = 0
  private peakRms: number = 0
  private rmsHistory: number[] = [] // rolling window for smoothing
  private static readonly RMS_HISTORY_SIZE = 10

  // 4.4 FIX: Named capture sessions for dual-source (system + microphone)
  private captureSessions = new Map<string, CaptureSession>()

  // 2.7 FIX: Audio device reconnection — auto-fallback on Bluetooth disconnect
  private currentDeviceId: string | null = null
  private fallbackDeviceId: string | null = null
  private reconnectAttempts = 0
  private static readonly MAX_RECONNECT_ATTEMPTS = 3

  private isCapturing = false
  private currentMeetingId: string | null = null
  private meetingStartTime: number = 0
  private chunkStartTime: number = 0
  private segmentCounter: number = 0

  // ── Disk buffering for crash resilience ──
  private tempFilePath: string | null = null
  private writeStream: fs.WriteStream | null = null
  private isProcessingChunk = false
  private pendingChunkProcess = false
  private _pendingOverflow: Float32Array[] | null = null
  private isPaused = false
  // #6: Track consecutive local ASR failures for cloud fallback
  private consecutiveAsrFailures = 0
  private static readonly MAX_LOCAL_FAILURES = 3

  /**
   * 4.4 FIX: Start a named capture session (e.g., 'system', 'microphone').
   * Supports concurrent dual-source capture for speaker diarization.
   */
  async startNamedCapture(sessionName: string, meetingId: string): Promise<void> {
    if (this.captureSessions.has(sessionName)) {
      throw new Error(`Session '${sessionName}' already active`)
    }
    this.captureSessions.set(sessionName, {
      name: sessionName,
      meetingId,
      startTime: Date.now(),
      segmentCount: 0,
    })
    log.info(`Started named capture session '${sessionName}' for meeting ${meetingId}`)
  }

  /**
   * 4.4 FIX: Stop a named capture session.
   */
  async stopNamedCapture(sessionName: string): Promise<void> {
    const session = this.captureSessions.get(sessionName)
    if (!session) {
      log.debug(`Named session '${sessionName}' not found`)
      return
    }
    this.captureSessions.delete(sessionName)
    log.info(`Stopped named capture session '${sessionName}' — ${session.segmentCount} segments`)
  }

  /**
   * 2.7 FIX: Track the current audio device for reconnection on disconnect.
   */
  setCurrentDevice(deviceId: string, fallbackId?: string): void {
    this.currentDeviceId = deviceId
    if (fallbackId) this.fallbackDeviceId = fallbackId
    this.reconnectAttempts = 0
  }

  /**
   * 2.7 FIX: Handle audio device disconnect during active recording.
   * Attempts to fall back to internal microphone automatically.
   * Emits 'device:lost' so the renderer can show a toast notification.
   */
  async handleDeviceDisconnect(disconnectedDeviceId: string): Promise<boolean> {
    if (!this.isCapturing) return false
    if (disconnectedDeviceId !== this.currentDeviceId) return false

    log.warn(`Audio device disconnected: ${disconnectedDeviceId} — attempting fallback`)
    this.emit('device:lost', { deviceId: disconnectedDeviceId })

    if (this.reconnectAttempts >= AudioPipelineService.MAX_RECONNECT_ATTEMPTS) {
      log.error('Max reconnection attempts reached — stopping capture')
      this.emit('device:failed', { deviceId: disconnectedDeviceId })
      return false
    }

    this.reconnectAttempts++

    // Try fallback to internal microphone
    if (this.fallbackDeviceId && this.fallbackDeviceId !== disconnectedDeviceId) {
      log.info(`Falling back to device: ${this.fallbackDeviceId}`)
      this.currentDeviceId = this.fallbackDeviceId
      this.emit('device:switched', {
        from: disconnectedDeviceId,
        to: this.fallbackDeviceId,
      })
      return true
    }

    // No fallback configured — try default system device
    log.info('No fallback configured — attempting default system device')
    this.currentDeviceId = 'default'
    this.emit('device:switched', {
      from: disconnectedDeviceId,
      to: 'default',
    })
    return true
  }

  /**
   * 2.7 FIX: Attempt to reconnect to the original device after it reappears.
   */
  async handleDeviceReconnect(deviceId: string): Promise<void> {
    if (deviceId === this.currentDeviceId) return
    log.info(`Original device reconnected: ${deviceId} — switching back`)
    const previous = this.currentDeviceId
    this.currentDeviceId = deviceId
    this.reconnectAttempts = 0
    this.emit('device:restored', { from: previous, to: deviceId })
  }

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
    this.tempFilePath = path.join(
      getAudioCacheDir(),
      `${TEMP_PREFIX}${meetingId}-${Date.now()}.raw`
    )
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
    } catch (err) {
      log.debug('Background embedding queue unavailable (optional):', err)
    }

    // Reset VAD state to clear stale LSTM context from any previous session.
    // Without this, if a recording is paused and resumed, the VAD LSTM tensors
    // retain old acoustic context, causing ~2s of false-negative voice detection.
    this.emit('vadReset')

    // 4.1 FIX: Start ring buffer flush timer — coalesces IPC chunks
    this.ringBuffer.reset()
    this.ringFlushTimer = setInterval(() => {
      this.flushRingBuffer()
    }, AudioPipelineService.RING_FLUSH_INTERVAL_MS)
    if (this.ringFlushTimer.unref) this.ringFlushTimer.unref()

    // 4.2 FIX: Reset RMS tracking
    this.currentRms = 0
    this.peakRms = 0
    this.rmsHistory = []

    this.emit('status', { meetingId, status: 'capturing' })
    log.info(`Started capture for meeting ${meetingId}`)
  }

  /**
   * 4.2 FIX: Compute RMS (Root Mean Square) audio level from PCM data.
   * Returns a value between 0 and 1 representing the current audio intensity.
   */
  private computeRMS(audioData: Float32Array): number {
    if (audioData.length === 0) return 0
    let sumSquares = 0
    for (const sample of audioData) {
      sumSquares += sample * sample
    }
    const rms = Math.sqrt(sumSquares / audioData.length)
    // Normalize: typical speech RMS is 0.01-0.2, clamp to 0-1
    return Math.min(rms * 5, 1.0)
  }

  /**
   * 4.2 FIX: Get smoothed RMS level for audio-reactive UI (widget recording dot).
   */
  getCurrentAudioLevel(): number {
    return this.currentRms
  }

  /**
   * 4.1 FIX: Flush the ring buffer — sends coalesced audio to the processing pipeline.
   * Called every 100ms by the flush timer, reducing IPC overhead 10×.
   */
  private flushRingBuffer(): void {
    if (!this.isCapturing || this.isPaused) return
    const available = this.ringBuffer.available
    if (available === 0) return

    // Read up to 0.1s of audio (1600 samples at 16kHz) per flush
    const flushSize = Math.min(available, this.ringFlushBuffer.length)
    const read = this.ringBuffer.read(this.ringFlushBuffer.subarray(0, flushSize))
    if (read > 0) {
      this.processAudioChunkInternal(this.ringFlushBuffer.subarray(0, read))
    }
  }

  /**
   * Receive audio data from renderer via IPC.
   * 4.1 FIX: Now writes into ring buffer instead of processing directly.
   * Called by audio IPC handler when renderer sends PCM buffers.
   */
  processAudioChunk(audioData: Float32Array): void {
    if (!this.isCapturing || !this.currentMeetingId || this.isPaused) return

    // 4.2 FIX: Compute RMS level for audio-reactive feedback
    const rms = this.computeRMS(audioData)
    this.rmsHistory.push(rms)
    if (this.rmsHistory.length > AudioPipelineService.RMS_HISTORY_SIZE) {
      this.rmsHistory.shift()
    }
    this.currentRms = this.rmsHistory.reduce((a, b) => a + b, 0) / this.rmsHistory.length
    if (rms > this.peakRms) this.peakRms = rms

    // 4.1 FIX: Write into ring buffer for coalesced processing
    const written = this.ringBuffer.write(audioData)
    if (written < audioData.length) {
      log.warn(`Ring buffer overflow: dropped ${audioData.length - written} samples`)
    }
  }

  /**
   * Internal audio processing — called by flushRingBuffer with coalesced data.
   */
  private processAudioChunkInternal(audioData: Float32Array): void {
    if (!this.isCapturing || !this.currentMeetingId || this.isPaused) return

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

      // Queue processing if already in progress — buffer overflow into a pending queue
      if (this.isProcessingChunk) {
        this.pendingChunkProcess = true
        // Buffer the overflow data that couldn't fit into currentBuffer
        if (overflowData && overflowData.length > 0) {
          if (!this._pendingOverflow) this._pendingOverflow = []
          this._pendingOverflow.push(new Float32Array(overflowData))
        }
        return
      }
      // #1 fix: Previously fire-and-forget — async errors were silently swallowed
      this.processAccumulatedChunk().catch(err => log.error('Chunk processing failed:', err))

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
    if (this.isProcessingChunk) return
    this.isProcessingChunk = true

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

    // ── Rotate disk buffer: create new stream BEFORE ending old one ──
    // This prevents a gap where audio data arrives but no stream exists.
    let newWriteStream: fs.WriteStream | null = null
    if (this.tempFilePath) {
      try {
        fs.unlinkSync(this.tempFilePath)
      } catch {
        /* already gone */
      }
      this.tempFilePath = path.join(
        getAudioCacheDir(),
        `${TEMP_PREFIX}${this.currentMeetingId}-${Date.now()}.raw`
      )
      try {
        newWriteStream = fs.createWriteStream(this.tempFilePath, { flags: 'w' })
      } catch (err) {
        log.warn('Failed to create writeStream for audio recording — audio data may be lost:', err)
      }
    }

    // Now safe to end the old stream — new one is ready
    if (this.writeStream && !this.writeStream.destroyed) {
      this.writeStream.end()
    }
    this.writeStream = newWriteStream

    try {
      // Send to Whisper via ASRService
      const result = await getASRService().transcribe(mergedAudio)

      if (!result || !result.segments || result.segments.length === 0) {
        log.debug('No speech detected in chunk')
        return
      }

      // Reset failure counter on success
      this.consecutiveAsrFailures = 0

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

        try {
          if (!_embeddingQueueMod) {
            _embeddingQueueMod = await import('./BackgroundEmbeddingQueue')
          }
          _embeddingQueueMod.getBackgroundEmbeddingQueue().enqueue({
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
      this.consecutiveAsrFailures++
      log.error(
        `Transcription failed (${this.consecutiveAsrFailures}/${AudioPipelineService.MAX_LOCAL_FAILURES}):`,
        error
      )

      // #6: Cloud transcription fallback after MAX_LOCAL_FAILURES consecutive failures
      let cloudFallbackSucceeded = false
      if (this.consecutiveAsrFailures >= AudioPipelineService.MAX_LOCAL_FAILURES) {
        // Enforce strict local-only execution for free tier
        const db = getDatabaseService()
        const tier = db.getSetting('subscription_tier') || 'free'

        if (tier === 'free') {
          log.warn(
            'Local ASR failed repeatedly, but user is on FREE tier. Skipping cloud fallback to enforce sovereignty.'
          )
          return
        }

        log.warn('Local ASR failed repeatedly — attempting cloud transcription fallback')
        try {
          if (!_cloudTranscriptionMod) {
            _cloudTranscriptionMod = await import('./CloudTranscriptionService')
          }
          const cloudService = _cloudTranscriptionMod.getCloudTranscriptionService()
          if (cloudService.isEnabled() && !cloudService.isLimitReached()) {
            const cloudResult = await cloudService.transcribe(mergedAudio)
            if (cloudResult && cloudResult.length > 0) {
              this.consecutiveAsrFailures = 0 // Reset on successful cloud transcription
              cloudFallbackSucceeded = true
              const transcriptService = getTranscriptService()
              for (const segment of cloudResult) {
                this.segmentCounter++
                transcriptService.saveTranscript({
                  meetingId: this.currentMeetingId || '',
                  segment: {
                    text: segment.text.trim(),
                    start: chunkStart + segment.start,
                    end: chunkStart + segment.end,
                    confidence: segment.confidence,
                    words: segment.words,
                  },
                })
              }
              log.info(`Cloud fallback succeeded: ${cloudResult.length} segments`)
            }
          }
        } catch (cloudErr) {
          log.warn('Cloud transcription fallback also failed:', cloudErr)
        }
      }

      // Only emit error to UI if cloud fallback didn't save the situation
      if (!cloudFallbackSucceeded) {
        this.emit('error', {
          meetingId: this.currentMeetingId,
          error: (error as Error).message,
        })
      }
    } finally {
      // Return buffer to pool after ASR finishes
      this.bufferPool.release(oldBuffer)
      this.isProcessingChunk = false

      // Process any chunk that was queued during our processing
      if (this.pendingChunkProcess) {
        this.pendingChunkProcess = false
        // Drain pending overflow data into the current buffer
        if (this._pendingOverflow && this._pendingOverflow.length > 0 && this.currentBuffer) {
          for (const overflowChunk of this._pendingOverflow) {
            const space = this.currentBuffer.length - this.writeOffset
            const toCopy = Math.min(overflowChunk.length, space)
            this.currentBuffer.set(overflowChunk.subarray(0, toCopy), this.writeOffset)
            this.writeOffset += toCopy
            if (toCopy < overflowChunk.length) break // buffer full
          }
          this._pendingOverflow = null
        }
        if (this.currentBuffer && this.writeOffset > 0) {
          this.processAccumulatedChunk().catch(err =>
            log.error('Pending chunk processing failed:', err)
          )
        }
      }
    }
  }

  /**
   * Recover orphaned audio files from a previous crash.
   * Scans tmpdir for bluearkive-audio-* files from prior sessions.
   */
  private recoverOrphanedAudio(currentMeetingId: string): void {
    try {
      const tmpDir = getAudioCacheDir()
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

    // 4.1 FIX: Stop ring buffer flush timer FIRST to prevent race condition
    // with processAccumulatedChunk below. Timer callbacks could fire during
    // the await and collide with the final flush.
    if (this.ringFlushTimer) {
      clearInterval(this.ringFlushTimer)
      this.ringFlushTimer = null
    }
    // Drain any remaining audio from ring buffer into the processing pipeline
    this.flushRingBuffer()

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
    } catch (err) {
      log.debug('Background embedding queue shutdown (optional):', err)
    }

    const duration = (Date.now() - this.meetingStartTime) / 1000
    const segments = this.segmentCounter

    this.isCapturing = false
    this.consecutiveAsrFailures = 0 // Reset for next recording session
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
   * I1 fix: Pause audio processing — chunks are silently dropped.
   * Resources stay allocated for instant resume.
   */
  pause(): void {
    if (!this.isCapturing) return
    this.isPaused = true
    this.emit('status', { meetingId: this.currentMeetingId, status: 'paused' })
    log.info(`Audio capture paused for meeting ${this.currentMeetingId}`)
  }

  /**
   * I1 fix: Resume audio processing after a pause.
   */
  resume(): void {
    if (!this.isCapturing) return
    this.isPaused = false
    this.emit('status', { meetingId: this.currentMeetingId, status: 'capturing' })
    log.info(`Audio capture resumed for meeting ${this.currentMeetingId}`)
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
   * G5: Uses Electron's webContents to query real system devices
   */
  async enumerateAudioSources(): Promise<AudioDeviceInfo[]> {
    const devices: AudioDeviceInfo[] = []

    try {
      // Always include system audio source (platform-specific)
      if (process.platform === 'darwin') {
        devices.push({
          id: 'system-audio',
          label: 'System Audio (via ScreenCaptureKit)',
          kind: 'system' as const,
          isDefault: true,
          isAvailable: true,
          deviceType: 'built-in' as const,
          connectionType: 'internal' as const,
        })
      } else if (process.platform === 'win32') {
        devices.push({
          id: 'wasapi-loopback',
          label: 'System Audio (WASAPI Loopback)',
          kind: 'system' as const,
          isDefault: true,
          isAvailable: true,
          deviceType: 'built-in' as const,
          connectionType: 'internal' as const,
        })
      }

      // G5: Query real input devices via BrowserWindow webContents
      const { BrowserWindow } = await import('electron')
      const win = BrowserWindow.getAllWindows()[0]
      if (win && !win.isDestroyed()) {
        const rawDevices = await win.webContents.executeJavaScript(
          `navigator.mediaDevices.enumerateDevices().then(d => d.filter(x => x.kind === 'audioinput').map(x => ({ deviceId: x.deviceId, label: x.label, groupId: x.groupId })))`,
          true
        )

        if (Array.isArray(rawDevices)) {
          for (const d of rawDevices) {
            const label = d.label || 'Unknown Microphone'
            const isDefault = d.deviceId === 'default' || label.toLowerCase().includes('default')
            const isBluetooth = label.toLowerCase().includes('bluetooth')
            const isUsb = label.toLowerCase().includes('usb')
            const devType = isBluetooth ? 'bluetooth' : isUsb ? 'usb' : 'built-in'
            const connType = isBluetooth ? 'bluetooth' : isUsb ? 'usb' : 'internal'

            devices.push({
              id: d.deviceId || `mic-${devices.length}`,
              label,
              kind: 'input' as const,
              isDefault,
              isAvailable: true,
              deviceType: devType as AudioDeviceInfo['deviceType'],
              connectionType: connType as AudioDeviceInfo['connectionType'],
            })
          }
        }
      } else {
        // Fallback: add a generic microphone entry if no window is available
        devices.push({
          id: 'default-microphone',
          label: 'Default Microphone',
          kind: 'input' as const,
          isDefault: true,
          isAvailable: true,
          deviceType: 'built-in' as const,
          connectionType: 'internal' as const,
        })
      }

      return devices
    } catch (error) {
      log.error('Device enumeration failed:', error)
      // Return whatever we've collected so far rather than empty
      return devices.length > 0 ? devices : []
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
      link: 'https://support.microsoft.com/en-us/windows/how-to-set-up-and-test-microphones-in-windows-ba9a4aab-35d1-12ee-5835-cccac7ee872a',
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
    this.consecutiveAsrFailures = 0
    this.deviceSwitchHistory = []
    this.currentDevice = 'System Audio'
    // 4.1 FIX: Clean up ring buffer
    if (this.ringFlushTimer) {
      clearInterval(this.ringFlushTimer)
      this.ringFlushTimer = null
    }
    this.ringBuffer.reset()
    // 4.2 FIX: Reset RMS tracking
    this.currentRms = 0
    this.peakRms = 0
    this.rmsHistory = []
    // 4.4 FIX: Clear named capture sessions
    this.captureSessions.clear()
    // #13: Clean up all event listeners to prevent memory leaks
    this.removeAllListeners()
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
