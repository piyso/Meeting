/**
 * Database Schema for BlueArkive
 *
 * This file contains all SQL schema definitions for the SQLite database.
 * Includes tables, indexes, FTS5 full-text search, and triggers.
 */

export const SCHEMA_VERSION = 1

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
`

/**
 * Index definitions for query optimization
 */
export const CREATE_INDEXES = `
-- Transcripts indexes
CREATE INDEX IF NOT EXISTS idx_transcripts_meeting ON transcripts(meeting_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_time ON transcripts(meeting_id, start_time);
CREATE INDEX IF NOT EXISTS idx_transcripts_embedding ON transcripts(id) WHERE embedding IS NOT NULL;

-- Notes indexes
CREATE INDEX IF NOT EXISTS idx_notes_meeting ON notes(meeting_id);

-- Entities indexes
CREATE INDEX IF NOT EXISTS idx_entities_meeting ON entities(meeting_id);
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);

-- Sync queue indexes
CREATE INDEX IF NOT EXISTS idx_sync_queue_pending ON sync_queue(operation_type, retry_count);

-- Devices indexes
CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_active ON devices(user_id, is_active);

-- Audit logs indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_operation ON audit_logs(operation);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table ON audit_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
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
`

/**
 * FTS5 triggers to keep search indexes synchronized
 */
export const CREATE_FTS_TRIGGERS = `
-- Transcripts FTS triggers
CREATE TRIGGER IF NOT EXISTS transcripts_fts_insert AFTER INSERT ON transcripts BEGIN
  INSERT INTO transcripts_fts(rowid, text) VALUES (new.rowid, new.text);
END;

CREATE TRIGGER IF NOT EXISTS transcripts_fts_delete AFTER DELETE ON transcripts BEGIN
  INSERT INTO transcripts_fts(transcripts_fts, rowid, text) 
  VALUES ('delete', old.rowid, old.text);
END;

CREATE TRIGGER IF NOT EXISTS transcripts_fts_update AFTER UPDATE ON transcripts BEGIN
  INSERT INTO transcripts_fts(transcripts_fts, rowid, text) 
  VALUES ('delete', old.rowid, old.text);
  INSERT INTO transcripts_fts(rowid, text) VALUES (new.rowid, new.text);
END;

-- Notes FTS triggers
CREATE TRIGGER IF NOT EXISTS notes_fts_insert AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(rowid, original_text, augmented_text) 
  VALUES (new.rowid, new.original_text, new.augmented_text);
END;

CREATE TRIGGER IF NOT EXISTS notes_fts_delete AFTER DELETE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, original_text, augmented_text) 
  VALUES ('delete', old.rowid, old.original_text, old.augmented_text);
END;

CREATE TRIGGER IF NOT EXISTS notes_fts_update AFTER UPDATE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, original_text, augmented_text) 
  VALUES ('delete', old.rowid, old.original_text, old.augmented_text);
  INSERT INTO notes_fts(rowid, original_text, augmented_text) 
  VALUES (new.rowid, new.original_text, new.augmented_text);
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
