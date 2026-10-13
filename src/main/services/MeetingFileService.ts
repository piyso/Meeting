/**
 * BlueArkive meeting files (`.pnotes`)
 *
 * The installers register `.pnotes` as "BlueArkive Meeting File", but nothing
 * ever wrote one and opening one did nothing. This is the format: one meeting
 * with its transcript, notes, entities and highlights as JSON, which the app
 * can write (export) and read back (double-click, or Settings → Import).
 *
 * A meeting file comes from outside — a colleague, a download — so reading
 * one trusts nothing in it: every field is checked for type and size and only
 * known fields are taken. Record ids are kept, which makes importing the same
 * file twice (or a file of a meeting that sync later brings down) a no-op
 * instead of a duplicate.
 */

import type Database from 'better-sqlite3'
import type { EntityType, Word } from '../../types/database'
import { plainTextFromHtml } from '../utils/htmlText'

export { plainTextFromHtml }

export const MEETING_FILE_FORMAT = 'bluearkive.meeting'
export const MEETING_FILE_VERSION = 1
export const MEETING_FILE_EXTENSION = 'pnotes'
/** Larger than any real meeting; small enough to parse without trouble. */
export const MAX_MEETING_FILE_BYTES = 64 * 1024 * 1024

const MAX_SEGMENTS = 200_000
const MAX_NOTES = 20_000
const MAX_ENTITIES = 100_000
const MAX_HIGHLIGHTS = 10_000
const MAX_TEXT = 1_000_000
const ENTITY_TYPES: readonly EntityType[] = [
  'PERSON',
  'DATE',
  'AMOUNT',
  'TOPIC',
  'EMAIL',
  'PHONE',
  'ORGANIZATION',
  'LOCATION',
  'DOCUMENT',
  'URL',
]

export interface MeetingFile {
  format: typeof MEETING_FILE_FORMAT
  version: number
  exportedAt: string
  appVersion?: string
  meeting: {
    id: string
    title: string | null
    start_time: number
    end_time: number | null
    duration: number | null
    participant_count: number | null
    tags: string[]
  }
  transcripts: Array<{
    id: string
    start_time: number
    end_time: number
    text: string
    confidence: number | null
    speaker_id: string | null
    speaker_name: string | null
    words: Word[] | null
  }>
  notes: Array<{
    id: string
    timestamp: number
    original_text: string
    augmented_text: string | null
    context: string | null
    is_augmented: boolean
  }>
  entities: Array<{
    id: string
    type: EntityType
    text: string
    confidence: number | null
    start_offset: number | null
    end_offset: number | null
    transcript_id: string | null
  }>
  highlights: Array<{
    start_time: number
    end_time: number
    label: string | null
    color: string | null
  }>
}

/** Why a file could not be read — the message is written for the user. */
export class MeetingFileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MeetingFileError'
  }
}

// ── Writing ──────────────────────────────────────────────────────

function parseJsonArray<T>(value: unknown): T[] | null {
  if (Array.isArray(value)) return value as T[]
  if (typeof value !== 'string' || !value) return null
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? (parsed as T[]) : null
  } catch {
    return null
  }
}

/** Everything about one meeting, or null when there is no such meeting. */
export function buildMeetingFile(
  db: Database.Database,
  meetingId: string,
  appVersion?: string
): MeetingFile | null {
  const meeting = db
    .prepare(
      `SELECT id, title, start_time, end_time, duration, participant_count, tags
         FROM meetings WHERE id = ? AND deleted_at IS NULL`
    )
    .get(meetingId) as
    | {
        id: string
        title: string | null
        start_time: number
        end_time: number | null
        duration: number | null
        participant_count: number | null
        tags: string | null
      }
    | undefined
  if (!meeting) return null

  // Explicit columns: SELECT * would drag the embedding blobs along.
  const transcripts = db
    .prepare(
      `SELECT id, start_time, end_time, text, confidence, speaker_id, speaker_name, words
         FROM transcripts WHERE meeting_id = ? ORDER BY start_time ASC`
    )
    .all(meetingId) as Array<
    Omit<MeetingFile['transcripts'][number], 'words'> & { words: string | null }
  >
  const notes = db
    .prepare(
      `SELECT id, timestamp, original_text, augmented_text, context, is_augmented
         FROM notes WHERE meeting_id = ? ORDER BY timestamp ASC`
    )
    .all(meetingId) as Array<
    Omit<MeetingFile['notes'][number], 'is_augmented'> & { is_augmented: number | null }
  >
  const entities = db
    .prepare(
      `SELECT id, type, text, confidence, start_offset, end_offset, transcript_id
         FROM entities WHERE meeting_id = ?`
    )
    .all(meetingId) as MeetingFile['entities']
  const highlights = db
    .prepare(
      `SELECT start_time, end_time, label, color
         FROM audio_highlights WHERE meeting_id = ? ORDER BY start_time ASC`
    )
    .all(meetingId) as MeetingFile['highlights']

  return {
    format: MEETING_FILE_FORMAT,
    version: MEETING_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion,
    meeting: { ...meeting, tags: parseJsonArray<string>(meeting.tags) ?? [] },
    transcripts: transcripts.map(t => ({ ...t, words: parseJsonArray<Word>(t.words) })),
    notes: notes.map(n => ({ ...n, is_augmented: !!n.is_augmented })),
    entities,
    highlights,
  }
}

