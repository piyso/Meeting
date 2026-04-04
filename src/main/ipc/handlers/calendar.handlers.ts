/**
 * Calendar IPC Handlers
 *
 * 5 handlers for calendar operations.
 * Calendar sync is cloud-gated (Starter+ tier).
 */

import { ipcMain, BrowserWindow } from 'electron'
import { Logger } from '../../services/Logger'
import {
  syncCalendar,
  autoLinkMeeting,
  getPreContext,
  getUpcomingNotifications,
} from '../../services/CalendarService'
import { getCalendarEventsByTimeRange } from '../../database/crud/calendar-events'
import type { IPCResponse } from '../../../types/ipc'
import type { CalendarProvider } from '../../../types/features'

const log = Logger.create('CalendarHandlers')

/**
 * Register all calendar IPC handlers
 */
export function registerCalendarHandlers(): void {
  // calendar:sync — Sync calendar events from a provider
  ipcMain.handle('calendar:sync', async (_, params: { provider: string }): Promise<IPCResponse> => {
    try {
      // Apple ICS is local-only (free for all tiers)
      // Google Calendar requires Starter+ (cloud access)
      if (params.provider === 'google') {
        try {
          const { getCloudAccessManager } = await import('../../services/CloudAccessManager')
          const cam = getCloudAccessManager()
          const features = await cam.getFeatureAccess()
          if (!features.calendarSync) {
            return {
              success: false,
              error: {
                code: 'TIER_RESTRICTED',
                message: 'Google Calendar sync requires Starter plan or higher',
                timestamp: Date.now(),
              },
            }
          }
        } catch {
          // CloudAccessManager not initialized — block Google (requires cloud)
          return {
            success: false,
            error: {
              code: 'TIER_RESTRICTED',
              message: 'Google Calendar sync requires cloud access',
              timestamp: Date.now(),
            },
          }
        }
      }

      const synced = await syncCalendar(params.provider as CalendarProvider)
      return { success: true, data: { synced } }
    } catch (error) {
      log.error('calendar:sync failed', error)
      return {
        success: false,
        error: {
          code: 'CALENDAR_SYNC_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // calendar:list — List calendar events in a time range
  ipcMain.handle(
    'calendar:list',
    async (_, params: { start: number; end: number }): Promise<IPCResponse> => {
      try {
        const events = getCalendarEventsByTimeRange(params.start, params.end)
        return { success: true, data: events }
      } catch (error) {
        log.error('calendar:list failed', error)
        return {
          success: false,
          error: {
            code: 'CALENDAR_LIST_FAILED',
            message: (error as Error).message,
            timestamp: Date.now(),
          },
        }
      }
    }
  )

  // calendar:link — Manually link a calendar event to a meeting
  ipcMain.handle(
    'calendar:link',
    async (_, params: { eventId: string; meetingId: string }): Promise<IPCResponse> => {
      try {
        const { linkCalendarToMeeting } = await import('../../database/crud/calendar-events')
        linkCalendarToMeeting(params.eventId, params.meetingId)
        return { success: true, data: undefined }
      } catch (error) {
        log.error('calendar:link failed', error)
        return {
          success: false,
          error: {
            code: 'CALENDAR_LINK_FAILED',
            message: (error as Error).message,
            timestamp: Date.now(),
          },
        }
      }
    }
  )

  // calendar:autoLink — Auto-link a meeting to the best matching event
  ipcMain.handle(
    'calendar:autoLink',
    async (_, params: { meetingId: string }): Promise<IPCResponse> => {
      try {
        // Get meeting start time
        const { getMeetingById } = await import('../../database/crud/meetings')
        const meeting = getMeetingById(params.meetingId)
        if (!meeting) {
          return {
            success: false,
            error: {
              code: 'MEETING_NOT_FOUND',
              message: 'Meeting not found',
              timestamp: Date.now(),
            },
          }
        }

        const linkedEvent = autoLinkMeeting(params.meetingId, meeting.start_time)
        return { success: true, data: linkedEvent }
      } catch (error) {
        log.error('calendar:autoLink failed', error)
        return {
          success: false,
          error: {
            code: 'CALENDAR_AUTOLINK_FAILED',
            message: (error as Error).message,
            timestamp: Date.now(),
          },
        }
      }
    }
  )

  // calendar:getPreContext — Get pre-meeting AI context (Pro+ only)
  ipcMain.handle(
    'calendar:getPreContext',
    async (_, params: { eventId: string }): Promise<IPCResponse> => {
      try {
        // Tier gate — Pro+ only
        try {
          const { getCloudAccessManager } = await import('../../services/CloudAccessManager')
          const cam = getCloudAccessManager()
          const features = await cam.getFeatureAccess()
          if (!features.cloudAI) {
            return {
              success: false,
              error: {
                code: 'TIER_RESTRICTED',
                message: 'Pre-meeting AI context requires Pro plan or higher',
                timestamp: Date.now(),
              },
            }
          }
        } catch {
          // CloudAccessManager not available — block (requires cloud)
          return {
            success: false,
            error: {
              code: 'TIER_RESTRICTED',
              message: 'Pre-meeting AI context requires cloud access',
              timestamp: Date.now(),
            },
          }
        }

        const context = await getPreContext(params.eventId)
        return { success: true, data: { context } }
      } catch (error) {
        log.error('calendar:getPreContext failed', error)
        return {
          success: false,
          error: {
            code: 'CALENDAR_CONTEXT_FAILED',
            message: (error as Error).message,
            timestamp: Date.now(),
          },
        }
      }
    }
  )

  // Track already-notified events to prevent duplicate alerts
  const notifiedEventIds = new Set<string>()

  // Set up periodic upcoming event notifications (every 5 minutes)
  setInterval(
    () => {
      try {
        const upcoming = getUpcomingNotifications(15)
        if (upcoming.length > 0) {
          const mainWindow = BrowserWindow.getAllWindows().find(
            w => !w.isDestroyed() && w.getBounds().width > 400
          )
          if (mainWindow) {
            for (const event of upcoming) {
              // Skip if we already sent a notification for this event
              if (notifiedEventIds.has(event.id)) continue
              notifiedEventIds.add(event.id)

              const minutesUntil = Math.round(
                (event.start_time - Math.floor(Date.now() / 1000)) / 60
              )
              mainWindow.webContents.send('event:calendarEventSoon', {
                event,
                minutesUntil,
              })
            }
          }
        }

        // Prune stale notification IDs to prevent unbounded growth
        if (notifiedEventIds.size > 100) {
          notifiedEventIds.clear()
        }
      } catch {
        // Non-critical
      }
    },
    5 * 60 * 1000
  )

  log.info('Calendar handlers registered')
}
