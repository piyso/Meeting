/**
 * DatabaseMigrationService — Versioned schema migrations
 *
 * Ensures the SQLite schema stays in sync with code across app updates.
 * Each migration is idempotent and runs in a transaction.
 */

import { Logger } from './Logger'
import { getDatabaseService } from './DatabaseService'

const log = Logger.create('DBMigration')

interface Migration {
  version: number
  name: string
  up: (db: ReturnType<ReturnType<typeof getDatabaseService>['getDb']>) => void
}

const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: _db => {
      // Schema is created by connection.ts initializeSchema() which runs
      // before migrations. This migration exists as a version anchor only.
    },
  },
  {
    version: 2,
    name: 'add_telemetry_table',
    up: db => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS telemetry_events (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          session_id TEXT NOT NULL,
          properties TEXT DEFAULT '{}'
        )
      `)
      try {
        db.exec(
          'CREATE INDEX IF NOT EXISTS idx_telemetry_type_time ON telemetry_events(type, timestamp)'
        )
      } catch {
        /* index exists */
      }
    },
  },
  {
    version: 3,
    name: 'add_sync_queue',
    up: db => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS sync_queue (
          id TEXT PRIMARY KEY,
          operation_type TEXT NOT NULL,
          table_name TEXT NOT NULL,
          record_id TEXT NOT NULL,
          payload TEXT DEFAULT '{}',
          status TEXT DEFAULT 'pending',
          retry_count INTEGER DEFAULT 0,
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `)
      try {
        db.exec('CREATE INDEX IF NOT EXISTS idx_sync_status ON sync_queue(status, created_at)')
      } catch {
        /* index exists */
      }
    },
  },
  {
    version: 4,
    name: 'add_episodic_memory',
    up: db => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS episodic_memory (
          id TEXT PRIMARY KEY,
          start_time INTEGER NOT NULL,
          end_time INTEGER NOT NULL,
          text TEXT NOT NULL,
          confidence REAL DEFAULT 0.8,
          created_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `)
      try {
        db.exec(
          'CREATE INDEX IF NOT EXISTS idx_episodic_time ON episodic_memory(start_time, end_time)'
        )
      } catch {
        /* index exists */
      }
    },
  },
  {
    version: 5,
    name: 'add_speaker_profiles',
    up: db => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS speaker_profiles (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          voiceprint TEXT NOT NULL,
          sample_count INTEGER DEFAULT 0,
          last_seen_at INTEGER DEFAULT 0,
          created_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `)
    },
  },
  {
    version: 6,
    name: 'add_calendar_events',
    up: db => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS calendar_events (
          id TEXT PRIMARY KEY,
          provider TEXT NOT NULL DEFAULT 'apple',
          external_id TEXT,
          title TEXT NOT NULL,
          description TEXT,
          location TEXT,
          start_time INTEGER NOT NULL,
          end_time INTEGER NOT NULL,
          attendees TEXT,
          organizer TEXT,
          is_all_day INTEGER DEFAULT 0,
          meeting_id TEXT,
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          FOREIGN KEY (meeting_id) REFERENCES meetings(id)
        )
      `)
      try {
        db.exec(
          'CREATE INDEX IF NOT EXISTS idx_calendar_time ON calendar_events(start_time, end_time)'
        )
        db.exec(
          'CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_external ON calendar_events(provider, external_id)'
        )
      } catch {
        /* index exists */
      }
    },
  },
  {
    version: 7,
    name: 'add_backup_metadata',
    up: db => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS backups (
          id TEXT PRIMARY KEY,
          file_path TEXT NOT NULL,
          size_bytes INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          schema_version INTEGER NOT NULL,
          checksum TEXT
        )
      `)
    },
  },
  {
    version: 8,
    name: 'add_export_history',
    up: db => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS export_history (
          id TEXT PRIMARY KEY,
          meeting_id TEXT NOT NULL,
          format TEXT NOT NULL,
          file_path TEXT,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (meeting_id) REFERENCES meetings(id)
        )
      `)
    },
  },
  {
    version: 9,
    name: 'add_notifications',
    up: db => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS notifications (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          message TEXT,
          meeting_id TEXT,
          action_item_id TEXT,
          scheduled_for INTEGER,
          delivered_at INTEGER,
          dismissed_at INTEGER,
          created_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `)
      try {
        db.exec(
          'CREATE INDEX IF NOT EXISTS idx_notif_scheduled ON notifications(scheduled_for, delivered_at)'
        )
      } catch {
        /* index exists */
      }
    },
  },
  {
    version: 10,
    name: 'add_missing_columns_for_existing_users',
    up: db => {
      // Add deleted_at to meetings if missing (existing users before schema v5)
      try {
        const hasDeletedAt = db
          .prepare(
            "SELECT COUNT(*) as cnt FROM pragma_table_info('meetings') WHERE name='deleted_at'"
          )
          .get() as { cnt: number }
        if (!hasDeletedAt || hasDeletedAt.cnt === 0) {
          db.exec('ALTER TABLE meetings ADD COLUMN deleted_at INTEGER')
        }
      } catch {
        /* column may already exist */
      }
      // Add segment_index to entities if missing
      try {
        const hasSegIdx = db
          .prepare(
            "SELECT COUNT(*) as cnt FROM pragma_table_info('entities') WHERE name='segment_index'"
          )
          .get() as { cnt: number }
        if (!hasSegIdx || hasSegIdx.cnt === 0) {
          db.exec('ALTER TABLE entities ADD COLUMN segment_index INTEGER DEFAULT 0')
        }
      } catch {
        /* column may already exist */
      }
      // Add metadata to entities if missing
      try {
        const hasMeta = db
          .prepare(
            "SELECT COUNT(*) as cnt FROM pragma_table_info('entities') WHERE name='metadata'"
          )
          .get() as { cnt: number }
        if (!hasMeta || hasMeta.cnt === 0) {
          db.exec("ALTER TABLE entities ADD COLUMN metadata TEXT DEFAULT '{}'")
        }
      } catch {
        /* column may already exist */
      }
    },
  },
]

