/**
 * Database Schema for BlueArkive
 *
 * This file contains all SQL schema definitions for the SQLite database.
 * Includes tables, indexes, FTS5 full-text search, and triggers.
 */

export const SCHEMA_VERSION = 3

/**
 * Core table schemas
 */
export const CREATE_TABLES = `
-- Meetings table
CREATE TABLE IF NOT EXISTS meetings (
  id TEXT PRIMARY KEY,
  title TEXT,
  start_time INTEGER NOT NULL,
  end_time INTEGER,
  duration INTEGER,
  participant_count INTEGER,
  tags TEXT,
  namespace TEXT DEFAULT 'default',
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  synced_at INTEGER DEFAULT 0,
  performance_tier TEXT
);

-- Transcripts table
-- NOTE: start_time/end_time are REAL (seconds with sub-second precision)
-- while meetings.start_time is INTEGER (epoch seconds). This is intentional —
-- transcripts need sub-second alignment for audio sync.
CREATE TABLE IF NOT EXISTS transcripts (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL,
  start_time REAL NOT NULL,
  end_time REAL NOT NULL,
  text TEXT NOT NULL,
  confidence REAL,
  speaker_id TEXT,
  speaker_name TEXT,
  words TEXT,
  embedding TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  synced_at INTEGER DEFAULT 0,
  FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
);

-- Notes table
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL,
  timestamp REAL NOT NULL,
  original_text TEXT NOT NULL,
  augmented_text TEXT,
  context TEXT,
  is_augmented BOOLEAN DEFAULT 0,
  version INTEGER DEFAULT 1,
  vector_clock TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  synced_at INTEGER DEFAULT 0,
  FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
);

-- Entities table
CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL,
  type TEXT NOT NULL,
  text TEXT NOT NULL,
  confidence REAL,
  start_offset INTEGER,
  end_offset INTEGER,
  transcript_id TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
  FOREIGN KEY (transcript_id) REFERENCES transcripts(id) ON DELETE CASCADE
);

-- Sync queue table
CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY,
  operation_type TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  payload TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  last_attempt INTEGER
);

-- Encryption keys table
CREATE TABLE IF NOT EXISTS encryption_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  salt BLOB NOT NULL,
  recovery_phrase_hash TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Query usage tracking (Starter tier: 50 AI queries/month)
CREATE TABLE IF NOT EXISTS query_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  type TEXT NOT NULL DEFAULT 'cloud_ai'
);

-- Devices table
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_name TEXT NOT NULL,
  platform TEXT NOT NULL,
  hostname TEXT NOT NULL,
  app_version TEXT NOT NULL,
  is_active BOOLEAN DEFAULT 1,
  last_sync_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Audit logs table (immutable)
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id TEXT,
  old_value TEXT,
  new_value TEXT,
  metadata TEXT,
  ip_address TEXT,
  user_agent TEXT,
  timestamp TEXT NOT NULL
);

-- NOTE: schema_version table is created by connection.ts initializeSchema()
-- which handles version tracking logic. Not duplicated here.

-- Action items extracted from meetings
CREATE TABLE IF NOT EXISTS action_items (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL,
  text TEXT NOT NULL,
  assignee TEXT,
  deadline INTEGER,
  priority TEXT DEFAULT 'normal',
  status TEXT DEFAULT 'open',
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  completed_at INTEGER,
  FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
);

-- Weekly/monthly AI digest summaries
CREATE TABLE IF NOT EXISTS digests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  period_type TEXT NOT NULL DEFAULT 'weekly',
  start_date INTEGER NOT NULL,
  end_date INTEGER NOT NULL,
  summary TEXT NOT NULL,
  highlights TEXT,
  meeting_count INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Reusable meeting templates
CREATE TABLE IF NOT EXISTS meeting_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  agenda TEXT,
  default_tags TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Audio highlight bookmarks
CREATE TABLE IF NOT EXISTS audio_highlights (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL,
  start_time REAL NOT NULL,
  end_time REAL NOT NULL,
  label TEXT,
  color TEXT DEFAULT '#7c3aed',
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
);
`

/**
 * Index definitions for query optimization
 */
