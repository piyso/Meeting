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
      console.error('[AudioPipeline] Enumeration failed:', error)
      return []
    }
  }

  /**
   * Handle audio device switch during recording
   */
  handleDeviceSwitch(device: AudioDeviceInfo): void {
    if (!this.isCapturing) {
      console.warn('[AudioPipeline] Cannot switch device: no active capture session')
      return
    }

    this.deviceSwitchHistory.push({
      from: this.currentDevice,
      to: device.label,
      timestamp: Date.now(),
    })
    this.currentDevice = device.label

    this.emit('deviceSwitch', { device, history: this.deviceSwitchHistory })
    console.log(`[AudioPipeline] Device switched to: ${device.label}`)
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
  async testAudioDevice(
    deviceId: string
  ): Promise<{ success: boolean; deviceInfo: AudioDeviceInfo | null; latency?: number; error?: string }> {
    const devices = await this.enumerateAudioSources()
    const device = devices.find((d) => d.id === deviceId)

    if (!device) {
      return { success: false, deviceInfo: null, error: `Device not found: ${deviceId}` }
    }

    // Estimate latency based on connection type
    let latency = 10
    if (device.connectionType === 'bluetooth') latency = 150
    else if (device.connectionType === 'usb') latency = 20
    else if (device.connectionType === 'hdmi' || device.connectionType === 'displayport') latency = 30

    return { success: true, deviceInfo: device, latency }
  }

  /**
   * Check Screen Recording permission status (macOS only)
   */
  getScreenRecordingPermissionStatus(): string {
    if (process.platform !== 'darwin') return 'not-applicable'

    try {
      const { systemPreferences } = require('electron')
      return systemPreferences.getMediaAccessStatus('screen')
    } catch {
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
      link: 'https://support.piyapi.com/stereo-mix',
    }
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