export class DatabaseMigrationService {
  async runMigrations(): Promise<number> {
    const db = getDatabaseService().getDb()

    // schema_version table is created by connection.ts initializeSchema()
    // which handles version tracking logic. We reuse it here.

    const currentVersion = this.getCurrentVersion(db)
    log.info(`Current schema version: ${currentVersion}`)

    let applied = 0

    for (const migration of migrations) {
      if (migration.version <= currentVersion) continue

      log.info(`Applying migration v${migration.version}: ${migration.name}`)

      try {
        const txn = db.transaction(() => {
          migration.up(db)
          db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(
            migration.version
          )
        })
        txn()
        applied++
        log.info(`Migration v${migration.version} applied successfully`)
      } catch (err) {
        log.error(`Migration v${migration.version} failed:`, err)
        throw err
      }
    }

    if (applied > 0) {
      log.info(`Applied ${applied} migrations. Schema now at v${this.getCurrentVersion(db)}`)
    } else {
      log.info('Schema is up to date')
    }

    return applied
  }

  getCurrentVersion(db = getDatabaseService().getDb()): number {
    try {
      const row = db.prepare('SELECT MAX(version) as version FROM schema_version').get() as {
        version: number | null
      }
      return row?.version ?? 0
    } catch {
      return 0
    }
  }

  getMigrationHistory(): Array<{ version: number; applied_at: number }> {
    try {
      const db = getDatabaseService().getDb()
      return db
        .prepare('SELECT version, applied_at FROM schema_version ORDER BY version')
        .all() as Array<{ version: number; applied_at: number }>
    } catch {
      return []
    }
  }
}

let instance: DatabaseMigrationService | null = null

export function getDatabaseMigrationService(): DatabaseMigrationService {
  if (!instance) {
    instance = new DatabaseMigrationService()
  }
  return instance
}
