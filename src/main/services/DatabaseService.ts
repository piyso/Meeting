/**
 * Database Service
 *
 * Centralized service for all SQLite database operations.
 * Delegates to connection.ts for the actual DB connection.
 */

import fs from 'fs'
import type Database from 'better-sqlite3'
import {
  initializeDatabase as initDbConnection,
  getDatabase,
  getDatabasePath,
} from '../database/connection'
import {
  createMeeting,
  getMeetingById,
  getAllMeetings,
  getMeetingCount,
  updateMeeting,
  deleteMeeting,
} from '../database/crud/meetings'
import {
  createTranscript,
  getTranscriptsByMeetingId,
  getTranscriptsByTimeRange,
} from '../database/crud/transcripts'
import {
  createNote,
  getNoteById,
  getNotesByMeetingId,
  updateNote,
  deleteNote,
} from '../database/crud/notes'
import { createEntity, getEntitiesByMeetingId } from '../database/crud/entities'
import {
  searchTranscripts as searchTranscriptsFTS,
  searchNotes as searchNotesFTS,
} from '../database/search'
import {
  createSyncQueueItem,
  getPendingSyncItems,
  deleteSyncQueueItem,
} from '../database/crud/sync-queue'
import type {
  Meeting,
  CreateMeetingInput,
  UpdateMeetingInput,
  Transcript,
  CreateTranscriptInput,
  Note,
  CreateNoteInput,
  UpdateNoteInput,
  Entity,
  CreateEntityInput,
  SyncQueueItem,
  CreateSyncQueueInput,
  TranscriptSearchResult,
  NoteSearchResult,
} from '../../types/database'

export class DatabaseService {
  private initialized = false

  /**
   * Initialize database connection — delegates to connection.ts
   */
  initialize(): void {
    if (this.initialized) return
    initDbConnection()
    this.initialized = true
  }

  /**
   * Get database instance from connection.ts
   */
  getDb(): Database.Database {
    return getDatabase()
  }

  /**
   * Close database connection — handled by connection.ts closeDatabase()
   */
  close(): void {
    // no-op: connection.ts closeDatabase() handles this in main.ts shutdown
  }

  // ============================================================================
  // Meeting Operations
  // ============================================================================

  createMeeting(input: CreateMeetingInput): Meeting {
    return createMeeting(input)
  }

  getMeeting(id: string): Meeting | null {
    return getMeetingById(id)
  }

  listMeetings(params: {
    namespace?: string
    limit?: number
    offset?: number
    startDate?: number
    endDate?: number
    tags?: string[]
  }): { meetings: Meeting[]; total: number } {
    const meetings = getAllMeetings({ limit: params.limit, offset: params.offset })
    const total = getMeetingCount()

    return { meetings, total }
  }

  updateMeeting(id: string, updates: UpdateMeetingInput): Meeting {
    return updateMeeting(id, updates) as Meeting
  }

  deleteMeeting(id: string): void {
    deleteMeeting(id)
  }

  // ============================================================================
  // Transcript Operations
  // ============================================================================

  createTranscript(input: CreateTranscriptInput): Transcript {
    return createTranscript(input)
  }

  getTranscripts(
    meetingId: string,
    options?: { startTime?: number; endTime?: number }
  ): Transcript[] {
    if (options?.startTime !== undefined && options?.endTime !== undefined) {
      return getTranscriptsByTimeRange(meetingId, options.startTime, options.endTime)
    }
    return getTranscriptsByMeetingId(meetingId)
  }

  getTranscriptContext(
    meetingId: string,
    timestamp: number,
    beforeSeconds: number,
    afterSeconds: number
  ): { transcripts: Transcript[]; contextText: string } {
    const startTime = timestamp - beforeSeconds
    const endTime = timestamp + afterSeconds

    const transcripts = getTranscriptsByTimeRange(meetingId, startTime, endTime)
    const contextText = transcripts.map((t: Transcript) => t.text).join(' ')

    return { transcripts, contextText }
  }

  updateSpeakerName(meetingId: string, speakerId: string, speakerName: string): void {
    const db = this.getDb()
    const stmt = db.prepare(`
      UPDATE transcripts
      SET speaker_name = ?
      WHERE meeting_id = ? AND speaker_id = ?
    `)
    stmt.run(speakerName, meetingId, speakerId)
  }

