/**
 * Restore-from-cloud test — run with `npm run test:db` (real SQLite under
 * Electron's Node; see upgrade-path.dbtest.ts for why it is not a vitest file).
 *
 * Device A records a meeting with the app's own database code. Its sync queue
 * is "uploaded" into an in-memory cloud using the uploader's own chunking,
 * encryption and memory format. Device B — an empty database — then restores,
 * and the test checks that B ends up with A's data and nothing else, that
 * nothing B already had is touched, and that the things which must not come
 * back (deleted here, unreadable, orphaned) do not.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { initializeDatabase, closeDatabase, getDatabase } from '../../database/connection'
import { createMeeting, deleteMeeting } from '../../database/crud/meetings'
import { createTranscript, deleteTranscript } from '../../database/crud/transcripts'
import { createNote, updateNote, getNoteById } from '../../database/crud/notes'
import { createEntity } from '../../database/crud/entities'
import { createHighlight } from '../../database/crud/highlights'
import { searchTranscripts } from '../../database/search'
import { EncryptionService } from '../EncryptionService'
import { buildSyncMemory, chunkSyncPayload } from '../syncPayload'
import { restoreFromCloud, type RestoreResult } from '../CloudRestoreService'
import type { Memory } from '../backend/IBackendProvider'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bluearkive-restoretest-'))
const USER = 'user-1'
/** Small enough that the long transcript below has to be uploaded in pieces. */
const SIZE_LIMIT = 5000
let failures = 0

