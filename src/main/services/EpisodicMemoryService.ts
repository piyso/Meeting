/**
 * EpisodicMemoryService — Always-on rolling audio buffer
 *
 * 13.6 FIX: Replaces "Start Meeting" with a passive rolling audio buffer.
 * Users can ask PiyNotes about any conversation from the last 24 hours.
 *
 * Architecture:
 * - Maintains a 24-hour circular audio buffer in memory + disk
 * - Continuously transcribes with low-priority background ASR
 * - Indexes transcript segments by timestamp for instant recall
 * - Auto-purges segments older than 24 hours
 * - Privacy-first: all processing is local, nothing leaves the device
 */

import { EventEmitter } from 'events'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { Logger } from './Logger'
import { getDatabaseService } from './DatabaseService'
import { v4 as uuidv4 } from 'uuid'

const log = Logger.create('EpisodicMemory')

const BUFFER_DURATION_MS = 24 * 60 * 60 * 1000 // 24 hours
// Removed unused SEGMENT_DURATION_SEC
const PURGE_INTERVAL_MS = 5 * 60 * 1000 // Purge every 5 minutes

interface MemorySegment {
  id: string
  startTime: number
  endTime: number
  text: string
  confidence: number
  audioFile?: string
}

export class EpisodicMemoryService extends EventEmitter {
  private isRunning = false
  private segments: MemorySegment[] = []
  private purgeTimer: ReturnType<typeof setInterval> | null = null
  private audioDir: string

  constructor() {
    super()
    this.setMaxListeners(10)
    this.audioDir = path.join(app.getPath('userData'), 'cache', 'episodic')
    if (!fs.existsSync(this.audioDir)) {
      fs.mkdirSync(this.audioDir, { recursive: true })
    }
  }

  /**
   * Start the always-on memory buffer.
   */
  async start(): Promise<void> {
    if (this.isRunning) return

    this.isRunning = true
    log.info('Episodic memory buffer started (24h rolling window)')

    // Load existing segments from DB
    await this.loadSegments()

    // Start periodic purge of old segments
    this.purgeTimer = setInterval(() => {
      this.purgeOldSegments()
    }, PURGE_INTERVAL_MS)
    if (this.purgeTimer.unref) this.purgeTimer.unref()

    this.emit('started')
  }

  /**
   * Stop the memory buffer.
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return

    this.isRunning = false

    if (this.purgeTimer) {
      clearInterval(this.purgeTimer)
      this.purgeTimer = null
    }

    // Final purge
    await this.purgeOldSegments()

    log.info('Episodic memory buffer stopped')
    this.emit('stopped')
  }

  /**
   * Store a new transcript segment in the memory buffer.
   */
  async storeSegment(
    text: string,
    startTime: number,
    endTime: number,
    confidence: number = 0.8
  ): Promise<void> {
    if (!this.isRunning) return

    const segment: MemorySegment = {
      id: uuidv4(),
      startTime,
      endTime,
      text,
      confidence,
    }

    this.segments.push(segment)

    // Persist to database
    try {
      const db = getDatabaseService().getDb()
      db.prepare(
        `
        INSERT INTO episodic_memory (id, start_time, end_time, text, confidence)
        VALUES (?, ?, ?, ?, ?)
      `
      ).run(segment.id, segment.startTime, segment.endTime, segment.text, segment.confidence)
    } catch (err) {
      log.warn('Failed to persist episodic segment:', err)
    }

    this.emit('segment', segment)
  }

  /**
   * Query the memory buffer for conversations in a time range.
   */
  queryTimeRange(startTime: number, endTime: number): MemorySegment[] {
    return this.segments.filter(s => s.endTime >= startTime && s.startTime <= endTime)
  }