  // ============================================================================
  // Note Operations
  // ============================================================================

  createNote(input: CreateNoteInput): Note {
    return createNote(input)
  }

  getNote(id: string): Note | null {
    return getNoteById(id)
  }

  getNotesByMeeting(meetingId: string): Note[] {
    return getNotesByMeetingId(meetingId)
  }

  updateNote(id: string, updates: UpdateNoteInput): Note {
    return updateNote(id, updates) as Note
  }

  deleteNote(id: string): void {
    deleteNote(id)
  }

  // ============================================================================
  // Entity Operations
  // ============================================================================

  createEntity(input: CreateEntityInput): Entity {
    return createEntity(input)
  }

  getEntitiesByMeeting(meetingId: string, _types?: string[]): Entity[] {
    return getEntitiesByMeetingId(meetingId)
  }

  getEntitiesByType(_type: string, _limit?: number): Entity[] {
    return [] // getEntitiesByType requires meetingId context
  }

  // ============================================================================
  // Search Operations
  // ============================================================================

  searchTranscripts(
    query: string,
    _namespace?: string,
    limit: number = 50
  ): TranscriptSearchResult[] {
    return searchTranscriptsFTS(query, { limit })
  }

  searchNotes(query: string, _namespace?: string, limit: number = 50): NoteSearchResult[] {
    return searchNotesFTS(query, { limit })
  }

  // ============================================================================
  // Sync Queue Operations
  // ============================================================================

  createSyncQueueItem(input: CreateSyncQueueInput): SyncQueueItem {
    return createSyncQueueItem(input)
  }

  getPendingSyncItems(limit: number = 50): SyncQueueItem[] {
    return getPendingSyncItems(limit)
  }

  markSyncItemCompleted(id: string): void {
    deleteSyncQueueItem(id)
  }

  incrementSyncRetryCount(id: string): void {
    const db = this.getDb()
    const stmt = db.prepare(`
      UPDATE sync_queue
      SET retry_count = retry_count + 1,
          last_attempt = strftime('%s', 'now')
      WHERE id = ?
    `)
    stmt.run(id)
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  getStats(): {
    totalMeetings: number
    totalTranscripts: number
    totalNotes: number
    totalEntities: number
    dbSizeBytes: number
  } {
    const db = this.getDb()
    const stats = db
      .prepare(
        `
      SELECT
        (SELECT COUNT(*) FROM meetings) as totalMeetings,
        (SELECT COUNT(*) FROM transcripts) as totalTranscripts,
        (SELECT COUNT(*) FROM notes) as totalNotes,
        (SELECT COUNT(*) FROM entities) as totalEntities
    `
      )
      .get() as {
      totalMeetings: number
      totalTranscripts: number
      totalNotes: number
      totalEntities: number
    }

    const dbPath = getDatabasePath()
    const dbSizeBytes = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0

    return {
      ...stats,
      dbSizeBytes,
    }
  }

  // ============================================================================
  // Settings Operations
  // ============================================================================

  /**
   * Get a setting value by key
   */
  getSetting(key: string): string | null {
    const db = this.getDb()
    const result = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined

    return result?.value || null
  }

  /**
   * Set a setting value
   */
  setSetting(key: string, value: string): void {
    const db = this.getDb()
    db.prepare(
      `
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, strftime('%s', 'now'))
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `
    ).run(key, value)
  }

  /**
   * Get all settings
   */
  getAllSettings(): Record<string, string> {
    const db = this.getDb()
    const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{
      key: string
      value: string
    }>

    const settings: Record<string, string> = {}
    for (const row of rows) {
      settings[row.key] = row.value
    }

    return settings
  }

  /**
   * Delete a setting
   */
  deleteSetting(key: string): void {
    const db = this.getDb()
    db.prepare('DELETE FROM settings WHERE key = ?').run(key)
  }
}

// Singleton instance
let instance: DatabaseService | null = null

export function getDatabaseService(): DatabaseService {
  if (!instance) {
    instance = new DatabaseService()
    instance.initialize()
  }
  return instance
}
