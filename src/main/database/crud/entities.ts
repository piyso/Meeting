/**
 * CRUD Operations for Entities Table
 */

import { getDatabase } from '../connection'
import type { Entity, CreateEntityInput, EntityType } from '../../../types/database'
import { createSyncQueueItem } from './sync-queue'
import { v4 as uuidv4 } from 'uuid'

/**
 * Create a new entity
 */
export function createEntity(input: CreateEntityInput): Entity {
  const db = getDatabase()

  const stmt = db.prepare(`
    INSERT INTO entities (
      id, meeting_id, type, text, confidence,
      start_offset, end_offset, transcript_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)

  stmt.run(
    input.id,
    input.meeting_id,
    input.type,
    input.text,
    input.confidence || null,
    input.start_offset || null,
    input.end_offset || null,
    input.transcript_id || null
  )

  const entity = getEntityById(input.id)
  if (!entity) {
    throw new Error(`Failed to read back entity after INSERT: ${input.id}`)
  }

  createSyncQueueItem({
    id: uuidv4(),
    operation_type: 'create',
    table_name: 'entities',
    record_id: entity.id,
    payload: entity as unknown as Record<string, unknown>,
  })

  return entity
}

/**
 * Create multiple entities in a transaction
 */
export function createEntities(inputs: CreateEntityInput[]): Entity[] {
  const db = getDatabase()

  const insertMany = db.transaction((entities: CreateEntityInput[]) => {
    const stmt = db.prepare(`
      INSERT INTO entities (
        id, meeting_id, type, text, confidence,
        start_offset, end_offset, transcript_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)

    for (const input of entities) {
      stmt.run(
        input.id,
        input.meeting_id,
        input.type,
        input.text,
        input.confidence || null,
        input.start_offset || null,
        input.end_offset || null,
        input.transcript_id || null
      )
    }
  })

  insertMany(inputs)

  return inputs.map(input => {
    const entity = getEntityById(input.id)
    if (!entity) {
      throw new Error(`Failed to read back entity after INSERT: ${input.id}`)
    }

    createSyncQueueItem({
      id: uuidv4(),
      operation_type: 'create',
      table_name: 'entities',
      record_id: entity.id,
      payload: entity as unknown as Record<string, unknown>,
    })

    return entity
  })
}

/**
 * Get entity by ID
 */
export function getEntityById(id: string): Entity | null {
  const db = getDatabase()

  const stmt = db.prepare('SELECT * FROM entities WHERE id = ?')
  return stmt.get(id) as Entity | null
}

/**
 * Get all entities for a meeting
 */
export function getEntitiesByMeetingId(meetingId: string): Entity[] {
  const db = getDatabase()

  const stmt = db.prepare(`
    SELECT * FROM entities 
    WHERE meeting_id = ?
    ORDER BY created_at ASC
  `)

  return stmt.all(meetingId) as Entity[]
}

/**
 * Get entities by type for a meeting
 */
export function getEntitiesByType(meetingId: string, type: EntityType): Entity[] {
  const db = getDatabase()

  const stmt = db.prepare(`
    SELECT * FROM entities 
    WHERE meeting_id = ? AND type = ?
    ORDER BY created_at ASC
  `)

  return stmt.all(meetingId, type) as Entity[]
}

/**
 * Get entities for a transcript
 */
export function getEntitiesByTranscriptId(transcriptId: string): Entity[] {
  const db = getDatabase()

  const stmt = db.prepare(`
    SELECT * FROM entities 
    WHERE transcript_id = ?
    ORDER BY start_offset ASC
  `)

  return stmt.all(transcriptId) as Entity[]
}

/**
 * Get unique entity texts by type
 * Useful for filtering and aggregation
 */
export function getUniqueEntitiesByType(meetingId: string, type: EntityType): string[] {
  const db = getDatabase()

  const stmt = db.prepare(`
    SELECT DISTINCT text FROM entities 
    WHERE meeting_id = ? AND type = ?
    ORDER BY text ASC
  `)

  const results = stmt.all(meetingId, type) as Array<{ text: string }>
  return results.map(r => r.text)
}

/**
 * Get entity count by type for a meeting
 */
export function getEntityCountByType(meetingId: string): Record<string, number> {
  const db = getDatabase()

  const stmt = db.prepare(`
    SELECT type, COUNT(*) as count 
    FROM entities 
    WHERE meeting_id = ?
    GROUP BY type
  `)

  const results = stmt.all(meetingId) as Array<{ type: string; count: number }>

  const counts: Record<string, number> = {}
  for (const result of results) {
    counts[result.type] = result.count
  }

  return counts
}

/**
 * Search entities by text
 */
export function searchEntities(meetingId: string, searchText: string): Entity[] {
  const db = getDatabase()

  const stmt = db.prepare(`
    SELECT * FROM entities 
    WHERE meeting_id = ? AND text LIKE ?
    ORDER BY created_at ASC
  `)

  return stmt.all(meetingId, `%${searchText}%`) as Entity[]
}

/**
 * Delete entity
 */
export function deleteEntity(id: string): boolean {
  const db = getDatabase()

  const stmt = db.prepare('DELETE FROM entities WHERE id = ?')
  const result = stmt.run(id)

  if (result.changes > 0) {
    createSyncQueueItem({
      id: uuidv4(),
      operation_type: 'delete',
      table_name: 'entities',
      record_id: id,
      payload: { id },
    })
  }

  return result.changes > 0
}

/**
 * Delete all entities for a meeting
 */
export function deleteEntitiesByMeetingId(meetingId: string): number {
  const db = getDatabase()

  const stmt = db.prepare('DELETE FROM entities WHERE meeting_id = ?')
  const result = stmt.run(meetingId)

  return result.changes
}

/**
 * Delete entities by transcript
 */
export function deleteEntitiesByTranscriptId(transcriptId: string): number {
  const db = getDatabase()

  const stmt = db.prepare('DELETE FROM entities WHERE transcript_id = ?')
  const result = stmt.run(transcriptId)

  return result.changes
}

/**
 * Get entity count for a meeting
 */
export function getEntityCount(meetingId: string): number {
  const db = getDatabase()

  const stmt = db.prepare('SELECT COUNT(*) as count FROM entities WHERE meeting_id = ?')
  const result = stmt.get(meetingId) as { count: number }

  return result.count
}
