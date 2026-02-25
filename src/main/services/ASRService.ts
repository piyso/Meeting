/**
 * ASR Service
 *
 * Manages the ASR worker thread and provides transcription capabilities.
 * Handles model loading, transcription requests, and memory management.
 */

import { Worker } from 'worker_threads'
import * as path from 'path'
import { EventEmitter } from 'events'

interface ASRWorkerMessage {
  type: 'init' | 'transcribe' | 'unload' | 'ping'
  data?: any
}

interface ASRWorkerResponse {
  type: 'ready' | 'transcript' | 'error' | 'unloaded' | 'pong'
  data?: any
  error?: string
}

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

interface TranscriptResult {
  segments: TranscriptSegment[]
  model: string
  tier: string
}

export class ASRService extends EventEmitter {
  private worker: Worker | null = null
  private isReady: boolean = false
  private isInitializing: boolean = false
  private pendingRequests: Map<number, { resolve: Function; reject: Function }> = new Map()
  private requestId: number = 0
  private lastUsedTime: number = 0
  private unloadTimeout: NodeJS.Timeout | null = null
  private readonly IDLE_TIMEOUT = 60000 // 60 seconds

  constructor() {
    super()
  }

  /**
   * Initialize the ASR worker
   */
  async initialize(): Promise<void> {
    if (this.isReady) {
      console.log('[ASR Service] Already initialized')
      return
    }

    if (this.isInitializing) {
      console.log('[ASR Service] Already initializing, waiting...')
      return new Promise((resolve, reject) => {
        this.once('ready', resolve)
        this.once('error', reject)
      })
    }

    this.isInitializing = true

    try {
      console.log('[ASR Service] Starting ASR worker...')

      // Create worker
      const workerPath = path.join(__dirname, '../workers/asr.worker.js')
      this.worker = new Worker(workerPath)

      // Set up message handler
      this.worker.on('message', (response: ASRWorkerResponse) => {
        this.handleWorkerMessage(response)
      })

      // Set up error handler
      this.worker.on('error', (error: Error) => {
        console.error('[ASR Service] Worker error:', error)
        this.emit('error', error)
      })

      // Set up exit handler
      this.worker.on('exit', (code: number) => {
        console.log(`[ASR Service] Worker exited with code ${code}`)
        this.isReady = false
        this.worker = null
      })

      // Send init message
      this.sendMessage({ type: 'init' })

      // Wait for ready
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('ASR worker initialization timeout'))
        }, 30000) // 30 second timeout

        this.once('ready', () => {
          clearTimeout(timeout)
          resolve()
        })

        this.once('error', (error: Error) => {
          clearTimeout(timeout)
          reject(error)
        })
      })

      this.isReady = true
      this.isInitializing = false
      console.log('[ASR Service] ✅ ASR service ready')
    } catch (error: any) {
      this.isInitializing = false
      console.error('[ASR Service] Initialization failed:', error)
      throw error
    }
  }

  /**
   * Transcribe audio buffer
   */
  async transcribe(audioBuffer: Float32Array): Promise<TranscriptResult> {
    if (!this.isReady) {
      await this.initialize()
    }

    this.lastUsedTime = Date.now()
    this.resetUnloadTimeout()

    const id = this.requestId++

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject })

      this.sendMessage({
        type: 'transcribe',
        data: {
          id,
          audioBuffer: audioBuffer.buffer,
        },
      })

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          reject(new Error('Transcription timeout'))
        }
      }, 30000)
    })
  }

  /**
   * Unload model to free memory
   */
  async unload(): Promise<void> {
    if (!this.worker || !this.isReady) {
      return
    }

    console.log('[ASR Service] Unloading model...')

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Unload timeout'))
      }, 5000)

      this.once('unloaded', () => {
        clearTimeout(timeout)
        this.isReady = false
        resolve()
      })

      this.sendMessage({ type: 'unload' })
    })
  }

  /**
   * Terminate the worker
   */
  async terminate(): Promise<void> {
    if (this.unloadTimeout) {
      clearTimeout(this.unloadTimeout)
      this.unloadTimeout = null
    }

    if (this.worker) {
      await this.worker.terminate()
      this.worker = null
      this.isReady = false
    }
  }

  /**
   * Check if service is ready
   */
  isServiceReady(): boolean {
    return this.isReady
  }

  /**
   * Send message to worker
   */
  private sendMessage(message: ASRWorkerMessage): void {
    if (!this.worker) {
      throw new Error('Worker not initialized')
    }

    this.worker.postMessage(message)
  }

  /**
   * Handle message from worker
   */
  private handleWorkerMessage(response: ASRWorkerResponse): void {
    switch (response.type) {
      case 'ready':
        console.log('[ASR Service] Worker ready:', response.data)
        this.emit('ready', response.data)
        break

      case 'transcript':
        const id = response.data?.id
        if (id !== undefined && this.pendingRequests.has(id)) {
          const { resolve } = this.pendingRequests.get(id)!
          this.pendingRequests.delete(id)
          resolve(response.data)
        }
        break

      case 'error':
        console.error('[ASR Service] Worker error:', response.error)
        this.emit('error', new Error(response.error))
        break

      case 'unloaded':
        console.log('[ASR Service] Model unloaded')
        this.emit('unloaded')
        break

      case 'pong':
        // Health check response
        break

      default:
        console.warn('[ASR Service] Unknown response type:', response.type)
    }
  }

  /**
   * Reset the unload timeout
   */
  private resetUnloadTimeout(): void {
    if (this.unloadTimeout) {
      clearTimeout(this.unloadTimeout)
    }

    this.unloadTimeout = setTimeout(async () => {
      const idleTime = Date.now() - this.lastUsedTime
      if (idleTime >= this.IDLE_TIMEOUT) {
        console.log('[ASR Service] Idle timeout reached, unloading model...')
        try {
          await this.unload()
        } catch (error) {
          console.error('[ASR Service] Failed to unload model:', error)
        }
      }
    }, this.IDLE_TIMEOUT)
  }
}

// Singleton instance
let asrServiceInstance: ASRService | null = null

export function getASRService(): ASRService {
  if (!asrServiceInstance) {
    asrServiceInstance = new ASRService()
  }
  return asrServiceInstance
}
