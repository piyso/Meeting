/**
 * CRUD Operations for Notes Table
 */

import { getDatabase } from '../connection'
import type { Note, CreateNoteInput, UpdateNoteInput } from '../../../types/database'
import { createSyncQueueItem } from './sync-queue'
import { v4 as uuidv4 } from 'uuid'

/**
 * Create a new note
 */
export function createNote(input: CreateNoteInput): Note {
  const db = getDatabase()

  const stmt = db.prepare(`
    INSERT INTO notes (
      id, meeting_id, timestamp, original_text, augmented_text,
      context, is_augmented
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `)

  stmt.run(
    input.id,
    input.meeting_id,
    input.timestamp,
    input.original_text,
    input.augmented_text || null,
    input.context || null,
    input.is_augmented ? 1 : 0
  )

  const note = getNoteById(input.id)
  if (!note) {
    throw new Error(`Failed to read back note after INSERT: ${input.id}`)
  }

  // Queue sync event
  createSyncQueueItem({
    id: uuidv4(),
    operation_type: 'create',
    table_name: 'notes',
    record_id: note.id,
    payload: note as unknown as Record<string, unknown>,
  })

  return note
}

/**
 * Get note by ID
 */
export function getNoteById(id: string): Note | null {
  const db = getDatabase()

  const stmt = db.prepare('SELECT * FROM notes WHERE id = ?')
  return stmt.get(id) as Note | null
}

/**
 * Get all notes for a meeting
 */
export function getNotesByMeetingId(meetingId: string): Note[] {
  const db = getDatabase()

  const stmt = db.prepare(`
    SELECT * FROM notes 
    WHERE meeting_id = ?
    ORDER BY timestamp ASC
  `)

  return stmt.all(meetingId) as Note[]
}

/**
 * Get augmented notes for a meeting
 */
export function getAugmentedNotes(meetingId: string): Note[] {
  const db = getDatabase()

  const stmt = db.prepare(`
    SELECT * FROM notes 
    WHERE meeting_id = ? AND is_augmented = 1
    ORDER BY timestamp ASC
  `)

  return stmt.all(meetingId) as Note[]
}

/**
 * Update note
 */
export function updateNote(id: string, input: UpdateNoteInput): Note | null {
  const db = getDatabase()

  const updates: string[] = []
  const values: unknown[] = []

  if (input.original_text !== undefined) {
    updates.push('original_text = ?')
    values.push(input.original_text)
  }

  if (input.augmented_text !== undefined) {
    updates.push('augmented_text = ?')
    values.push(input.augmented_text)
  }

  if (input.context !== undefined) {
    updates.push('context = ?')
    values.push(input.context)
  }

  if (input.is_augmented !== undefined) {
    updates.push('is_augmented = ?')
    values.push(input.is_augmented ? 1 : 0)
  }

  if (updates.length === 0) {
    return getNoteById(id)
  }

  // Always update updated_at and increment version
  updates.push("updated_at = strftime('%s', 'now')")
  updates.push('version = version + 1')

  values.push(id)

  const stmt = db.prepare(`
    UPDATE notes 
    SET ${updates.join(', ')}
    WHERE id = ?
  `)

  stmt.run(...values)

  const updatedNote = getNoteById(id)
  if (updatedNote) {
    // Queue sync event
    createSyncQueueItem({
      id: uuidv4(),
      operation_type: 'update',
      table_name: 'notes',
      record_id: updatedNote.id,
      payload: updatedNote as unknown as Record<string, unknown>,
    })
  }

  return updatedNote
}

/**
 * Delete note
 */
export function deleteNote(id: string): boolean {
  const db = getDatabase()

  const stmt = db.prepare('DELETE FROM notes WHERE id = ?')
  const result = stmt.run(id)

  if (result.changes > 0) {
    // Queue sync event
    createSyncQueueItem({
      id: uuidv4(),
      operation_type: 'delete',
      table_name: 'notes',
      record_id: id,
      payload: { id },
    })
  }

  return result.changes > 0
}

/**
 * Delete all notes for a meeting
 */
export function deleteNotesByMeetingId(meetingId: string): number {
  const db = getDatabase()

  const stmt = db.prepare('DELETE FROM notes WHERE meeting_id = ?')
  const result = stmt.run(meetingId)

  return result.changes
}

/**
 * Mark note as synced
 */
export function markNoteSynced(id: string): void {
  const db = getDatabase()

  const stmt = db.prepare(`
    UPDATE notes 
    SET synced_at = strftime('%s', 'now')
    WHERE id = ?
  `)

  stmt.run(id)
}

/**
 * Get note count for a meeting
 */
export function getNoteCount(meetingId: string): number {
  const db = getDatabase()

  const stmt = db.prepare('SELECT COUNT(*) as count FROM notes WHERE meeting_id = ?')
  const result = stmt.get(meetingId) as { count: number }

  return result.count
}

/**
 * Get augmented note count for a meeting
 */
export function getAugmentedNoteCount(meetingId: string): number {
  const db = getDatabase()

  const stmt = db.prepare(`
    SELECT COUNT(*) as count FROM notes 
    WHERE meeting_id = ? AND is_augmented = 1
  `)
  const result = stmt.get(meetingId) as { count: number }

  return result.count
}
