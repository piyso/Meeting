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
  private language: string = 'en' // Default language
  private crashCount: number = 0
  private readonly MAX_CRASH_RESTARTS = 3
  private restartTimer: ReturnType<typeof setTimeout> | null = null
  // True while terminate() is ending the worker on purpose
  private terminating = false

  constructor() {
    super()
    // C-8 FIX: Concurrent initialize() calls each add .once('ready'/'error') listeners.
    // Node's default max is 10 — this suppresses false "memory leak" warnings.
    // All listeners are .once() so they auto-clean after firing.
    this.setMaxListeners(20)
  }

  /**
   * Initialize the ASR worker
   */
  async initialize(): Promise<void> {
    if (this.isReady) {
      log.debug('Already initialized')
      return
    }

    // Everyone who asks while a load is in flight shares its outcome. Waiting
    // on the 'ready'/'error' events instead left the second caller hanging
    // forever when the first one timed out: a timeout emits neither. (A
    // recording started while startup recovery was loading the model would
    // then never start, and never fail.)
    if (!this.initPromise) {
      this.initPromise = this.loadModel().finally(() => {
        this.initPromise = null
      })
    } else {
      log.debug('Already initializing, waiting...')
    }
    return this.initPromise
  }

  private initPromise: Promise<void> | null = null

  private async loadModel(): Promise<void> {
    try {
      // After an idle unload the worker thread is still alive with its model
      // released — reuse it. Creating a new Worker here leaked one thread
      // (and a loaded ONNX runtime) per recording session.
      if (!this.worker) this.spawnWorker()

      // Send init message with resolved models directory and language
      const modelsDir = app.isPackaged
        ? path.join(app.getPath('userData'), 'models')
        : path.join(process.cwd(), 'resources', 'models')
      this.sendMessage({ type: 'init', data: { modelsDir, language: this.language } })

      // Wait for ready
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          clearTimeout(timeout)
          this.off('ready', onReady)
          this.off('error', onError)
        }
        const onReady = () => {
          cleanup()
          resolve()
        }
        const onError = (error: Error) => {
          cleanup()
          reject(error)
        }
        const timeout = setTimeout(() => {
          cleanup()
          reject(new Error('ASR worker initialization timeout'))
        }, 30000) // 30 second timeout

        // Both listeners are removed together. Leaving the unused one attached
        // (the old .once pair) meant the first later 'error' was swallowed and
        // the next had no listener at all, which throws.
        this.on('ready', onReady)
        this.on('error', onError)
      })

      this.isReady = true
      this.crashCount = 0 // Reset crash counter on successful init
      log.info('✅ ASR service ready')
    } catch (error: unknown) {
      log.error('[ASR Service] Initialization failed:', error)
      throw error instanceof Error ? error : new Error(String(error))
    }
  }

  /**
   * EventEmitter throws when 'error' is emitted without a listener, and these
   * emits happen inside worker callbacks — i.e. as uncaught exceptions in the
   * main process. Only emit when someone (an in-flight initialize) is waiting.
   */
  private emitError(error: Error): void {
    if (this.listenerCount('error') > 0) this.emit('error', error)
  }

  /** Reject every in-flight transcription (the worker can no longer answer them). */
  private rejectPending(reason: string): void {
    for (const pending of this.pendingRequests.values()) {
      pending.reject(new Error(reason))
    }
    this.pendingRequests.clear()
  }

  /** Create the worker thread and wire its lifecycle handlers. */
  private spawnWorker(): void {
    log.info('Starting ASR worker...')

    // Worker path: in production, workers are in dist-electron/workers/
    const workerPath = path.join(__dirname, 'workers', 'asr.worker.js')
    const worker = new Worker(workerPath)
    this.worker = worker

    // Set up message handler
    worker.on('message', (response: ASRWorkerResponse) => {
      this.handleWorkerMessage(response)
    })

    // Set up error handler
    worker.on('error', (error: Error) => {
      log.error('[ASR Service] Worker error:', error)
      this.rejectPending(`ASR worker error: ${error.message}`)
      this.emitError(error)
    })

    // Set up exit handler with auto-restart
    worker.on('exit', (code: number) => {
      // terminate() ends the worker with a non-zero code. That is a shutdown,
      // not a crash — it used to be logged as "crashed 3 times, giving up" on
      // every quit.
      if (this.terminating) {
        log.debug(`Worker stopped (code ${code})`)
        return
      }
      log.warn(`Worker exited with code ${code}`)
      // A stale worker's exit must not clobber the state of its replacement.
      if (this.worker !== worker) return
      this.isReady = false
      this.worker = null
      this.rejectPending(`ASR worker exited (code ${code})`)

      // Auto-restart on crash (non-zero exit), up to MAX_CRASH_RESTARTS times
      if (code !== 0 && this.crashCount < this.MAX_CRASH_RESTARTS) {
        this.crashCount++
        const delay = Math.min(1000 * Math.pow(2, this.crashCount - 1), 8000) // 1s, 2s, 4s
        log.warn(
          `ASR worker crashed (attempt ${this.crashCount}/${this.MAX_CRASH_RESTARTS}), restarting in ${delay}ms...`
        )
        this.restartTimer = setTimeout(() => {
          this.restartTimer = null
          this.initialize().catch(err => {
            log.error('ASR worker auto-restart failed:', err)
          })
        }, delay)
      } else if (code !== 0) {
        log.error(
          `ASR worker crashed ${this.MAX_CRASH_RESTARTS} times, giving up. User must restart app.`
        )
        this.emitError(new Error('ASR worker crashed too many times'))
      }
    })
  }

  /**
   * Set transcription language
   * Called when user changes language in Settings
   */
  setLanguage(language: string): void {
    this.language = language || 'en'
    log.info(`Language set to: ${this.language}`)
    // If worker is ready, notify it of the language change
    if (this.isReady && this.worker) {
      this.sendMessage({ type: 'init', data: { language: this.language } })
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
      // P2-7 FIX: Track timeout so it can be cleared when the worker responds.
      // Without this, 100+ orphaned timers accumulate during high-throughput recording.
      //
      // The allowance grows with the audio: a fixed 30s for a 30s chunk left
      // no margin on a slow machine, and because the worker cannot be
      // interrupted, one timeout pushed every later chunk past its own.
      const audioSeconds = audioBuffer.length / 16000
      const timeoutMs = Math.max(30_000, Math.ceil(audioSeconds * 4) * 1000)
      const timeoutId = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          reject(new Error('Transcription timeout'))
        }
      }, timeoutMs)

      this.pendingRequests.set(id, {
        resolve: value => {
          clearTimeout(timeoutId)
          resolve(value)
        },
        reject: reason => {
          clearTimeout(timeoutId)
          reject(reason)
        },
      })

      try {
        this.sendMessage({
          type: 'transcribe',
          data: {
            id,
            audioBuffer: audioBuffer.buffer,
            byteOffset: audioBuffer.byteOffset,
            byteLength: audioBuffer.byteLength,
          },
        })
      } catch (sendErr) {
        this.pendingRequests.delete(id)
        clearTimeout(timeoutId)
        reject(sendErr)
      }
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
      const onUnloaded = () => {
        clearTimeout(timeout)
        this.isReady = false
        resolve()
      }
      const timeout = setTimeout(() => {
        this.off('unloaded', onUnloaded)
        reject(new Error('Unload timeout'))
      }, 5000)

      this.once('unloaded', onUnloaded)

      this.sendMessage({ type: 'unload' })
    })
  }

  /**
   * Terminate the worker
   */
  async terminate(): Promise<void> {
    // Cancel any pending auto-restart (prevents zombie worker after intentional shutdown)
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }
    this.crashCount = this.MAX_CRASH_RESTARTS // Prevent future restarts

    if (this.unloadTimeout) {
      clearTimeout(this.unloadTimeout)
      this.unloadTimeout = null
    }

    if (this.worker) {
      this.terminating = true
      try {
        await this.worker.terminate()
      } finally {
        this.terminating = false
      }
      this.worker = null
      this.isReady = false
      this.rejectPending('ASR worker stopped')
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

      case 'error': {
        log.error('[ASR Service] Worker error:', response.error)
        const message = response.error || 'ASR worker error'
        const failedId = typeof response.data?.id === 'number' ? response.data.id : undefined
        const failed = failedId !== undefined ? this.pendingRequests.get(failedId) : undefined
        if (failedId !== undefined && failed) {
          // The worker named the request that failed — the others are unaffected.
          this.pendingRequests.delete(failedId)
          failed.reject(new Error(message))
        } else {
          // Not tied to a request (e.g. model load failure): nothing pending
          // will get an answer.
          this.rejectPending(message)
          this.emitError(new Error(message))
        }
        break
      }

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
