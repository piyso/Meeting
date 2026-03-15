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
import { PHIDetectionService } from './PHIDetectionService'

/**
 * Allowed table names for sync operations (SQL injection protection)
 * Task 30.10: ALLOWED_TABLES whitelist
 */
const ALLOWED_TABLES = ['meetings', 'transcripts', 'notes', 'entities', 'audio_highlights'] as const
type AllowedTable = (typeof ALLOWED_TABLES)[number]

/**
 * Content size limits imported from TierMappingService (single source of truth)
 * Task 30.11: Content size limits and chunking
 */
import { getContentSizeLimit, type BlueArkiveTier } from './TierMappingService'

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
  // Security: password is held in memory only for encryption operations during sync.
  // EncryptionService.encrypt() requires the raw password to derive the encryption key.
  // We store it here rather than re-prompting the user on every sync cycle.
  // TODO: Refactor EncryptionService to accept a pre-derived key instead.
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
      // E2: Collect create events for batch processing instead of one-by-one
      const pendingCreates: Array<{
        memory: Memory
        event: { table_name: string; record_id: string; id: string; operation_type: string }
        queueItemId: string
      }> = []
      let processedCount = 0

      // Process each event
      for (const event of pendingEvents) {
        try {
          // Parse payload
          const payload = event.payload ? JSON.parse(event.payload) : {}

          // Task 30.11: Check content size and chunk if necessary
          const chunkedPayloads = this.chunkContentIfNeeded(payload)

          // Read PHI settings once per sync batch (avoid repeated DB queries per chunk)
          let phiEnabled = false
          let maskBeforeSync = false
          try {
            const dbForPhi = getDatabase()
            const phiRow = dbForPhi
              .prepare('SELECT value FROM settings WHERE key = ?')
              .get('phiDetectionEnabled') as { value: string } | undefined
            const maskRow = dbForPhi
              .prepare('SELECT value FROM settings WHERE key = ?')
              .get('maskPHIBeforeSync') as { value: string } | undefined
            phiEnabled = phiRow?.value === 'true' || phiRow?.value === '1'
            maskBeforeSync = maskRow?.value === 'true' || maskRow?.value === '1'
          } catch (phiSettingsError) {
            this.log.warn('PHI settings read failed:', phiSettingsError)
          }

          // Process each chunk
          for (const chunkPayload of chunkedPayloads) {
            // Generate local embeddings BEFORE encryption (Encrypted Search Paradox fix)
            const plaintextContent =
              (typeof chunkPayload.text === 'string' ? chunkPayload.text : '') ||
              (typeof chunkPayload.content === 'string' ? chunkPayload.content : '') ||
              (typeof chunkPayload.original_text === 'string' ? chunkPayload.original_text : '') ||
              ''

            // PHI Detection: Check content before cloud upload (HIPAA compliance)
            if (phiEnabled && typeof plaintextContent === 'string' && plaintextContent.length > 0) {
              try {
                const phiResult = PHIDetectionService.detectPHI(plaintextContent)
                if (phiResult.hasPHI) {
                  this.log.warn(
                    `PHI detected in ${event.table_name}:${event.record_id} — ` +
                      `${phiResult.detectedIdentifiers.length} entities (risk: ${phiResult.riskLevel})`
                  )
                  // Mask PHI if setting enabled
                  if (maskBeforeSync && phiResult.maskedText) {
                    chunkPayload.text = phiResult.maskedText
                    chunkPayload.content = phiResult.maskedText
                    chunkPayload.original_text = phiResult.maskedText
                    this.log.info('PHI masked before sync')
                  }
                }
              } catch (phiError) {
                this.log.warn('PHI detection failed, continuing without:', phiError)
              }
            }

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
              tags: [event.table_name, event.operation_type, `rid:${event.record_id}`],
              metadata: {
                record_id: event.record_id,
                iv: encryptedPayload.iv,
                salt: encryptedPayload.salt,
                authTag: encryptedPayload.authTag,
                algorithm: encryptedPayload.algorithm,
                created_at: event.created_at,
                encrypted: true,
                // E-CRIT: Always skip server embedding for encrypted content.
                // PiyAPI would generate embeddings from ciphertext (garbage vectors).
                // We send the client-side plaintext embedding instead (L276-279).
                skip_server_embedding: true,
              },
              embedding: embeddingData,
              sourceType: event.table_name,
              eventTime: new Date(event.created_at * 1000).toISOString(),
            }

            // Route to correct PiyAPI operation based on event type
            switch (event.operation_type) {
              case 'create': {
                // E2: Collect creates for batch processing (handled after loop)
                pendingCreates.push({ memory, event, queueItemId: event.id })
                break
              }

              case 'update': {
                // P1-4 FIX: Use getMemories + metadata filter instead of semanticSearch on UUID.
                // UUIDs have no semantic meaning — semanticSearch was returning wrong results.
                const updateResults = await this.backend.getMemories(
                  `meetings.${event.table_name}`,
                  50,
                  0
                )
                const existing = updateResults.find(r => r.metadata?.record_id === event.record_id)

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
                // P1-4 FIX: Use getMemories + metadata filter instead of semanticSearch on UUID.
                // UUIDs have no semantic meaning — semanticSearch was returning wrong results.
                const deleteResults = await this.backend.getMemories(
                  `meetings.${event.table_name}`,
                  50,
                  0
                )
                const toDelete = deleteResults.find(r => r.metadata?.record_id === event.record_id)

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

          // Task 30.6: Mark synced_at on success (skip creates — handled by batch below)
          if (event.operation_type !== 'create') {
            this.markSyncedAtomic(event.table_name, event.record_id, event.id)
            syncedIds.push(event.id)
          }

          this.log.info(`Synced ${event.operation_type} ${event.table_name}:${event.record_id}`)
        } catch (error: unknown) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          const statusCode =
            ((error as Record<string, unknown>)?.status as number) ||
            ((error as Record<string, unknown>)?.statusCode as number) ||
            0

          // Classify error: permanent (4xx except 401) vs retryable (network / 5xx / 401)
          // R3: 401 is NOT permanent — attempt token refresh instead of dead-lettering
          const is401 = statusCode === 401
          const isPermanent =
            !is401 &&
            ((statusCode >= 400 && statusCode < 500) ||
              errorMsg.includes('JSON') ||
              errorMsg.includes('Invalid') ||
              errorMsg.includes('Forbidden'))

          // R3: On 401, attempt Supabase token refresh and update BackendSingleton
          if (is401 && this.userId) {
            try {
              const { setBackendToken } = await import('./backend/BackendSingleton')
              const freshToken = await KeyStorageService.getAccessToken(this.userId)
              if (freshToken) {
                setBackendToken(freshToken, this.userId)
                this.backend.setAccessToken(freshToken, this.userId)
                this.log.info('401 received — refreshed token, will retry on next sync')
              }
            } catch (refreshErr) {
              this.log.warn('Token refresh on 401 failed:', refreshErr)
            }
            // Don't dead-letter — mark as retryable
            incrementSyncRetry(event.id)
            errors.push(`${event.table_name}:${event.record_id} - 401 (token refreshed)`)
            continue
          }

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

      // E2: Batch-create all pending create events in one API call (up to 50)
      if (pendingCreates.length > 0) {
        try {
          const batchMemories = pendingCreates.map(pc => pc.memory)
          const batchResults = await this.backend.batchCreateMemories(batchMemories)
          for (let i = 0; i < pendingCreates.length; i++) {
            const pc = pendingCreates[i]
            if (pc && batchResults[i]?.id) {
              this.markSyncedAtomic(pc.event.table_name, pc.event.record_id, pc.queueItemId)
              processedCount++
            }
          }
          this.log.info(`Batch-created ${pendingCreates.length} memories in one API call`)
        } catch (batchErr) {
          this.log.warn('Batch create failed, falling back to individual creates:', batchErr)
          for (const pc of pendingCreates) {
            try {
              await this.backend.createMemory(pc.memory)
              this.markSyncedAtomic(pc.event.table_name, pc.event.record_id, pc.queueItemId)
              processedCount++
            } catch (individualErr) {
              errors.push(
                `Create failed for ${pc.event.record_id}: ${(individualErr as Error).message}`
              )
            }
          }
        }
      }

      return {
        success: errors.length === 0,
        syncedCount: syncedIds.length + processedCount,
        failedCount: errors.length,
        errors,
      }
    } finally {
      this.isSyncing = false
    }
  }

  /**
   * Poll embedding status for a memory.
   * E4 optimization: Single delayed check instead of 10×1s polling loop.
   * PiyAPI embeddings are typically ready in <2s; one check at 3s suffices.
   *
   * @param memoryId - Memory ID to poll
   * @returns Final embedding status
   */
  public async pollEmbeddingStatus(
    memoryId: string,
    _maxAttempts: number = 1,
    _intervalMs: number = 3000
  ): Promise<EmbeddingStatus> {
    this.log.debug(`Checking embedding status for memory: ${memoryId}`)

    // Wait 3 seconds for PiyAPI to generate embeddings
    await new Promise(resolve => setTimeout(resolve, 3000))

    try {
      // P3: Use backend.getMemories instead of raw fetch to go through
      // proper auth, proxy mode, and error handling
      const memories = await this.backend.getMemories(`memory:${memoryId}`, 1, 0)
      const memory = memories?.[0]
      if (!memory) return 'pending'

      return (memory.metadata?.embedding_status as EmbeddingStatus) || 'pending'
    } catch (error) {
      this.log.debug('Embedding check failed (non-critical):', (error as Error).message)
      return 'pending'
    }
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

    // E5: Semantic-boundary chunking — split on sentence/newline boundaries
    // instead of character positions that break words mid-syllable
    let remaining = content
    let chunkIndex = 0
    while (remaining.length > 0) {
      let chunkContent: string
      if (remaining.length <= sizeLimit) {
        chunkContent = remaining
        remaining = ''
      } else {
        // Find the last sentence boundary within the size limit
        const slice = remaining.substring(0, sizeLimit)
        // Try newline, then period+space, then space as fallback
        let splitAt = slice.lastIndexOf('\n')
        if (splitAt < sizeLimit * 0.5) splitAt = slice.lastIndexOf('. ')
        if (splitAt < sizeLimit * 0.5) splitAt = slice.lastIndexOf(' ')
        if (splitAt < sizeLimit * 0.3) {
          splitAt = sizeLimit // fallback to hard cut
        } else {
          splitAt += 1 // include the delimiter
        }

        chunkContent = remaining.substring(0, splitAt).trim()
        remaining = remaining.substring(splitAt).trim()
      }

      chunks.push({
        ...payload,
        text: chunkContent,
        content: chunkContent,
        original_text: chunkContent,
        parent_id: parentId,
        chunk_index: chunkIndex,
        total_chunks: -1, // P6: Set after loop — semantic chunking may differ from math estimate
      })
      chunkIndex++
    }

    // P6: Now that we know the actual count, set total_chunks correctly
    for (const chunk of chunks) {
      chunk.total_chunks = chunks.length
    }

    this.log.debug(`Split content into ${numChunks} chunks`)
    return chunks
  }

  /**
   * Get user's plan tier from keychain via KeyStorageService
   *
   * @returns Plan tier
   */
  private getUserPlanTier(): BlueArkiveTier {
    if (!this.userId) {
      return 'free'
    }

    try {
      // Synchronous check — KeyStorageService is async so we cache the tier
      // during login and use the cached value here
      if (this.cachedPlanTier) {
        return this.cachedPlanTier as BlueArkiveTier
      }
      return 'free'
    } catch (err) {
      this.log.debug('getPlanTier fallback to free', err)
      return 'free'
    }
  }
}
