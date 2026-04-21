/**
 * Full-Text Search Functions using FTS5
 *
 * Provides search capabilities across transcripts and notes
 */

import { getDatabase } from './connection'
import { Logger } from '../services/Logger'

const log = Logger.create('Search')

/**
 * Sanitize FTS5 query to prevent syntax errors from special characters.
 * Strips FTS5 operators and wraps in double quotes for phrase matching.
 */
function sanitizeFtsQuery(raw: string): string {
  // Remove FTS5 special characters that could cause syntax errors
  // H-5 AUDIT: Added backslash (\\) and pipe (|) which also break FTS5 queries
  const cleaned = raw.replace(/["*(){}[\]^~\\|]/g, '').trim()
  if (!cleaned) return '""'
  // Wrap in double quotes to treat as literal phrase
  return `"${cleaned}"`
}

import type { TranscriptSearchResult, NoteSearchResult } from '../../types/database'

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

  const safeQuery = sanitizeFtsQuery(query)

  let sql = `
    SELECT 
      t.id AS t_id, t.meeting_id, t.start_time AS t_start_time,
      t.end_time AS t_end_time, t.text, t.confidence, t.speaker_id,
      t.speaker_name, t.words, t.created_at AS t_created_at,
      t.synced_at AS t_synced_at,
      m.id AS m_id, m.title, m.start_time AS m_start_time,
      m.end_time AS m_end_time, m.duration, m.participant_count,
      m.tags, m.namespace, m.created_at AS m_created_at,
      m.synced_at AS m_synced_at, m.performance_tier,
      transcripts_fts.rank,
      snippet(transcripts_fts, 0, '<mark>', '</mark>', '...', 32) as snippet
    FROM transcripts_fts
    JOIN transcripts t ON transcripts_fts.rowid = t.rowid
    JOIN meetings m ON t.meeting_id = m.id
    WHERE transcripts_fts MATCH ?
  `

  const params: unknown[] = [safeQuery]

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
  const results = stmt.all(...params) as Array<Record<string, unknown>>

  return results.map(row => ({
    transcript: {
      id: row.t_id as string,
      meeting_id: row.meeting_id as string,
      start_time: row.t_start_time as number,
      end_time: row.t_end_time as number,
      text: row.text as string,
      confidence: row.confidence as number | null,
      speaker_id: row.speaker_id as string | null,
      speaker_name: row.speaker_name as string | null,
      words: row.words as string | null,
      created_at: row.t_created_at as number,
      synced_at: row.t_synced_at as number,
    },
    meeting: {
      id: row.m_id as string,
      title: row.title as string,
      start_time: row.m_start_time as number,
      end_time: row.m_end_time as number | null,
      duration: row.duration as number | null,
      participant_count: row.participant_count as number | null,
      tags: row.tags as string | null,
      namespace: row.namespace as string,
      created_at: row.m_created_at as number,
      synced_at: row.m_synced_at as number,
      performance_tier: row.performance_tier as string | null,
    },
    rank: row.rank as number,
    snippet: row.snippet as string,
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

  const safeQuery = sanitizeFtsQuery(query)

  let sql = `
    SELECT 
      n.id AS n_id, n.meeting_id, n.timestamp, n.original_text,
      n.augmented_text, n.context, n.is_augmented, n.version,
      n.created_at AS n_created_at, n.updated_at, n.synced_at AS n_synced_at,
      m.id AS m_id, m.title, m.start_time AS m_start_time,
      m.end_time AS m_end_time, m.duration, m.participant_count,
      m.tags, m.namespace, m.created_at AS m_created_at,
      m.synced_at AS m_synced_at, m.performance_tier,
      notes_fts.rank,
      snippet(notes_fts, 0, '<mark>', '</mark>', '...', 32) as snippet
    FROM notes_fts
    JOIN notes n ON notes_fts.rowid = n.rowid
    JOIN meetings m ON n.meeting_id = m.id
    WHERE notes_fts MATCH ?
  `

  const params: unknown[] = [safeQuery]

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
  const results = stmt.all(...params) as Array<Record<string, unknown>>

  return results.map(row => ({
    note: {
      id: row.n_id as string,
      meeting_id: row.meeting_id as string,
      timestamp: row.timestamp as number,
      original_text: row.original_text as string,
      augmented_text: row.augmented_text as string | null,
      context: row.context as string | null,
      is_augmented: row.is_augmented as boolean,
      version: row.version as number,
      created_at: row.n_created_at as number,
      updated_at: row.updated_at as number,
      synced_at: row.n_synced_at as number,
    },
    meeting: {
      id: row.m_id as string,
      title: row.title as string,
      start_time: row.m_start_time as number,
      end_time: row.m_end_time as number | null,
      duration: row.duration as number | null,
      participant_count: row.participant_count as number | null,
      tags: row.tags as string | null,
      namespace: row.namespace as string,
      created_at: row.m_created_at as number,
      synced_at: row.m_synced_at as number,
      performance_tier: row.performance_tier as string | null,
    },
    rank: row.rank as number,
    snippet: row.snippet as string,
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

  // Query the original transcripts table instead of FTS5 virtual table
  // FTS5 text column reconstruction is expensive; LIKE on the real table is faster
  const safePart = partialQuery.replace(/[%_\\]/g, '\\$&')
  const stmt = db.prepare(`
    SELECT DISTINCT text
    FROM transcripts
    WHERE text LIKE ? ESCAPE '\\'
    LIMIT ?
  `)

  const results = stmt.all(`%${safePart}%`, limit * 3) as Array<{ text: string }>

  // Extract unique words that match the partial query
  const words = new Set<string>()
  const lowerPartial = partialQuery.toLowerCase()
  for (const result of results) {
    const tokens = result.text.toLowerCase().split(/\s+/)
    for (const token of tokens) {
      if (token.startsWith(lowerPartial) && token.length > 2) {
        words.add(token)
      }
      if (words.size >= limit) break
    }
    if (words.size >= limit) break
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
  const safeQuery = sanitizeFtsQuery(query)

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

  const params: unknown[] = [safeQuery]

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

  // Rebuild entities index
  db.exec("INSERT INTO entities_fts(entities_fts) VALUES('rebuild')")

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

  // Optimize entities index
  db.exec("INSERT INTO entities_fts(entities_fts) VALUES('optimize')")

  log.info('FTS5 indexes optimized successfully')
}
