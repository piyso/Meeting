/**
 * CRUD Operations for Sync Queue Table
 */

import { getDatabase } from '../connection'
import type { SyncQueueItem, CreateSyncQueueInput, OperationType } from '../../../types/database'

/**
 * Allowed table names for sync operations (SQL injection protection)
 */
const ALLOWED_TABLES = [
  'meetings',
  'transcripts',
  'notes',
  'entities',
  'audio_highlights',
  // P1-7 FIX: Must match SyncManager.ALLOWED_TABLES — these 4 were missing,
  // causing validateTableName() to throw if CRUD files enqueued sync events.
  'action_items',
  'sentiment_scores',
  'calendar_events',
  'webhooks',
]

/**
 * Validate table name against whitelist
 */
function validateTableName(tableName: string): void {
  if (!ALLOWED_TABLES.includes(tableName)) {
    throw new Error(
      `Invalid table name: ${tableName}. Allowed tables: ${ALLOWED_TABLES.join(', ')}`
    )
  }
}

/**
 * Queue rows a sync pass has read and is uploading right now. Coalescing must
 * leave these alone: the pass deletes them by id when the upload succeeds, so
 * folding a newer payload into one would silently discard that newer payload.
 */
const inFlightIds = new Set<string>()

export function markSyncItemsInFlight(ids: string[]): void {
  for (const id of ids) inFlightIds.add(id)
}

export function clearSyncItemsInFlight(): void {
  inFlightIds.clear()
}

/**
 * Create a new sync queue item
 *
 * The queue is coalesced as it is written, because it is also written while
 * nobody is signed in (so nothing drains it) and the note editor saves the
 * whole document every 1.5s of typing:
 *
 *  - update: if an update for the same record is already waiting, its payload
 *    is replaced instead of adding another full copy of the record.
 *  - delete: waiting creates/updates for the record are dropped; if the record
 *    was never uploaded at all, the delete itself is unnecessary.
 */
export function createSyncQueueItem(input: CreateSyncQueueInput): SyncQueueItem {
  validateTableName(input.table_name)

  const db = getDatabase()

  const payloadStr = input.payload ? JSON.stringify(input.payload) : null
  const now = Math.floor(Date.now() / 1000)

  // Only rows that have never been attempted and are not being uploaded.
  const waiting = db
    .prepare(
      `SELECT id, operation_type FROM sync_queue
       WHERE table_name = ? AND record_id = ? AND last_attempt IS NULL
       ORDER BY created_at ASC`
    )
    .all(input.table_name, input.record_id) as Array<{ id: string; operation_type: string }>
  const idle = waiting.filter(row => !inFlightIds.has(row.id))
  // If anything for this record is mid-upload, queue normally — order matters.
  const safeToCoalesce = idle.length === waiting.length

  if (safeToCoalesce && input.operation_type === 'update') {
    // The newest waiting row (create or update) simply carries the new state.
    const target = idle[idle.length - 1]
    if (target && target.operation_type !== 'delete') {
      db.prepare('UPDATE sync_queue SET payload = ? WHERE id = ?').run(payloadStr, target.id)
      return {
        id: target.id,
        operation_type: target.operation_type as OperationType,
        table_name: input.table_name,
        record_id: input.record_id,
        payload: payloadStr,
        retry_count: 0,
        created_at: now,
        last_attempt: null,
      }
    }
  }

  if (safeToCoalesce && input.operation_type === 'delete' && idle.length > 0) {
    const neverUploaded = idle.some(row => row.operation_type === 'create')
    const drop = db.prepare('DELETE FROM sync_queue WHERE id = ?')
    for (const row of idle) {
      if (row.operation_type !== 'delete') drop.run(row.id)
    }
    if (neverUploaded) {
      // Created and deleted without ever reaching the cloud: nothing to sync.
      return {
        id: input.id,
        operation_type: input.operation_type,
        table_name: input.table_name,
        record_id: input.record_id,
        payload: payloadStr,
        retry_count: 0,
        created_at: now,
        last_attempt: null,
      }
    }
  }

  const stmt = db.prepare(`
    INSERT INTO sync_queue (
      id, operation_type, table_name, record_id, payload
    ) VALUES (?, ?, ?, ?, ?)
  `)

  stmt.run(input.id, input.operation_type, input.table_name, input.record_id, payloadStr)

  // Return constructed object directly instead of reading back from DB.
  // All fields are known from the input — the extra SELECT was unnecessary
  // and expensive when called in bulk loops (entity sync, etc.)
  return {
    id: input.id,
    operation_type: input.operation_type,
    table_name: input.table_name,
    record_id: input.record_id,
    payload: payloadStr,
    retry_count: 0,
    created_at: Math.floor(Date.now() / 1000),
    last_attempt: null,
  }
}

/**
 * Get sync queue item by ID
 */
export function getSyncQueueItemById(id: string): SyncQueueItem | null {
  const db = getDatabase()

  const stmt = db.prepare('SELECT * FROM sync_queue WHERE id = ?')
  return stmt.get(id) as SyncQueueItem | null
}

/**
 * Get all pending sync items
 * Items with retry_count < max_retries, ordered by created_at
 */
