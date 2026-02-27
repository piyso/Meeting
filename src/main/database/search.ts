/**
 * Full-Text Search Functions using FTS5
 *
 * Provides search capabilities across transcripts and notes
 */

import { getDatabase } from './connection'
import { Logger } from '../services/Logger'

const log = Logger.create('Search')

import type {
  TranscriptSearchResult,
  NoteSearchResult,
  Meeting,
  Transcript,
  Note,
} from '../../types/database'

/**
 * Search transcripts using FTS5
 */
export function searchTranscripts(
  query: string,
  options?: {
    meetingId?: string
    limit?: number
    offset?: number
  }
): TranscriptSearchResult[] {
  const db = getDatabase()

  const limit = options?.limit || 50
  const offset = options?.offset || 0

  let sql = `
    SELECT 
      t.*,
      m.*,
      transcripts_fts.rank,
      snippet(transcripts_fts, 0, '<mark>', '</mark>', '...', 32) as snippet
    FROM transcripts_fts
    JOIN transcripts t ON transcripts_fts.rowid = t.rowid
    JOIN meetings m ON t.meeting_id = m.id
    WHERE transcripts_fts MATCH ?
  `

  const params: unknown[] = [query]

  if (options?.meetingId) {
    sql += ' AND t.meeting_id = ?'
    params.push(options.meetingId)
  }

  sql += `
    ORDER BY transcripts_fts.rank
    LIMIT ? OFFSET ?
  `

  params.push(limit, offset)

  const stmt = db.prepare(sql)
  const results = stmt.all(...params) as Array<
    Transcript & Meeting & { rank: number; snippet: string }
  >

  return results.map(row => ({
    transcript: {
      id: row.id,
      meeting_id: row.meeting_id,
      start_time: row.start_time,
      end_time: row.end_time,
      text: row.text,
      confidence: row.confidence,
      speaker_id: row.speaker_id,
      speaker_name: row.speaker_name,
      words: row.words,
      created_at: row.created_at,
      synced_at: row.synced_at,
    },
    meeting: {
      id: row.meeting_id,
      title: row.title,
      start_time: row.start_time,
      end_time: row.end_time,
      duration: row.duration,
      participant_count: row.participant_count,
      tags: row.tags,
      namespace: row.namespace,
      created_at: row.created_at,
      synced_at: row.synced_at,
      performance_tier: row.performance_tier,
    },
    rank: row.rank,
    snippet: row.snippet,
  }))
}

/**
 * Search notes using FTS5
 */
export function searchNotes(
  query: string,
  options?: {
    meetingId?: string
    limit?: number
    offset?: number
  }
): NoteSearchResult[] {
  const db = getDatabase()

  const limit = options?.limit || 50
  const offset = options?.offset || 0

  let sql = `
    SELECT 
      n.*,
      m.*,
      notes_fts.rank,
      snippet(notes_fts, 0, '<mark>', '</mark>', '...', 32) as snippet
    FROM notes_fts
    JOIN notes n ON notes_fts.rowid = n.rowid
    JOIN meetings m ON n.meeting_id = m.id
    WHERE notes_fts MATCH ?
  `

  const params: unknown[] = [query]

  if (options?.meetingId) {
    sql += ' AND n.meeting_id = ?'
    params.push(options.meetingId)
  }

  sql += `
    ORDER BY notes_fts.rank
    LIMIT ? OFFSET ?
  `

  params.push(limit, offset)

  const stmt = db.prepare(sql)
  const results = stmt.all(...params) as Array<Note & Meeting & { rank: number; snippet: string }>

  return results.map(row => ({
    note: {
      id: row.id,
      meeting_id: row.meeting_id,
      timestamp: row.timestamp,
      original_text: row.original_text,
      augmented_text: row.augmented_text,
      context: row.context,
      is_augmented: row.is_augmented,
      version: row.version,
      created_at: row.created_at,
      updated_at: row.updated_at,
      synced_at: row.synced_at,
    },
    meeting: {
      id: row.meeting_id,
      title: row.title,
      start_time: row.start_time,
      end_time: row.end_time,
      duration: row.duration,
      participant_count: row.participant_count,
      tags: row.tags,
      namespace: row.namespace,
      created_at: row.created_at,
      synced_at: row.synced_at,
      performance_tier: row.performance_tier,
    },
    rank: row.rank,
    snippet: row.snippet,
  }))
}

