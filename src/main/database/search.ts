/**
 * Full-Text Search Functions using FTS5
 *
 * Provides search capabilities across transcripts and notes
 */

import { getDatabase } from './connection'
import { CREATE_FTS_TABLES, CREATE_FTS_TRIGGERS, FTS_TABLE_NAMES } from './schema'
import { Logger } from '../services/Logger'
import { containsAllTerms, excerptAround, plainTextFromHtml, searchTerms } from '../utils/htmlText'

const log = Logger.create('Search')

/**
 * Sanitize FTS5 query to prevent syntax errors from special characters.
 * Supports tokenized multi-term matching and interactive typeahead prefix search.
 */
function sanitizeFtsQuery(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return '""'

  // If user explicitly wrapped in quotes, preserve exact phrase match
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length > 2) {
    const inner = trimmed
      .slice(1, -1)
      .replace(/["*(){}[\]^~\\|]/g, ' ')
      .trim()
    return inner ? `"${inner}"` : '""'
  }

  // Tokenize terms, stripping FTS5 operators and special chars
  const tokens = trimmed
    .replace(/["*(){}[\]^~\\|:]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 0)

  if (tokens.length === 0) return '""'

  if (tokens.length === 1) {
    return `"${tokens[0]}"*`
  }

  // Multi-term: AND all terms together, allowing prefix matching on the last term
  return tokens
    .map((token, idx) => (idx === tokens.length - 1 ? `"${token}"*` : `"${token}"`))
    .join(' AND ')
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
      snippet(transcripts_fts, 0, '', '', '…', 32) as snippet
    FROM transcripts_fts
    JOIN transcripts t ON transcripts_fts.rowid = t.rowid
    JOIN meetings m ON t.meeting_id = m.id
    WHERE transcripts_fts MATCH ?
      AND m.deleted_at IS NULL
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
      notes_fts.rank
    FROM notes_fts
    JOIN notes n ON notes_fts.rowid = n.rowid
    JOIN meetings m ON n.meeting_id = m.id
    WHERE notes_fts MATCH ?
      AND m.deleted_at IS NULL
  `

  const params: unknown[] = [safeQuery]

  if (options?.meetingId) {
    sql += ' AND n.meeting_id = ?'
    params.push(options.meetingId)
  }

  sql += `
    ORDER BY notes_fts.rank
    LIMIT ?
  `

  // Notes are stored as editor HTML and the index is built over that, so a
  // query can match the markup instead of the words: "p", "strong" or "li"
  // matched nearly every note. Fetch more than asked for, keep the notes whose
  // text contains the words, and page over those.
  const terms = searchTerms(query)
  params.push(Math.min((offset + limit) * 3, 1500))

  const stmt = db.prepare(sql)
  const rows = stmt.all(...params) as Array<Record<string, unknown>>

  const matches: NoteSearchResult[] = []
  for (const row of rows) {
    const original = plainTextFromHtml(String(row.original_text ?? ''))
    const augmented = plainTextFromHtml(String(row.augmented_text ?? ''))
    if (terms.length > 0 && !containsAllTerms(`${original}\n${augmented}`, terms)) continue

    matches.push({
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
      // Text, not markup: the excerpt is displayed as it is.
      snippet:
        excerptAround(original, terms) ??
        excerptAround(augmented, terms) ??
        (original || augmented).slice(0, 180),
    })
  }

  return matches.slice(offset, offset + limit)
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
    JOIN meetings m ON t.meeting_id = m.id
    WHERE transcripts_fts MATCH ?
      AND m.deleted_at IS NULL
  `

  let noteSql = `
    SELECT COUNT(*) as count
    FROM notes_fts
    JOIN notes n ON notes_fts.rowid = n.rowid
    JOIN meetings m ON n.meeting_id = m.id
    WHERE notes_fts MATCH ?
      AND m.deleted_at IS NULL
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
 * Should be run if indexes become corrupted or after bulk operations.
 * Each table is independently guarded — one failure won't block the rest.
 */
export function rebuildSearchIndexes(): void {
  const db = getDatabase()

  log.info('Rebuilding FTS5 indexes...')

  // A table missing altogether (dropped by an earlier failed repair) makes
  // every insert into its source table fail, because the sync triggers still
  // reference it. Put the tables and triggers back before rebuilding.
  db.exec(CREATE_FTS_TABLES)
  db.exec(CREATE_FTS_TRIGGERS)

  let succeeded = 0
  for (const name of FTS_TABLE_NAMES) {
    try {
      db.exec(`INSERT INTO ${name}(${name}) VALUES('rebuild')`)
      succeeded++
    } catch (err) {
      log.error(`Failed to rebuild ${name}:`, err)
      // The index itself is damaged: replace it. Drop and recreate in one
      // transaction so the table is never left missing — the triggers on the
      // source table would then reject every new transcript or note.
      try {
        db.transaction(() => {
          db.exec(`DROP TABLE IF EXISTS ${name}`)
          db.exec(CREATE_FTS_TABLES)
          db.exec(CREATE_FTS_TRIGGERS)
          db.exec(`INSERT INTO ${name}(${name}) VALUES('rebuild')`)
        })()
        succeeded++
        log.warn(`Recreated ${name} from scratch`)
      } catch (recreateErr) {
        log.error(`Could not recreate ${name}:`, recreateErr)
      }
    }
  }

  log.info(`FTS5 indexes rebuilt: ${succeeded}/${FTS_TABLE_NAMES.length} succeeded`)
}

/**
 * Optimize FTS5 indexes
 * Should be run periodically to maintain search performance.
 * Each table is independently guarded — one failure won't block the rest.
 */
export function optimizeSearchIndexes(): void {
  const db = getDatabase()

  log.info('Optimizing FTS5 indexes...')

  const tables = [
    { name: 'transcripts_fts', label: 'transcripts' },
    { name: 'notes_fts', label: 'notes' },
    { name: 'entities_fts', label: 'entities' },
    { name: 'action_items_fts', label: 'action items' },
  ]

  let succeeded = 0
  for (const table of tables) {
    try {
      db.exec(`INSERT INTO ${table.name}(${table.name}) VALUES('optimize')`)
      succeeded++
    } catch (err) {
      log.error(`Failed to optimize ${table.label} FTS index:`, err)
    }
  }

  log.info(`FTS5 indexes optimized: ${succeeded}/${tables.length} succeeded`)
}