// ── Reading ──────────────────────────────────────────────────────

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readId(value: unknown): string | null {
  return typeof value === 'string' && ID_PATTERN.test(value) ? value : null
}

function readText(value: unknown, max = MAX_TEXT): string | null {
  return typeof value === 'string' && value.length <= max ? value : null
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readList(value: unknown, max: number, what: string): unknown[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new MeetingFileError(`This file's ${what} are not readable.`)
  if (value.length > max) throw new MeetingFileError(`This file has too many ${what} to import.`)
  return value
}

function readWords(value: unknown): Word[] | null {
  const list = parseJsonArray<unknown>(value)
  if (!list || list.length > 50_000) return null
  const words: Word[] = []
  for (const entry of list) {
    if (!isRecord(entry)) return null
    const word = readText(entry.word, 200)
    const start = readNumber(entry.start)
    const end = readNumber(entry.end)
    if (word === null || start === null || end === null) return null
    words.push({ word, start, end, confidence: readNumber(entry.confidence) ?? 0 })
  }
  return words
}

/**
 * The meeting in a `.pnotes` file's text.
 * @throws MeetingFileError when it is not a meeting file this version can read.
 */
export function parseMeetingFile(text: string): MeetingFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new MeetingFileError('This is not a BlueArkive meeting file.')
  }
  if (!isRecord(raw) || raw.format !== MEETING_FILE_FORMAT) {
    throw new MeetingFileError('This is not a BlueArkive meeting file.')
  }
  if (typeof raw.version !== 'number' || raw.version > MEETING_FILE_VERSION) {
    throw new MeetingFileError(
      'This meeting file was made by a newer version of BlueArkive. Update the app to open it.'
    )
  }

  const m = raw.meeting
  const meetingId = isRecord(m) ? readId(m.id) : null
  const startTime = isRecord(m) ? readNumber(m.start_time) : null
  if (!isRecord(m) || !meetingId || startTime === null) {
    throw new MeetingFileError('This meeting file is damaged: it has no meeting in it.')
  }

  // A record that does not hold up is dropped; the rest of the meeting is
  // still worth having.
  const transcripts: MeetingFile['transcripts'] = []
  const transcriptIds = new Set<string>()
  for (const entry of readList(raw.transcripts, MAX_SEGMENTS, 'transcript segments')) {
    if (!isRecord(entry)) continue
    const id = readId(entry.id)
    const start = readNumber(entry.start_time)
    const end = readNumber(entry.end_time)
    const segmentText = readText(entry.text)
    if (!id || start === null || end === null || segmentText === null) continue
    if (transcriptIds.has(id)) continue
    transcriptIds.add(id)
    transcripts.push({
      id,
      start_time: start,
      end_time: end,
      text: segmentText,
      confidence: readNumber(entry.confidence),
      speaker_id: readText(entry.speaker_id, 200),
      speaker_name: readText(entry.speaker_name, 200),
      words: readWords(entry.words),
    })
  }

  const notes: MeetingFile['notes'] = []
  const noteIds = new Set<string>()
  for (const entry of readList(raw.notes, MAX_NOTES, 'notes')) {
    if (!isRecord(entry)) continue
    const id = readId(entry.id)
    const timestamp = readNumber(entry.timestamp)
    const original = readText(entry.original_text)
    if (!id || timestamp === null || original === null || noteIds.has(id)) continue
    noteIds.add(id)
    notes.push({
      id,
      timestamp,
      original_text: original,
      augmented_text: readText(entry.augmented_text),
      context: readText(entry.context),
      is_augmented: entry.is_augmented === true || entry.is_augmented === 1,
    })
  }

  const entities: MeetingFile['entities'] = []
  const entityIds = new Set<string>()
  for (const entry of readList(raw.entities, MAX_ENTITIES, 'entities')) {
    if (!isRecord(entry)) continue
    const id = readId(entry.id)
    const type = ENTITY_TYPES.find(known => known === entry.type)
    const entityText = readText(entry.text, 2000)
    if (!id || !type || entityText === null || entityIds.has(id)) continue
    entityIds.add(id)
    const transcriptId = readId(entry.transcript_id)
    entities.push({
      id,
      type,
      text: entityText,
      confidence: readNumber(entry.confidence),
      start_offset: readNumber(entry.start_offset),
      end_offset: readNumber(entry.end_offset),
      transcript_id: transcriptId && transcriptIds.has(transcriptId) ? transcriptId : null,
    })
  }

  const highlights: MeetingFile['highlights'] = []
  for (const entry of readList(raw.highlights, MAX_HIGHLIGHTS, 'highlights')) {
    if (!isRecord(entry)) continue
    const start = readNumber(entry.start_time)
    const end = readNumber(entry.end_time)
    if (start === null || end === null || start < 0 || end <= start) continue
    const color = readText(entry.color, 20)
    highlights.push({
      start_time: start,
      end_time: end,
      label: readText(entry.label, 500),
      color: color && /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : null,
    })
  }

  const tags = (parseJsonArray<unknown>(m.tags) ?? [])
    .filter((tag): tag is string => typeof tag === 'string' && tag.length <= 100)
    .slice(0, 100)

  return {
    format: MEETING_FILE_FORMAT,
    version: raw.version,
    exportedAt: readText(raw.exportedAt, 64) ?? '',
    appVersion: readText(raw.appVersion, 32) ?? undefined,
    meeting: {
      id: meetingId,
      title: readText(m.title, 500),
      start_time: Math.trunc(startTime),
      end_time: readNumber(m.end_time),
      duration: readNumber(m.duration),
      participant_count: readNumber(m.participant_count),
      tags,
    },
    transcripts,
    notes,
    entities,
    highlights,
  }
}