/**
 * Search both transcripts and notes
 */
export function searchAll(
  query: string,
  options?: {
    meetingId?: string
    limit?: number
    offset?: number
  }
): {
  transcripts: TranscriptSearchResult[]
  notes: NoteSearchResult[]
} {
  const transcripts = searchTranscripts(query, options)
  const notes = searchNotes(query, options)

  return { transcripts, notes }
}

/**
 * Get search suggestions based on partial query
 * Uses FTS5 prefix matching
 */
export function getSearchSuggestions(partialQuery: string, limit: number = 10): string[] {
  const db = getDatabase()

  // Search for terms that start with the partial query
  const query = `${partialQuery}*`

  const stmt = db.prepare(`
    SELECT DISTINCT text 
    FROM transcripts_fts 
    WHERE transcripts_fts MATCH ?
    LIMIT ?
  `)

  const results = stmt.all(query, limit) as Array<{ text: string }>

  // Extract unique words from results
  const words = new Set<string>()
  for (const result of results) {
    const tokens = result.text.toLowerCase().split(/\s+/)
    for (const token of tokens) {
      if (token.startsWith(partialQuery.toLowerCase())) {
        words.add(token)
      }
    }
  }

  return Array.from(words).slice(0, limit)
}

/**
 * Count search results without fetching them
 */
export function countSearchResults(
  query: string,
  options?: { meetingId?: string }
): {
  transcripts: number
  notes: number
  total: number
} {
  const db = getDatabase()

  let transcriptSql = `
    SELECT COUNT(*) as count
    FROM transcripts_fts
    JOIN transcripts t ON transcripts_fts.rowid = t.rowid
    WHERE transcripts_fts MATCH ?
  `

  let noteSql = `
    SELECT COUNT(*) as count
    FROM notes_fts
    JOIN notes n ON notes_fts.rowid = n.rowid
    WHERE notes_fts MATCH ?
  `

  const params: unknown[] = [query]

  if (options?.meetingId) {
    transcriptSql += ' AND t.meeting_id = ?'
    noteSql += ' AND n.meeting_id = ?'
    params.push(options.meetingId)
  }

  const transcriptStmt = db.prepare(transcriptSql)
  const noteStmt = db.prepare(noteSql)

  const transcriptCount = (transcriptStmt.get(...params) as { count: number }).count
  const noteCount = (noteStmt.get(...params) as { count: number }).count

  return {
    transcripts: transcriptCount,
    notes: noteCount,
    total: transcriptCount + noteCount,
  }
}

/**
 * Rebuild FTS5 indexes
 * Should be run if indexes become corrupted or after bulk operations
 */
export function rebuildSearchIndexes(): void {
  const db = getDatabase()

  log.info('Rebuilding FTS5 indexes...')

  // Rebuild transcripts index
  db.exec("INSERT INTO transcripts_fts(transcripts_fts) VALUES('rebuild')")

  // Rebuild notes index
  db.exec("INSERT INTO notes_fts(notes_fts) VALUES('rebuild')")

  log.info('FTS5 indexes rebuilt successfully')
}

/**
 * Optimize FTS5 indexes
 * Should be run periodically to maintain search performance
 */
export function optimizeSearchIndexes(): void {
  const db = getDatabase()

  log.info('Optimizing FTS5 indexes...')

  // Optimize transcripts index
  db.exec("INSERT INTO transcripts_fts(transcripts_fts) VALUES('optimize')")

  // Optimize notes index
  db.exec("INSERT INTO notes_fts(notes_fts) VALUES('optimize')")

  log.info('FTS5 indexes optimized successfully')
}