  /**
   * Search the memory buffer for text content.
   */
  searchText(query: string, limit: number = 20): MemorySegment[] {
    const lowerQuery = query.toLowerCase()
    // Escape special regex characters to prevent injection
    const escapedQuery = lowerQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const results: Array<{ segment: MemorySegment; score: number }> = []

    for (const segment of this.segments) {
      const lowerText = segment.text.toLowerCase()
      if (lowerText.includes(lowerQuery)) {
        const count = (lowerText.match(new RegExp(escapedQuery, 'g')) || []).length
        results.push({ segment, score: count })
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(r => r.segment)
  }

  /**
   * Get a summary of the last N hours of conversation.
   */
  getRecentSummary(hours: number = 1): {
    segmentCount: number
    totalDurationSec: number
    preview: string
  } {
    const cutoff = Date.now() - hours * 60 * 60 * 1000
    const recent = this.segments.filter(s => s.endTime >= cutoff)

    const totalDuration = recent.reduce((sum, s) => sum + (s.endTime - s.startTime), 0)
    const preview = recent
      .slice(0, 5)
      .map(s => s.text)
      .join(' | ')

    return {
      segmentCount: recent.length,
      totalDurationSec: Math.round(totalDuration / 1000),
      preview: preview.substring(0, 500),
    }
  }

  /**
   * Get the current buffer status.
   */
  getStatus(): {
    isRunning: boolean
    segmentCount: number
    oldestSegment: number | null
    newestSegment: number | null
    totalDurationSec: number
  } {
    const totalDurationMs = this.segments.reduce((sum, s) => sum + (s.endTime - s.startTime), 0)

    return {
      isRunning: this.isRunning,
      segmentCount: this.segments.length,
      oldestSegment: this.segments[0]?.startTime ?? null,
      newestSegment: this.segments[this.segments.length - 1]?.endTime ?? null,
      totalDurationSec: Math.round(totalDurationMs / 1000),
    }
  }

  // ── Private ──

  private async loadSegments(): Promise<void> {
    try {
      const db = getDatabaseService().getDb()

      // Ensure table exists — timestamps are in milliseconds (Date.now())
      db.exec(`
        CREATE TABLE IF NOT EXISTS episodic_memory (
          id TEXT PRIMARY KEY,
          start_time INTEGER NOT NULL,
          end_time INTEGER NOT NULL,
          text TEXT NOT NULL,
          confidence REAL DEFAULT 0.8,
          created_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `)
      db.exec(
        'CREATE INDEX IF NOT EXISTS idx_episodic_time ON episodic_memory(start_time, end_time)'
      )

      const cutoff = Date.now() - BUFFER_DURATION_MS
      const rows = db
        .prepare('SELECT * FROM episodic_memory WHERE end_time >= ? ORDER BY start_time ASC')
        .all(cutoff) as Array<{
        id: string
        start_time: number
        end_time: number
        text: string
        confidence: number
      }>

      this.segments = rows.map(r => ({
        id: r.id,
        startTime: r.start_time,
        endTime: r.end_time,
        text: r.text,
        confidence: r.confidence,
      }))

      log.info(`Loaded ${this.segments.length} episodic memory segments`)
    } catch (err) {
      log.warn('Failed to load episodic memory segments:', err)
    }
  }

  private async purgeOldSegments(): Promise<void> {
    const cutoff = Date.now() - BUFFER_DURATION_MS
    const before = this.segments.length

    this.segments = this.segments.filter(s => s.endTime >= cutoff)
    const removed = before - this.segments.length

    if (removed > 0) {
      try {
        const db = getDatabaseService().getDb()
        db.prepare('DELETE FROM episodic_memory WHERE end_time < ?').run(cutoff)
        log.info(`Purged ${removed} old episodic memory segments`)
      } catch (err) {
        log.warn('Failed to purge old episodic segments:', err)
      }
    }
  }
}

// Singleton
let instance: EpisodicMemoryService | null = null

export function getEpisodicMemoryService(): EpisodicMemoryService {
  if (!instance) {
    instance = new EpisodicMemoryService()
  }
  return instance
}

export function resetEpisodicMemoryService(): void {
  if (instance) {
    instance.stop()
  }
  instance = null
}
