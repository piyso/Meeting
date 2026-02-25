/**
 * Cloud Transcription Service
 *
 * Provides cloud-based transcription using Deepgram API.
 * Used as fallback for low-tier hardware or when local transcription fails.
 */

import { EventEmitter } from 'events'
import { getDatabaseService } from './DatabaseService'
import { config } from '../config/environment'

interface TranscriptSegment {
  text: string
  start: number
  end: number
  confidence: number
  words?: Array<{
    word: string
    start: number
    end: number
    confidence: number
  }>
}

interface CloudTranscriptionConfig {
  apiKey: string
  model?: string
  language?: string
  punctuate?: boolean
  diarize?: boolean
}

interface UsageStats {
  totalSeconds: number
  monthlyLimit: number
  tier: 'free' | 'starter' | 'pro'
}

export class CloudTranscriptionService extends EventEmitter {
  private apiKey: string | null = null
  private enabled: boolean = false
  private ws: WebSocket | null = null
  private usageStats: UsageStats = {
    totalSeconds: 0,
    monthlyLimit: 36000, // 10 hours for free tier
    tier: 'free',
  }

  constructor() {
    super()
    this.loadConfig()
  }

  /**
   * Load configuration from database
   */
  private async loadConfig(): Promise<void> {
    const db = getDatabaseService()
    this.enabled = (await db.getSetting('cloud_transcription_enabled')) === 'true'
    this.apiKey = await db.getSetting('deepgram_api_key')

    const tier = (await db.getSetting('subscription_tier')) || 'free'
    this.usageStats.tier = tier as 'free' | 'starter' | 'pro'

    // Set monthly limits based on tier
    switch (tier) {
      case 'free':
        this.usageStats.monthlyLimit = 36000 // 10 hours
        break
      case 'starter':
        this.usageStats.monthlyLimit = 72000 // 20 hours
        break
      case 'pro':
        this.usageStats.monthlyLimit = Infinity // Unlimited
        break
    }

    // Load usage stats
    const usage = await db.getSetting('cloud_transcription_usage')
    if (usage) {
      this.usageStats.totalSeconds = parseInt(usage, 10)
    }
  }

  /**
   * Enable cloud transcription
   */
  async enable(apiKey: string): Promise<void> {
    this.apiKey = apiKey
    this.enabled = true

    const db = getDatabaseService()
    await db.setSetting('cloud_transcription_enabled', 'true')
    await db.setSetting('deepgram_api_key', apiKey)

    console.log('[Cloud Transcription] Enabled')
  }

  /**
   * Disable cloud transcription
   */
  async disable(): Promise<void> {
    this.enabled = false

    const db = getDatabaseService()
    await db.setSetting('cloud_transcription_enabled', 'false')

    console.log('[Cloud Transcription] Disabled')
  }

  /**
   * Check if cloud transcription is enabled
   */
  isEnabled(): boolean {
    return this.enabled && this.apiKey !== null
  }

  /**
   * Get usage statistics
   */
  getUsageStats(): UsageStats {
    return { ...this.usageStats }
  }

  /**
   * Check if usage limit is reached
   */
  isLimitReached(): boolean {
    return this.usageStats.totalSeconds >= this.usageStats.monthlyLimit
  }

  /**
   * Transcribe audio using Deepgram API
   */
  async transcribe(audioBuffer: Float32Array): Promise<TranscriptSegment[]> {
    if (!this.enabled || !this.apiKey) {
      throw new Error('Cloud transcription not enabled')
    }

    if (this.isLimitReached()) {
      throw new Error('Monthly cloud transcription limit reached')
    }

    try {
      // Convert Float32Array to WAV format
      const wavBuffer = this.float32ToWav(audioBuffer, 16000)

      // Call Deepgram API
      const response = await fetch(`${config.DEEPGRAM_API_URL}/listen`, {
        method: 'POST',
        headers: {
          Authorization: `Token ${this.apiKey}`,
          'Content-Type': 'audio/wav',
        },
        body: wavBuffer as any,
      })

      if (!response.ok) {
        throw new Error(`Deepgram API error: ${response.statusText}`)
      }

      const result = await response.json()

      // Parse Deepgram response
      const segments = this.parseDeepgramResponse(result)

      // Update usage stats
      const audioDuration = audioBuffer.length / 16000
      this.usageStats.totalSeconds += audioDuration

      const db = getDatabaseService()
      await db.setSetting('cloud_transcription_usage', this.usageStats.totalSeconds.toString())

      console.log(
        `[Cloud Transcription] Transcribed ${audioDuration.toFixed(1)}s (${this.usageStats.totalSeconds}/${this.usageStats.monthlyLimit}s used)`
      )

      return segments
    } catch (error: any) {
      console.error('[Cloud Transcription] Error:', error)
      throw error
    }
  }

