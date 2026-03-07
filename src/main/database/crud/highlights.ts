/**
 * Audio Highlights CRUD — Bookmark moments during meetings
 *
 * Uses the `audio_highlights` table (created in migration 002).
 * Each highlight marks a time range within a meeting as important.
 */

import { v4 as uuid } from 'uuid'
import { getDatabase } from '../connection'
import { Logger } from '../../services/Logger'

const log = Logger.create('HighlightsCRUD')

export interface Highlight {
  id: string
  meeting_id: string
  start_time: number
  end_time: number
  label: string | null
  color: string
  created_at: number
}

/**
 * Create a new highlight (bookmark) for a meeting
 */
export function createHighlight(params: {
  meetingId: string
  startTime: number
  endTime: number
  label?: string
  color?: string
}): Highlight {
  const db = getDatabase()
  const id = uuid()
  const { meetingId, startTime, endTime, label, color } = params

  if (!meetingId) throw new Error('meetingId is required')
  if (startTime < 0 || endTime < 0) throw new Error('Times must be non-negative')
  if (endTime <= startTime) throw new Error('endTime must be greater than startTime')

  const stmt = db.prepare(`
    INSERT INTO audio_highlights (id, meeting_id, start_time, end_time, label, color)
    VALUES (?, ?, ?, ?, ?, ?)
  `)

  stmt.run(id, meetingId, startTime, endTime, label || null, color || '#7c3aed')

  log.info('Created highlight', { id, meetingId, startTime, endTime })

  return {
    id,
    meeting_id: meetingId,
    start_time: startTime,
    end_time: endTime,
    label: label || null,
    color: color || '#7c3aed',
    created_at: Math.floor(Date.now() / 1000),
  }
}

/**
 * Get all highlights for a meeting, ordered by start time
 */
export function getHighlights(meetingId: string): Highlight[] {
  const db = getDatabase()

  if (!meetingId) return []

  const stmt = db.prepare(`
    SELECT id, meeting_id, start_time, end_time, label, color, created_at
    FROM audio_highlights
    WHERE meeting_id = ?
    ORDER BY start_time ASC
  `)

  return stmt.all(meetingId) as Highlight[]
}

/**
 * Delete a highlight by ID
 */
export function deleteHighlight(id: string): boolean {
  const db = getDatabase()

  if (!id) throw new Error('id is required')

  const result = db.prepare('DELETE FROM audio_highlights WHERE id = ?').run(id)

  if (result.changes > 0) {
    log.info('Deleted highlight', { id })
    return true
  }

  return false
}
