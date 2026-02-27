/**
 * Unit Tests for Database Connection
 *
 * Run with: node --test src/main/database/__tests__/connection.test.ts
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import fs from 'fs'
import path from 'path'
import { initializeDatabase, getDatabase, closeDatabase, checkDatabaseHealth } from '../connection'

describe('Database Connection', () => {
  const testDbPath = path.join(__dirname, 'test-connection.db')

  before(() => {
    // Clean up any existing test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath)
    }
    if (fs.existsSync(`${testDbPath}-shm`)) {
      fs.unlinkSync(`${testDbPath}-shm`)
    }
    if (fs.existsSync(`${testDbPath}-wal`)) {
      fs.unlinkSync(`${testDbPath}-wal`)
    }
  })

  after(() => {
    closeDatabase()
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath)
    }
    if (fs.existsSync(`${testDbPath}-shm`)) {
      fs.unlinkSync(`${testDbPath}-shm`)
    }
    if (fs.existsSync(`${testDbPath}-wal`)) {
      fs.unlinkSync(`${testDbPath}-wal`)
    }
  })

  it('should initialize database with WAL mode', () => {
    const db = initializeDatabase({ filename: testDbPath })

    assert.ok(db, 'Database should be initialized')

    const health = checkDatabaseHealth()
    assert.strictEqual(health.walMode, true, 'WAL mode should be enabled')
    assert.strictEqual(health.foreignKeys, true, 'Foreign keys should be enabled')
    assert.strictEqual(health.isHealthy, true, 'Database should be healthy')
  })

  it('should create all required tables', () => {
    const db = getDatabase()

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>

    const tableNames = tables.map(t => t.name)

    assert.ok(tableNames.includes('meetings'), 'meetings table should exist')
    assert.ok(tableNames.includes('transcripts'), 'transcripts table should exist')
    assert.ok(tableNames.includes('notes'), 'notes table should exist')
    assert.ok(tableNames.includes('entities'), 'entities table should exist')
    assert.ok(tableNames.includes('sync_queue'), 'sync_queue table should exist')
    assert.ok(tableNames.includes('encryption_keys'), 'encryption_keys table should exist')
    assert.ok(tableNames.includes('schema_version'), 'schema_version table should exist')
  })

  it('should create FTS5 virtual tables', () => {
    const db = getDatabase()

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%_fts'")
      .all() as Array<{ name: string }>

    const tableNames = tables.map(t => t.name)

    assert.ok(tableNames.includes('transcripts_fts'), 'transcripts_fts should exist')
    assert.ok(tableNames.includes('notes_fts'), 'notes_fts should exist')
  })

  it('should create all required indexes', () => {
    const db = getDatabase()

    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'")
      .all() as Array<{ name: string }>

    const indexNames = indexes.map(i => i.name)

    assert.ok(
      indexNames.includes('idx_transcripts_meeting'),
      'idx_transcripts_meeting should exist'
    )
    assert.ok(indexNames.includes('idx_transcripts_time'), 'idx_transcripts_time should exist')
    assert.ok(indexNames.includes('idx_notes_meeting'), 'idx_notes_meeting should exist')
    assert.ok(indexNames.includes('idx_entities_meeting'), 'idx_entities_meeting should exist')
    assert.ok(indexNames.includes('idx_entities_type'), 'idx_entities_type should exist')
    assert.ok(indexNames.includes('idx_sync_queue_pending'), 'idx_sync_queue_pending should exist')
  })

  it('should track schema version', () => {
    const db = getDatabase()

    const version = db
      .prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1')
      .get() as { version: number }

    assert.strictEqual(version.version, 1, 'Schema version should be 1')
  })

  it('should throw error when getting database before initialization', () => {
    closeDatabase()

    assert.throws(
      () => getDatabase(),
      /Database not initialized/,
      'Should throw error when database not initialized'
    )

    // Re-initialize for other tests
    initializeDatabase({ filename: testDbPath })
  })
})
