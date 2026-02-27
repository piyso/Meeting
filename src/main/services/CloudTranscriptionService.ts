/**
 * Cloud Transcription Service
 *
 * Provides cloud-based transcription using Deepgram API.
 * Used as fallback for low-tier hardware or when local transcription fails.
 *
 * Security: API key is stored in OS keychain via KeyStorageService (not plaintext SQLite).
 */

import { EventEmitter } from 'events'
import { getDatabaseService } from './DatabaseService'
import { KeyStorageService as _KeyStorageService } from './KeyStorageService'
import { config } from '../config/environment'
import { Logger } from './Logger'
const log = Logger.create('CloudTranscription')

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

/** Keychain account used for Deepgram API key */
const DEEPGRAM_KEYCHAIN_ACCOUNT = 'deepgram-api-key'

export class CloudTranscriptionService extends EventEmitter {
  private apiKey: string | null = null
  private enabled: boolean = false
  private ws: WebSocket | null = null
  private configLoaded: boolean = false
  private usageStats: UsageStats = {
    totalSeconds: 0,
    monthlyLimit: 36000, // 10 hours for free tier
    tier: 'free',
  }

  constructor() {
    super()
    // Config is loaded lazily on first use (avoids async-in-constructor antipattern)
  }

  /**
   * Ensure configuration is loaded (lazy initialization)
   */
  private async ensureConfigLoaded(): Promise<void> {
    if (this.configLoaded) return
    await this.loadConfig()
    this.configLoaded = true
  }

  /**
   * Load configuration from database + keychain
   */
  private async loadConfig(): Promise<void> {
    const db = getDatabaseService()
    this.enabled = db.getSetting('cloud_transcription_enabled') === 'true'

    // Load API key from OS keychain (secure storage)
    try {
      const keytar = await import('keytar')
      this.apiKey = await keytar.default.getPassword('bluearkive', DEEPGRAM_KEYCHAIN_ACCOUNT)
    } catch (err) {
      log.warn('[Cloud Transcription] Failed to read API key from keychain', err)
      this.apiKey = null
    }

    const tier = db.getSetting('subscription_tier') || 'free'
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
    const usage = db.getSetting('cloud_transcription_usage')
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
    db.setSetting('cloud_transcription_enabled', 'true')

    // Store API key in OS keychain (secure), not in SQLite
    try {
      const keytar = await import('keytar')
      await keytar.default.setPassword('bluearkive', DEEPGRAM_KEYCHAIN_ACCOUNT, apiKey)
    } catch (err) {
      log.error('[Cloud Transcription] Failed to store API key in keychain', err)
    }

    this.configLoaded = true
    log.info('[Cloud Transcription] Enabled')
  }

  /**
   * Disable cloud transcription
   */
  async disable(): Promise<void> {
    this.enabled = false

    const db = getDatabaseService()
    await db.setSetting('cloud_transcription_enabled', 'false')

    log.info('[Cloud Transcription] Disabled')
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
    await this.ensureConfigLoaded()

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
        body: wavBuffer as unknown as BodyInit,
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

      log.info(
        `[Cloud Transcription] Transcribed ${audioDuration.toFixed(1)}s (${this.usageStats.totalSeconds}/${this.usageStats.monthlyLimit}s used)`
      )

      return segments
    } catch (error: unknown) {
      log.error('[Cloud Transcription] Error:', error)
      throw error instanceof Error ? error : new Error(String(error))
    }
  }

  /**
   * Start streaming transcription
   */
  async startStreaming(_config: CloudTranscriptionConfig): Promise<void> {
    await this.ensureConfigLoaded()

    if (!this.enabled || !this.apiKey) {
      throw new Error('Cloud transcription not enabled')
    }

    const wsUrl = `wss://api.deepgram.com/v1/listen?punctuate=true&diarize=false&model=nova-2`

    // Node.js WebSocket (ws) accepts options with headers, but browser WebSocket doesn't.
    // In Electron main process, this uses the ws library which supports headers.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.ws = new (WebSocket as any)(wsUrl, {
      headers: {
        Authorization: `Token ${this.apiKey}`,
      },
    })

    const ws = this.ws
    if (!ws) return

    ws.addEventListener('open', () => {
      log.info('[Cloud Transcription] Streaming connection opened')
      this.emit('connected')
    })

    ws.addEventListener('message', (event: MessageEvent) => {
      try {
        const result = JSON.parse(event.data.toString())
        if (result.channel?.alternatives?.[0]?.transcript) {
          const transcript = result.channel.alternatives[0].transcript
          this.emit('transcript', transcript)
        }
      } catch (error) {
        log.error('[Cloud Transcription] Parse error:', error)
      }
    })

    ws.addEventListener('error', (event: Event) => {
      log.error('[Cloud Transcription] WebSocket error:', event)
      this.emit('error', event)
    })

    ws.addEventListener('close', () => {
      log.info('[Cloud Transcription] Streaming connection closed')
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
  private parseDeepgramResponse(result: Record<string, unknown>): TranscriptSegment[] {
    const segments: TranscriptSegment[] = []

    const results = result.results as Record<string, unknown> | undefined
    const channels = results?.channels as Array<Record<string, unknown>> | undefined
    const alternative = channels?.[0]?.alternatives as Array<Record<string, unknown>> | undefined
    const alt = alternative?.[0]

    if (alt) {
      const words = (alt.words || []) as Array<Record<string, unknown>>

      if (words.length > 0) {
        segments.push({
          text: alt.transcript as string,
          start: words[0]!.start as number,
          end: words[words.length - 1]!.end as number,
          confidence: alt.confidence as number,
          words: words.map((w: Record<string, unknown>) => ({
            word: w.word as string,
            start: w.start as number,
            end: w.end as number,
            confidence: w.confidence as number,
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

    log.info('[Cloud Transcription] Monthly usage reset')
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
