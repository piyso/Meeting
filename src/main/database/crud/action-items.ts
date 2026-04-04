/**
 * CRUD Operations for Action Items Table
 *
 * Uses INSERT OR IGNORE to match existing digest.handlers.ts behavior
 * (which writes action items with INSERT OR IGNORE at L384-404).
 */

import { getDatabase } from '../connection'
import type {
  ActionItem,
  CreateActionItemInput,
  UpdateActionItemInput,
} from '../../../types/features'
import { v4 as uuidv4 } from 'uuid'

/**
 * Create a new action item.
 * Uses INSERT OR IGNORE to handle duplicate IDs gracefully
 * (compatibility with digest.handlers.ts raw SQL path).
 */
export function createActionItem(input: CreateActionItemInput): ActionItem {
  const db = getDatabase()
  const id = input.id || uuidv4()

  db.prepare(
    `INSERT OR IGNORE INTO action_items (id, meeting_id, text, assignee, deadline, priority, status, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.meeting_id,
    input.text,
    input.assignee ?? null,
    input.deadline ?? null,
    input.priority || 'normal',
    input.status || 'open',
    input.source || 'manual',
    Math.floor(Date.now() / 1000)
  )

  const item = getActionItemById(id)
  if (!item) {
    // INSERT OR IGNORE swallowed a duplicate — return a stub so callers don't crash
    return {
      id,
      meeting_id: input.meeting_id,
      text: input.text,
      assignee: input.assignee ?? null,
      deadline: input.deadline ?? null,
      priority: input.priority || 'normal',
      status: input.status || 'open',
      source: input.source || 'manual',
      created_at: Math.floor(Date.now() / 1000),
      completed_at: null,
    }
  }
  return item
}

/**
 * Batch create action items (transaction-wrapped for atomicity)
 */
export function createActionItemsBatch(items: CreateActionItemInput[]): ActionItem[] {
  const db = getDatabase()
  const results: ActionItem[] = []

  const insertAll = db.transaction(() => {
    for (const input of items) {
      results.push(createActionItem(input))
    }
  })
  insertAll()
  return results
}

/**
 * Get action item by ID
 */
export function getActionItemById(id: string): ActionItem | null {
  const db = getDatabase()
  return db.prepare('SELECT * FROM action_items WHERE id = ?').get(id) as ActionItem | null
}

/**
 * Get all action items for a meeting
 */
export function getActionItemsByMeeting(meetingId: string): ActionItem[] {
  const db = getDatabase()
  return db
    .prepare('SELECT * FROM action_items WHERE meeting_id = ? ORDER BY created_at DESC')
    .all(meetingId) as ActionItem[]
}

/**
 * Get action items by status
 */
export function getActionItemsByStatus(status: string): ActionItem[] {
  const db = getDatabase()
  return db
    .prepare('SELECT * FROM action_items WHERE status = ? ORDER BY created_at DESC')
    .all(status) as ActionItem[]
}

/**
 * Get action items by assignee
 */
export function getActionItemsByAssignee(assignee: string): ActionItem[] {
  const db = getDatabase()
  return db
    .prepare('SELECT * FROM action_items WHERE assignee = ? ORDER BY created_at DESC')
    .all(assignee) as ActionItem[]
}

/**
 * Get all overdue action items.
 * An item is overdue if: status='open' AND deadline IS NOT NULL AND deadline < now()
 */
export function getOverdueActionItems(): ActionItem[] {
  const db = getDatabase()
  const now = Math.floor(Date.now() / 1000)
  return db
    .prepare(
      `SELECT * FROM action_items
       WHERE status = 'open' AND deadline IS NOT NULL AND deadline < ?
       ORDER BY deadline ASC`
    )
    .all(now) as ActionItem[]
}

/**
 * Update an action item
 */
export function updateActionItem(id: string, updates: UpdateActionItemInput): ActionItem {
  const db = getDatabase()
  const fields: string[] = []
  const values: unknown[] = []

  if (updates.text !== undefined) {
    fields.push('text = ?')
    values.push(updates.text)
  }
  if (updates.assignee !== undefined) {
    fields.push('assignee = ?')
    values.push(updates.assignee)
  }
  if (updates.deadline !== undefined) {
    fields.push('deadline = ?')
    values.push(updates.deadline)
  }
  if (updates.priority !== undefined) {
    fields.push('priority = ?')
    values.push(updates.priority)
  }
  if (updates.status !== undefined) {
    fields.push('status = ?')
    values.push(updates.status)
    // Auto-set completed_at when marking as completed
    if (updates.status === 'completed' && updates.completed_at === undefined) {
      fields.push('completed_at = ?')
      values.push(Math.floor(Date.now() / 1000))
    }
  }
  if (updates.completed_at !== undefined) {
    fields.push('completed_at = ?')
    values.push(updates.completed_at)
  }

  if (fields.length === 0) {
    const existing = getActionItemById(id)
    if (!existing) throw new Error(`Action item not found: ${id}`)
    return existing
  }

  values.push(id)
  db.prepare(`UPDATE action_items SET ${fields.join(', ')} WHERE id = ?`).run(...values)

  const updated = getActionItemById(id)
  if (!updated) throw new Error(`Action item not found after update: ${id}`)
  return updated
}

/**
 * Delete an action item
 */
export function deleteActionItem(id: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM action_items WHERE id = ?').run(id)
}

/**
 * Get aggregate stats across all action items
 */
export function getActionItemStats(): { open: number; completed: number; overdue: number } {
  const db = getDatabase()
  const now = Math.floor(Date.now() / 1000)
  const row = db
    .prepare(
      `SELECT
         SUM(CASE WHEN status = 'open' AND (deadline IS NULL OR deadline >= ?) THEN 1 ELSE 0 END) as open,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
         SUM(CASE WHEN status = 'open' AND deadline IS NOT NULL AND deadline < ? THEN 1 ELSE 0 END) as overdue
       FROM action_items`
    )
    .get(now, now) as { open: number; completed: number; overdue: number } | undefined

  return {
    open: row?.open || 0,
    completed: row?.completed || 0,
    overdue: row?.overdue || 0,
  }
}
