/**
 * CRUD Operations for Sync Queue Table
 */

import { getDatabase } from '../connection'
import type { SyncQueueItem, CreateSyncQueueInput, OperationType } from '../../../types/database'

/**
 * Allowed table names for sync operations (SQL injection protection)
 */
const ALLOWED_TABLES = ['meetings', 'transcripts', 'notes', 'entities']

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
 * Create a new sync queue item
 */
export function createSyncQueueItem(input: CreateSyncQueueInput): SyncQueueItem {
  validateTableName(input.table_name)

  const db = getDatabase()

  const stmt = db.prepare(`
    INSERT INTO sync_queue (
      id, operation_type, table_name, record_id, payload
    ) VALUES (?, ?, ?, ?, ?)
  `)

  stmt.run(
    input.id,
    input.operation_type,
    input.table_name,
    input.record_id,
    input.payload ? JSON.stringify(input.payload) : null
  )

  return getSyncQueueItemById(input.id)!
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
    WHERE last_attempt IS NULL OR retry_count < 10
    ORDER BY created_at ASC
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
    WHERE last_attempt IS NULL OR retry_count < 10
  `)
  const result = stmt.get() as { count: number }

  return result.count
}

/**
 * Get failed sync items (retry_count >= 10)
 */
export function getFailedSyncItems(): SyncQueueItem[] {
  const db = getDatabase()

  const stmt = db.prepare(`
    SELECT * FROM sync_queue 
    WHERE retry_count >= 10
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

  const stmt = db.prepare('DELETE FROM sync_queue WHERE retry_count >= 10')
  const result = stmt.run()

  return result.changes
}