export function getPendingSyncItems(limit: number = 50): SyncQueueItem[] {
  const db = getDatabase()

  const stmt = db.prepare(`
    SELECT * FROM sync_queue 
    WHERE last_attempt IS NULL OR retry_count < 100
    ORDER BY created_at ASC, rowid ASC
    LIMIT ?
  `)

  return stmt.all(limit) as SyncQueueItem[]
}

/**
 * Get sync items by operation type
 */
export function getSyncItemsByOperation(operationType: OperationType): SyncQueueItem[] {
  const db = getDatabase()

  const stmt = db.prepare(`
    SELECT * FROM sync_queue 
    WHERE operation_type = ?
    ORDER BY created_at ASC
  `)

  return stmt.all(operationType) as SyncQueueItem[]
}

/**
 * Get sync items by table name
 */
export function getSyncItemsByTable(tableName: string): SyncQueueItem[] {
  validateTableName(tableName)

  const db = getDatabase()

  const stmt = db.prepare(`
    SELECT * FROM sync_queue 
    WHERE table_name = ?
    ORDER BY created_at ASC
  `)

  return stmt.all(tableName) as SyncQueueItem[]
}

/**
 * Update sync item retry count and last attempt
 */
export function incrementSyncRetry(id: string): void {
  const db = getDatabase()

  const stmt = db.prepare(`
    UPDATE sync_queue 
    SET retry_count = retry_count + 1,
        last_attempt = strftime('%s', 'now')
    WHERE id = ?
  `)

  stmt.run(id)
}

/** retry_count at which an item is treated as failed (see getPendingSyncItems). */
const FAILED_RETRY_COUNT = 100

/**
 * Park an item that can never sync: it stops being picked up by
 * getPendingSyncItems() but stays listed by getFailedSyncItems().
 */
export function parkSyncQueueItem(id: string): void {
  const db = getDatabase()

  db.prepare(
    `
    UPDATE sync_queue
    SET retry_count = MAX(retry_count, ?),
        last_attempt = strftime('%s', 'now')
    WHERE id = ?
  `
  ).run(FAILED_RETRY_COUNT, id)
}

/** How many items are parked as failed (see parkSyncQueueItem). */
export function getFailedSyncCount(): number {
  const db = getDatabase()
  const row = db
    .prepare('SELECT COUNT(*) as count FROM sync_queue WHERE retry_count >= ?')
    .get(FAILED_RETRY_COUNT) as { count: number }
  return row.count
}

/**
 * Put every parked item back in the pending set with a clean slate.
 * Returns how many were revived.
 */
export function resetFailedSyncItems(): number {
  const db = getDatabase()
  return db
    .prepare('UPDATE sync_queue SET retry_count = 0, last_attempt = NULL WHERE retry_count >= ?')
    .run(FAILED_RETRY_COUNT).changes
}

/**
 * Delete sync queue item (after successful sync)
 */
export function deleteSyncQueueItem(id: string): boolean {
  const db = getDatabase()

  const stmt = db.prepare('DELETE FROM sync_queue WHERE id = ?')
  const result = stmt.run(id)

  return result.changes > 0
}

/**
 * Delete multiple sync queue items in a transaction
 */
export function deleteSyncQueueItems(ids: string[]): number {
  const db = getDatabase()

  const deleteMany = db.transaction((itemIds: string[]) => {
    const stmt = db.prepare('DELETE FROM sync_queue WHERE id = ?')
    let totalChanges = 0

    for (const id of itemIds) {
      const result = stmt.run(id)
      totalChanges += result.changes
    }

    return totalChanges
  })

  return deleteMany(ids)
}

/**
 * Get sync queue count
 */
export function getSyncQueueCount(): number {
  const db = getDatabase()

  const stmt = db.prepare('SELECT COUNT(*) as count FROM sync_queue')
  const result = stmt.get() as { count: number }

  return result.count
}

/**
 * Get pending sync count
 */
export function getPendingSyncCount(): number {
  const db = getDatabase()

  const stmt = db.prepare(`
    SELECT COUNT(*) as count FROM sync_queue 
    WHERE last_attempt IS NULL OR retry_count < 100
  `)
  const result = stmt.get() as { count: number }

  return result.count
}

/**
 * Get failed sync items (retry_count >= 100)
 */
export function getFailedSyncItems(): SyncQueueItem[] {
  const db = getDatabase()

  const stmt = db.prepare(`
    SELECT * FROM sync_queue 
    WHERE retry_count >= 100
    ORDER BY created_at ASC
  `)

  return stmt.all() as SyncQueueItem[]
}

/**
 * Clear all sync queue items
 * WARNING: Use with caution
 */
export function clearSyncQueue(): number {
  const db = getDatabase()

  const stmt = db.prepare('DELETE FROM sync_queue')
  const result = stmt.run()

  return result.changes
}

/**
 * Clear failed sync items only
 */
export function clearFailedSyncItems(): number {
  const db = getDatabase()

  const stmt = db.prepare('DELETE FROM sync_queue WHERE retry_count >= 100')
  const result = stmt.run()

  return result.changes
}
