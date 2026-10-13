/**
 * Upgrade-path test for the SQLite schema — run with `npm run test:db`.
 *
 * Not a vitest file: better-sqlite3 is compiled for Electron's ABI, so this is
 * bundled with esbuild and run with Electron's own Node (ELECTRON_RUN_AS_NODE).
 *
 * For a fresh install and for a database exactly as each earlier release left
 * it (fixtures/schema-v*.sql, with rows in it), it opens the database with the
 * real connection code and checks that:
 *   - it opens at all (v0.3.x databases used to fail on every launch with
 *     "no such column: embedding_blob"),
 *   - every column the current code relies on exists,
 *   - the versioned migrations run,
 *   - old and new rows are searchable, and a soft-deleted meeting is not,
 *   - a search table that was dropped comes back — on repair and on restart —
 *     and inserts keep working (they used to fail from then on).
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import Database from 'better-sqlite3'
import { initializeDatabase, closeDatabase, getDatabase } from '../connection'
import { searchTranscripts, searchNotes, rebuildSearchIndexes, countSearchResults } from '../search'
import { getDatabaseMigrationService } from '../../services/DatabaseMigrationService'

const FIXTURES = path.join(process.cwd(), 'src/main/database/__tests__/fixtures')
const OLD_RELEASES = [
  { name: 'v0.3.1-v0.3.3', file: 'schema-v3.sql', version: 3 },
  { name: 'pre-0.3.5', file: 'schema-v4.sql', version: 4 },
  { name: 'v0.3.5-v0.3.6', file: 'schema-v5.sql', version: 5 },
]

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bluearkive-dbtest-'))
let failures = 0

function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' — ' + detail : ''}`)
}

async function run(name: string, old: { sql: string; version: number } | null): Promise<void> {
  console.log(`== ${name}`)
  const file = path.join(dir, `${name}.db`)

  if (old) {
    const legacy = new Database(file)
    legacy.pragma('journal_mode = WAL')
    legacy.exec(
      "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied_at INTEGER DEFAULT (strftime('%s','now')));"
    )
    legacy.exec(old.sql)
    legacy.prepare('INSERT OR IGNORE INTO schema_version (version) VALUES (?)').run(old.version)
    legacy
      .prepare(
        "INSERT INTO meetings (id,title,start_time) VALUES ('m1','Budget review',1700000000)"
      )
      .run()
    legacy
      .prepare(
        "INSERT INTO transcripts (id,meeting_id,start_time,end_time,text) VALUES ('t1','m1',0,5,'quarterly budget forecast')"
      )
      .run()
    legacy
      .prepare(
        "INSERT INTO notes (id,meeting_id,timestamp,original_text) VALUES ('n1','m1',3,'follow up on forecast')"
      )
      .run()
    legacy.close()
  }

  try {
    initializeDatabase({ filename: file })
    check('opens', true)
  } catch (e) {
    check('opens', false, (e as Error).message)
    return
  }

  const db = getDatabase()
  const has = (table: string, column: string): boolean =>
    (
      db
        .prepare(`SELECT COUNT(*) c FROM pragma_table_info('${table}') WHERE name = ?`)
        .get(column) as { c: number }
    ).c === 1

  check('transcripts.embedding_blob', has('transcripts', 'embedding_blob'))
  check('meetings.deleted_at', has('meetings', 'deleted_at'))
  check(
    'entities.segment_index + metadata',
    has('entities', 'segment_index') && has('entities', 'metadata')
  )
  for (const table of [
    'entities',
    'audio_highlights',
    'action_items',
    'sentiment_scores',
    'calendar_events',
    'webhooks',
  ]) {
    check(`${table}.synced_at`, has(table, 'synced_at'))
  }

  try {
    const applied = await getDatabaseMigrationService().runMigrations()
    check('versioned migrations run', true, `applied ${applied}`)
  } catch (e) {
    check('versioned migrations run', false, (e as Error).message)
  }

  if (old) {
    check('old transcript searchable', searchTranscripts('budget').length === 1)
    check('old note searchable', searchNotes('forecast').length === 1)
  }

  db.prepare(
    "INSERT OR IGNORE INTO meetings (id,title,start_time) VALUES ('m2','Roadmap',1700000100)"
  ).run()
  db.prepare(
    "INSERT INTO transcripts (id,meeting_id,start_time,end_time,text) VALUES ('t2','m2',0,5,'kubernetes migration plan')"
  ).run()
  check('new transcript searchable', searchTranscripts('kubernetes').length === 1)

  db.prepare("UPDATE meetings SET deleted_at = 123 WHERE id = 'm2'").run()
  check(
    'soft-deleted meeting hidden from search',
    searchTranscripts('kubernetes').length === 0 && countSearchResults('kubernetes').total === 0
  )
  db.prepare("UPDATE meetings SET deleted_at = NULL WHERE id = 'm2'").run()

  // Repair: a dropped index must come back with its content, and inserts must keep working.
  db.exec('DROP TABLE transcripts_fts')
  rebuildSearchIndexes()
  let insertOk = true
  try {
    db.prepare(
      "INSERT INTO transcripts (id,meeting_id,start_time,end_time,text) VALUES ('t3','m2',6,9,'postgres failover drill')"
    ).run()
  } catch {
    insertOk = false
  }
  check('insert works after repair', insertOk)
  check(
    'repair restored old + new rows',
    searchTranscripts('kubernetes').length === 1 && searchTranscripts('postgres').length === 1
  )

  // A dropped index and a restart with no explicit repair.
  db.exec('DROP TABLE notes_fts')
  closeDatabase()
  initializeDatabase({ filename: file })
  let noteOk = true
  try {
    getDatabase()
      .prepare(
        "INSERT INTO notes (id,meeting_id,timestamp,original_text) VALUES ('n9','m2',1,'ship the release notes')"
      )
      .run()
  } catch {
    noteOk = false
  }
  check(
    'restart recreates dropped search table',
    noteOk && searchNotes('release').length === 1 && (!old || searchNotes('forecast').length === 1)
  )

  closeDatabase()
  initializeDatabase({ filename: file })
  check('idempotent restart', searchTranscripts('postgres').length === 1)
  closeDatabase()
}

;(async () => {
  await run('fresh-install', null)
  for (const release of OLD_RELEASES) {
    await run(`upgrade-from-${release.name}`, {
      sql: fs.readFileSync(path.join(FIXTURES, release.file), 'utf-8'),
      version: release.version,
    })
  }
  fs.rmSync(dir, { recursive: true, force: true })
  console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`)
  process.exit(failures === 0 ? 0 : 1)
})()
