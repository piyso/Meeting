/**
 * Calendar Service
 *
 * Apple ICS (CalDAV) sync first, Google OAuth later.
 * Auto-links calendar events to meetings based on time proximity.
 */

import { Logger } from './Logger'
import type { CalendarEvent, CalendarProvider } from '../../types/features'
import {
  upsertCalendarEvent,
  getCalendarEventsByTimeRange,
  linkCalendarToMeeting,
  findOverlappingEvents,
} from '../database/crud/calendar-events'

const log = Logger.create('CalendarService')

// ─── Apple ICS Sync ─────────────────────────────────────────

/**
 * Parse an ICS (iCalendar) string into calendar events.
 * Handles VEVENT blocks with DTSTART, DTEND, SUMMARY, DESCRIPTION, LOCATION, ATTENDEE.
 */
export function parseICS(icsContent: string): Array<{
  uid: string
  title: string
  description: string | null
  location: string | null
  startTime: number
  endTime: number
  attendees: string[]
  organizer: string | null
  isAllDay: boolean
}> {
  const events: Array<{
    uid: string
    title: string
    description: string | null
    location: string | null
    startTime: number
    endTime: number
    attendees: string[]
    organizer: string | null
    isAllDay: boolean
  }> = []

  const blocks = icsContent.split('BEGIN:VEVENT')

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i]?.split('END:VEVENT')[0]
    if (!block) continue

    const uid = extractField(block, 'UID') || `ics-${Date.now()}-${i}`
    const summary = extractField(block, 'SUMMARY') || 'Untitled Event'
    const description = extractField(block, 'DESCRIPTION')
    const location = extractField(block, 'LOCATION')
    const organizer = extractField(block, 'ORGANIZER')

    const dtStart = extractField(block, 'DTSTART')
    const dtEnd = extractField(block, 'DTEND')

    if (!dtStart) continue

    const isAllDay = dtStart.length === 8 // YYYYMMDD format (no time)
    const startTime = parseICSDate(dtStart)
    const endTime = dtEnd ? parseICSDate(dtEnd) : startTime + 3600

    // Extract attendees
    const attendees: string[] = []
    const attendeeRegex = /ATTENDEE[^:]*:(?:mailto:)?(.+)/gi
    let match
    while ((match = attendeeRegex.exec(block)) !== null) {
      if (match[1]) attendees.push(match[1].trim())
    }

    events.push({
      uid,
      title: summary,
      description: description ? unescapeICS(description) : null,
      location,
      startTime,
      endTime,
      attendees,
      organizer: organizer ? organizer.replace(/^mailto:/i, '') : null,
      isAllDay,
    })
  }

  return events
}

/**
 * Extract a field value from an ICS block.
 */
function extractField(block: string, field: string): string | null {
  const regex = new RegExp(`${field}(?:;[^:]*)?:(.+)`, 'i')
  const match = block.match(regex)
  return match?.[1]?.trim() ?? null
}

/**
 * Parse an ICS datetime string to epoch seconds.
 * Supports: YYYYMMDD, YYYYMMDDTHHmmss, YYYYMMDDTHHmmssZ
 */
function parseICSDate(dt: string): number {
  const clean = dt.replace(/[^0-9T]/g, '')

  if (clean.length === 8) {
    const y = parseInt(clean.substring(0, 4))
    const m = parseInt(clean.substring(4, 6)) - 1
    const d = parseInt(clean.substring(6, 8))
    return Math.floor(new Date(y, m, d).getTime() / 1000)
  }

  if (clean.length >= 15) {
    const y = parseInt(clean.substring(0, 4))
    const m = parseInt(clean.substring(4, 6)) - 1
    const d = parseInt(clean.substring(6, 8))
    const h = parseInt(clean.substring(9, 11))
    const min = parseInt(clean.substring(11, 13))
    const s = parseInt(clean.substring(13, 15))

    if (dt.endsWith('Z')) {
      return Math.floor(Date.UTC(y, m, d, h, min, s) / 1000)
    }
    return Math.floor(new Date(y, m, d, h, min, s).getTime() / 1000)
  }

  return Math.floor(new Date(dt).getTime() / 1000) || Math.floor(Date.now() / 1000)
}

/**
 * Unescape ICS text (handles \\n, \\, etc.)
 */
function unescapeICS(text: string): string {
  return text.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\\\/g, '\\').replace(/\\;/g, ';')
}

/**
 * Sync Apple Calendar (ICS) events.
 */