export const CREATE_INDEXES = `
-- Meetings indexes
CREATE INDEX IF NOT EXISTS idx_meetings_start ON meetings(start_time DESC);
CREATE INDEX IF NOT EXISTS idx_meetings_namespace ON meetings(namespace);

-- Transcripts indexes
CREATE INDEX IF NOT EXISTS idx_transcripts_meeting ON transcripts(meeting_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_time ON transcripts(meeting_id, start_time);
CREATE INDEX IF NOT EXISTS idx_transcripts_embedding ON transcripts(id) WHERE embedding IS NOT NULL;

-- Notes indexes
CREATE INDEX IF NOT EXISTS idx_notes_meeting ON notes(meeting_id);
CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);

-- Entities indexes
CREATE INDEX IF NOT EXISTS idx_entities_meeting ON entities(meeting_id);
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
CREATE INDEX IF NOT EXISTS idx_entities_meeting_type ON entities(meeting_id, type);

-- Sync queue indexes
CREATE INDEX IF NOT EXISTS idx_sync_queue_pending ON sync_queue(retry_count, created_at);
CREATE INDEX IF NOT EXISTS idx_sync_queue_created ON sync_queue(created_at);

-- Devices indexes
CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_active ON devices(user_id, is_active);

-- Audit logs indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_operation ON audit_logs(operation);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table ON audit_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);

-- Action items indexes
CREATE INDEX IF NOT EXISTS idx_action_items_meeting ON action_items(meeting_id);
CREATE INDEX IF NOT EXISTS idx_action_items_status ON action_items(status);
CREATE INDEX IF NOT EXISTS idx_action_items_assignee ON action_items(assignee);

-- Digests indexes
CREATE INDEX IF NOT EXISTS idx_digests_user ON digests(user_id);
CREATE INDEX IF NOT EXISTS idx_digests_period ON digests(period_type, start_date);

-- Audio highlights indexes
CREATE INDEX IF NOT EXISTS idx_audio_highlights_meeting ON audio_highlights(meeting_id);

-- Query usage index
CREATE INDEX IF NOT EXISTS idx_query_usage_timestamp ON query_usage(timestamp);
`

/**
 * FTS5 full-text search virtual tables
 */
export const CREATE_FTS_TABLES = `
-- Transcripts full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS transcripts_fts USING fts5(
  text,
  content=transcripts,
  content_rowid=rowid
);

-- Notes full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  original_text,
  augmented_text,
  content=notes,
  content_rowid=rowid
);

-- Entities full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS entities_fts USING fts5(
  text,
  content=entities,
  content_rowid=rowid
);
`

/**
 * FTS5 triggers to keep search indexes synchronized
 */
export const CREATE_FTS_TRIGGERS = `
-- Transcripts FTS triggers (with WHEN guards to avoid re-indexing on non-text updates)
CREATE TRIGGER IF NOT EXISTS transcripts_fts_insert AFTER INSERT ON transcripts BEGIN
  INSERT INTO transcripts_fts(rowid, text) VALUES (new.rowid, new.text);
END;

CREATE TRIGGER IF NOT EXISTS transcripts_fts_delete AFTER DELETE ON transcripts BEGIN
  INSERT INTO transcripts_fts(transcripts_fts, rowid, text) 
  VALUES ('delete', old.rowid, old.text);
END;

CREATE TRIGGER IF NOT EXISTS transcripts_fts_update AFTER UPDATE ON transcripts
  WHEN old.text IS NOT new.text
BEGIN
  INSERT INTO transcripts_fts(transcripts_fts, rowid, text) 
  VALUES ('delete', old.rowid, old.text);
  INSERT INTO transcripts_fts(rowid, text) VALUES (new.rowid, new.text);
END;

-- Notes FTS triggers (with WHEN guards to avoid re-indexing on non-text updates)
CREATE TRIGGER IF NOT EXISTS notes_fts_insert AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(rowid, original_text, augmented_text) 
  VALUES (new.rowid, new.original_text, new.augmented_text);
END;

CREATE TRIGGER IF NOT EXISTS notes_fts_delete AFTER DELETE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, original_text, augmented_text) 
  VALUES ('delete', old.rowid, old.original_text, old.augmented_text);
END;

CREATE TRIGGER IF NOT EXISTS notes_fts_update AFTER UPDATE ON notes
  WHEN old.original_text IS NOT new.original_text OR old.augmented_text IS NOT new.augmented_text
BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, original_text, augmented_text) 
  VALUES ('delete', old.rowid, old.original_text, old.augmented_text);
  INSERT INTO notes_fts(rowid, original_text, augmented_text) 
  VALUES (new.rowid, new.original_text, new.augmented_text);
END;

-- Entities FTS triggers
CREATE TRIGGER IF NOT EXISTS entities_fts_insert AFTER INSERT ON entities BEGIN
  INSERT INTO entities_fts(rowid, text) VALUES (new.rowid, new.text);
END;

CREATE TRIGGER IF NOT EXISTS entities_fts_delete AFTER DELETE ON entities BEGIN
  INSERT INTO entities_fts(entities_fts, rowid, text)
  VALUES ('delete', old.rowid, old.text);
END;

CREATE TRIGGER IF NOT EXISTS entities_fts_update AFTER UPDATE ON entities
  WHEN old.text IS NOT new.text
BEGIN
  INSERT INTO entities_fts(entities_fts, rowid, text)
  VALUES ('delete', old.rowid, old.text);
  INSERT INTO entities_fts(rowid, text) VALUES (new.rowid, new.text);
END;
`

/**
 * Complete schema initialization
 * Executes all schema creation statements in the correct order
 */
export const INITIALIZE_SCHEMA = [
  CREATE_TABLES,
  CREATE_INDEXES,
  CREATE_FTS_TABLES,
  CREATE_FTS_TRIGGERS,
].join('\n\n')
