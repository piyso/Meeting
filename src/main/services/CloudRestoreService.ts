/**
 * Restore from cloud
 *
 * Sync only ever uploaded. Signing in on a second computer — or on the same
 * one after a reinstall — showed an empty app, although everything was sitting
 * in the account. This downloads it.
 *
 * It is additive, and deliberately so: a record is written only if this device
 * does not have it. Nothing local is overwritten or removed, so running it can
 * never lose work, and running it twice changes nothing. What it does not do
 * is carry edits and deletions made on another device over to this one.
 *
 * Restored rows are written straight to the tables: they are already in the
 * cloud, so they must not go back into the upload queue.
 */

import type Database from 'better-sqlite3'
import type { IBackendProvider, Memory } from './backend/IBackendProvider'
import { Logger } from './Logger'

const log = Logger.create('CloudRestore')

/** Parents before children: a transcript needs its meeting to exist first. */
const RESTORE_TABLES = ['meetings', 'transcripts', 'notes', 'entities', 'audio_highlights'] as const
type RestoreTable = (typeof RESTORE_TABLES)[number]

const PAGE_SIZE = 100
/** Stops a service that ignores `offset` from being paged forever. */
const MAX_PAGES_PER_TABLE = 5000

/** Local-only columns: recomputed here, or meaningless on another device. */
const NEVER_RESTORED = new Set(['synced_at', 'embedding', 'embedding_blob'])
/** Added to each piece of a record that was too large to upload in one. */
const CHUNK_FIELDS = ['parent_id', 'chunk_index', 'total_chunks'] as const
const CONTENT_FIELDS = ['text', 'content', 'original_text'] as const

export interface RestoreCounts {
  /** Written to this device. */
  restored: number
  /** Already here — left exactly as they are. */
  alreadyPresent: number
  /** Could not be decrypted with this account's key, or not a usable record. */
  unreadable: number
  /** Deleted on this device, with the deletion still waiting to upload. */
  deletedLocally: number
  /** Belongs to a meeting that is not in the account any more. */
  orphaned: number
}

export interface RestoreResult {
  complete: boolean
  /** Set when the download stopped early; what was restored so far is kept. */
  error?: string
  tables: Record<RestoreTable, RestoreCounts>
  restored: number
}

export interface RestoreDependencies {
  db: Database.Database
  backend: Pick<IBackendProvider, 'getMemories'>
  /** Plaintext of an encrypted payload, or null when this device's key cannot read it. */
  decrypt: (payload: {
    ciphertext: string
    iv: string
    authTag: string
    salt?: string
  }) => string | null
  onProgress?: (progress: { table: RestoreTable; restored: number }) => void
}

interface CloudRecord {
  row: Record<string, unknown>
  remoteIds: string[]
}

const emptyCounts = (): RestoreCounts => ({
  restored: 0,
  alreadyPresent: 0,
  unreadable: 0,
  deletedLocally: 0,
  orphaned: 0,
})

/** Download every record of the account that this device is missing. */
export async function restoreFromCloud(deps: RestoreDependencies): Promise<RestoreResult> {
  const result: RestoreResult = {
    complete: true,
    tables: Object.fromEntries(RESTORE_TABLES.map(table => [table, emptyCounts()])) as Record<
      RestoreTable,
      RestoreCounts
    >,
    restored: 0,
  }

  for (const table of RESTORE_TABLES) {
    const counts = result.tables[table]
    let memories: Memory[]
    try {
      memories = await downloadNamespace(deps.backend, `meetings.${table}`)
    } catch (err) {
      // Children of a table that could not be listed would mostly be orphans;
      // stop here and let the next run pick up where this one left off.
      result.complete = false
      result.error = err instanceof Error ? err.message : String(err)
      log.warn(`Restore stopped at ${table}:`, result.error)
      break
    }

    const records = assembleRecords(memories, deps.decrypt, counts)
    writeRecords(deps.db, table, records, counts)
    result.restored += counts.restored
    deps.onProgress?.({ table, restored: counts.restored })
    if (memories.length > 0) {
      log.info(
        `${table}: ${counts.restored} restored, ${counts.alreadyPresent} already here, ` +
          `${counts.unreadable} unreadable, ${counts.orphaned} orphaned`
      )
    }
  }

  return result
}

