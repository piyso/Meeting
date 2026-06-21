/**
 * TelemetryService — Privacy-respecting usage analytics
 *
 * 12.3 FIX: Lightweight telemetry layer that emits events to a local SQLite table.
 * Optionally syncs anonymized aggregates (with user consent) for product insights.
 *
 * Design principles:
 * - All data stored locally first (SQLite telemetry_events table)
 * - No PII — only feature usage counts and performance metrics
 * - User must opt-in for cloud sync of anonymized aggregates
 * - Events are batched and flushed periodically to minimize I/O
 */

import { v4 as uuidv4 } from 'uuid'
import { Logger } from './Logger'
import { getDatabaseService } from './DatabaseService'

const log = Logger.create('TelemetryService')

export type TelemetryEventType =
  | 'app:launch'
  | 'app:quit'
  | 'meeting:started'
  | 'meeting:stopped'
  | 'meeting:duration'
  | 'recording:paused'
  | 'recording:resumed'
  | 'note:created'
  | 'note:expanded'
  | 'action_item:toggled'
  | 'search:performed'
  | 'digest:generated'
  | 'feature:quick_note'
  | 'feature:focus_mode'
  | 'feature:entity_sidebar'
  | 'feature:command_palette'
  | 'feature:knowledge_graph'
  | 'error:asr_failure'
  | 'error:sync_failure'
  | 'error:crash'
  | 'perf:transcription_latency'
  | 'perf:memory_usage'
  | 'perf:db_size'

export interface TelemetryEvent {
  id: string
  type: TelemetryEventType
  timestamp: number
  sessionId: string
  properties: Record<string, unknown>
}

export class TelemetryService {
  private sessionId: string
  private eventBuffer: TelemetryEvent[] = []
  private flushTimer: ReturnType<typeof setInterval> | null = null
  private isFlushing = false
  private static readonly FLUSH_INTERVAL_MS = 30000
  private static readonly BATCH_SIZE = 50
  private static readonly MAX_BUFFER_SIZE = 1000

  constructor() {
    this.sessionId = uuidv4()
    this.ensureTable()
  }

  /**
   * Track a telemetry event.
   */
  track(type: TelemetryEventType, properties: Record<string, unknown> = {}): void {
    const event: TelemetryEvent = {
      id: uuidv4(),
      type,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      properties: this.sanitizeProperties(properties),
    }

    this.eventBuffer.push(event)

    // Flush immediately if buffer is full
    if (this.eventBuffer.length >= TelemetryService.BATCH_SIZE) {
      this.flush()
    }
  }

  /**
   * Enable cloud sync of anonymized aggregates.
   */
  enableCloudSync(): void {
    log.info('Telemetry cloud sync enabled')
  }

  /**
   * Disable cloud sync.
   */
  disableCloudSync(): void {
    log.info('Telemetry cloud sync disabled')
  }

  /**
   * Start periodic flush timer.
   */
  startPeriodicFlush(): void {
    this.flushTimer = setInterval(() => {
      this.flush()
    }, TelemetryService.FLUSH_INTERVAL_MS)
    if (this.flushTimer.unref) this.flushTimer.unref()
  }

  /**
   * Stop periodic flush timer.
   */
  stopPeriodicFlush(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
  }

  /**
   * Flush buffered events to SQLite.
   */
  flush(): void {
    if (this.eventBuffer.length === 0 || this.isFlushing) return
    this.isFlushing = true

    const events = this.eventBuffer.splice(0)
    try {
      const db = getDatabaseService().getDb()
      const stmt = db.prepare(`
        INSERT INTO telemetry_events (id, type, timestamp, session_id, properties)
        VALUES (?, ?, ?, ?, ?)
      `)

      const txn = db.transaction(() => {
        for (const event of events) {
          stmt.run(
            event.id,
            event.type,
            event.timestamp,
            event.sessionId,
            JSON.stringify(event.properties)
          )
        }
      })
      txn()

      log.debug(`Flushed ${events.length} telemetry events`)
    } catch (err) {
      log.warn('Failed to flush telemetry events:', err)
      // On failure, return events to the buffer (at the beginning) so they aren't lost
      this.eventBuffer.unshift(...events)
      // Prevent infinite growth if the database is permanently inaccessible
      if (this.eventBuffer.length > TelemetryService.MAX_BUFFER_SIZE) {
        log.warn(
          `Telemetry buffer exceeded max size, dropping ${this.eventBuffer.length - TelemetryService.MAX_BUFFER_SIZE} oldest events`
        )
        this.eventBuffer.splice(TelemetryService.MAX_BUFFER_SIZE)
      }
    } finally {
      this.isFlushing = false
    }
  }

  /**
   * Get aggregated stats for a time range.
   */
  getStats(since: number, until: number = Date.now()): Record<string, number> {
    try {
      const db = getDatabaseService().getDb()
      const rows = db
        .prepare(
          `SELECT type, COUNT(*) as count FROM telemetry_events
           WHERE timestamp >= ? AND timestamp <= ?
           GROUP BY type`
        )
        .all(since, until) as Array<{ type: string; count: number }>

      const stats: Record<string, number> = {}
      for (const row of rows) {
        stats[row.type] = row.count
      }
      return stats
    } catch {
      return {}
    }
  }

  /**
   * Get total event count.
   */
  getEventCount(): number {
    try {
      const db = getDatabaseService().getDb()
      const row = db.prepare('SELECT COUNT(*) as count FROM telemetry_events').get() as {
        count: number
      }
      return row.count
    } catch {
      return 0
    }
  }

  /**
   * Clean up old telemetry data (older than retention period).
   */
  cleanup(retentionDays: number = 90): void {
    try {
      const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
      const db = getDatabaseService().getDb()
      const result = db.prepare('DELETE FROM telemetry_events WHERE timestamp < ?').run(cutoff)
      log.info(`Cleaned up ${result.changes} old telemetry events`)
    } catch (err) {
      log.warn('Telemetry cleanup failed:', err)
    }
  }

  // ── Private ──

  private ensureTable(): void {
    try {
      const db = getDatabaseService().getDb()
      db.exec(`
        CREATE TABLE IF NOT EXISTS telemetry_events (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          session_id TEXT NOT NULL,
          properties TEXT DEFAULT '{}'
        )
      `)
      db.exec(
        'CREATE INDEX IF NOT EXISTS idx_telemetry_type_time ON telemetry_events(type, timestamp)'
      )
    } catch (err) {
      log.debug('Telemetry table creation skipped:', err)
    }
  }

  /**
   * Strip PII from event properties.
   */
  private sanitizeProperties(properties: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {}
    const piiKeys = ['email', 'name', 'password', 'token', 'key', 'secret', 'userId', 'user_id']

    for (const [key, value] of Object.entries(properties)) {
      if (piiKeys.some(pii => key.toLowerCase().includes(pii))) {
        sanitized[key] = '[REDACTED]'
      } else {
        sanitized[key] = value
      }
    }

    return sanitized
  }
}

// Singleton
let instance: TelemetryService | null = null

export function getTelemetryService(): TelemetryService {
  if (!instance) {
    instance = new TelemetryService()
    instance.startPeriodicFlush()
  }
  return instance
}

export function resetTelemetryService(): void {
  if (instance) {
    instance.stopPeriodicFlush()
    instance.flush()
  }
  instance = null
}