// ── Importing ────────────────────────────────────────────────────

export interface MeetingImportResult {
  meetingId: string
  title: string | null
  /** `exists`: this device already has the meeting; it was left as it is. */
  status: 'imported' | 'exists'
  transcripts: number
  notes: number
}

/** What importMeetingFile needs from the database layer (the app's own CRUD). */
export interface MeetingImportStore {
  db: Database.Database
  createMeeting: (input: {
    id: string
    title?: string
    start_time: number
    end_time?: number
    duration?: number
    participant_count?: number
    tags?: string[]
  }) => unknown
  createTranscripts: (
    inputs: Array<{
      id: string
      meeting_id: string
      start_time: number
      end_time: number
      text: string
      confidence?: number
      speaker_id?: string
      speaker_name?: string
      words?: Word[]
    }>
  ) => unknown
  createNote: (input: {
    id: string
    meeting_id: string
    timestamp: number
    original_text: string
    augmented_text?: string
    context?: string
    is_augmented?: boolean
  }) => unknown
  createEntities: (
    inputs: Array<{
      id: string
      meeting_id: string
      type: EntityType
      text: string
      confidence?: number
      start_offset?: number
      end_offset?: number
      transcript_id?: string
    }>
  ) => unknown
  createHighlight: (params: {
    meetingId: string
    startTime: number
    endTime: number
    label?: string
    color?: string
  }) => unknown
}

/**
 * Add the meeting in `file` to this device. All of it or none of it.
 *
 * It goes in through the app's own create functions, so it is indexed for
 * search and queued for sync like a meeting recorded here.
 *
 * @throws MeetingFileError when a record in the file collides with a
 *   different meeting's on this device.
 */
