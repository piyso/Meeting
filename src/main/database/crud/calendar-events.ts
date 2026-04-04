/**
 * CRUD Operations for Calendar Events Table
 *
 * Uses INSERT OR REPLACE on (provider, external_id) UNIQUE constraint
 * for idempotent calendar sync.
 */

import { getDatabase } from '../connection'
import type { CalendarEvent, UpsertCalendarEventInput } from '../../../types/features'
import { v4 as uuidv4 } from 'uuid'

/**
 * Upsert a calendar event.
 * Uses INSERT OR REPLACE to handle re-syncs idempotently.
 * The UNIQUE index on (provider, external_id) drives the conflict.
 */
export function upsertCalendarEvent(input: UpsertCalendarEventInput): CalendarEvent {
  const db = getDatabase()
  const id = input.id || uuidv4()
  const now = Math.floor(Date.now() / 1000)

  db.prepare(
    `INSERT INTO calendar_events
       (id, provider, external_id, title, description, location, start_time, end_time, attendees, meeting_id, organizer, is_all_day, created_at, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(provider, external_id) DO UPDATE SET
       title = excluded.title,
       description = excluded.description,
       location = excluded.location,
       start_time = excluded.start_time,
       end_time = excluded.end_time,
       attendees = excluded.attendees,
       organizer = excluded.organizer,
       is_all_day = excluded.is_all_day,
       synced_at = excluded.synced_at`
  ).run(
    id,
    input.provider,
    input.external_id,
    input.title,
    input.description ?? null,
    input.location ?? null,
    input.start_time,
    input.end_time,
    input.attendees ?? null,
    input.meeting_id ?? null,
    input.organizer ?? null,
    input.is_all_day ?? 0,
    now,
    now
  )

  // Read back (may have been updated, not inserted)
  const event = db
    .prepare('SELECT * FROM calendar_events WHERE provider = ? AND external_id = ?')
    .get(input.provider, input.external_id) as CalendarEvent

  return event
}

/**
 * Get calendar events within a time range
 */
export function getCalendarEventsByTimeRange(startSec: number, endSec: number): CalendarEvent[] {
  const db = getDatabase()
  return db
    .prepare(
      `SELECT * FROM calendar_events
       WHERE start_time >= ? AND start_time <= ?
       ORDER BY start_time ASC`
    )
    .all(startSec, endSec) as CalendarEvent[]
}

/**
 * Link a calendar event to a meeting
 */
export function linkCalendarToMeeting(eventId: string, meetingId: string): void {
  const db = getDatabase()
  db.prepare('UPDATE calendar_events SET meeting_id = ? WHERE id = ?').run(meetingId, eventId)
}

/**
 * Get calendar event linked to a meeting
 */
export function getCalendarEventByMeeting(meetingId: string): CalendarEvent | null {
  const db = getDatabase()
  return db
    .prepare('SELECT * FROM calendar_events WHERE meeting_id = ?')
    .get(meetingId) as CalendarEvent | null
}

/**
 * Delete all calendar events from a specific provider (for re-sync)
 */
export function deleteCalendarEventsByProvider(provider: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM calendar_events WHERE provider = ?').run(provider)
}

/**
 * Get upcoming calendar events (next 24 hours)
 */
export function getUpcomingEvents(withinSeconds: number = 86400): CalendarEvent[] {
  const db = getDatabase()
  const now = Math.floor(Date.now() / 1000)
  return db
    .prepare(
      `SELECT * FROM calendar_events
       WHERE start_time > ? AND start_time <= ?
       ORDER BY start_time ASC`
    )
    .all(now, now + withinSeconds) as CalendarEvent[]
}

/**
 * Find calendar events that overlap with a meeting's time range.
 * Used for auto-linking: finds events within ±15 min of meeting start.
 */
export function findOverlappingEvents(
  meetingStartSec: number,
  windowSec: number = 900
): CalendarEvent[] {
  const db = getDatabase()
  return db
    .prepare(
      `SELECT * FROM calendar_events
       WHERE start_time BETWEEN ? AND ?
       ORDER BY ABS(start_time - ?) ASC`
    )
    .all(
      meetingStartSec - windowSec,
      meetingStartSec + windowSec,
      meetingStartSec
    ) as CalendarEvent[]
}
