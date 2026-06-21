/**
 * NotificationService — Meeting reminders & action item deadline alerts
 *
 * Schedules and delivers native macOS notifications for upcoming meetings
 * and overdue action items. Uses Electron's Notification API.
 */

import { Notification } from 'electron'
import { Logger } from './Logger'
import { getDatabaseService } from './DatabaseService'
import { v4 as uuidv4 } from 'uuid'

const log = Logger.create('NotificationService')

export type NotificationType =
  | 'meeting_reminder'
  | 'action_item_deadline'
  | 'action_item_overdue'
  | 'meeting_summary_ready'

export interface ScheduledNotification {
  id: string
  type: NotificationType
  title: string
  message: string
  meetingId?: string
  actionItemId?: string
  scheduledFor: number
  deliveredAt: number | null
  dismissedAt: number | null
}

export class NotificationService {
  private checkTimer: ReturnType<typeof setInterval> | null = null
  private static readonly CHECK_INTERVAL_MS = 60_000 // Every minute

  /**
   * Schedule a meeting reminder notification.
   * startTime is in milliseconds (Date.now() compatible).
   */
  async scheduleMeetingReminder(
    meetingId: string,
    meetingTitle: string,
    startTime: number,
    remindBeforeMs: number = 5 * 60_000
  ): Promise<string> {
    const id = uuidv4()
    const scheduledFor = startTime - remindBeforeMs

    if (scheduledFor <= Date.now()) return id // Already past

    this.persistNotification({
      id,
      type: 'meeting_reminder',
      title: `Meeting: ${meetingTitle}`,
      message: `Starting in ${Math.round(remindBeforeMs / 60_000)} minutes`,
      meetingId,
      scheduledFor,
      deliveredAt: null,
      dismissedAt: null,
    })

    log.info(
      `Scheduled reminder for meeting "${meetingTitle}" at ${new Date(scheduledFor).toLocaleTimeString()}`
    )
    return id
  }

  /**
   * Schedule an action item deadline alert.
   * deadline is in milliseconds (Date.now() compatible).
   */
  async scheduleActionItemDeadline(
    actionItemId: string,
    text: string,
    deadline: number
  ): Promise<string> {
    const id = uuidv4()
    const remindBeforeMs = 60 * 60_000 // 1 hour before
    const scheduledFor = deadline - remindBeforeMs

    if (scheduledFor <= Date.now()) return id // Already past or due within the hour

    this.persistNotification({
      id,
      type: 'action_item_deadline',
      title: 'Action Item Due Soon',
      message: text,
      actionItemId,
      scheduledFor,
      deliveredAt: null,
      dismissedAt: null,
    })

    return id
  }

  /**
   * Check for overdue action items and send alerts.
   */
  async checkOverdueActionItems(): Promise<number> {
    try {
      const db = getDatabaseService().getDb()
      const now = Math.floor(Date.now() / 1000)
      const overdue = db
        .prepare(
          `SELECT * FROM action_items WHERE status != 'completed' AND deadline IS NOT NULL AND deadline < ?`
        )
        .all(now) as Array<{ id: string; text: string; deadline: number }>

      let sent = 0
      for (const item of overdue) {
        const alreadyNotified = db
          .prepare(
            `SELECT COUNT(*) as cnt FROM notifications WHERE action_item_id = ? AND type = 'action_item_overdue' AND delivered_at IS NOT NULL`
          )
          .get(item.id) as { cnt: number }

        if (alreadyNotified.cnt > 0) continue

        this.persistNotification({
          id: uuidv4(),
          type: 'action_item_overdue',
          title: 'Overdue Action Item',
          message: item.text,
          actionItemId: item.id,
          scheduledFor: Date.now(),
          deliveredAt: Date.now(),
          dismissedAt: null,
        })

        this.deliverNativeNotification('Overdue Action Item', item.text)
        sent++
      }

      return sent
    } catch (err) {
      log.warn('Failed to check overdue action items:', err)
      return 0
    }
  }

  /**
   * Start the periodic notification checker.
   */
  startPeriodicCheck(): void {
    this.checkTimer = setInterval(() => {
      this.processPendingNotifications()
      this.checkOverdueActionItems()
    }, NotificationService.CHECK_INTERVAL_MS)
    if (this.checkTimer.unref) this.checkTimer.unref()
    log.info('Notification checker started')
  }

  stopPeriodicCheck(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer)
      this.checkTimer = null
    }
  }

  /**
   * Dismiss a notification.
   */
  dismissNotification(notificationId: string): void {
    try {
      const db = getDatabaseService().getDb()
      db.prepare('UPDATE notifications SET dismissed_at = ? WHERE id = ?').run(
        Date.now(),
        notificationId
      )
    } catch {
      /* non-critical */
    }
  }

  /**
   * Get pending notifications.
   */
  getPendingNotifications(): ScheduledNotification[] {
    try {
      const db = getDatabaseService().getDb()
      return db
        .prepare(
          `SELECT * FROM notifications WHERE delivered_at IS NULL AND dismissed_at IS NULL AND scheduled_for <= ? ORDER BY scheduled_for ASC`
        )
        .all(Date.now()) as ScheduledNotification[]
    } catch {
      return []
    }
  }

  // ── Private ──

  private processPendingNotifications(): void {
    const pending = this.getPendingNotifications()
    for (const notif of pending) {
      this.deliverNativeNotification(notif.title, notif.message)
      try {
        const db = getDatabaseService().getDb()
        db.prepare('UPDATE notifications SET delivered_at = ? WHERE id = ?').run(
          Date.now(),
          notif.id
        )
      } catch {
        /* non-critical */
      }
    }
  }

  private deliverNativeNotification(title: string, body: string): void {
    try {
      const notification = new Notification({ title, body, silent: false })
      notification.show()
    } catch (err) {
      log.debug('Failed to show native notification:', err)
    }
  }

  private persistNotification(notif: ScheduledNotification): void {
    try {
      const db = getDatabaseService().getDb()
      db.prepare(
        `INSERT OR REPLACE INTO notifications (id, type, title, message, meeting_id, action_item_id, scheduled_for, delivered_at, dismissed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        notif.id,
        notif.type,
        notif.title,
        notif.message,
        notif.meetingId || null,
        notif.actionItemId || null,
        notif.scheduledFor,
        notif.deliveredAt,
        notif.dismissedAt
      )
    } catch (err) {
      log.warn('Failed to persist notification:', err)
    }
  }
}

let instance: NotificationService | null = null

export function getNotificationService(): NotificationService {
  if (!instance) instance = new NotificationService()
  return instance
}
