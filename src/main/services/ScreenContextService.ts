/**
 * ScreenContextService — Low-FPS OCR snapshots synced with audio timestamps
 *
 * 13.1 FIX: Stores screen captures indexed alongside transcripts.
 * Enables queries like "What was I looking at when X was decided?"
 *
 * IMPORTANT: desktopCapturer only works in the renderer process.
 * The renderer captures screenshots and sends them to this service
 * via IPC (screen:storeSnapshot). This service handles storage + querying.
 */

import { EventEmitter } from 'events'
import { Logger } from './Logger'
import { getDatabaseService } from './DatabaseService'
import { v4 as uuidv4 } from 'uuid'

const log = Logger.create('ScreenContext')

export interface ScreenSnapshot {
  id: string
  meetingId: string
  timestamp: number
  ocrText: string
  activeApp: string
  activeWindowTitle: string
  thumbnailPath: string | null
}

export interface RawCaptureData {
  meetingId: string
  timestamp: number
  ocrText: string
  activeApp: string
  activeWindowTitle: string
  /** JPEG buffer from NativeImage.toJPEG() in the renderer */
  thumbnailJpeg: Buffer
}

export class ScreenContextService extends EventEmitter {
  private currentMeetingId: string | null = null

  /**
   * Mark a meeting as active for screen context capture.
   * The actual capture is driven by the renderer via setInterval.
   */
  startCapture(meetingId: string): void {
    this.currentMeetingId = meetingId
    this.ensureTable()
    log.info(`Screen context capture started for meeting ${meetingId}`)
    this.emit('started', { meetingId })
  }

  stopCapture(): void {
    log.info('Screen context capture stopped')
    this.emit('stopped', { meetingId: this.currentMeetingId })
    this.currentMeetingId = null
  }

  /**
   * Store a screen snapshot captured by the renderer process.
   * Called via IPC handler 'screen:storeSnapshot'.
   */
  storeSnapshot(data: RawCaptureData): ScreenSnapshot {
    const snapshot: ScreenSnapshot = {
      id: uuidv4(),
      meetingId: data.meetingId,
      timestamp: data.timestamp,
      ocrText: data.ocrText,
      activeApp: data.activeApp,
      activeWindowTitle: data.activeWindowTitle,
      thumbnailPath: null,
    }

    try {
      const db = getDatabaseService().getDb()
      db.prepare(
        `INSERT INTO screen_snapshots (id, meeting_id, timestamp, ocr_text, active_app, active_window_title, thumbnail)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        snapshot.id,
        snapshot.meetingId,
        snapshot.timestamp,
        snapshot.ocrText,
        snapshot.activeApp,
        snapshot.activeWindowTitle,
        data.thumbnailJpeg
      )

      this.emit('snapshot', snapshot)
    } catch (err) {
      log.warn('Failed to persist screen snapshot:', err)
    }

    return snapshot
  }

  /**
   * Query screen snapshots for a time range.
   */
  querySnapshots(meetingId: string, startTime: number, endTime: number): ScreenSnapshot[] {
    try {
      const db = getDatabaseService().getDb()
      return db
        .prepare(
          `SELECT * FROM screen_snapshots WHERE meeting_id = ? AND timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC`
        )
        .all(meetingId, startTime, endTime) as ScreenSnapshot[]
    } catch {
      return []
    }
  }

  /**
   * Search OCR text across all snapshots.
   */
  searchOcrText(query: string, limit = 20): ScreenSnapshot[] {
    try {
      const db = getDatabaseService().getDb()
      return db
        .prepare(
          `SELECT * FROM screen_snapshots WHERE ocr_text LIKE ? ORDER BY timestamp DESC LIMIT ?`
        )
        .all(`%${query}%`, limit) as ScreenSnapshot[]
    } catch {
      return []
    }
  }

  /**
   * Get the most recent snapshot for a meeting.
   */
  getLatestSnapshot(meetingId: string): ScreenSnapshot | null {
    try {
      const db = getDatabaseService().getDb()
      return db
        .prepare(
          `SELECT * FROM screen_snapshots WHERE meeting_id = ? ORDER BY timestamp DESC LIMIT 1`
        )
        .get(meetingId) as ScreenSnapshot | null
    } catch {
      return null
    }
  }

  // ── Private ──

  private ensureTable(): void {
    try {
      const db = getDatabaseService().getDb()
      db.exec(`
        CREATE TABLE IF NOT EXISTS screen_snapshots (
          id TEXT PRIMARY KEY,
          meeting_id TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          ocr_text TEXT DEFAULT '',
          active_app TEXT DEFAULT '',
          active_window_title TEXT DEFAULT '',
          thumbnail BLOB,
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          FOREIGN KEY (meeting_id) REFERENCES meetings(id)
        )
      `)
      try {
        db.exec(
          'CREATE INDEX IF NOT EXISTS idx_snapshots_meeting_time ON screen_snapshots(meeting_id, timestamp)'
        )
      } catch {
        /* index exists */
      }
    } catch (err) {
      log.debug('Failed to ensure screen_snapshots table:', err)
    }
  }
}

let instance: ScreenContextService | null = null

export function getScreenContextService(): ScreenContextService {
  if (!instance) instance = new ScreenContextService()
  return instance
}
