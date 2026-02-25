/**
 * CRUD Operations for Transcripts Table
 */

import { getDatabase } from '../connection'
import type {
  Transcript,
  CreateTranscriptInput,
  UpdateTranscriptInput,
} from '../../../types/database'

/**
 * Create a new transcript
 */
export function createTranscript(input: CreateTranscriptInput): Transcript {
  const db = getDatabase()

  const stmt = db.prepare(`
    INSERT INTO transcripts (
      id, meeting_id, start_time, end_time, text, confidence,
      speaker_id, speaker_name, words
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  stmt.run(
    input.id,
    input.meeting_id,
    input.start_time,
    input.end_time,
    input.text,
    input.confidence || null,
    input.speaker_id || null,
    input.speaker_name || null,
    input.words ? JSON.stringify(input.words) : null
  )

  return getTranscriptById(input.id)!
}

/**
 * Create multiple transcripts in a transaction
 */
export function createTranscripts(inputs: CreateTranscriptInput[]): Transcript[] {
  const db = getDatabase()

  const insertMany = db.transaction((transcripts: CreateTranscriptInput[]) => {
    const stmt = db.prepare(`
      INSERT INTO transcripts (
        id, meeting_id, start_time, end_time, text, confidence,
        speaker_id, speaker_name, words
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    for (const input of transcripts) {
      stmt.run(
        input.id,
        input.meeting_id,
        input.start_time,
        input.end_time,
        input.text,
        input.confidence || null,
        input.speaker_id || null,
        input.speaker_name || null,
        input.words ? JSON.stringify(input.words) : null
      )
    }
  })

  insertMany(inputs)

  return inputs.map(input => getTranscriptById(input.id)!)
}

/**
 * Get transcript by ID
 */
export function getTranscriptById(id: string): Transcript | null {
  const db = getDatabase()

  const stmt = db.prepare('SELECT * FROM transcripts WHERE id = ?')
  return stmt.get(id) as Transcript | null
}

/**
 * Get all transcripts for a meeting
 */
export function getTranscriptsByMeetingId(meetingId: string): Transcript[] {
  const db = getDatabase()

  const stmt = db.prepare(`
    SELECT * FROM transcripts 
    WHERE meeting_id = ?
    ORDER BY start_time ASC
  `)

  return stmt.all(meetingId) as Transcript[]
}

/**
 * Get transcripts in time range for a meeting
 */
export function getTranscriptsByTimeRange(
  meetingId: string,
  startTime: number,
  endTime: number
): Transcript[] {
  const db = getDatabase()

  const stmt = db.prepare(`
    SELECT * FROM transcripts 
    WHERE meeting_id = ? 
      AND start_time >= ? 
      AND end_time <= ?
    ORDER BY start_time ASC
  `)

  return stmt.all(meetingId, startTime, endTime) as Transcript[]
}

/**
 * Get context window around a timestamp
 * Used for note expansion
 */
export function getTranscriptContext(
  meetingId: string,
  timestamp: number,
  beforeSeconds: number = 60,
  afterSeconds: number = 10
): Transcript[] {
  const db = getDatabase()

  const startTime = timestamp - beforeSeconds
  const endTime = timestamp + afterSeconds

  const stmt = db.prepare(`
    SELECT * FROM transcripts 
    WHERE meeting_id = ? 
      AND end_time >= ? 
      AND start_time <= ?
    ORDER BY start_time ASC
  `)

  return stmt.all(meetingId, startTime, endTime) as Transcript[]
}

/**
 * Update transcript
 */
export function updateTranscript(id: string, input: UpdateTranscriptInput): Transcript | null {
  const db = getDatabase()

  const updates: string[] = []
  const values: unknown[] = []

  if (input.text !== undefined) {
    updates.push('text = ?')
    values.push(input.text)
  }

  if (input.confidence !== undefined) {
    updates.push('confidence = ?')
    values.push(input.confidence)
  }

  if (input.speaker_id !== undefined) {
    updates.push('speaker_id = ?')
    values.push(input.speaker_id)
  }

  if (input.speaker_name !== undefined) {
    updates.push('speaker_name = ?')
    values.push(input.speaker_name)
  }

  if (input.words !== undefined) {
    updates.push('words = ?')
    values.push(JSON.stringify(input.words))
  }

  if (updates.length === 0) {
    return getTranscriptById(id)
  }

  values.push(id)

  const stmt = db.prepare(`
    UPDATE transcripts 
    SET ${updates.join(', ')}
    WHERE id = ?
  `)

  stmt.run(...values)

  return getTranscriptById(id)
}

/**
 * Delete transcript
 */
export function deleteTranscript(id: string): boolean {
  const db = getDatabase()

  const stmt = db.prepare('DELETE FROM transcripts WHERE id = ?')
  const result = stmt.run(id)

  return result.changes > 0
}

/**
 * Delete all transcripts for a meeting
 */
export function deleteTranscriptsByMeetingId(meetingId: string): number {
  const db = getDatabase()

  const stmt = db.prepare('DELETE FROM transcripts WHERE meeting_id = ?')
  const result = stmt.run(meetingId)

  return result.changes
}

/**
 * Mark transcript as synced
 */
export function markTranscriptSynced(id: string): void {
  const db = getDatabase()

  const stmt = db.prepare(`
    UPDATE transcripts 
    SET synced_at = strftime('%s', 'now')
    WHERE id = ?
  `)

  stmt.run(id)
}

/**
 * Get transcript count for a meeting
 */
export function getTranscriptCount(meetingId: string): number {
  const db = getDatabase()

  const stmt = db.prepare('SELECT COUNT(*) as count FROM transcripts WHERE meeting_id = ?')
  const result = stmt.get(meetingId) as { count: number }

  return result.count
}

/**
 * Get transcripts by speaker
 */
export function getTranscriptsBySpeaker(meetingId: string, speakerId: string): Transcript[] {
  const db = getDatabase()

  const stmt = db.prepare(`
    SELECT * FROM transcripts 
    WHERE meeting_id = ? AND speaker_id = ?
    ORDER BY start_time ASC
  `)

  return stmt.all(meetingId, speakerId) as Transcript[]
}
