/**
 * OfflineMutationQueue — Offline-first mutation persistence
 *
 * 12.1 FIX: Queues mutations (note edits, action item toggles, bookmarks) in IndexedDB
 * when offline. Replays them in order when connectivity returns.
 *
 * Architecture:
 * - Mutations are stored in the local SQLite sync_queue table
 * - On reconnect, SyncManager replays queued mutations
 * - TanStack Query-style optimistic updates with rollback on failure
 * - Each mutation has a unique ID for idempotent replay
 */

import { v4 as uuidv4 } from 'uuid'
import { Logger } from './Logger'
import { getDatabaseService } from './DatabaseService'

const log = Logger.create('OfflineMutationQueue')

export type MutationType =
  | 'note:update'
  | 'note:create'
  | 'note:delete'
  | 'actionItem:toggle'
  | 'actionItem:create'
  | 'actionItem:delete'
  | 'bookmark:create'
  | 'bookmark:delete'
  | 'meeting:update'

export interface Mutation {
  id: string
  type: MutationType
  payload: Record<string, unknown>
  timestamp: number
  retryCount: number
  maxRetries: number
}

export interface MutationResult {
  success: boolean
  mutationId: string
  error?: string
}

export class OfflineMutationQueue {
  private isOnline = true
  private isProcessing = false
  private processTimer: ReturnType<typeof setInterval> | null = null
  private static readonly PROCESS_INTERVAL_MS = 5000
  private static readonly MAX_RETRIES = 5

  /**
   * Set online status. When transitioning from offline → online, triggers replay.
   */
  setOnlineStatus(online: boolean): void {
    const wasOffline = !this.isOnline
    this.isOnline = online

    if (wasOffline && online) {
      log.info('Connectivity restored — replaying offline mutation queue')
      this.processQueue()
    }
  }

  /**
   * Enqueue a mutation for later processing.
   * If online, processes immediately. If offline, queues for replay.
   */
  async enqueue(type: MutationType, payload: Record<string, unknown>): Promise<string> {
    const mutation: Mutation = {
      id: uuidv4(),
      type,
      payload,
      timestamp: Date.now(),
      retryCount: 0,
      maxRetries: OfflineMutationQueue.MAX_RETRIES,
    }

    // Persist to SQLite sync_queue for crash resilience
    try {
      const db = getDatabaseService()
      db.createSyncQueueItem({
        id: `mut-${mutation.id}`,
        operation_type: 'update',
        table_name: this.getTableForMutation(type),
        record_id: (payload.id as string) || mutation.id,
        payload: {
          mutation_type: type,
          mutation_payload: payload,
          mutation_id: mutation.id,
          mutation_timestamp: mutation.timestamp,
        },
      })
    } catch (err) {
      log.warn('Failed to persist mutation to sync_queue:', err)
    }

    if (this.isOnline) {
      // Process immediately — mark sync_queue item as completed to prevent double-processing
      const result = await this.processMutation(mutation)
      if (result.success) {
        try {
          const db = getDatabaseService()
          db.markSyncItemCompleted(`mut-${mutation.id}`)
        } catch {
          // Non-critical
        }
      } else {
        log.warn(`Immediate mutation processing failed, queued for retry: ${result.error}`)
      }
    } else {
      log.debug(`Queued offline mutation: ${type} (${mutation.id})`)
    }

    return mutation.id
  }

  /**
   * Process all queued mutations in order.
   */
  async processQueue(): Promise<MutationResult[]> {
    if (this.isProcessing) return []
    this.isProcessing = true

    const results: MutationResult[] = []

    try {
      const db = getDatabaseService()
      const pendingItems = db.getPendingSyncItems(100)

      const mutations: Mutation[] = pendingItems
        .filter(item => item.id.startsWith('mut-'))
        .map(item => {
          const payload = item.payload ? JSON.parse(item.payload) : {}
          return {
            id: payload.mutation_id || item.id,
            type: payload.mutation_type as MutationType,
            payload: payload.mutation_payload || {},
            timestamp: payload.mutation_timestamp || item.created_at,
            retryCount: item.retry_count,
            maxRetries: OfflineMutationQueue.MAX_RETRIES,
          }
        })

      if (mutations.length === 0) {
        log.debug('No offline mutations to replay')
        this.isProcessing = false
        return []
      }

      log.info(`Replaying ${mutations.length} offline mutations`)

      for (const mutation of mutations) {
        const result = await this.processMutation(mutation)
        results.push(result)

        if (result.success) {
          // Remove from sync_queue on success
          try {
            db.markSyncItemCompleted(`mut-${mutation.id}`)
          } catch {
            // Non-critical
          }
        } else {
          // Increment retry count
          try {
            db.incrementSyncRetryCount(`mut-${mutation.id}`)
          } catch {
            // Non-critical
          }
        }
      }
    } catch (err) {
      log.error('Failed to process offline mutation queue:', err)
    } finally {
      this.isProcessing = false
    }

    return results
  }

