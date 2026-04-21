/**
 * BackgroundEmbeddingQueue — Low-priority background queue for generating embeddings
 *
 * Instead of blocking the audio pipeline or UI thread with synchronous
 * embedding generation, this service maintains a queue of pending texts
 * and processes them in batches during idle periods.
 *
 * Architecture:
 * - AudioPipelineService → enqueue transcript text after transcription
 * - Queue drains in background with configurable batch size and interval
 * - Results are stored via LocalEmbeddingService for semantic search
 */

import { Logger } from './Logger'

const log = Logger.create('EmbeddingQueue')

// #10 fix: Cache dynamic imports to avoid re-resolving on every batch
let _embeddingServiceMod: typeof import('./LocalEmbeddingService') | null = null
let _dbConnectionMod: typeof import('../database/connection') | null = null

interface QueueItem {
  id: string
  meetingId: string
  text: string
  createdAt: number
}

export class BackgroundEmbeddingQueue {
  private queue: QueueItem[] = []
  private isProcessing = false
  private timer: ReturnType<typeof setInterval> | null = null

  // Configuration
  private readonly BATCH_SIZE = 5
  private readonly INTERVAL_MS = 10_000 // Process every 10 seconds
  private readonly MAX_QUEUE_SIZE = 500 // Prevent unbounded growth

  /**
   * Start the background processing loop.
   */
  start(): void {
    if (this.timer) return

    this.timer = setInterval(() => {
      this.processQueue().catch(err => log.debug('Queue processing error:', err))
    }, this.INTERVAL_MS)
    // OPT-16: Don't let this timer prevent clean app shutdown
    if (this.timer.unref) this.timer.unref()

    log.info('Background embedding queue started')
  }

  /**
   * Stop the background processing loop.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    log.info(`Background embedding queue stopped (${this.queue.length} items remaining)`)
  }

  /**
   * Enqueue text for background embedding generation.
   */
  enqueue(item: Omit<QueueItem, 'createdAt'>): void {
    // Don't enqueue if text is too short
    if (item.text.trim().length < 20) return

    // Prevent unbounded growth
    if (this.queue.length >= this.MAX_QUEUE_SIZE) {
      // Drop oldest items
      this.queue = this.queue.slice(-Math.floor(this.MAX_QUEUE_SIZE * 0.8))
      log.warn(`Queue overflow, trimmed to ${this.queue.length} items`)
    }

    // Deduplicate by id
    if (this.queue.some(q => q.id === item.id)) return

    this.queue.push({ ...item, createdAt: Date.now() })
  }

  /**
   * Process a batch of queued items.
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) return

    this.isProcessing = true
    const batch = this.queue.splice(0, this.BATCH_SIZE)

    try {
      // #10: Use cached imports instead of dynamic import() on every batch
      if (!_embeddingServiceMod) {
        _embeddingServiceMod = await import('./LocalEmbeddingService')
      }
      const embeddingService = _embeddingServiceMod.getLocalEmbeddingService()

      // OPT-6: Process batch items in parallel (up to BATCH_SIZE concurrent)
      const results = await Promise.allSettled(
        batch.map(async item => {
          try {
            const result = await embeddingService.embed(item.text)

            // Persist the embedding as BLOB to the transcripts table
            try {
              if (!_dbConnectionMod) {
                _dbConnectionMod = await import('../database/connection')
              }
              const db = _dbConnectionMod.getDatabase()
              const buffer = Buffer.from(new Float32Array(result.embedding).buffer)
              db.prepare('UPDATE transcripts SET embedding_blob = ? WHERE id = ?').run(
                buffer,
                item.id
              )
            } catch (dbErr) {
              log.debug(`Failed to persist embedding for ${item.id}:`, dbErr)
            }

            log.debug(
              `Embedded "${item.text.substring(0, 40)}..." → ${result.dimensions}d in ${result.generationTimeMs}ms`
            )
          } catch (err) {
            log.debug(`Failed to embed item ${item.id}:`, err)
            // Don't re-queue failed items to prevent infinite loops
          }
        })
      )

      const succeeded = results.filter(r => r.status === 'fulfilled').length

      if (batch.length > 0) {
        log.info(
          `Processed ${succeeded}/${batch.length} embeddings (${this.queue.length} remaining)`
        )
      }
    } catch (err) {
      log.error('Embedding queue batch failed:', err)
      // M-6 AUDIT: Only re-queue if items haven't exceeded retry limit.
      // Prevents infinite loop when embedding service has a systematic failure.
      const MAX_BATCH_RETRIES = 3
      const retryable = batch.filter(item => {
        const retries = ((item as unknown as { _retries?: number })._retries ?? 0) + 1
        ;(item as unknown as { _retries: number })._retries = retries
        return retries <= MAX_BATCH_RETRIES
      })
      if (retryable.length > 0) {
        this.queue.unshift(...retryable)
      }
      if (retryable.length < batch.length) {
        log.warn(
          `Dropped ${batch.length - retryable.length} items after ${MAX_BATCH_RETRIES} retries`
        )
      }
    } finally {
      this.isProcessing = false
    }
  }

  /**
   * Get queue status for monitoring.
   */
  getStatus(): { queueLength: number; isProcessing: boolean; isRunning: boolean } {
    return {
      queueLength: this.queue.length,
      isProcessing: this.isProcessing,
      isRunning: this.timer !== null,
    }
  }

  /**
   * Flush the queue — process all remaining items immediately.
   */
  async flush(): Promise<void> {
    // I13 fix: Add max iterations guard to prevent infinite loop.
    // If processQueue() fails at batch level, items get re-queued via unshift(),
    // causing flush() to spin forever. Cap at 3× queue length iterations.
    const maxIterations = Math.max(10, this.queue.length * 3)
    let iterations = 0
    while (this.queue.length > 0 && iterations < maxIterations) {
      await this.processQueue()
      iterations++
    }
    if (this.queue.length > 0) {
      log.warn(`flush() hit max iterations (${maxIterations}), ${this.queue.length} items remain`)
    }
  }

  /**
   * Reset the queue (for test isolation).
   */
  reset(): void {
    this.stop()
    this.queue = []
    this.isProcessing = false
  }
}

// Singleton
let instance: BackgroundEmbeddingQueue | null = null
export function getBackgroundEmbeddingQueue(): BackgroundEmbeddingQueue {
  if (!instance) {
    instance = new BackgroundEmbeddingQueue()
  }
  return instance
}
