/**
 * CRUD Operations for Meetings Table
 */

import { getDatabase } from '../connection'
import type { Meeting, CreateMeetingInput, UpdateMeetingInput } from '../../../types/database'

/**
 * Create a new meeting
 */
export function createMeeting(input: CreateMeetingInput): Meeting {
  const db = getDatabase()

  const stmt = db.prepare(`
    INSERT INTO meetings (
      id, title, start_time, end_time, duration, participant_count, 
      tags, namespace, performance_tier
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  stmt.run(
    input.id,
    input.title || null,
    input.start_time,
    input.end_time || null,
    input.duration || null,
    input.participant_count || null,
    input.tags ? JSON.stringify(input.tags) : null,
    input.namespace || 'default',
    input.performance_tier || null
  )

  return getMeetingById(input.id)!
}

/**
 * Get meeting by ID
 */
export function getMeetingById(id: string): Meeting | null {
  const db = getDatabase()

  const stmt = db.prepare('SELECT * FROM meetings WHERE id = ?')
  return stmt.get(id) as Meeting | null
}

/**
 * Get all meetings
 */
export function getAllMeetings(options?: {
  limit?: number
  offset?: number
  orderBy?: 'start_time' | 'created_at'
  order?: 'ASC' | 'DESC'
}): Meeting[] {
  const db = getDatabase()

  const orderBy = options?.orderBy || 'start_time'
  const order = options?.order || 'DESC'
  const limit = options?.limit || 100
  const offset = options?.offset || 0

  const stmt = db.prepare(`
    SELECT * FROM meetings 
    ORDER BY ${orderBy} ${order}
    LIMIT ? OFFSET ?
  `)

  return stmt.all(limit, offset) as Meeting[]
}

/**
 * Get meetings by namespace
 */
export function getMeetingsByNamespace(namespace: string): Meeting[] {
  const db = getDatabase()

  const stmt = db.prepare(`
    SELECT * FROM meetings 
    WHERE namespace = ?
    ORDER BY start_time DESC
  `)

  return stmt.all(namespace) as Meeting[]
}

/**
 * Get meetings by date range
 */
export function getMeetingsByDateRange(startTime: number, endTime: number): Meeting[] {
  const db = getDatabase()

  const stmt = db.prepare(`
    SELECT * FROM meetings 
    WHERE start_time >= ? AND start_time <= ?
    ORDER BY start_time DESC
  `)

  return stmt.all(startTime, endTime) as Meeting[]
}

/**
 * Update meeting
 */
export function updateMeeting(id: string, input: UpdateMeetingInput): Meeting | null {
  const db = getDatabase()

  const updates: string[] = []
  const values: unknown[] = []

  if (input.title !== undefined) {
    updates.push('title = ?')
    values.push(input.title)
  }

  if (input.end_time !== undefined) {
    updates.push('end_time = ?')
    values.push(input.end_time)
  }

  if (input.duration !== undefined) {
    updates.push('duration = ?')
    values.push(input.duration)
  }

  if (input.participant_count !== undefined) {
    updates.push('participant_count = ?')
    values.push(input.participant_count)
  }

  if (input.tags !== undefined) {
    updates.push('tags = ?')
    values.push(JSON.stringify(input.tags))
  }

  if (input.performance_tier !== undefined) {
    updates.push('performance_tier = ?')
    values.push(input.performance_tier)
  }

  if (updates.length === 0) {
    return getMeetingById(id)
  }

  values.push(id)

  const stmt = db.prepare(`
    UPDATE meetings 
    SET ${updates.join(', ')}
    WHERE id = ?
  `)

  stmt.run(...values)

  return getMeetingById(id)
}

/**
 * Delete meeting (cascades to transcripts, notes, entities)
 */
export function deleteMeeting(id: string): boolean {
  const db = getDatabase()

  const stmt = db.prepare('DELETE FROM meetings WHERE id = ?')
  const result = stmt.run(id)

  return result.changes > 0
}

/**
 * Mark meeting as synced
 */
export function markMeetingSynced(id: string): void {
  const db = getDatabase()

  const stmt = db.prepare(`
    UPDATE meetings 
    SET synced_at = strftime('%s', 'now')
    WHERE id = ?
  `)

  stmt.run(id)
}

/**
 * Get meeting count
 */
export function getMeetingCount(): number {
  const db = getDatabase()

  const stmt = db.prepare('SELECT COUNT(*) as count FROM meetings')
  const result = stmt.get() as { count: number }

  return result.count
}

/**
 * Get total meeting duration
 */
export function getTotalMeetingDuration(): number {
  const db = getDatabase()

  const stmt = db.prepare('SELECT SUM(duration) as total FROM meetings WHERE duration IS NOT NULL')
  const result = stmt.get() as { total: number | null }

  return result.total || 0
}