export function importMeetingFile(
  file: MeetingFile,
  store: MeetingImportStore
): MeetingImportResult {
  const { db } = store
  const { meeting } = file
  const result: MeetingImportResult = {
    meetingId: meeting.id,
    title: meeting.title,
    status: 'exists',
    transcripts: 0,
    notes: 0,
  }
  if (db.prepare('SELECT 1 FROM meetings WHERE id = ?').get(meeting.id)) return result

  const optional = <T>(value: T | null): T | undefined => (value === null ? undefined : value)

  try {
    db.transaction(() => {
      // A meeting without an end time is one the app takes to be still
      // recording. An imported one is over, whatever the file left out.
      const lastSegmentEnd = file.transcripts.reduce((max, t) => Math.max(max, t.end_time), 0)
      const length = Math.max(0, Math.ceil(meeting.duration ?? lastSegmentEnd))
      store.createMeeting({
        id: meeting.id,
        title: optional(meeting.title),
        start_time: meeting.start_time,
        end_time: meeting.end_time ?? meeting.start_time + length,
        duration: meeting.duration ?? length,
        participant_count: optional(meeting.participant_count),
        tags: meeting.tags.length > 0 ? meeting.tags : undefined,
      })
      if (file.transcripts.length > 0) {
        store.createTranscripts(
          file.transcripts.map(t => ({
            id: t.id,
            meeting_id: meeting.id,
            start_time: t.start_time,
            end_time: t.end_time,
            text: t.text,
            confidence: optional(t.confidence),
            speaker_id: optional(t.speaker_id),
            speaker_name: optional(t.speaker_name),
            words: optional(t.words),
          }))
        )
      }
      for (const note of file.notes) {
        store.createNote({
          id: note.id,
          meeting_id: meeting.id,
          timestamp: note.timestamp,
          original_text: note.original_text,
          augmented_text: optional(note.augmented_text),
          context: optional(note.context),
          is_augmented: note.is_augmented,
        })
      }
      if (file.entities.length > 0) {
        store.createEntities(
          file.entities.map(e => ({
            id: e.id,
            meeting_id: meeting.id,
            type: e.type,
            text: e.text,
            confidence: optional(e.confidence),
            start_offset: optional(e.start_offset),
            end_offset: optional(e.end_offset),
            transcript_id: optional(e.transcript_id),
          }))
        )
      }
      for (const highlight of file.highlights) {
        store.createHighlight({
          meetingId: meeting.id,
          startTime: highlight.start_time,
          endTime: highlight.end_time,
          label: optional(highlight.label),
          color: optional(highlight.color),
        })
      }
    })()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/UNIQUE constraint|PRIMARY KEY/i.test(message)) {
      throw new MeetingFileError(
        'Parts of this meeting are already on this device under a different meeting, so it was not imported.'
      )
    }
    throw err
  }

  return {
    ...result,
    status: 'imported',
    transcripts: file.transcripts.length,
    notes: file.notes.length,
  }
}

// ── A readable page of the meeting (for PDF export) ──────────────

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function clock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(total / 3600)
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`
}

/** A self-contained, script-free HTML page of the meeting. */
export function renderMeetingHtml(file: MeetingFile): string {
  const { meeting } = file
  const title = escapeHtml(meeting.title || 'Meeting')
  const date = new Date(meeting.start_time * 1000).toLocaleString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  const duration = meeting.duration ? `${Math.round(meeting.duration / 60)} minutes` : ''

  const transcript = file.transcripts
    .map(t => {
      // Segment times are seconds from the start; very old rows hold epoch seconds.
      const offset =
        t.start_time >= 1_000_000_000 ? t.start_time - meeting.start_time : t.start_time
      return `<p class="seg"><span class="who">${escapeHtml(t.speaker_name || 'Speaker')}</span> <span class="at">${clock(offset)}</span><br>${escapeHtml(t.text)}</p>`
    })
    .join('\n')
  const notes = file.notes
    .map(n => {
      const body = plainTextFromHtml(n.augmented_text || n.original_text)
      return body ? `<li>${escapeHtml(body).replace(/\n/g, '<br>')}</li>` : ''
    })
    .join('\n')

  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${title}</title>
<style>
  body { font: 11pt/1.5 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #111; margin: 0; }
  h1 { font-size: 20pt; margin: 0 0 4pt; }
  h2 { font-size: 13pt; margin: 22pt 0 8pt; border-bottom: 1px solid #ccc; padding-bottom: 3pt; }
  .meta { color: #555; margin: 0 0 4pt; }
  .seg { margin: 0 0 9pt; break-inside: avoid; }
  .who { font-weight: 600; }
  .at { color: #777; font-size: 9pt; }
  li { margin-bottom: 5pt; }
</style></head><body>
<h1>${title}</h1>
<p class="meta">${escapeHtml(date)}${duration ? ' · ' + escapeHtml(duration) : ''}</p>
${notes ? `<h2>Notes</h2>\n<ul>\n${notes}\n</ul>` : ''}
${transcript ? `<h2>Transcript</h2>\n${transcript}` : ''}
</body></html>`
}