export async function syncAppleCalendar(): Promise<number> {
  try {
    // Apple Calendar is macOS-only
    if (process.platform !== 'darwin') {
      log.debug('Apple Calendar sync skipped — not on macOS')
      return 0
    }

    const path = await import('path')
    const fs = await import('fs')
    const os = await import('os')

    const calDir = path.join(os.homedir(), 'Library', 'Calendars')
    if (!fs.existsSync(calDir)) {
      log.debug('Apple Calendar directory not found')
      return 0
    }

    let synced = 0

    const walkDir = (dir: string): string[] => {
      const files: string[] = []
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name)
          if (entry.isDirectory()) {
            files.push(...walkDir(fullPath))
          } else if (entry.name.endsWith('.ics')) {
            files.push(fullPath)
          }
        }
      } catch {
        // Permission denied
      }
      return files
    }

    const icsFiles = walkDir(calDir)
    log.info(`Found ${icsFiles.length} ICS files`)

    for (const file of icsFiles) {
      try {
        const content = fs.readFileSync(file, 'utf-8')
        const events = parseICS(content)

        for (const event of events) {
          const now = Math.floor(Date.now() / 1000)
          const thirtyDaysAgo = now - 30 * 86400
          const sixtyDaysAhead = now + 60 * 86400

          if (event.startTime < thirtyDaysAgo || event.startTime > sixtyDaysAhead) continue

          upsertCalendarEvent({
            provider: 'apple' as CalendarProvider,
            external_id: event.uid,
            title: event.title,
            description: event.description,
            location: event.location,
            start_time: event.startTime,
            end_time: event.endTime,
            attendees: event.attendees.length > 0 ? JSON.stringify(event.attendees) : null,
            organizer: event.organizer,
            is_all_day: event.isAllDay ? 1 : 0,
          })
          synced++
        }
      } catch (err) {
        log.debug(`Failed to parse ICS file ${file}:`, err)
      }
    }

    log.info(`Apple Calendar sync complete: ${synced} events`)
    return synced
  } catch (err) {
    log.error('Apple Calendar sync failed:', err)
    return 0
  }
}

// Google Calendar stub (pending OAuth verification)
export async function syncGoogleCalendar(): Promise<number> {
  log.warn('Google Calendar sync not yet implemented')
  return 0
}

// ─── Auto-Linking ───────────────────────────────────────────

/**
 * Auto-link a meeting to the best matching calendar event.
 */
export function autoLinkMeeting(meetingId: string, meetingStartSec: number): CalendarEvent | null {
  const overlapping = findOverlappingEvents(meetingStartSec, 900)
  if (overlapping.length === 0) return null

  const best = overlapping[0]
  if (!best) return null

  linkCalendarToMeeting(best.id, meetingId)
  log.info(`Auto-linked meeting ${meetingId} to calendar event "${best.title}"`)
  return best
}

/**
 * Get pre-meeting context from a calendar event.
 */
export async function getPreContext(eventId: string): Promise<string> {
  const db = await import('../database/connection')
  const database = db.getDatabase()

  const event = database
    .prepare('SELECT * FROM calendar_events WHERE id = ?')
    .get(eventId) as CalendarEvent | null

  if (!event) return ''

  let context = `# Pre-Meeting Context: ${event.title}\n\n`
  context += `**Time:** ${new Date(event.start_time * 1000).toLocaleString()}\n`
  if (event.location) context += `**Location:** ${event.location}\n`
  if (event.organizer) context += `**Organizer:** ${event.organizer}\n`

  if (event.attendees) {
    try {
      const attendees = JSON.parse(event.attendees) as string[]
      context += `**Attendees:** ${attendees.join(', ')}\n`
    } catch {
      context += `**Attendees:** ${event.attendees}\n`
    }
  }

  if (event.description) {
    context += `\n## Agenda\n${event.description}\n`
  }

  // Enrich from knowledge graph
  try {
    const { getBackend } = await import('./backend/BackendSingleton')
    const backend = getBackend()
    const health = await backend.healthCheck()
    if (health.status === 'healthy') {
      const answer = await backend.ask(`Past meetings with ${event.title} attendees`)
      if (answer?.answer) {
        context += `\n## Related Past Meetings\n${answer.answer}\n`
      }
    }
  } catch {
    // Not available
  }

  return context
}

/**
 * Sync calendar events from the given provider.
 */
export async function syncCalendar(provider: CalendarProvider): Promise<number> {
  switch (provider) {
    case 'apple':
      return syncAppleCalendar()
    case 'google':
      return syncGoogleCalendar()
    default:
      throw new Error(`Unknown calendar provider: ${provider}`)
  }
}

/**
 * Get upcoming events in a time window.
 */
export function getUpcomingNotifications(windowMinutes: number = 15): CalendarEvent[] {
  const now = Math.floor(Date.now() / 1000)
  const windowSec = windowMinutes * 60
  return getCalendarEventsByTimeRange(now, now + windowSec)
}