  /**
   * Start streaming transcription
   */
  async startStreaming(_config: CloudTranscriptionConfig): Promise<void> {
    if (!this.enabled || !this.apiKey) {
      throw new Error('Cloud transcription not enabled')
    }

    const wsUrl = `wss://api.deepgram.com/v1/listen?punctuate=true&diarize=false&model=nova-2`

    this.ws = new WebSocket(wsUrl, {
      headers: {
        Authorization: `Token ${this.apiKey}`,
      },
    } as any)

    this.ws.addEventListener('open', () => {
      console.log('[Cloud Transcription] Streaming connection opened')
      this.emit('connected')
    })

    this.ws.addEventListener('message', (event: any) => {
      try {
        const result = JSON.parse(event.data.toString())
        if (result.channel?.alternatives?.[0]?.transcript) {
          const transcript = result.channel.alternatives[0].transcript
          this.emit('transcript', transcript)
        }
      } catch (error) {
        console.error('[Cloud Transcription] Parse error:', error)
      }
    })

    this.ws.addEventListener('error', (event: any) => {
      console.error('[Cloud Transcription] WebSocket error:', event.error)
      this.emit('error', event.error)
    })

    this.ws.addEventListener('close', () => {
      console.log('[Cloud Transcription] Streaming connection closed')
      this.emit('disconnected')
    })
  }

  /**
   * Send audio chunk to streaming connection
   */
  sendAudioChunk(audioBuffer: Float32Array): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Streaming connection not open')
    }

    // Convert to 16-bit PCM
    const pcm = this.float32ToPCM16(audioBuffer)
    this.ws.send(pcm)
  }

  /**
   * Stop streaming transcription
   */
  stopStreaming(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  /**
   * Parse Deepgram API response
   */
  private parseDeepgramResponse(result: any): TranscriptSegment[] {
    const segments: TranscriptSegment[] = []

    if (result.results?.channels?.[0]?.alternatives?.[0]) {
      const alternative = result.results.channels[0].alternatives[0]
      const words = alternative.words || []

      if (words.length > 0) {
        segments.push({
          text: alternative.transcript,
          start: words[0].start,
          end: words[words.length - 1].end,
          confidence: alternative.confidence,
          words: words.map((w: any) => ({
            word: w.word,
            start: w.start,
            end: w.end,
            confidence: w.confidence,
          })),
        })
      }
    }

    return segments
  }

  /**
   * Convert Float32Array to WAV format
   */
  private float32ToWav(samples: Float32Array, sampleRate: number): Buffer {
    const buffer = Buffer.alloc(44 + samples.length * 2)

    // WAV header
    buffer.write('RIFF', 0)
    buffer.writeUInt32LE(36 + samples.length * 2, 4)
    buffer.write('WAVE', 8)
    buffer.write('fmt ', 12)
    buffer.writeUInt32LE(16, 16) // PCM
    buffer.writeUInt16LE(1, 20) // PCM format
    buffer.writeUInt16LE(1, 22) // Mono
    buffer.writeUInt32LE(sampleRate, 24)
    buffer.writeUInt32LE(sampleRate * 2, 28) // Byte rate
    buffer.writeUInt16LE(2, 32) // Block align
    buffer.writeUInt16LE(16, 34) // Bits per sample
    buffer.write('data', 36)
    buffer.writeUInt32LE(samples.length * 2, 40)

    // Convert samples to 16-bit PCM
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]!))
      buffer.writeInt16LE(s < 0 ? s * 0x8000 : s * 0x7fff, 44 + i * 2)
    }

    return buffer
  }

  /**
   * Convert Float32Array to 16-bit PCM
   */
  private float32ToPCM16(samples: Float32Array): Buffer {
    const buffer = Buffer.alloc(samples.length * 2)

    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]!))
      buffer.writeInt16LE(s < 0 ? s * 0x8000 : s * 0x7fff, i * 2)
    }

    return buffer
  }

  /**
   * Reset monthly usage (called on billing cycle)
   */
  async resetMonthlyUsage(): Promise<void> {
    this.usageStats.totalSeconds = 0

    const db = getDatabaseService()
    await db.setSetting('cloud_transcription_usage', '0')

    console.log('[Cloud Transcription] Monthly usage reset')
  }
}

// Singleton instance
let cloudTranscriptionServiceInstance: CloudTranscriptionService | null = null

export function getCloudTranscriptionService(): CloudTranscriptionService {
  if (!cloudTranscriptionServiceInstance) {
    cloudTranscriptionServiceInstance = new CloudTranscriptionService()
  }
  return cloudTranscriptionServiceInstance
}
