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
 * Content size limits by plan tier (GAP-N15)
 * Task 30.11: Content size limits and chunking
 */
const CONTENT_SIZE_LIMITS = {
  free: 5000, // 5K characters
  starter: 10000, // 10K characters
  pro: 25000, // 25K characters
  team: 50000, // 50K characters
  enterprise: 100000, // 100K characters
} as const

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
  private cachedPlanTier: string | null = null

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
    } catch {
      this.cachedPlanTier = 'free'
    }

    console.log(`[SyncManager] Initialized for user: ${userId}`)
  }

  /**
   * Start automatic sync (every 30 seconds)
   * Task 30.8: Queue persists across app restarts
   */
  public startAutoSync(): void {
    if (this.syncInterval) {
      console.log('[SyncManager] Auto-sync already running')
      return
    }

    console.log('[SyncManager] Starting auto-sync (every 30 seconds)')

    // Sync immediately on start
    this.syncPendingEvents().catch(error => {
      console.error('[SyncManager] Initial sync failed:', error)
    })

    // Then sync every 30 seconds
    this.syncInterval = setInterval(() => {
      this.syncPendingEvents().catch(error => {
        console.error('[SyncManager] Auto-sync failed:', error)
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
      console.log('[SyncManager] Auto-sync stopped')
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
    console.log(`[SyncManager] Queued ${operation} event for ${table}:${recordId}`)
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
      console.log('[SyncManager] Sync already in progress, skipping')
      return { success: true, syncedCount: 0, failedCount: 0, errors: [] }
    }

    if (!this.userId || !this.password) {
      console.log('[SyncManager] Not initialized, skipping sync')
      return { success: false, syncedCount: 0, failedCount: 0, errors: ['Not initialized'] }
    }

    this.isSyncing = true

    try {
      // Get pending events (batch up to 50)
      const pendingEvents = getPendingSyncItems(MAX_BATCH_SIZE)

      if (pendingEvents.length === 0) {
        console.log('[SyncManager] No pending events to sync')
        return { success: true, syncedCount: 0, failedCount: 0, errors: [] }
      }

      console.log(`[SyncManager] Syncing ${pendingEvents.length} pending events`)

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
              (chunkPayload as any).text ||
              (chunkPayload as any).content ||
              (chunkPayload as any).original_text ||
              ''
            let embeddingData: number[] | undefined
            if (
              typeof plaintextContent === 'string' &&
              plaintextContent.length > 0
            ) {
              try {
                const { getLocalEmbeddingService } = await import(
                  './LocalEmbeddingService'
                )
                const embeddingResult =
                  await getLocalEmbeddingService().embed(plaintextContent)
                embeddingData = embeddingResult.embedding
              } catch (error) {
                console.warn(
                  '[SyncManager] Local embedding failed, continuing without:',
                  error
                )
              }
            }

            // Task 30.4: Encrypt payload before upload
            const encryptedPayload = EncryptionService.encrypt(
              JSON.stringify(chunkPayload),
              this.password!
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

            // Task 30.5: POST to /api/v1/memories
            const memoryResult = await this.backend.createMemory(memory)

            // Wait for PiyAPI to generate embeddings (async, ~2-4s)
            // Without this, immediate search returns zero semantic results
            if (memoryResult?.id) {
              this.waitForEmbedding(memoryResult.id).catch(() => {
                // Non-blocking — search may return incomplete results
              })
            }
          }

          // Task 30.6: Mark synced_at on success
          this.markSynced(event.table_name, event.record_id)

          syncedIds.push(event.id)
          console.log(
            `[SyncManager] Synced ${event.operation_type} ${event.table_name}:${event.record_id}`
          )
        } catch (error: any) {
          // Task 30.7: Implement exponential backoff with infinite retries
          const retryDelay = this.getBackoffDelay(event.retry_count)
          console.error(
            `[SyncManager] Failed to sync event ${event.id} (retry ${event.retry_count}):`,
            (error as Error).message
          )
          console.log(`[SyncManager] Will retry in ${retryDelay / 1000}s`)

          incrementSyncRetry(event.id)
          errors.push(`${event.table_name}:${event.record_id} - ${(error as Error).message}`)

          // Schedule retry with exponential backoff
          setTimeout(() => {
            this.syncPendingEvents().catch(err => {
              console.error('[SyncManager] Retry sync failed:', err)
            })
          }, retryDelay)
        }
      }

      // Delete successfully synced events from queue
      if (syncedIds.length > 0) {
        deleteSyncQueueItems(syncedIds)
        console.log(`[SyncManager] Deleted ${syncedIds.length} synced events from queue`)
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
    console.log(`[SyncManager] Polling embedding status for memory: ${memoryId}`)

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        // Get memory from backend
        const memories = await this.backend.getMemories('meetings', 1, 0)
        const memory = memories.find(m => m.id === memoryId)

        if (!memory) {
          console.error(`[SyncManager] Memory not found: ${memoryId}`)
          return 'failed'
        }

        const embeddingStatus = (memory.metadata?.embedding_status as EmbeddingStatus) || 'pending'

        console.log(`[SyncManager] Embedding status (attempt ${attempt + 1}): ${embeddingStatus}`)

        if (embeddingStatus === 'ready' || embeddingStatus === 'failed') {
          return embeddingStatus
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, intervalMs))
      } catch (error) {
        console.error(`[SyncManager] Error polling embedding status:`, (error as Error).message)
        return 'failed'
      }
    }

    console.warn(`[SyncManager] Embedding status polling timed out after ${maxAttempts} attempts`)
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
    return BACKOFF_DELAYS[index]!
  }

  /**
   * Mark record as synced in database
   * Task 30.6: Mark synced_at on success
   *
   * @param table - Table name
   * @param recordId - Record ID
   */
  private markSynced(table: string, recordId: string): void {
    const db = getDatabase()
    const now = Math.floor(Date.now() / 1000)

    try {
      const stmt = db.prepare(`
        UPDATE ${table}
        SET synced_at = ?
        WHERE id = ?
      `)
      stmt.run(now, recordId)
    } catch (error) {
      console.error(`[SyncManager] Failed to mark ${table}:${recordId} as synced:`, (error as Error).message)
    }
  }

  /**
   * Wait for PiyAPI to generate embeddings for a memory
   * Embeddings are generated asynchronously (~2-4s after creation).
   * Status value is 'ready', NOT 'completed' (API quirk).
   */
  private async waitForEmbedding(memoryId: string, maxWaitMs = 10_000): Promise<boolean> {
    const start = Date.now()
    while (Date.now() - start < maxWaitMs) {
      try {
        // Access token from backend internal state
        const token = (this.backend as any).accessToken
        if (!token) return false
        const res = await fetch(
          `${(this.backend as any).baseUrl || config.PIYAPI_BASE_URL}/api/v1/memories/${memoryId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        if (res.ok) {
          const memory = await res.json()
          if (memory?.embedding_status === 'ready') return true
        }
      } catch {
        return false
      }
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
    console.warn(`[SyncManager] Embedding timeout for memory ${memoryId}`)
    return false
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
    const sizeLimit = CONTENT_SIZE_LIMITS[planTier]

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

    console.log(
      `[SyncManager] Content exceeds ${planTier} plan limit (${contentLength} > ${sizeLimit}), chunking...`
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

    console.log(`[SyncManager] Split content into ${numChunks} chunks`)
    return chunks
  }

  /**
   * Get user's plan tier from keychain via KeyStorageService
   *
   * @returns Plan tier
   */
  private getUserPlanTier(): keyof typeof CONTENT_SIZE_LIMITS {
    if (!this.userId) {
      return 'free'
    }

    try {
      // Synchronous check — KeyStorageService is async so we cache the tier
      // during login and use the cached value here
      if (this.cachedPlanTier) {
        return this.cachedPlanTier as keyof typeof CONTENT_SIZE_LIMITS
      }
      return 'free'
    } catch {
      return 'free'
    }
  }
}
