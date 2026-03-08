/**
 * Sync Manager
 *
 * Handles encrypted sync with PiyAPI backend.
 * Implements event-sourced sync queue with exponential backoff and infinite retries.
 *
 * Features:
 * - Event-sourced sync queue (persists across app restarts)
 * - Batch up to 50 events per sync
 * - Encrypt events before upload using EncryptionService
 * - POST to /api/v1/memories
 * - Mark synced_at on success
 * - Exponential backoff with infinite retries (5s, 10s, 20s, 30s max)
 * - ALLOWED_TABLES whitelist for SQL injection protection
 * - Content size limits and chunking (GAP-N15)
 * - Embedding status polling (GAP-16)
 */

import { v4 as uuidv4 } from 'uuid'
import { EncryptionService } from './EncryptionService'
import { PiyAPIBackend } from './backend/PiyAPIBackend'
import { KeyStorageService } from './KeyStorageService'
import { Logger } from './Logger'
import { config } from '../config/environment'
import type { Memory } from './backend/IBackendProvider'
import {
  createSyncQueueItem,
  getPendingSyncItems,
  deleteSyncQueueItems,
  incrementSyncRetry,
  getSyncQueueCount,
  getPendingSyncCount,
} from '../database/crud/sync-queue'
import type { OperationType, CreateSyncQueueInput } from '../../types/database'
import { getDatabase } from '../database/connection'

/**
 * Allowed table names for sync operations (SQL injection protection)
 * Task 30.10: ALLOWED_TABLES whitelist
 */
const ALLOWED_TABLES = ['meetings', 'transcripts', 'notes', 'entities'] as const
type AllowedTable = (typeof ALLOWED_TABLES)[number]

/**
 * Content size limits imported from TierMappingService (single source of truth)
 * Task 30.11: Content size limits and chunking
 */
import { getContentSizeLimit, type PiyNotesTier } from './TierMappingService'

/**
 * Exponential backoff delays (in milliseconds)
 * Task 30.7: Exponential backoff with infinite retries
 */
const BACKOFF_DELAYS = [5000, 10000, 20000, 30000] // 5s, 10s, 20s, 30s (max)

/**
 * Maximum events per batch
 * Task 30.3: Batch up to 50 events per sync
 */
const MAX_BATCH_SIZE = 50

/**
 * Sync event structure
 */
export interface SyncEvent {
  id: string
  operation_type: OperationType
  table_name: AllowedTable
  record_id: string
  payload: Record<string, unknown>
  timestamp: number
}

/**
 * Sync result
 */
export interface SyncResult {
  success: boolean
  syncedCount: number
  failedCount: number
  errors: string[]
}

/**
 * Embedding status
 * Task 30.12: Embedding status polling (GAP-16)
 */
export type EmbeddingStatus = 'pending' | 'processing' | 'ready' | 'failed'

/**
 * Sync Manager Class
 */
export class SyncManager {
  private backend: PiyAPIBackend
  private userId: string | null = null
  private password: string | null = null
  private syncInterval: NodeJS.Timeout | null = null
  private isSyncing: boolean = false
  private retryPending: boolean = false
  private cachedPlanTier: string | null = null
  private log = Logger.create('SyncManager')

  constructor(backend?: PiyAPIBackend) {
    this.backend = backend || new PiyAPIBackend()
  }

  /**
   * Initialize sync manager with user credentials
   *
   * @param userId - User ID
   * @param password - User password (for encryption)
   */
  public async initialize(userId: string, password: string): Promise<void> {
    this.userId = userId
    this.password = password

    // Initialize encryption for user if not already done
    await EncryptionService.initializeUserEncryption(userId, password)

    // Load access token from keychain
    const accessToken = await KeyStorageService.getAccessToken(userId)
    if (accessToken) {
      this.backend.setAccessToken(accessToken, userId)
    }

    // Cache plan tier for synchronous access in chunking
    try {
      const tier = await KeyStorageService.getPlanTier(userId)
      this.cachedPlanTier = tier || 'free'
    } catch (err) {
      this.log.debug('Plan tier lookup failed, defaulting to free', err)
      this.cachedPlanTier = 'free'
    }

    this.log.info(`Initialized for user: ${userId}`)
  }

