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
import os from 'os'
import path from 'path'
import { app } from 'electron'
import { getASRService } from './ASRService'
import { getTranscriptService } from './TranscriptService'
import { config } from '../config/environment'
import { Logger } from './Logger'

const log = Logger.create('AudioPipeline')
const TEMP_PREFIX = 'bluearkive-audio-'
/** `<prefix><meeting uuid>-<epoch ms>-<seq>-s<start seconds>.raw` → [1] meeting id, [2] start seconds. */
const ORPHAN_FILE_PATTERN =
  /^bluearkive-audio-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-\d+-\d+-s(\d+)\.raw$/i

// #11 fix: Cache dynamic imports to avoid re-resolving on hot path per-segment
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

/** A sealed 30s (or final partial) chunk waiting for transcription. */
interface QueuedChunk {
  meetingId: string
  audio: Float32Array
  /** Seconds since the meeting started. */
  startSec: number
  endSec: number
  /** Crash-recovery copy on disk; removed once the chunk has been handled. */
  tempFile: string | null
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
    chunkDurationSec: 30, // Longest chunk; most are sealed earlier, at a pause
    vadThreshold: 0.5,
  }

  // Pre-allocate buffer pool for memory recycling
  private bufferPool = new AudioBufferPool(this.config.sampleRate, this.config.chunkDurationSec + 5)
  private currentBuffer: Float32Array | null = null
  private writeOffset = 0

  // 4.1 FIX: Ring buffer for IPC backpressure — coalesces ~100 chunks/sec → 10 flushes/sec
  // 10s: comfortably larger than the biggest burst the renderer sends.
  private ringBuffer = new AudioRingBuffer(this.config.sampleRate, 10)
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
  /** End of the last sealed chunk on the meeting timeline (seconds). */
  private lastChunkEndSec: number = 0
  // Segments saved per meeting. Keyed by meeting because a stopped meeting's
  // queued chunks keep being transcribed after the next recording has started.
  private segmentCounts = new Map<string, number>()

  // ── Disk buffering for crash resilience ──
  private tempFilePath: string | null = null
  private writeStream: fs.WriteStream | null = null
  private tempFileSeq = 0
  /** True while stopCapture() is running (guards re-entry from its own final flush). */
  private isStopping = false
  // Sealed chunks awaiting transcription. Capture never waits on this queue.
  private readyChunks: QueuedChunk[] = []
  private drainPromise: Promise<void> | null = null
  /** ~5 minutes of audio (~19MB) may queue behind a slow model before dropping. */
  private static readonly MAX_QUEUED_SECONDS = 300

  // ── Pause-aligned chunking ──
  // A chunk is handed to the recognizer at the first pause after
  // MIN_CHUNK_SEC, instead of always after a fixed 30s. The transcript then
  // trails the conversation by a sentence or two rather than half a minute,
  // and chunks end between words instead of through the middle of one (each
  // chunk is recognised on its own, so a word cut at the boundary was garbled
  // in both halves). Speech with no pause still seals at the 30s cap.
  private static readonly MIN_CHUNK_SEC = 6
  private static readonly PAUSE_SEC = 0.45
  /** Energy analysis frame: 30ms at 16kHz. */
  private static readonly ENERGY_FRAME = 480
  /** Below this RMS a frame is never speech. */
  private static readonly ENERGY_FLOOR = 0.003
  /** A chunk whose loudest frame stays under this holds no speech worth an early seal. */
  private static readonly SPEECH_PEAK = 0.01
  private frameSum = 0
  private frameFill = 0
  private chunkPeakRms = 0
  private trailingQuietFrames = 0
  /** How long stopCapture() waits for the queue before returning. */
  private static readonly STOP_DRAIN_TIMEOUT_MS = 90_000
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

    // Initialize ASR service (lazy — loads the speech model on first use).
    // Done before any state is touched so a failure leaves nothing to undo.
    try {
      await getASRService().initialize()
    } catch (error) {
      log.error('ASR initialization failed:', error)
      throw error
    }

    // Another startCapture may have won the race while the model loaded.
    if (this.isCapturing) {
      throw new Error('Already capturing — stop current capture first')
    }

    this.currentMeetingId = meetingId
    this.isCapturing = true
    this.isPaused = false
    this.meetingStartTime = Date.now()
    this.lastChunkEndSec = 0
    this.consecutiveAsrFailures = 0

    this.currentBuffer = this.bufferPool.acquire()
    this.writeOffset = 0

    this.segmentCounts.set(meetingId, 0)

    // ── Create temp file for crash-resilient disk buffering ──
    this.openChunkTempFile(meetingId)

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
   * 4.1 FIX: Flush the ring buffer into the processing pipeline.
   *
   * Drains everything that has arrived, not a fixed 0.1s slice. A timer never
   * fires more often than its interval and in practice fires ~1% less often,
   * so reading at most "one interval's worth" per tick falls steadily behind
   * real time until the ring overflows and samples are dropped for the rest of
   * the recording.
   */
  private flushRingBuffer(): void {
    if (!this.isCapturing || this.isPaused) return
    for (;;) {
      const available = this.ringBuffer.available
      if (available === 0) return
      const flushSize = Math.min(available, this.ringFlushBuffer.length)
      const read = this.ringBuffer.read(this.ringFlushBuffer.subarray(0, flushSize))
      if (read <= 0) return
      this.processAudioChunkInternal(this.ringFlushBuffer.subarray(0, read))
      if (!this.isCapturing) return // max-duration guard stopped the capture
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

    // 4.1 FIX: Write into ring buffer for coalesced processing. If a burst
    // does not fit, make room by flushing now rather than dropping audio.
    let offset = this.ringBuffer.write(audioData)
    while (offset < audioData.length) {
      this.flushRingBuffer()
      const written = this.ringBuffer.write(audioData.subarray(offset))
      if (written === 0) {
        log.warn(`Ring buffer overflow: dropped ${audioData.length - offset} samples`)
        break
      }
      offset += written
    }
  }

  /** Samples in one transcription chunk (30s at 16kHz). */
  private get chunkSamples(): number {
    return this.config.sampleRate * this.config.chunkDurationSec
  }

  /**
   * Internal audio processing — called by flushRingBuffer with coalesced data.
   * Appends to the current chunk and seals it each time it reaches 30s.
   * Never waits on transcription: sealed chunks go to a queue.
   */
  private processAudioChunkInternal(audioData: Float32Array): void {
    if (!this.isCapturing || !this.currentMeetingId || this.isPaused) return

    // ── Max recording duration guard ──────────────────────────
    const maxDurationMs = config.MAX_RECORDING_DURATION_MS
    if (maxDurationMs > 0 && !this.isStopping) {
      const elapsed = Date.now() - this.meetingStartTime
      if (elapsed >= maxDurationMs) {
        log.warn(
          `Max recording duration reached (${Math.round(elapsed / 60000)} min). Auto-stopping.`
        )
        this.emit('maxDurationReached', {
          meetingId: this.currentMeetingId,
          elapsedMs: elapsed,
          limitMs: maxDurationMs,
        })
        this.stopCapture().catch(err => log.error('Auto-stop failed:', err))
        return
      }
    }

    let offset = 0
    while (offset < audioData.length) {
      if (!this.currentBuffer) return
      const space = this.chunkSamples - this.writeOffset
      const count = Math.min(space, audioData.length - offset)
      const part = audioData.subarray(offset, offset + count)

      this.currentBuffer.set(part, this.writeOffset)
      this.writeOffset += count
      offset += count
      this.trackEnergy(part)

      // ── Write to disk for crash resilience ──
      // Copy: the caller reuses its buffer, and a stream write is deferred.
      if (this.writeStream && !this.writeStream.destroyed) {
        this.writeStream.write(
          Buffer.from(new Uint8Array(part.buffer, part.byteOffset, part.byteLength))
        )
      }

      if (this.writeOffset >= this.chunkSamples || this.isAtPause()) {
        this.sealCurrentChunk()
      }
    }
  }

  /** Follow the level of the chunk being filled, one 30ms frame at a time. */
  private trackEnergy(samples: Float32Array): void {
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i] ?? 0
      this.frameSum += sample * sample
      if (++this.frameFill < AudioPipelineService.ENERGY_FRAME) continue

      const rms = Math.sqrt(this.frameSum / AudioPipelineService.ENERGY_FRAME)
      this.frameSum = 0
      this.frameFill = 0
      if (rms > this.chunkPeakRms) this.chunkPeakRms = rms
      // Quiet relative to the speech in this chunk, with an absolute floor.
      const quiet = rms < Math.max(AudioPipelineService.ENERGY_FLOOR, this.chunkPeakRms * 0.1)
      this.trailingQuietFrames = quiet ? this.trailingQuietFrames + 1 : 0
    }
  }

  /** True when the chunk holds speech, is long enough, and has just gone quiet. */
  private isAtPause(): boolean {
    const { sampleRate } = this.config
    return (
      this.writeOffset >= AudioPipelineService.MIN_CHUNK_SEC * sampleRate &&
      this.chunkPeakRms >= AudioPipelineService.SPEECH_PEAK &&
      this.trailingQuietFrames * AudioPipelineService.ENERGY_FRAME >=
        AudioPipelineService.PAUSE_SEC * sampleRate
    )
  }

  /**
   * Close the chunk being filled and hand it to the transcription queue.
   * The audio is copied out, so capture continues into the same buffer
   * immediately regardless of how long transcription takes.
   */
  private sealCurrentChunk(): void {
    if (!this.currentMeetingId || !this.currentBuffer || this.writeOffset === 0) return

    const audio = this.currentBuffer.slice(0, this.writeOffset)
    const durationSec = audio.length / this.config.sampleRate
    this.writeOffset = 0
    this.frameSum = 0
    this.frameFill = 0
    this.chunkPeakRms = 0
    this.trailingQuietFrames = 0

    // Timeline: seconds since the meeting started (wall clock), kept
    // monotonic so consecutive chunks never overlap.
    const nowSec = (Date.now() - this.meetingStartTime) / 1000
    const startSec = Math.max(this.lastChunkEndSec, nowSec - durationSec)
    const endSec = startSec + durationSec
    this.lastChunkEndSec = endSec

    // This chunk's disk copy stays until its transcript is saved.
    const tempFile = this.tempFilePath
    if (this.writeStream && !this.writeStream.destroyed) {
      this.writeStream.end()
    }
    this.writeStream = null
    this.tempFilePath = null
    if (this.isCapturing) this.openChunkTempFile(this.currentMeetingId)

    this.readyChunks.push({
      meetingId: this.currentMeetingId,
      audio,
      startSec,
      endSec,
      tempFile,
    })

    // Transcription slower than real time: bound memory by dropping the
    // oldest queued chunk, loudly. Measured in seconds of audio — chunks vary
    // in length now.
    const queuedSeconds = () =>
      this.readyChunks.reduce((total, queued) => total + (queued.endSec - queued.startSec), 0)
    while (
      this.readyChunks.length > 1 &&
      queuedSeconds() > AudioPipelineService.MAX_QUEUED_SECONDS
    ) {
      const dropped = this.readyChunks.shift()
      if (!dropped) break
      // Its disk copy is left in place for recoverInterruptedAudio().
      log.error(
        `Transcription backlog full — dropped audio ${dropped.startSec.toFixed(0)}s-${dropped.endSec.toFixed(0)}s`
      )
      this.emitError(dropped.meetingId, 'Transcription cannot keep up; some audio was skipped')
    }

    this.startDraining()
  }

  /** Run the transcription queue if it is not already running. */
  private startDraining(): void {
    if (this.drainPromise) return
    this.drainPromise = (async () => {
      for (;;) {
        const chunk = this.readyChunks.shift()
        if (!chunk) return
        await this.transcribeChunk(chunk)
      }
    })()
      .catch(err => log.error('Transcription queue failed:', err))
      .finally(() => {
        this.drainPromise = null
        if (this.readyChunks.length > 0) this.startDraining()
      })
  }

  /**
   * Transcribe one sealed chunk and store its segments. Never throws.
   * Everything it needs travels with the chunk — it must not read
   * currentMeetingId, which may already belong to the next recording.
   */
  private async transcribeChunk(chunk: QueuedChunk): Promise<boolean> {
    const { meetingId, audio, startSec, endSec } = chunk
    let handled = false

    try {
      const result = await getASRService().transcribe(audio)
      handled = true

      // Reset failure counter on success
      this.consecutiveAsrFailures = 0

      const { saved, failed } = this.saveSegments(meetingId, startSec, result?.segments ?? [])
      // Transcribed but nothing could be stored (database error): keep the
      // audio on disk so the next launch retries it, instead of deleting the
      // only copy. (A partial save is not retried — it would duplicate the
      // segments that did get stored.)
      if (failed > 0 && saved === 0) handled = false
      if (saved === 0 && failed === 0) {
        log.debug('No speech detected in chunk')
      } else {
        log.info(
          `Processed chunk ${startSec.toFixed(1)}s-${endSec.toFixed(1)}s: ${saved} segments (total: ${this.segmentCounts.get(meetingId) ?? saved})`
        )
      }
    } catch (error) {
      this.consecutiveAsrFailures++
      log.error(
        `Transcription failed (${this.consecutiveAsrFailures}/${AudioPipelineService.MAX_LOCAL_FAILURES}):`,
        error
      )

      // #6: Cloud transcription fallback after MAX_LOCAL_FAILURES consecutive failures
      let cloudFallbackSucceeded = false
      if (this.consecutiveAsrFailures >= AudioPipelineService.MAX_LOCAL_FAILURES) {
        cloudFallbackSucceeded = await this.tryCloudFallback(meetingId, startSec, audio)
        handled = cloudFallbackSucceeded
      }

      // Only surface the error if cloud fallback didn't save the situation
      if (!cloudFallbackSucceeded) {
        this.emitError(meetingId, error instanceof Error ? error.message : String(error))
      }
    } finally {
      // Audio that could not be transcribed stays on disk so the next launch
      // can retry it (recoverInterruptedAudio); AudioCacheCleanup removes
      // anything older than 48 hours.
      if (handled) this.removeTempFile(chunk.tempFile)
    }
    return handled
  }

  /** Store transcript segments, skipping empty ones. Returns how many were saved / could not be. */
  private saveSegments(
    meetingId: string,
    chunkStartSec: number,
    segments: Array<{
      text: string
      start: number
      end: number
      confidence: number
      words?: Array<{ word: string; start: number; end: number; confidence: number }>
    }>
  ): { saved: number; failed: number } {
    const transcriptService = getTranscriptService()
    let saved = 0
    let failed = 0
    for (const segment of segments) {
      const text = (segment.text || '').trim()
      // A model that heard nothing returns an empty segment — not a transcript.
      if (!text) continue
      try {
        transcriptService.saveTranscript({
          meetingId,
          segment: {
            text,
            start: chunkStartSec + segment.start,
            end: chunkStartSec + segment.end,
            confidence: segment.confidence,
            words: segment.words,
          },
        })
        // TranscriptService.saveTranscript() auto-emits 'transcript' event and
        // generates the segment's embedding; transcript.handlers.ts forwards
        // the event to the renderer.
        this.segmentCounts.set(meetingId, (this.segmentCounts.get(meetingId) ?? 0) + 1)
        saved++
      } catch (saveErr) {
        failed++
        log.error('Failed to save transcript segment:', saveErr)
      }
    }
    return { saved, failed }
  }

  /** Paid tiers only: send the chunk to cloud transcription. Returns true if segments were saved. */
  private async tryCloudFallback(
    meetingId: string,
    chunkStartSec: number,
    audio: Float32Array
  ): Promise<boolean> {
    try {
      // Free tier is strictly local. Read the tier from the same source the
      // rest of the app gates on (the old 'subscription_tier' setting was
      // never written, so this fallback could not run for anyone).
      const { getCloudAccessManager } = await import('./CloudAccessManager')
      const status = await getCloudAccessManager().getCloudAccessStatus()
      if (!status.hasAccess) {
        log.warn(`Local ASR failed repeatedly; cloud fallback unavailable (${status.reason})`)
        return false
      }

      log.warn('Local ASR failed repeatedly — attempting cloud transcription fallback')
      if (!_cloudTranscriptionMod) {
        _cloudTranscriptionMod = await import('./CloudTranscriptionService')
      }
      const cloudService = _cloudTranscriptionMod.getCloudTranscriptionService()
      if (!cloudService.isEnabled() || cloudService.isLimitReached()) return false

      const cloudResult = await cloudService.transcribe(audio)
      if (!cloudResult || cloudResult.length === 0) return false

      const { saved } = this.saveSegments(meetingId, chunkStartSec, cloudResult)
      if (saved > 0) {
        this.consecutiveAsrFailures = 0 // Reset on successful cloud transcription
        log.info(`Cloud fallback succeeded: ${saved} segments`)
      }
      return saved > 0
    } catch (cloudErr) {
      log.warn('Cloud transcription fallback also failed:', cloudErr)
      return false
    }
  }

  /**
   * Report a pipeline error. EventEmitter throws when 'error' is emitted with
   * no listener — which previously aborted stopCapture() half-way and left the
   * pipeline stuck in the "capturing" state.
   */
  private emitError(meetingId: string | null, message: string): void {
    this.emit('pipelineError', { meetingId, error: message })
    if (this.listenerCount('error') > 0) {
      this.emit('error', { meetingId, error: message })
    }
  }

  /** Open the disk buffer for the chunk now being filled. */
  private openChunkTempFile(meetingId: string): void {
    try {
      const filePath = path.join(
        getAudioCacheDir(),
        `${TEMP_PREFIX}${meetingId}-${Date.now()}-${this.tempFileSeq++}-s${Math.round(this.lastChunkEndSec)}.raw`
      )
      const stream = fs.createWriteStream(filePath, { flags: 'w' })
      // Stream errors (disk full, permissions) arrive asynchronously; without
      // a listener they become an uncaught exception. Losing the crash copy
      // must never cost the recording itself.
      stream.on('error', err => {
        log.warn('Audio disk buffer unavailable, continuing in memory:', err)
        if (this.writeStream === stream) {
          this.writeStream = null
          this.tempFilePath = null
        }
        stream.destroy()
      })
      this.writeStream = stream
      this.tempFilePath = filePath
    } catch (err) {
      log.warn('Could not create temp audio file, using RAM-only buffering:', err)
      this.writeStream = null
      this.tempFilePath = null
    }
  }

  private removeTempFile(filePath: string | null): void {
    if (!filePath) return
    fs.unlink(filePath, () => {
      /* already gone */
    })
  }

  /**
   * Transcribe audio left on disk by a crash, a forced quit, or a failed
   * transcription, and attach it to the meeting it belongs to.
   *
   * Each chunk is written to `<prefix><meetingId>-<time>-<seq>-s<startSec>.raw`
   * while it is being recorded and removed once its transcript is saved, so
   * any file still present at startup is audio that never became text.
   *
   * Call once at startup (not while recording). Safe to call when there is
   * nothing to recover — the speech model is only loaded if files exist.
   */
  async recoverInterruptedAudio(): Promise<{ recovered: number; failed: number }> {
    const outcome = { recovered: 0, failed: 0 }
    if (this.isCapturing) return outcome

    let files: string[]
    try {
      files = fs
        .readdirSync(getAudioCacheDir())
        .filter(f => ORPHAN_FILE_PATTERN.test(f))
        .sort()
    } catch (err) {
      log.debug('Interrupted-audio scan skipped:', err)
      return outcome
    }
    if (files.length === 0) return outcome

    log.info(`Found ${files.length} unsaved audio chunk(s) from a previous session`)
    const { getDatabaseService } = await import('./DatabaseService')

    for (const file of files) {
      // A recording takes priority; whatever is left is retried next launch.
      if (this.isCapturing) break

      const fullPath = path.join(getAudioCacheDir(), file)
      const match = ORPHAN_FILE_PATTERN.exec(file)
      const meetingId = match?.[1]
      if (!meetingId) continue

      try {
        const stat = fs.statSync(fullPath)
        // Whole samples only — a crash can leave a partial trailing sample.
        const sampleCount = Math.floor(stat.size / 4)
        if (
          sampleCount < this.config.sampleRate / 2 ||
          !getDatabaseService().getMeeting(meetingId)
        ) {
          // Under half a second, or its meeting no longer exists.
          fs.unlinkSync(fullPath)
          continue
        }

        const raw = fs.readFileSync(fullPath)
        // Copy into an aligned buffer (a Node Buffer's byteOffset need not be a multiple of 4).
        const audio = new Float32Array(sampleCount)
        new Uint8Array(audio.buffer).set(raw.subarray(0, sampleCount * 4))

        const startSec = Number(match?.[2] ?? 0)
        const handled = await this.transcribeChunk({
          meetingId,
          audio,
          startSec,
          endSec: startSec + sampleCount / this.config.sampleRate,
          tempFile: fullPath,
        })
        if (handled) outcome.recovered++
        else outcome.failed++
      } catch (err) {
        outcome.failed++
        log.warn(`Could not recover audio chunk ${file}:`, err)
      }
    }

    if (outcome.recovered > 0 || outcome.failed > 0) {
      log.info(
        `Interrupted audio: recovered ${outcome.recovered} chunk(s), ${outcome.failed} left for retry`
      )
      this.emit('orphanedAudioRecovered', outcome)
    }
    return outcome
  }

  /**
   * Clean up disk buffer resources.
   */
  private cleanupDiskBuffer(): void {
    if (this.writeStream && !this.writeStream.destroyed) {
      this.writeStream.end()
    }
    this.writeStream = null
    this.removeTempFile(this.tempFilePath)
    this.tempFilePath = null
  }

  /**
   * Stop capturing and process any remaining audio.
   */
  async stopCapture(
    options: { drainTimeoutMs?: number } = {}
  ): Promise<{ duration: number; segments: number }> {
    if (!this.isCapturing || this.isStopping) {
      return { duration: 0, segments: 0 }
    }
    return this.stopCaptureInternal(
      options.drainTimeoutMs ?? AudioPipelineService.STOP_DRAIN_TIMEOUT_MS
    )
  }

  /**
   * @param drainTimeoutMs how long to wait for queued chunks to be transcribed.
   *   App quit passes a short value: what is not transcribed in time stays on
   *   disk and is picked up by recoverInterruptedAudio() at the next launch.
   */
  private async stopCaptureInternal(
    drainTimeoutMs: number
  ): Promise<{ duration: number; segments: number }> {
    const meetingId = this.currentMeetingId
    const startedAt = this.meetingStartTime

    // `isStopping` covers only the synchronous teardown below (it keeps the
    // final ring flush from re-entering through the duration limit). It used
    // to stay set for the whole wait on queued transcription — up to 90s —
    // during which a recording started in the meantime could not be stopped:
    // its stop request returned as if nothing were capturing.
    this.isStopping = true
    try {
      this.endCaptureNow(meetingId)
    } finally {
      this.isStopping = false
    }

    return this.awaitDrainAndReport(meetingId, startedAt, drainTimeoutMs)
  }

  /** The synchronous part of a stop: after this no new audio is accepted. */
  private endCaptureNow(meetingId: string | null): void {
    // Announce the stop before the (up to 90s) wait for queued transcription:
    // listeners close the meeting and release the audio device now, not after
    // the last chunk has been transcribed.
    this.emit('status', { meetingId, status: 'stopping' })

    // 4.1 FIX: Stop ring buffer flush timer FIRST so it cannot interleave
    // with the final flush below.
    if (this.ringFlushTimer) {
      clearInterval(this.ringFlushTimer)
      this.ringFlushTimer = null
    }

    // Drain everything still in the ring (a paused capture has nothing new),
    // then seal the partial chunk so the end of the meeting is transcribed.
    const wasPaused = this.isPaused
    this.isPaused = false
    if (!wasPaused) this.flushRingBuffer()

    // From here no new audio is accepted.
    this.isCapturing = false
    this.sealCurrentChunk()

    // Return current buffer to pool
    if (this.currentBuffer) {
      this.bufferPool.release(this.currentBuffer)
      this.currentBuffer = null
      this.writeOffset = 0
    }

    // Clean up the (now unused) disk buffer for the next chunk
    this.cleanupDiskBuffer()
    this.ringBuffer.reset()
  }

  /**
   * Wait (bounded) for the stopped meeting's queued chunks, then report.
   * Another recording may start while this waits, so everything here is tied
   * to `meetingId` rather than to the pipeline's current state.
   */
  private async awaitDrainAndReport(
    meetingId: string | null,
    startedAt: number,
    drainTimeoutMs: number
  ): Promise<{ duration: number; segments: number }> {
    // Wait for queued chunks to be transcribed — bounded, so a stuck model
    // cannot hang the Stop button. Anything still queued keeps running in the
    // background and saves to the right meeting when it completes.
    const drainDeadline = Date.now() + drainTimeoutMs
    while (this.drainPromise && Date.now() < drainDeadline) {
      const remaining = Math.max(0, drainDeadline - Date.now())
      await Promise.race([
        this.drainPromise,
        new Promise<void>(resolve => {
          const t = setTimeout(resolve, remaining)
          if (t.unref) t.unref()
        }),
      ])
    }
    if (this.drainPromise) {
      log.warn('Stop: transcription still in progress — finishing in the background')
    }

    const duration = (Date.now() - startedAt) / 1000
    const segments = meetingId ? (this.segmentCounts.get(meetingId) ?? 0) : 0

    // Only touch shared state if a new capture has not started in the meantime.
    if (!this.isCapturing) {
      this.consecutiveAsrFailures = 0 // Reset for next recording session
      if (this.currentMeetingId === meetingId) this.currentMeetingId = null
    }
    // Chunks still queued past the deadline keep counting under this id.
    if (meetingId && !this.drainPromise) this.segmentCounts.delete(meetingId)
    this.emit('status', {
      meetingId,
      status: 'stopped',
      duration,
      segments,
    })
    log.info(
      `Stopped capture for meeting ${meetingId} — ${duration.toFixed(1)}s, ${segments} segments`
    )

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
    // 'resumed', not 'capturing': 'capturing' means a recording has started.
    this.emit('status', { meetingId: this.currentMeetingId, status: 'resumed' })
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
      totalSegments: this.currentMeetingId
        ? (this.segmentCounts.get(this.currentMeetingId) ?? 0)
        : 0,
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
      // System audio source (platform-specific). On macOS it needs macOS 13+
      // and the Screen Recording permission; a denied permission is reported
      // as unavailable rather than promised.
      if (process.platform === 'darwin') {
        const available =
          isSystemAudioCaptureSupported() && this.getScreenRecordingPermissionStatus() !== 'denied'
        devices.push({
          id: 'system-audio',
          label: 'System Audio (via ScreenCaptureKit)',
          kind: 'system' as const,
          isDefault: available,
          isAvailable: available,
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
    this.frameSum = 0
    this.frameFill = 0
    this.chunkPeakRms = 0
    this.trailingQuietFrames = 0
    this.currentMeetingId = null
    this.segmentCounts.clear()
    this.consecutiveAsrFailures = 0
    this.isPaused = false
    this.lastChunkEndSec = 0
    for (const chunk of this.readyChunks) this.removeTempFile(chunk.tempFile)
    this.readyChunks = []
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

/**
 * Whether the computer's own audio output can be recorded on this platform at
 * all: Windows (WASAPI loopback), and macOS 13 or later (ScreenCaptureKit —
 * Darwin kernel 22+). Electron's docs still call getDisplayMedia's
 * `audio: 'loopback'` Windows-only, but Chromium implements it on macOS too.
 */
export function isSystemAudioCaptureSupported(): boolean {
  if (process.platform === 'win32') return true
  if (process.platform === 'darwin') {
    const darwinMajor = parseInt(os.release().split('.')[0] ?? '0', 10)
    return darwinMajor >= 22
  }
  return false
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
