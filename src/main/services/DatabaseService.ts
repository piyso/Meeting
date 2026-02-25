/**
 * Database Service
 *
 * Centralized service for all SQLite database operations.
 * Uses better-sqlite3 with WAL mode and FTS5 for full-text search.
 */

/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */

import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'
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
  private db: Database.Database | null = null
  private dbPath: string

  constructor() {
    // Store database in user data directory
    const userDataPath = app.getPath('userData')
    this.dbPath = path.join(userDataPath, 'piyapi-notes.db')
  }

  /**
   * Initialize database connection with optimized settings
   */
  initialize(): void {
    if (this.db) {
      return // Already initialized
    }

    this.db = new Database(this.dbPath, {
      verbose: process.env.NODE_ENV === 'development' ? console.log : undefined,
    })

    // Configure SQLite for optimal performance
    this.db.pragma('journal_mode = WAL') // Write-Ahead Logging for concurrent reads
    this.db.pragma('synchronous = NORMAL') // Balanced safety/speed
    this.db.pragma('cache_size = -64000') // 64MB cache
    this.db.pragma('temp_store = MEMORY') // Store temp tables in memory
    this.db.pragma('mmap_size = 2000000000') // 2GB memory-mapped I/O

    // Run migrations
    this.runMigrations()
  }

  /**
   * Run database migrations
   */
  private runMigrations(): void {
    if (!this.db) throw new Error('Database not initialized')

    // Import and run migrations from existing schema
    const { initializeDatabase } = require('../database/schema')
    initializeDatabase(this.db)
  }

  /**
   * Get database instance
   */
  getDb(): Database.Database {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.')
    }
    return this.db
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }

  // ============================================================================
  // Meeting Operations
  // ============================================================================

  createMeeting(input: CreateMeetingInput): Meeting {
    const db = this.getDb()
    const { createMeeting } = require('../database/crud/meetings')
    return createMeeting(db, input)
  }

  getMeeting(id: string): Meeting | null {
    const db = this.getDb()
    const { getMeeting } = require('../database/crud/meetings')
    return getMeeting(db, id)
  }

  listMeetings(params: {
    namespace?: string
    limit?: number
    offset?: number
    startDate?: number
    endDate?: number
    tags?: string[]
  }): { meetings: Meeting[]; total: number } {
    const db = this.getDb()
    const { listMeetings, countMeetings } = require('../database/crud/meetings')

    const meetings = listMeetings(db, params)
    const total = countMeetings(db, params)

    return { meetings, total }
  }

  updateMeeting(id: string, updates: UpdateMeetingInput): Meeting {
    const db = this.getDb()
    const { updateMeeting } = require('../database/crud/meetings')
    return updateMeeting(db, id, updates)
  }

  deleteMeeting(id: string): void {
    const db = this.getDb()
    const { deleteMeeting } = require('../database/crud/meetings')
    deleteMeeting(db, id)
  }

  // ============================================================================
  // Transcript Operations
  // ============================================================================

  createTranscript(input: CreateTranscriptInput): Transcript {
    const db = this.getDb()
    const { createTranscript } = require('../database/crud/transcripts')
    return createTranscript(db, input)
  }

  getTranscripts(
    meetingId: string,
    options?: { startTime?: number; endTime?: number }
  ): Transcript[] {
    const db = this.getDb()
    const { getTranscriptsByMeeting } = require('../database/crud/transcripts')
    return getTranscriptsByMeeting(db, meetingId, options)
  }

  getTranscriptContext(
    meetingId: string,
    timestamp: number,
    beforeSeconds: number,
    afterSeconds: number
  ): { transcripts: Transcript[]; contextText: string } {
    const db = this.getDb()
    const { getTranscriptsByMeeting } = require('../database/crud/transcripts')

    const startTime = timestamp - beforeSeconds
    const endTime = timestamp + afterSeconds

    const transcripts = getTranscriptsByMeeting(db, meetingId, { startTime, endTime })
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
    const db = this.getDb()
    const { createNote } = require('../database/crud/notes')
    return createNote(db, input)
  }

  getNote(id: string): Note | null {
    const db = this.getDb()
    const { getNote } = require('../database/crud/notes')
    return getNote(db, id)
  }

  getNotesByMeeting(meetingId: string): Note[] {
    const db = this.getDb()
    const { getNotesByMeeting } = require('../database/crud/notes')
    return getNotesByMeeting(db, meetingId)
  }

  updateNote(id: string, updates: UpdateNoteInput): Note {
    const db = this.getDb()
    const { updateNote } = require('../database/crud/notes')
    return updateNote(db, id, updates)
  }

  deleteNote(id: string): void {
    const db = this.getDb()
    const { deleteNote } = require('../database/crud/notes')
    deleteNote(db, id)
  }

  // ============================================================================
  // Entity Operations
  // ============================================================================

  createEntity(input: CreateEntityInput): Entity {
    const db = this.getDb()
    const { createEntity } = require('../database/crud/entities')
    return createEntity(db, input)
  }

  getEntitiesByMeeting(meetingId: string, types?: string[]): Entity[] {
    const db = this.getDb()
    const { getEntitiesByMeeting } = require('../database/crud/entities')
    return getEntitiesByMeeting(db, meetingId, types)
  }

  getEntitiesByType(type: string, limit?: number): Entity[] {
    const db = this.getDb()
    const { getEntitiesByType } = require('../database/crud/entities')
    return getEntitiesByType(db, type, limit)
  }

  // ============================================================================
  // Search Operations
  // ============================================================================

  searchTranscripts(
    query: string,
    namespace?: string,
    limit: number = 50
  ): TranscriptSearchResult[] {
    const db = this.getDb()
    const { searchTranscripts } = require('../database/search')
    return searchTranscripts(db, query, namespace, limit)
  }

  searchNotes(query: string, namespace?: string, limit: number = 50): NoteSearchResult[] {
    const db = this.getDb()
    const { searchNotes } = require('../database/search')
    return searchNotes(db, query, namespace, limit)
  }

  // ============================================================================
  // Sync Queue Operations
  // ============================================================================

  createSyncQueueItem(input: CreateSyncQueueInput): SyncQueueItem {
    const db = this.getDb()
    const { createSyncQueueItem } = require('../database/crud/sync-queue')
    return createSyncQueueItem(db, input)
  }

  getPendingSyncItems(limit: number = 50): SyncQueueItem[] {
    const db = this.getDb()
    const { getPendingSyncItems } = require('../database/crud/sync-queue')
    return getPendingSyncItems(db, limit)
  }

  markSyncItemCompleted(id: string): void {
    const db = this.getDb()
    const { deleteSyncQueueItem } = require('../database/crud/sync-queue')
    deleteSyncQueueItem(db, id)
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
    const fs = require('fs')

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

    const dbSizeBytes = fs.existsSync(this.dbPath) ? fs.statSync(this.dbPath).size : 0

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