  /**
   * Start automatic sync (every 30 seconds)
   * Task 30.8: Queue persists across app restarts
   */
  public startAutoSync(): void {
    if (this.syncInterval) {
      this.log.debug('Auto-sync already running')
      return
    }

    this.log.info('Starting auto-sync (every 30 seconds)')

    // Sync immediately on start
    this.syncPendingEvents().catch(error => {
      this.log.error('Initial sync failed:', error)
    })

    // Then sync every 30 seconds
    this.syncInterval = setInterval(() => {
      this.syncPendingEvents().catch(error => {
        this.log.error('Auto-sync failed:', error)
      })
    }, 30000)
  }

  /**
   * Stop automatic sync
   */
  public stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
      this.syncInterval = null
      this.log.info('Auto-sync stopped')
    }
  }

  /**
   * Queue a sync event
   * Task 30.2: Queue events on create/update/delete
   *
   * @param operation - Operation type (create, update, delete)
   * @param table - Table name (must be in ALLOWED_TABLES)
   * @param recordId - Record ID
   * @param payload - Event payload
   */
  public queueEvent(
    operation: OperationType,
    table: string,
    recordId: string,
    payload: Record<string, unknown>
  ): void {
    // Task 30.10: Validate table name against whitelist
    if (!this.isAllowedTable(table)) {
      throw new Error(`Invalid table name: ${table}. Allowed tables: ${ALLOWED_TABLES.join(', ')}`)
    }

    const event: CreateSyncQueueInput = {
      id: uuidv4(),
      operation_type: operation,
      table_name: table as AllowedTable,
      record_id: recordId,
      payload,
    }

    createSyncQueueItem(event)
    this.log.debug(`Queued ${operation} event for ${table}:${recordId}`)
  }

  /**
   * Sync pending events to backend
   * Task 30.1: Implement event-sourced sync queue
   * Task 30.3: Batch up to 50 events per sync
   * Task 30.4: Encrypt events before upload
   * Task 30.5: POST to /api/v1/memories
   * Task 30.6: Mark synced_at on success
   * Task 30.7: Implement exponential backoff with infinite retries
   *
   * @returns Sync result
   */
  public async syncPendingEvents(): Promise<SyncResult> {
    if (this.isSyncing) {
      this.log.debug('Sync already in progress, skipping')
      return { success: true, syncedCount: 0, failedCount: 0, errors: [] }
    }

    // Guard against re-entry during pending retry (prevents duplicate processing)
    if (this.retryPending) {
      this.log.debug('Retry pending, skipping auto-sync')
      return { success: true, syncedCount: 0, failedCount: 0, errors: [] }
    }

    if (!this.userId || !this.password) {
      this.log.debug('Not initialized, skipping sync')
      return { success: false, syncedCount: 0, failedCount: 0, errors: ['Not initialized'] }
    }

    this.isSyncing = true

    try {
      // Get pending events (batch up to 50)
      const pendingEvents = getPendingSyncItems(MAX_BATCH_SIZE)

      if (pendingEvents.length === 0) {
        this.log.debug('No pending events to sync')
        return { success: true, syncedCount: 0, failedCount: 0, errors: [] }
      }

      this.log.info(`Syncing ${pendingEvents.length} pending events`)

      const syncedIds: string[] = []
      const errors: string[] = []

      // Process each event
      for (const event of pendingEvents) {
        try {
          // Parse payload
          const payload = event.payload ? JSON.parse(event.payload) : {}

          // Task 30.11: Check content size and chunk if necessary
          const chunkedPayloads = this.chunkContentIfNeeded(payload)

          // Process each chunk
          for (const chunkPayload of chunkedPayloads) {
            // Generate local embeddings BEFORE encryption (Encrypted Search Paradox fix)
            const plaintextContent =
              (typeof chunkPayload.text === 'string' ? chunkPayload.text : '') ||
              (typeof chunkPayload.content === 'string' ? chunkPayload.content : '') ||
              (typeof chunkPayload.original_text === 'string' ? chunkPayload.original_text : '') ||
              ''
            let embeddingData: number[] | undefined
            if (typeof plaintextContent === 'string' && plaintextContent.length > 0) {
              try {
                const { getLocalEmbeddingService } = await import('./LocalEmbeddingService')
                const embeddingResult = await getLocalEmbeddingService().embed(plaintextContent)
                embeddingData = embeddingResult.embedding
              } catch (error) {
                this.log.warn('Local embedding failed, continuing without:', error)
              }
            }

            // Task 30.4: Encrypt payload before upload
            const encryptedPayload = await EncryptionService.encrypt(
              JSON.stringify(chunkPayload),
              this.password ?? ''
            )

            // Convert to Memory format for PiyAPI
            const memory: Memory = {
              content: encryptedPayload.ciphertext,
              namespace: `meetings.${event.table_name}`,
              tags: [event.table_name, event.operation_type],
              metadata: {
                record_id: event.record_id,
                iv: encryptedPayload.iv,
                salt: encryptedPayload.salt,
                authTag: encryptedPayload.authTag,
                algorithm: encryptedPayload.algorithm,
                created_at: event.created_at,
                encrypted: true,
                skip_server_embedding: !!embeddingData,
              },
              embedding: embeddingData,
              sourceType: event.table_name,
              eventTime: new Date(event.created_at * 1000).toISOString(),
            }

            // Route to correct PiyAPI operation based on event type
            switch (event.operation_type) {
              case 'create': {
                // Task 30.5: POST to /api/v1/memories
                const memoryResult = await this.backend.createMemory(memory)

                // Wait for PiyAPI to generate embeddings (async, ~2-4s)
                // Without this, immediate search returns zero semantic results
                if (memoryResult?.id) {
                  this.waitForEmbedding(memoryResult.id).catch(() => {
                    // Non-blocking — search may return incomplete results
                  })
                }
                break
              }

              case 'update': {
                // Find existing cloud memory by record_id, then update
                const existingMemories = await this.backend.getMemories(
                  `meetings.${event.table_name}`,
                  100,
                  0
                )
                const existing = existingMemories.find(
                  (m: Memory) => m.metadata?.record_id === event.record_id
                )

                if (existing?.id) {
                  await this.backend.updateMemory(existing.id, memory)
                } else {
                  // Fallback: record not found in cloud — create instead
                  this.log.warn(
                    `Update target not found in cloud for ${event.record_id}, creating new`
                  )
                  await this.backend.createMemory(memory)
                }
                break
              }

              case 'delete': {
                // Find existing cloud memory by record_id, then delete
                const deleteMemories = await this.backend.getMemories(
                  `meetings.${event.table_name}`,
                  100,
                  0
                )
                const toDelete = deleteMemories.find(
                  (m: Memory) => m.metadata?.record_id === event.record_id
                )

                if (toDelete?.id) {
                  await this.backend.deleteMemory(toDelete.id)
                } else {
                  // Already deleted or never synced — safe to skip
                  this.log.debug(
                    `Delete target not found in cloud for ${event.record_id}, skipping`
                  )
                }
                break
              }

              default:
                this.log.warn(
                  `Unknown operation type: ${event.operation_type}, defaulting to create`
                )
                await this.backend.createMemory(memory)
            }
          }

          // Task 30.6: Mark synced_at on success (atomic with queue deletion)
          this.markSyncedAtomic(event.table_name, event.record_id, event.id)
          syncedIds.push(event.id)

          this.log.info(`Synced ${event.operation_type} ${event.table_name}:${event.record_id}`)
        } catch (error: unknown) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          const statusCode =
            ((error as Record<string, unknown>)?.status as number) ||
            ((error as Record<string, unknown>)?.statusCode as number) ||
            0

          // Classify error: permanent (4xx / serialization) vs retryable (network / 5xx)
          const isPermanent =
            (statusCode >= 400 && statusCode < 500) ||
            errorMsg.includes('JSON') ||
            errorMsg.includes('Invalid') ||
            errorMsg.includes('Forbidden')

          if (isPermanent) {
            // Dead-letter: log and remove from queue to stop infinite retries
            this.log.error(
              `Permanent sync failure for event ${event.id} — removing from queue:`,
              errorMsg
            )
            try {
              deleteSyncQueueItems([event.id])
            } catch {
              /* best effort */
            }
            continue
          }

          // Retryable error: exponential backoff
          const retryDelay = this.getBackoffDelay(event.retry_count)
          this.log.error(
            `Retryable sync failure for event ${event.id} (retry ${event.retry_count}):`,
            errorMsg
          )
          this.log.info(`Will retry in ${retryDelay / 1000}s`)

          incrementSyncRetry(event.id)
          errors.push(`${event.table_name}:${event.record_id} - ${errorMsg}`)

          // Schedule retry with exponential backoff (guard against cascading retries)
          if (!this.retryPending) {
            this.retryPending = true
            setTimeout(() => {
              this.retryPending = false
              this.syncPendingEvents().catch(err => {
                this.log.error('Retry sync failed:', err)
              })
            }, retryDelay)
          }
        }
      }

      // Delete successfully synced events from queue
      if (syncedIds.length > 0) {
        deleteSyncQueueItems(syncedIds)
        this.log.debug(`Deleted ${syncedIds.length} synced events from queue`)
      }

      return {
        success: errors.length === 0,
        syncedCount: syncedIds.length,
        failedCount: errors.length,
        errors,
      }
    } finally {
      this.isSyncing = false
    }
  }

  /**
   * Poll embedding status until ready
   * Task 30.12: Implement embedding status polling (GAP-16)
   *
   * @param memoryId - Memory ID to poll
   * @param maxAttempts - Maximum polling attempts (default: 10)
   * @param intervalMs - Polling interval in milliseconds (default: 1000)
   * @returns Final embedding status
   */
  public async pollEmbeddingStatus(
    memoryId: string,
    maxAttempts: number = 10,
    intervalMs: number = 1000
  ): Promise<EmbeddingStatus> {
    this.log.debug(`Polling embedding status for memory: ${memoryId}`)

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        // Fetch this specific memory by ID via direct API call
        const token = this.backend.getAccessToken?.()
        if (!token) {
          this.log.debug('No access token for embedding poll')
          return 'pending'
        }

        // Use backend's base URL — already correctly set for both proxy and direct modes
        // Proxy mode: baseUrl = .../piyapi-proxy → .../piyapi-proxy/memories/{id}
        // Direct mode: baseUrl = .../api/v1 → .../api/v1/memories/{id}
        const baseUrl = this.backend.getBaseUrl?.()
        const memoryUrl = baseUrl
          ? `${baseUrl}/memories/${memoryId}`
          : `${config.PIYAPI_BASE_URL}/api/v1/memories/${memoryId}`

        const res = await fetch(memoryUrl, { headers: { Authorization: `Bearer ${token}` } })

        if (!res.ok) {
          this.log.debug(`Memory fetch returned ${res.status}`)
          if (res.status === 404) return 'failed'
          // Transient error — wait and retry
          await new Promise(resolve => setTimeout(resolve, intervalMs))
          continue
        }

        const memory = await res.json()
        const embeddingStatus = (memory?.embedding_status ||
          memory?.metadata?.embedding_status ||
          'pending') as EmbeddingStatus

        this.log.debug(`Embedding status (attempt ${attempt + 1}): ${embeddingStatus}`)

        if (embeddingStatus === 'ready' || embeddingStatus === 'failed') {
          return embeddingStatus
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, intervalMs))
      } catch (error) {
        this.log.error('Error polling embedding status:', (error as Error).message)
        return 'failed'
      }
    }

    this.log.warn(`Embedding status polling timed out after ${maxAttempts} attempts`)
    return 'pending'
  }

  /**
   * Get sync queue statistics
   *
   * @returns Queue statistics
   */
  public getSyncStats(): { total: number; pending: number } {
    return {
      total: getSyncQueueCount(),
      pending: getPendingSyncCount(),
    }
  }

  /**
   * Check if table name is in ALLOWED_TABLES whitelist
   * Task 30.10: ALLOWED_TABLES whitelist for SQL injection protection
   *
   * @param table - Table name to validate
   * @returns True if table is allowed
   */
  private isAllowedTable(table: string): table is AllowedTable {
    return ALLOWED_TABLES.includes(table as AllowedTable)
  }

  /**
   * Get exponential backoff delay based on retry count
   * Task 30.7: Exponential backoff with infinite retries
   *
   * @param retryCount - Number of retries
   * @returns Delay in milliseconds
   */
  private getBackoffDelay(retryCount: number): number {
    const index = Math.min(retryCount, BACKOFF_DELAYS.length - 1)
    return BACKOFF_DELAYS[index] ?? BACKOFF_DELAYS[BACKOFF_DELAYS.length - 1] ?? 30000
  }

  /**
   * Mark record as synced in database AND delete queue item atomically
   * Task 30.6: Mark synced_at on success
   *
   * Runs both operations in a single SQLite transaction to prevent
   * duplicate uploads if the app crashes between them.
   *
   * @param table - Table name (re-validated against ALLOWED_TABLES)
   * @param recordId - Record ID
   * @param queueItemId - Sync queue item ID to delete
   */
  private markSyncedAtomic(table: string, recordId: string, queueItemId: string): void {
    const db = getDatabase()
    const now = Math.floor(Date.now() / 1000)

    // Re-validate table against whitelist to prevent SQL injection
    // even when called independently from queueEvent
    if (!ALLOWED_TABLES.includes(table as (typeof ALLOWED_TABLES)[number])) {
      this.log.error(`markSyncedAtomic: Blocked invalid table "${table}"`)
      return
    }

    try {
      const txn = db.transaction(() => {
        // 1. Mark the source record as synced
        const stmt = db.prepare(`
          UPDATE ${table}
          SET synced_at = ?
          WHERE id = ?
        `)
        stmt.run(now, recordId)

        // 2. Remove from sync queue
        db.prepare('DELETE FROM sync_queue WHERE id = ?').run(queueItemId)
      })
      txn()
    } catch (error) {
      this.log.error(`Failed atomic markSynced for ${table}:${recordId}:`, (error as Error).message)
    }
  }

  /**
   * Wait for PiyAPI to generate embeddings for a memory.
   * Consolidated to delegate to pollEmbeddingStatus (NEW-09 fix).
   */
  private async waitForEmbedding(memoryId: string, maxWaitMs = 10_000): Promise<boolean> {
    const maxAttempts = Math.max(1, Math.ceil(maxWaitMs / 1000))
    const status = await this.pollEmbeddingStatus(memoryId, maxAttempts, 1000)
    return status === 'ready'
  }

  /**
   * Chunk content if it exceeds plan limits
   * Task 30.11: Implement content size limits and chunking (GAP-N15)
   *
   * Uses plan-based size limits to automatically chunk large transcripts.
   * TranscriptChunker service provides the chunking logic.
   *
   * @param payload - Event payload
   * @returns Array of chunked payloads
   */
  private chunkContentIfNeeded(payload: Record<string, unknown>): Record<string, unknown>[] {
    // Get user's plan tier
    const planTier = this.getUserPlanTier()
    const sizeLimit = getContentSizeLimit(planTier)

    // Check if content field exists and needs chunking
    const content = payload.text || payload.content || payload.original_text
    if (typeof content !== 'string') {
      return [payload]
    }

    const contentLength = content.length

    // If content is within limit, return as-is
    if (contentLength <= sizeLimit) {
      return [payload]
    }

    this.log.info(
      `Content exceeds ${planTier} plan limit (${contentLength} > ${sizeLimit}), chunking...`
    )

    // Chunk content into multiple payloads
    const chunks: Record<string, unknown>[] = []
    const numChunks = Math.ceil(contentLength / sizeLimit)
    const parentId = uuidv4()

    for (let i = 0; i < numChunks; i++) {
      const start = i * sizeLimit
      const end = Math.min((i + 1) * sizeLimit, contentLength)
      const chunkContent = content.substring(start, end)

      chunks.push({
        ...payload,
        text: chunkContent,
        content: chunkContent,
        original_text: chunkContent,
        parent_id: parentId,
        chunk_index: i,
        total_chunks: numChunks,
      })
    }

    this.log.debug(`Split content into ${numChunks} chunks`)
    return chunks
  }

  /**
   * Get user's plan tier from keychain via KeyStorageService
   *
   * @returns Plan tier
   */
  private getUserPlanTier(): PiyNotesTier {
    if (!this.userId) {
      return 'free'
    }

    try {
      // Synchronous check — KeyStorageService is async so we cache the tier
      // during login and use the cached value here
      if (this.cachedPlanTier) {
        return this.cachedPlanTier as PiyNotesTier
      }
      return 'free'
    } catch (err) {
      this.log.debug('getPlanTier fallback to free', err)
      return 'free'
    }
  }
}