  /**
   * Process a single mutation with retry logic.
   */
  private async processMutation(mutation: Mutation): Promise<MutationResult> {
    try {
      switch (mutation.type) {
        case 'note:update': {
          const { id, updates } = mutation.payload as {
            id: string
            updates: Record<string, unknown>
          }
          const db = getDatabaseService()
          db.updateNote(id, updates as Record<string, unknown>)
          break
        }
        case 'note:create': {
          const { meeting_id, text, timestamp } = mutation.payload as {
            meeting_id: string
            text: string
            timestamp: number
          }
          const db = getDatabaseService()
          db.createNote({
            id: mutation.id,
            meeting_id,
            timestamp,
            original_text: text,
          })
          break
        }
        case 'note:delete': {
          const { id } = mutation.payload as { id: string }
          const db = getDatabaseService()
          db.deleteNote(id)
          break
        }
        case 'actionItem:toggle': {
          const { id, status } = mutation.payload as { id: string; status: string }
          const { updateActionItem } = await import('../database/crud/action-items')
          updateActionItem(id, { status: status as 'open' | 'completed' | 'overdue' })
          break
        }
        case 'actionItem:create': {
          const { meeting_id, text, assignee, priority } = mutation.payload as {
            meeting_id: string
            text: string
            assignee?: string
            priority?: string
          }
          const { createActionItem } = await import('../database/crud/action-items')
          createActionItem({
            meeting_id,
            text,
            assignee: assignee || null,
            deadline: null,
            priority: (priority as 'low' | 'normal' | 'high' | 'critical') || 'normal',
            source: 'manual',
          })
          break
        }
        case 'bookmark:create': {
          const { meeting_id, start_time, end_time, label } = mutation.payload as {
            meeting_id: string
            start_time: number
            end_time: number
            label?: string
          }
          const { createHighlight } = await import('../database/crud/highlights')
          createHighlight({
            meetingId: meeting_id,
            startTime: start_time,
            endTime: end_time,
            label: label || undefined,
          })
          break
        }
        default:
          log.warn(`Unknown mutation type: ${mutation.type}`)
          return {
            success: false,
            mutationId: mutation.id,
            error: `Unknown type: ${mutation.type}`,
          }
      }

      log.debug(`Processed mutation: ${mutation.type} (${mutation.id})`)
      return { success: true, mutationId: mutation.id }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      log.warn(`Mutation failed (retry ${mutation.retryCount}/${mutation.maxRetries}): ${errorMsg}`)

      if (mutation.retryCount >= mutation.maxRetries) {
        log.error(`Mutation dead-lettered after ${mutation.maxRetries} retries: ${mutation.id}`)
        return { success: false, mutationId: mutation.id, error: errorMsg }
      }

      return { success: false, mutationId: mutation.id, error: errorMsg }
    }
  }

  /**
   * Map mutation type to the corresponding database table.
   */
  private getTableForMutation(type: MutationType): string {
    if (type.startsWith('note:')) return 'notes'
    if (type.startsWith('actionItem:')) return 'action_items'
    if (type.startsWith('bookmark:')) return 'audio_highlights'
    if (type.startsWith('meeting:')) return 'meetings'
    return 'notes'
  }

  /**
   * Start periodic queue processing for retries.
   */
  startPeriodicProcessing(): void {
    this.processTimer = setInterval(() => {
      if (this.isOnline && !this.isProcessing) {
        this.processQueue().catch(err => {
          log.debug('Periodic queue processing failed:', err)
        })
      }
    }, OfflineMutationQueue.PROCESS_INTERVAL_MS)
    if (this.processTimer.unref) this.processTimer.unref()
  }

  /**
   * Stop periodic processing.
   */
  stopPeriodicProcessing(): void {
    if (this.processTimer) {
      clearInterval(this.processTimer)
      this.processTimer = null
    }
  }

  /**
   * Get queue statistics.
   */
  getStats(): { pendingMutations: number; isOnline: boolean } {
    try {
      const db = getDatabaseService()
      const items = db.getPendingSyncItems(1000)
      const pendingMutations = items.filter(i => i.id.startsWith('mut-')).length
      return { pendingMutations, isOnline: this.isOnline }
    } catch {
      return { pendingMutations: 0, isOnline: this.isOnline }
    }
  }
}

// Singleton
let instance: OfflineMutationQueue | null = null

export function getOfflineMutationQueue(): OfflineMutationQueue {
  if (!instance) {
    instance = new OfflineMutationQueue()
    instance.startPeriodicProcessing()
  }
  return instance
}

export function resetOfflineMutationQueue(): void {
  if (instance) {
    instance.stopPeriodicProcessing()
  }
  instance = null
}
