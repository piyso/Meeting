/**
 * Meeting file round trip — run with `npm run test:db`.
 *
 * A meeting recorded on one device is written to a .pnotes file with the
 * export code, and read into an empty database with the import code (through
 * the app's own create functions). Checks that it arrives whole, is searchable
 * and queued for sync like any other meeting, that importing it twice changes
 * nothing, and that a file which collides with another meeting's records is
 * refused without leaving half a meeting behind.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { initializeDatabase, closeDatabase, getDatabase } from '../../database/connection'
import { createMeeting } from '../../database/crud/meetings'
import { createTranscript, createTranscripts } from '../../database/crud/transcripts'
import { createNote } from '../../database/crud/notes'
import { createEntities, createEntity } from '../../database/crud/entities'
import { createHighlight } from '../../database/crud/highlights'
import { searchTranscripts } from '../../database/search'
import {
  MeetingFileError,
  buildMeetingFile,
  importMeetingFile,
  parseMeetingFile,
  type MeetingImportStore,
} from '../MeetingFileService'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bluearkive-meetingfile-'))
let failures = 0

function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' — ' + detail : ''}`)
}

function openDevice(name: string): void {
  closeDatabase()
  initializeDatabase({ filename: path.join(dir, `${name}.db`) })
}

const count = (what: string): number =>
  (getDatabase().prepare(`SELECT COUNT(*) AS n FROM ${what}`).get() as { n: number }).n

const store = (): MeetingImportStore => ({
  db: getDatabase(),
  createMeeting,
  createTranscripts,
  createNote,
  createEntities,
  createHighlight,
})

function main(): void {
  console.log('== export on device A')
  openDevice('a')
  createMeeting({
    id: 'm1',
    title: 'Budget review',
    start_time: 1_760_000_000,
    duration: 1800,
    tags: ['finance', 'q4'],
  })
  createTranscript({
    id: 't1',
    meeting_id: 'm1',
    start_time: 0,
    end_time: 4.5,
    text: 'Let us start with the hiring plan.',
    speaker_name: 'Asha',
    confidence: 0.93,
    words: [{ word: 'Let', start: 0, end: 0.2, confidence: 0.9 }],
  })
  createTranscript({ id: 't2', meeting_id: 'm1', start_time: 4.5, end_time: 9, text: 'Agreed.' })
  createNote({
    id: 'n1',
    meeting_id: 'm1',
    timestamp: 3,
    original_text: '<p>Ask about headcount</p>',
    augmented_text: 'Headcount was approved for two roles.',
    is_augmented: true,
  })
  createEntity({ id: 'e1', meeting_id: 'm1', type: 'PERSON', text: 'Asha', transcript_id: 't1' })
  createHighlight({ meetingId: 'm1', startTime: 2, endTime: 8, label: 'Decision' })

  const exported = buildMeetingFile(getDatabase(), 'm1', '0.8.0')
  check('the meeting can be exported', !!exported)
  check('an unknown meeting cannot', buildMeetingFile(getDatabase(), 'nope') === null)
  const text = JSON.stringify(exported)
  check('the file carries no embeddings or sync bookkeeping', !/embedding|synced_at/.test(text))

  console.log('== import on device B')
  openDevice('b')
  const first = importMeetingFile(parseMeetingFile(text), store())
  check(
    'it is imported',
    first.status === 'imported' && first.transcripts === 2 && first.notes === 1
  )

  const db = getDatabase()
  const meeting = db.prepare("SELECT * FROM meetings WHERE id = 'm1'").get() as Record<
    string,
    unknown
  >
  check(
    'the meeting keeps its title, time, length and tags',
    meeting.title === 'Budget review' &&
      meeting.start_time === 1_760_000_000 &&
      meeting.duration === 1800 &&
      meeting.tags === JSON.stringify(['finance', 'q4'])
  )
  const t1 = db.prepare("SELECT * FROM transcripts WHERE id = 't1'").get() as Record<
    string,
    unknown
  >
  check(
    'a segment keeps its speaker, timing and word timings',
    t1.speaker_name === 'Asha' &&
      t1.end_time === 4.5 &&
      t1.confidence === 0.93 &&
      JSON.parse(String(t1.words))[0].word === 'Let'
  )
  const n1 = db.prepare("SELECT * FROM notes WHERE id = 'n1'").get() as Record<string, unknown>
  check(
    'a note keeps both its texts',
    n1.original_text === '<p>Ask about headcount</p>' &&
      n1.augmented_text === 'Headcount was approved for two roles.' &&
      n1.is_augmented === 1
  )
  check(
    'entities and highlights come along',
    count("entities WHERE transcript_id = 't1'") === 1 && count('audio_highlights') === 1
  )
  check('the transcript is searchable', searchTranscripts('hiring').length === 1)
  check(
    'it is queued for sync like a meeting recorded here',
    count("sync_queue WHERE table_name = 'meetings'") === 1 &&
      count("sync_queue WHERE table_name = 'transcripts'") === 2
  )

  const open = JSON.parse(text)
  open.meeting.id = 'm-open'
  delete open.meeting.end_time
  delete open.meeting.duration
  open.transcripts = [{ id: 'open-t1', start_time: 0, end_time: 61.2, text: 'only segment' }]
  open.notes = []
  open.entities = []
  importMeetingFile(parseMeetingFile(JSON.stringify(open)), store())
  const ended = db.prepare("SELECT end_time, duration FROM meetings WHERE id = 'm-open'").get() as {
    end_time: number | null
    duration: number | null
  }
  check(
    'a file without an end time still gives a finished meeting',
    ended.end_time === 1_760_000_000 + 62 && ended.duration === 62,
    JSON.stringify(ended)
  )

  console.log('== importing it again')
  const queued = count('sync_queue')
  const again = importMeetingFile(parseMeetingFile(text), store())
  check(
    'changes nothing',
    again.status === 'exists' &&
      count("transcripts WHERE meeting_id = 'm1'") === 2 &&
      count('sync_queue') === queued
  )

  console.log('== a file that collides with another meeting')
  const clash = JSON.parse(text)
  clash.meeting.id = 'm-other'
  clash.transcripts.push({ id: 'fresh', start_time: 20, end_time: 21, text: 'new segment' })
  let refused: unknown
  try {
    importMeetingFile(parseMeetingFile(JSON.stringify(clash)), store())
  } catch (err) {
    refused = err
  }
  check('is refused with a message for the user', refused instanceof MeetingFileError)
  check(
    'and leaves nothing of itself behind',
    count("meetings WHERE id = 'm-other'") === 0 &&
      count("transcripts WHERE id = 'fresh'") === 0 &&
      count('sync_queue') === queued
  )

  closeDatabase()
  fs.rmSync(dir, { recursive: true, force: true })
  console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}

try {
  main()
} catch (err) {
  console.error(err)
  process.exit(1)
}
