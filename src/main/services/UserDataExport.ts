/**
 * "Export my data" — everything the app holds about the user, in one file.
 *
 * The export used to be built as a single string in memory and handed to the
 * window, which turned it into a download. A long-time user's library (word
 * timings alone run to megabytes per meeting) does not fit: the string hit
 * V8's size limit and the export failed for exactly the people with the most
 * data to take with them.
 *
 * It is now written straight to the file the user picked, a few hundred rows
 * at a time. Memory stays flat, the app stays responsive, and a failed export
 * leaves no half-written file behind under the final name.
 */

import fs from 'fs'
import { once } from 'events'
import type Database from 'better-sqlite3'
import { plainTextFromHtml } from '../utils/htmlText'

const BATCH_ROWS = 500

export type UserDataFormat = 'json' | 'markdown'

export interface UserDataExportResult {
  bytes: number
  stats: Record<string, number>
}

/** What goes into the export: output key → table and columns. */
const EXPORT_TABLES: Array<{ key: string; table: string; columns: string }> = [
  { key: 'meetings', table: 'meetings', columns: '*' },
  {
    // Named columns: the embedding columns are derived data, megabytes of it.
    key: 'transcripts',
    table: 'transcripts',
    columns:
      'id, meeting_id, start_time, end_time, text, confidence, speaker_id, speaker_name, words, created_at',
  },
  { key: 'notes', table: 'notes', columns: '*' },
  { key: 'entities', table: 'entities', columns: '*' },
  { key: 'actionItems', table: 'action_items', columns: '*' },
  { key: 'digests', table: 'digests', columns: '*' },
  { key: 'sentimentScores', table: 'sentiment_scores', columns: '*' },
  { key: 'highlights', table: 'audio_highlights', columns: '*' },
  { key: 'calendarEvents', table: 'calendar_events', columns: '*' },
  {
    // Without the signing secrets.
    key: 'webhooks',
    table: 'webhooks',
    columns: 'id, url, events, description, is_active, created_at, updated_at',
  },
]

class FileWriter {
  bytes = 0
  private readonly stream: fs.WriteStream
  private failure: Error | null = null

  constructor(path: string) {
    this.stream = fs.createWriteStream(path, { encoding: 'utf-8', mode: 0o600 })
    this.stream.on('error', err => {
      this.failure = err
    })
  }

  async write(text: string): Promise<void> {
    if (this.failure) throw this.failure
    this.bytes += Buffer.byteLength(text)
    if (!this.stream.write(text)) await once(this.stream, 'drain')
  }

  async close(): Promise<void> {
    if (this.failure) throw this.failure
    this.stream.end()
    await once(this.stream, 'close')
    if (this.failure) throw this.failure
  }

  abort(): void {
    this.stream.destroy()
  }
}

function tableExists(db: Database.Database, table: string): boolean {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)
}

/**
 * Rows of a table, a batch at a time, without holding a query open in
 * between — the rest of the app keeps using the database while this runs.
 */
async function* rowsOf(
  db: Database.Database,
  table: string,
  columns: string,
  where = '',
  params: unknown[] = []
): AsyncGenerator<Record<string, unknown>> {
  const statement = db.prepare(
    `SELECT rowid AS __rowid, ${columns} FROM ${table}
      WHERE rowid > ? ${where ? `AND ${where}` : ''}
      ORDER BY rowid LIMIT ${BATCH_ROWS}`
  )
  let after = 0
  for (;;) {
    const batch = statement.all(after, ...params) as Array<Record<string, unknown>>
    for (const row of batch) {
      after = row.__rowid as number
      delete row.__rowid
      yield row
    }
    if (batch.length < BATCH_ROWS) return
    // Let the event loop turn: IPC, timers and the recorder are waiting.
    await new Promise<void>(resolve => setImmediate(resolve))
  }
}

async function writeJson(db: Database.Database, out: FileWriter): Promise<Record<string, number>> {
  const stats: Record<string, number> = {}
  await out.write(`{\n"exportedAt": ${JSON.stringify(new Date().toISOString())},\n`)
  await out.write('"version": "1.1",\n"data": {\n')

  let firstTable = true
  for (const { key, table, columns } of EXPORT_TABLES) {
    await out.write(`${firstTable ? '' : ',\n'}${JSON.stringify(key)}: [`)
    firstTable = false
    let count = 0
    // A table a newer release added may not exist in this database yet.
    if (tableExists(db, table)) {
      for await (const row of rowsOf(db, table, columns)) {
        // One record per line: readable, and far smaller than full indentation.
        await out.write(`${count === 0 ? '\n' : ',\n'}${JSON.stringify(row)}`)
        count++
      }
    }
    await out.write(count === 0 ? ']' : '\n]')
    stats[key] = count
  }

  await out.write(`\n},\n"stats": ${JSON.stringify(stats)}\n}\n`)
  return stats
}

async function writeMarkdown(
  db: Database.Database,
  out: FileWriter
): Promise<Record<string, number>> {
  const stats = { meetings: 0, transcripts: 0, notes: 0 }
  await out.write(`# BlueArkive Data Export\n\nExported: ${new Date().toISOString()}\n\n`)

  for await (const meeting of rowsOf(db, 'meetings', 'id, title, start_time, duration')) {
    stats.meetings++
    await out.write(`## ${String(meeting.title || 'Untitled')}\n\n`)
    await out.write(
      `- **Date:** ${new Date((Number(meeting.start_time) || 0) * 1000).toISOString()}\n`
    )
    await out.write(`- **Duration:** ${Math.round((Number(meeting.duration) || 0) / 60)} min\n\n`)

    let heading = false
    for await (const note of rowsOf(
      db,
      'notes',
      'original_text, augmented_text',
      'meeting_id = ?',
      [meeting.id]
    )) {
      if (!heading) await out.write('### Notes\n\n')
      heading = true
      stats.notes++
      // Notes are stored as editor HTML; Markdown readers want the text.
      const text = plainTextFromHtml(String(note.augmented_text || note.original_text || ''))
      await out.write(`- ${text.replace(/\n/g, '\n  ')}\n`)
    }
    if (heading) await out.write('\n')

    heading = false
    for await (const segment of rowsOf(db, 'transcripts', 'speaker_name, text', 'meeting_id = ?', [
      meeting.id,
    ])) {
      if (!heading) await out.write('### Transcript\n\n')
      heading = true
      stats.transcripts++
      await out.write(
        `**${String(segment.speaker_name || 'Speaker')}:** ${String(segment.text)}\n\n`
      )
    }
    await out.write('---\n\n')
  }
  return stats
}

/**
 * Write the whole library to `filePath`.
 * The file appears under that name only once it is complete.
 */
export async function writeUserDataExport(
  db: Database.Database,
  filePath: string,
  format: UserDataFormat
): Promise<UserDataExportResult> {
  const partial = `${filePath}.partial`
  const out = new FileWriter(partial)
  try {
    const stats = format === 'markdown' ? await writeMarkdown(db, out) : await writeJson(db, out)
    await out.close()
    await fs.promises.rename(partial, filePath)
    return { bytes: out.bytes, stats }
  } catch (err) {
    out.abort()
    await fs.promises.rm(partial, { force: true }).catch(() => undefined)
    throw err
  }
}