// ── Download ─────────────────────────────────────────────────────

async function downloadNamespace(
  backend: Pick<IBackendProvider, 'getMemories'>,
  namespace: string
): Promise<Memory[]> {
  const all: Memory[] = []
  const seen = new Set<string>()

  for (let page = 0; page < MAX_PAGES_PER_TABLE; page++) {
    const batch = await backend.getMemories(namespace, PAGE_SIZE, page * PAGE_SIZE)
    if (!Array.isArray(batch) || batch.length === 0) break

    let fresh = 0
    for (const memory of batch) {
      const key = memory.id ?? `${page}:${all.length}`
      if (seen.has(key)) continue
      seen.add(key)
      all.push(memory)
      fresh++
    }
    // The same page again: the service is not honouring the offset.
    if (fresh === 0 || batch.length < PAGE_SIZE) break
  }
  return all
}

// ── Decrypt and put chunked records back together ────────────────

function assembleRecords(
  memories: Memory[],
  decrypt: RestoreDependencies['decrypt'],
  counts: RestoreCounts
): Map<string, CloudRecord> {
  interface Piece {
    row: Record<string, unknown>
    remoteId: string | undefined
    stamp: number
  }
  const whole = new Map<string, Piece[]>()
  const chunked = new Map<string, Map<string, Piece[]>>()
  const remoteIdsOf = new Map<string, string[]>()

  for (const memory of memories) {
    const row = decryptRow(memory, decrypt)
    const recordId = row && typeof row.id === 'string' && row.id ? row.id : null
    if (!row || !recordId) {
      counts.unreadable++
      continue
    }
    if (memory.id) remoteIdsOf.set(recordId, [...(remoteIdsOf.get(recordId) ?? []), memory.id])

    const stamp = Number(memory.metadata?.created_at) || 0
    const piece: Piece = { row, remoteId: memory.id, stamp }
    if (typeof row.parent_id === 'string' && Number.isInteger(row.chunk_index)) {
      const sets = chunked.get(recordId) ?? new Map<string, Piece[]>()
      sets.set(row.parent_id, [...(sets.get(row.parent_id) ?? []), piece])
      chunked.set(recordId, sets)
    } else {
      whole.set(recordId, [...(whole.get(recordId) ?? []), piece])
    }
  }

  const records = new Map<string, CloudRecord>()
  const newest = (pieces: Piece[]): Piece =>
    pieces.reduce((best, piece) => (rowAge(piece) >= rowAge(best) ? piece : best))
  const rowAge = (piece: Piece): number => Number(piece.row.updated_at) || piece.stamp

  for (const [recordId, pieces] of whole) {
    records.set(recordId, { row: newest(pieces).row, remoteIds: remoteIdsOf.get(recordId) ?? [] })
  }

  for (const [recordId, sets] of chunked) {
    // An edit re-uploads a large record as a new set of chunks; take the
    // newest set that arrived whole.
    let best: { row: Record<string, unknown>; stamp: number } | null = null
    for (const pieces of sets.values()) {
      const joined = joinChunks(pieces.map(piece => piece.row))
      if (!joined) continue
      const stamp = Math.max(...pieces.map(piece => piece.stamp))
      if (!best || stamp >= best.stamp) best = { row: joined, stamp }
    }
    const single = whole.get(recordId)
    if (best && (!single || best.stamp >= newest(single).stamp)) {
      records.set(recordId, { row: best.row, remoteIds: remoteIdsOf.get(recordId) ?? [] })
    } else if (!best && !single) {
      counts.unreadable++
    }
  }

  return records
}

