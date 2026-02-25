/**
 * Audio Pipeline Service
 *
 * Orchestrates the full audio-to-transcript pipeline:
 * Renderer (audioCapture.ts) → IPC → AudioPipelineService → 30s chunks → ASRService → TranscriptService → IPC → Renderer
 *
 * This is the #1 critical service — without it, no audio becomes text.
 */

import { EventEmitter } from 'events'
import { getASRService } from './ASRService'
import { getTranscriptService } from './TranscriptService'

interface PipelineConfig {
  sampleRate: number // 16000 (Whisper's expected rate)
  chunkDurationSec: number // 30 seconds
  vadThreshold: number // 0.5 (Silero VAD confidence)
}

export class AudioPipelineService extends EventEmitter {
  private config: PipelineConfig = {
    sampleRate: 16000,
    chunkDurationSec: 30,
    vadThreshold: 0.5,
  }

  private audioBuffer: Float32Array[] = []
  private isCapturing = false
  private currentMeetingId: string | null = null
  private meetingStartTime: number = 0
  private chunkStartTime: number = 0
  private segmentCounter: number = 0

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
    this.audioBuffer = []
    this.segmentCounter = 0

    // Initialize ASR service (lazy — loads Whisper model on first use)
    try {
      await getASRService().initialize()
    } catch (error) {
      console.error('[AudioPipeline] ASR initialization failed:', error)
      this.isCapturing = false
      throw error
    }

    this.emit('status', { meetingId, status: 'capturing' })
    console.log(`[AudioPipeline] Started capture for meeting ${meetingId}`)
  }

  /**
   * Receive audio data from renderer via IPC.
   * Called by audio IPC handler when renderer sends PCM buffers.
   */
  processAudioChunk(audioData: Float32Array): void {
    if (!this.isCapturing || !this.currentMeetingId) return

    this.audioBuffer.push(audioData)

    // Check if accumulated enough audio for a 30s chunk
    const totalSamples = this.audioBuffer.reduce(
      (sum, buf) => sum + buf.length,
      0
    )
    const durationSec = totalSamples / this.config.sampleRate

    if (durationSec >= this.config.chunkDurationSec) {
      this.processAccumulatedChunk()
    }
  }

  /**
   * Process a 30-second audio chunk through Whisper.
   */
  private async processAccumulatedChunk(): Promise<void> {
    if (!this.currentMeetingId) return

    // Merge buffer into single Float32Array
    const totalLength = this.audioBuffer.reduce(
      (sum, buf) => sum + buf.length,
      0
    )
    const mergedAudio = new Float32Array(totalLength)
    let offset = 0
    for (const buf of this.audioBuffer) {
      mergedAudio.set(buf, offset)
      offset += buf.length
    }

    // Calculate chunk timing relative to meeting start
    const chunkStart =
      (this.chunkStartTime - this.meetingStartTime) / 1000
    const chunkEnd =
      chunkStart + totalLength / this.config.sampleRate

    // Reset buffer for next chunk
    this.audioBuffer = []
    this.chunkStartTime = Date.now()

    try {
      // Send to Whisper via ASRService
      const result = await getASRService().transcribe(mergedAudio)

      if (!result || !result.segments || result.segments.length === 0) {
        console.log('[AudioPipeline] No speech detected in chunk')
        return
      }

      // Save each segment to database + emit IPC event
      const transcriptService = getTranscriptService()
      for (const segment of result.segments) {
        this.segmentCounter++
        transcriptService.saveTranscript({
          meetingId: this.currentMeetingId,
          segment: {
            text: segment.text.trim(),
            start: chunkStart + segment.start,
            end: chunkStart + segment.end,
            confidence: segment.confidence,
            words: segment.words,
          },
        })
        // TranscriptService.saveTranscript() auto-emits 'transcript' event
        // transcript.handlers.ts auto-forwards to renderer via IPC
        // useTranscriptStream picks it up automatically
      }

      console.log(
        `[AudioPipeline] Processed chunk ${chunkStart.toFixed(1)}s-${chunkEnd.toFixed(1)}s: ${result.segments.length} segments (total: ${this.segmentCounter})`
      )
    } catch (error) {
      console.error('[AudioPipeline] Transcription failed:', error)
      this.emit('error', {
        meetingId: this.currentMeetingId,
        error: (error as Error).message,
      })
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
    if (this.audioBuffer.length > 0) {
      await this.processAccumulatedChunk()
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
    console.log(
      `[AudioPipeline] Stopped capture for meeting ${this.currentMeetingId} — ${duration.toFixed(1)}s, ${segments} segments`
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
      bufferDuration:
        this.audioBuffer.reduce((sum, buf) => sum + buf.length, 0) /
        this.config.sampleRate,
      totalSegments: this.segmentCounter,
      elapsedTime: this.isCapturing
        ? (Date.now() - this.meetingStartTime) / 1000
        : 0,
    }
  }
}

// Singleton
let instance: AudioPipelineService | null = null
export function getAudioPipelineService(): AudioPipelineService {
  if (!instance) instance = new AudioPipelineService()
  return instance
}
