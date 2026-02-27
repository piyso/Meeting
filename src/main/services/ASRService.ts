/**
 * ASR Service
 *
 * Manages the ASR worker thread and provides transcription capabilities.
 * Handles model loading, transcription requests, and memory management.
 */

import { Worker } from 'worker_threads'
import * as path from 'path'
import { app } from 'electron'
import { EventEmitter } from 'events'
import { Logger } from './Logger'

const log = Logger.create('ASRService')

interface ASRWorkerMessage {
  type: 'init' | 'transcribe' | 'unload' | 'ping'
  data?: Record<string, unknown>
}

interface ASRWorkerResponse {
  type: 'ready' | 'transcript' | 'error' | 'unloaded' | 'pong'
  data?: Record<string, unknown>
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
  private pendingRequests: Map<
    number,
    {
      resolve: (value: TranscriptResult | PromiseLike<TranscriptResult>) => void
      reject: (reason?: unknown) => void
    }
  > = new Map()
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
      log.debug('Already initialized')
      return
    }

    if (this.isInitializing) {
      log.debug('Already initializing, waiting...')
      return new Promise((resolve, reject) => {
        this.once('ready', resolve)
        this.once('error', reject)
      })
    }

    this.isInitializing = true

    try {
      log.info('Starting ASR worker...')

      // Worker path: in production, workers are in dist-electron/workers/
      const workerPath = path.join(__dirname, 'workers', 'asr.worker.js')
      this.worker = new Worker(workerPath)

      // Set up message handler
      this.worker.on('message', (response: ASRWorkerResponse) => {
        this.handleWorkerMessage(response)
      })

      // Set up error handler
      this.worker.on('error', (error: Error) => {
        log.error('[ASR Service] Worker error:', error)
        this.emit('error', error)
      })

      // Set up exit handler
      this.worker.on('exit', (code: number) => {
        log.warn(`Worker exited with code ${code}`)
        this.isReady = false
        this.worker = null
      })

      // Send init message with resolved models directory
      const modelsDir = app.isPackaged
        ? path.join(app.getPath('userData'), 'models')
        : path.join(process.cwd(), 'resources', 'models')
      this.sendMessage({ type: 'init', data: { modelsDir } })

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
      log.info('✅ ASR service ready')
    } catch (error: unknown) {
      this.isInitializing = false
      log.error('[ASR Service] Initialization failed:', error)
      throw error instanceof Error ? error : new Error(String(error))
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

    log.info('Unloading model...')

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
        log.info('Worker ready:', response.data)
        this.emit('ready', response.data)
        break

      case 'transcript': {
        const id = typeof response.data?.id === 'number' ? response.data.id : undefined
        if (id !== undefined && this.pendingRequests.has(id)) {
          const pending = this.pendingRequests.get(id)
          this.pendingRequests.delete(id)
          pending?.resolve(response.data as unknown as TranscriptResult)
        }
        break
      }

      case 'error':
        log.error('[ASR Service] Worker error:', response.error)
        this.emit('error', new Error(response.error))
        break

      case 'unloaded':
        log.info('Model unloaded')
        this.emit('unloaded')
        break

      case 'pong':
        // Health check response
        break

      default:
        log.warn('[ASR Service] Unknown response type:', response.type)
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
        log.info('Idle timeout reached, unloading model...')
        try {
          await this.unload()
        } catch (error) {
          log.error('[ASR Service] Failed to unload model:', error)
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