function decryptRow(
  memory: Memory,
  decrypt: RestoreDependencies['decrypt']
): Record<string, unknown> | null {
  const meta = memory.metadata ?? {}
  if (typeof memory.content !== 'string' || typeof meta.iv !== 'string') return null
  if (typeof meta.authTag !== 'string') return null
  try {
    const plaintext = decrypt({
      ciphertext: memory.content,
      iv: meta.iv,
      authTag: meta.authTag,
      salt: typeof meta.salt === 'string' ? meta.salt : undefined,
    })
    if (plaintext === null) return null
    const row = JSON.parse(plaintext) as unknown
    return row && typeof row === 'object' && !Array.isArray(row)
      ? (row as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

/** One record from its chunks, or null when some are missing. */
function joinChunks(chunks: Array<Record<string, unknown>>): Record<string, unknown> | null {
  const ordered = [...chunks].sort((a, b) => Number(a.chunk_index) - Number(b.chunk_index))
  const first = ordered[0]
  if (!first) return null
  const expected = Number(first.total_chunks)
  if (!Number.isInteger(expected) || expected !== ordered.length) return null
  if (ordered.some((chunk, index) => Number(chunk.chunk_index) !== index)) return null

  // The uploader split on whitespace and trimmed both sides of each cut.
  const text = ordered
    .map(chunk => CONTENT_FIELDS.map(field => chunk[field]).find(v => typeof v === 'string') ?? '')
    .join(' ')
  const row: Record<string, unknown> = { ...first }
  for (const field of CONTENT_FIELDS) row[field] = text
  for (const field of CHUNK_FIELDS) delete row[field]
  return row
}

// ── Write what is missing ────────────────────────────────────────

function writeRecords(
  db: Database.Database,
  table: RestoreTable,
  records: Map<string, CloudRecord>,
  counts: RestoreCounts
): void {
  if (records.size === 0) return

  const columns = new Set(
    (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(c => c.name)
  )
  const pendingDeletes = new Set(
    (
      db
        .prepare(
          "SELECT record_id FROM sync_queue WHERE table_name = ? AND operation_type = 'delete'"
        )
        .all(table) as Array<{ record_id: string }>
    ).map(r => r.record_id)
  )
  const exists = db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`)
  const meetingExists = db.prepare('SELECT 1 FROM meetings WHERE id = ?')
  const transcriptExists = db.prepare('SELECT 1 FROM transcripts WHERE id = ?')
  const rememberRemote = db.prepare(
    'INSERT OR IGNORE INTO sync_remote_ids (table_name, record_id, remote_id) VALUES (?, ?, ?)'
  )
  const now = Math.floor(Date.now() / 1000)
  // Records of one table nearly always carry the same columns.
  const inserts = new Map<string, Database.Statement>()
  const insertFor = (names: string[]): Database.Statement => {
    const signature = names.join(',')
    let statement = inserts.get(signature)
    if (!statement) {
      statement = db.prepare(
        `INSERT OR IGNORE INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`
      )
      inserts.set(signature, statement)
    }
    return statement
  }

  const write = db.transaction(() => {
    for (const [recordId, record] of records) {
      // Where each copy lives in the cloud — so a later edit or deletion on
      // this device reaches it directly, restored now or already here.
      for (const remoteId of record.remoteIds) rememberRemote.run(table, recordId, remoteId)

      if (exists.get(recordId)) {
        counts.alreadyPresent++
        continue
      }
      if (pendingDeletes.has(recordId)) {
        counts.deletedLocally++
        continue
      }

      const row = record.row
      if (table === 'meetings') {
        // Caught in the cloud between "moved to trash" and "purged".
        if (row.deleted_at !== null && row.deleted_at !== undefined) {
          counts.orphaned++
          continue
        }
      } else if (typeof row.meeting_id !== 'string' || !meetingExists.get(row.meeting_id)) {
        counts.orphaned++
        continue
      }
      if (
        table === 'entities' &&
        typeof row.transcript_id === 'string' &&
        !transcriptExists.get(row.transcript_id)
      ) {
        row.transcript_id = null
      }

      const names: string[] = []
      const values: Array<string | number | null> = []
      for (const [name, raw] of Object.entries(row)) {
        if (!columns.has(name) || NEVER_RESTORED.has(name)) continue
        const value = toSqlValue(raw)
        if (value === undefined) continue
        names.push(name)
        values.push(value)
      }
      if (columns.has('synced_at')) {
        names.push('synced_at')
        values.push(now)
      }

      try {
        const inserted = insertFor(names).run(...values)
        if (inserted.changes > 0) counts.restored++
        else counts.unreadable++ // a required column was missing from the record
      } catch (err) {
        counts.unreadable++
        log.debug(`${table}:${recordId} not restored:`, err instanceof Error ? err.message : err)
      }
    }
  })
  write()
}

function toSqlValue(value: unknown): string | number | null | undefined {
  if (value === null) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'object') return JSON.stringify(value)
  return undefined
}
