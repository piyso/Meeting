/**
 * Database Type Definitions
 *
 * TypeScript interfaces for all database tables and operations
 */

/**
 * Meeting record
 */
export interface Meeting {
  id: string
  title: string | null
  start_time: number
  end_time: number | null
  duration: number | null
  participant_count: number | null
  tags: string | null // JSON array
  namespace: string
  created_at: number
  synced_at: number
  performance_tier: string | null
}

export interface CreateMeetingInput {
  id: string
  title?: string
  start_time: number
  end_time?: number
  duration?: number
  participant_count?: number
  tags?: string[]
  namespace?: string
  performance_tier?: string
}

export interface UpdateMeetingInput {
  title?: string
  end_time?: number
  duration?: number
  participant_count?: number
  tags?: string[]
  performance_tier?: string
}

/**
 * Transcript record
 */
export interface Transcript {
  id: string
  meeting_id: string
  start_time: number
  end_time: number
  text: string
  confidence: number | null
  speaker_id: string | null
  speaker_name: string | null
  words: string | null // JSON array
  created_at: number
  synced_at: number
}

export interface Word {
  word: string
  start: number
  end: number
  confidence: number
}

export interface CreateTranscriptInput {
  id: string
  meeting_id: string
  start_time: number
  end_time: number
  text: string
  confidence?: number
  speaker_id?: string
  speaker_name?: string
  words?: Word[]
}

export interface UpdateTranscriptInput {
  text?: string
  confidence?: number
  speaker_id?: string
  speaker_name?: string
  words?: Word[]
}

/**
 * Note record
 */
export interface Note {
  id: string
  meeting_id: string
  timestamp: number
  original_text: string
  augmented_text: string | null
  context: string | null
  is_augmented: boolean
  version: number
  created_at: number
  updated_at: number
  synced_at: number
}

export interface CreateNoteInput {
  id: string
  meeting_id: string
  timestamp: number
  original_text: string
  augmented_text?: string
  context?: string
  is_augmented?: boolean
}

export interface UpdateNoteInput {
  original_text?: string
  augmented_text?: string
  context?: string
  is_augmented?: boolean
}

/**
 * Entity record
 */
export interface Entity {
  id: string
  meeting_id: string
  type: string
  text: string
  confidence: number | null
  start_offset: number | null
  end_offset: number | null
  transcript_id: string | null
  created_at: number
}

export type EntityType =
  | 'PERSON'
  | 'DATE'
  | 'AMOUNT'
  | 'TOPIC'
  | 'EMAIL'
  | 'PHONE'
  | 'ORGANIZATION'
  | 'LOCATION'
  | 'DOCUMENT'
  | 'URL'

export interface CreateEntityInput {
  id: string
  meeting_id: string
  type: EntityType
  text: string
  confidence?: number
  start_offset?: number
  end_offset?: number
  transcript_id?: string
}

/**
 * Sync queue record
 */
export interface SyncQueueItem {
  id: string
  operation_type: string
  table_name: string
  record_id: string
  payload: string | null // JSON
  retry_count: number
  created_at: number
  last_attempt: number | null
}

export type OperationType = 'create' | 'update' | 'delete'

export interface CreateSyncQueueInput {
  id: string
  operation_type: OperationType
  table_name: string
  record_id: string
  payload?: Record<string, unknown>
}

/**
 * Encryption key record
 */
export interface EncryptionKey {
  id: string
  user_id: string
  salt: Buffer
  recovery_phrase_hash: string | null
  created_at: number
}

export interface CreateEncryptionKeyInput {
  id: string
  user_id: string
  salt: Buffer
  recovery_phrase_hash?: string
}

/**
 * Search result types
 */
export interface TranscriptSearchResult {
  transcript: Transcript
  meeting: Meeting
  rank: number
  snippet: string
}

export interface NoteSearchResult {
  note: Note
  meeting: Meeting
  rank: number
  snippet: string
}
