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
      const { getLocalEmbeddingService } = await import('./LocalEmbeddingService')
      const embeddingService = getLocalEmbeddingService()

      for (const item of batch) {
        try {
          const result = await embeddingService.embed(item.text)

          // Persist the embedding as BLOB to the transcripts table
          try {
            const { getDatabase } = await import('../database/connection')
            const db = getDatabase()
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
      }

      if (batch.length > 0) {
        log.info(`Processed ${batch.length} embeddings (${this.queue.length} remaining)`)
      }
    } catch (err) {
      log.error('Embedding queue batch failed:', err)
      // Re-queue items on batch-level failure
      this.queue.unshift(...batch)
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
    while (this.queue.length > 0) {
      await this.processQueue()
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