function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' — ' + detail : ''}`)
}

function useKey(fill: number): void {
  EncryptionService.primeKeyCache(Buffer.alloc(32, fill), EncryptionService.syncSaltFor(USER))
}

function openDevice(name: string): void {
  closeDatabase()
  initializeDatabase({ filename: path.join(dir, `${name}.db`) })
}

const count = (table: string): number =>
  (getDatabase().prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n

// ── The cloud ────────────────────────────────────────────────────

class Cloud {
  memories: Memory[] = []
  private nextId = 1
  /** Namespaces that answer with an error. */
  failing = new Set<string>()
  ignoreOffset = false
  requests = 0

  backend = {
    getMemories: async (namespace: string, limit = 50, offset = 0): Promise<Memory[]> => {
      this.requests++
      if (this.failing.has(namespace)) {
        throw Object.assign(new Error('Service unavailable'), { status: 503 })
      }
      const all = this.memories.filter(m => m.namespace === namespace)
      return this.ignoreOffset ? all.slice(0, limit) : all.slice(offset, offset + limit)
    },
  }

  private remove(table: string, recordId: string): void {
    this.memories = this.memories.filter(
      m => !(m.namespace === `meetings.${table}` && m.metadata?.record_id === recordId)
    )
  }

  /** What a sync pass does with this device's queue. */
  async uploadQueue(): Promise<void> {
    const db = getDatabase()
    const rows = db.prepare('SELECT * FROM sync_queue ORDER BY rowid').all() as Array<{
      id: string
      operation_type: string
      table_name: string
      record_id: string
      payload: string | null
      created_at: number
    }>
    for (const row of rows) {
      if (row.operation_type !== 'create') this.remove(row.table_name, row.record_id)
      if (row.operation_type !== 'delete') {
        const payload = JSON.parse(row.payload ?? '{}') as Record<string, unknown>
        for (const chunk of chunkSyncPayload(payload, SIZE_LIMIT)) {
          const encrypted = await EncryptionService.encryptWithCachedKey(
            JSON.stringify(chunk),
            USER
          )
          this.memories.push({ ...buildSyncMemory(row, encrypted), id: `mem-${this.nextId++}` })
        }
      }
      db.prepare('DELETE FROM sync_queue WHERE id = ?').run(row.id)
    }
  }
}

async function restore(cloud: Cloud): Promise<RestoreResult> {
  return restoreFromCloud({
    db: getDatabase(),
    backend: cloud.backend,
    decrypt: payload => EncryptionService.decryptWithCachedKey(payload),
  })
}

// ── Test data ────────────────────────────────────────────────────

const LONG_TEXT = Array.from(
  { length: 900 },
  (_, i) => `Sentence ${i} about the quarterly forecast.`
).join(' ')
const squash = (text: string): string => text.replace(/\s+/g, ' ').trim()

function recordOnDeviceA(): void {
  createMeeting({ id: 'm1', title: 'Budget review', start_time: 1_760_000_000, duration: 1800 })
  createTranscript({
    id: 't1',
    meeting_id: 'm1',
    start_time: 0,
    end_time: 4.5,
    text: 'Let us start with the hiring plan.',
    speaker_name: 'Asha',
    confidence: 0.93,
  })
  createTranscript({ id: 't2', meeting_id: 'm1', start_time: 4.5, end_time: 9, text: 'Agreed.' })
  createTranscript({ id: 't3', meeting_id: 'm1', start_time: 9, end_time: 600, text: LONG_TEXT })
  createNote({
    id: 'n1',
    meeting_id: 'm1',
    timestamp: 3,
    original_text: '<p>Ask about headcount</p>',
  })
  createNote({
    id: 'n2',
    meeting_id: 'm1',
    timestamp: 20,
    original_text: 'forecast',
    augmented_text: 'The forecast was revised upward.',
    is_augmented: true,
  })
  createEntity({ id: 'e1', meeting_id: 'm1', type: 'PERSON', text: 'Asha', transcript_id: 't1' })
  createHighlight({ meetingId: 'm1', startTime: 2, endTime: 8, label: 'Decision' })

  // A meeting that is recorded and then deleted: none of it may come back.
  createMeeting({ id: 'm2', title: 'Scrapped', start_time: 1_760_100_000 })
  createTranscript({ id: 't9', meeting_id: 'm2', start_time: 0, end_time: 1, text: 'Never mind.' })
}

async function main(): Promise<void> {
  // ── Device A records and uploads ──
  console.log('== device A records, uploads, deletes one meeting')
  useKey(1)
  openDevice('a')
  recordOnDeviceA()
  const cloud = new Cloud()
  await cloud.uploadQueue()
  deleteMeeting('m2')
  await cloud.uploadQueue()
  const chunksOfT3 = cloud.memories.filter(m => m.metadata?.record_id === 't3').length
  check('the long transcript was uploaded in several pieces', chunksOfT3 > 1, `${chunksOfT3}`)
  check(
    'nothing in the cloud is readable without the key',
    !cloud.memories.some(m => /forecast|headcount|Asha/.test(JSON.stringify(m)))
  )

  // ── Device B: empty, same account ──
  console.log('== device B restores')
  openDevice('b')
  check('device B starts empty', count('meetings') === 0)
  const first = await restore(cloud)
  check('restore completes', first.complete, first.error)
  check('the meeting is there', count('meetings') === 1 && first.tables.meetings.restored === 1)
  check('the deleted meeting is not', count("meetings WHERE id = 'm2'") === 0)
  check('all three transcript segments are there', count('transcripts') === 3)

  const db = getDatabase()
  const t1 = db.prepare("SELECT * FROM transcripts WHERE id = 't1'").get() as Record<
    string,
    unknown
  >
  check(
    'a segment keeps its fields',
    t1.text === 'Let us start with the hiring plan.' &&
      t1.speaker_name === 'Asha' &&
      t1.confidence === 0.93 &&
      t1.end_time === 4.5
  )
  const t3 = db.prepare("SELECT text FROM transcripts WHERE id = 't3'").get() as { text: string }
  check(
    'the long transcript is back in one piece',
    squash(t3.text) === squash(LONG_TEXT),
    `${t3.text.length} of ${LONG_TEXT.length} characters`
  )
  const n2 = getNoteById('n2')
  check(
    'notes are there, expanded text included',
    count('notes') === 2 && n2?.augmented_text === 'The forecast was revised upward.'
  )
  const e1 = db.prepare("SELECT transcript_id FROM entities WHERE id = 'e1'").get() as
    | { transcript_id: string }
    | undefined
  check('the entity still points at its segment', e1?.transcript_id === 't1')
  check('the highlight is there', count('audio_highlights') === 1)

  check('nothing restored is queued for upload again', count('sync_queue') === 0)
  check('restored rows are marked as synced', count('transcripts WHERE synced_at > 0') === 3)
  check(
    'each cloud copy is remembered for later edits and deletes',
    count('sync_remote_ids') === cloud.memories.length,
    `${count('sync_remote_ids')} of ${cloud.memories.length}`
  )
  check(
    'restored transcripts are searchable',
    searchTranscripts('hiring').length === 1 && searchTranscripts('forecast').length >= 1
  )

  // ── Running it again ──
  console.log('== restoring again changes nothing')
  const second = await restore(cloud)
  check(
    'nothing is written twice',
    second.restored === 0 &&
      second.tables.transcripts.alreadyPresent === 3 &&
      count('transcripts') === 3
  )

  // ── Additive: local work is never overwritten ──
  console.log('== what this device has is left alone')
  updateNote('n1', { original_text: '<p>Edited on device B</p>' })
  await restore(cloud)
  check(
    'a note edited here keeps the edit',
    getNoteById('n1')?.original_text === '<p>Edited on device B</p>'
  )

  deleteTranscript('t2') // deleted here; the deletion has not been uploaded yet
  const afterDelete = await restore(cloud)
  check(
    'a segment deleted here does not come back',
    count("transcripts WHERE id = 't2'") === 0 &&
      afterDelete.tables.transcripts.deletedLocally === 1
  )

  // ── A device with the wrong key ──
  console.log('== a device that cannot decrypt')
  openDevice('c')
  useKey(2)
  const wrongKey = await restore(cloud)
  check(
    'restores nothing and reports every record as unreadable',
    wrongKey.complete &&
      wrongKey.restored === 0 &&
      count('meetings') === 0 &&
      wrongKey.tables.meetings.unreadable === 1 &&
      wrongKey.tables.transcripts.unreadable >= 3
  )
  useKey(1)

  // ── Records whose meeting is gone ──
  console.log('== records without their meeting')
  openDevice('d')
  const orphanCloud = new Cloud()
  orphanCloud.memories = cloud.memories.filter(m => m.namespace !== 'meetings.meetings')
  const orphans = await restore(orphanCloud)
  check(
    'are not restored',
    orphans.complete && orphans.restored === 0 && orphans.tables.transcripts.orphaned === 3
  )

  // ── The service fails part-way ──
  console.log('== the service fails part-way through')
  openDevice('e')
  cloud.failing.add('meetings.notes')
  const partial = await restore(cloud)
  check(
    'what was downloaded before the failure is kept, and the failure is reported',
    !partial.complete &&
      !!partial.error &&
      count('meetings') === 1 &&
      count('transcripts') === 3 &&
      count('notes') === 0
  )
  cloud.failing.clear()
  const resumed = await restore(cloud)
  check(
    'the next run fetches the rest',
    resumed.complete && count('notes') === 2 && count('entities') === 1
  )

  // ── More than one page ──
  console.log('== an account with more than one page of records')
  openDevice('a')
  useKey(1)
  for (let i = 0; i < 250; i++) {
    createTranscript({
      id: `bulk-${i}`,
      meeting_id: 'm1',
      start_time: 1000 + i,
      end_time: 1001 + i,
      text: `bulk segment ${i}`,
    })
  }
  await cloud.uploadQueue()
  openDevice('f')
  const paged = await restore(cloud)
  check('every page is fetched', paged.complete && count('transcripts') === 253)

  openDevice('g')
  cloud.ignoreOffset = true
  cloud.requests = 0
  const stuck = await restore(cloud)
  check(
    'a service that keeps returning the first page does not hang the restore',
    stuck.complete && cloud.requests < 20,
    `${cloud.requests} requests`
  )

  closeDatabase()
  fs.rmSync(dir, { recursive: true, force: true })
  console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
