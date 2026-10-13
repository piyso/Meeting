/**
 * Database Connection Manager
 *
 * Manages SQLite database connection with WAL mode for concurrent reads
 * and optimized performance settings.
 */

import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import {
  CREATE_TABLES,
  CREATE_INDEXES,
  CREATE_FTS_TABLES,
  CREATE_FTS_TRIGGERS,
  FTS_TABLE_NAMES,
  SCHEMA_VERSION,
} from './schema'
import { Logger } from '../services/Logger'
const log = Logger.create('Database')

let db: Database.Database | null = null
let walCheckpointTimer: ReturnType<typeof setInterval> | null = null

/**
 * Database configuration options
 */
interface DatabaseConfig {
  filename: string
  readonly?: boolean
  fileMustExist?: boolean
  timeout?: number
  verbose?: (message?: unknown, ...additionalArgs: unknown[]) => void
}

/**
 * Get the database file path
 * Stores database in user data directory
 */
export function getDatabasePath(): string {
  const userDataPath = app.getPath('userData')
  const dbDir = path.join(userDataPath, 'data')

  // Ensure data directory exists
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }

  return path.join(dbDir, 'bluearkive.db')
}

/**
 * Initialize database connection with WAL mode and performance optimizations
 */
export function initializeDatabase(config?: Partial<DatabaseConfig>): Database.Database {
  if (db) {
    return db
  }

  const dbPath = config?.filename || getDatabasePath()

  log.info(`Initializing database at: ${dbPath}`)

  // Create database connection. Configure it through a local handle and only
  // publish it once setup has succeeded: if a pragma or the schema step throws
  // (corrupt file, disk full), a published half-initialised handle would be
  // returned by every later getDatabase() call instead of a clear error.
  const connection = new Database(dbPath, {
    readonly: config?.readonly || false,
    fileMustExist: config?.fileMustExist || false,
    timeout: config?.timeout || 5000,
    verbose: config?.verbose,
  })

  try {
    configureConnection(connection)
  } catch (error) {
    try {
      connection.close()
    } catch {
      /* already unusable */
    }
    throw error
  }
  db = connection

  // Periodic WAL checkpoint to prevent .db-wal file explosion during long recordings.
  // Without this, if a read transaction is held (e.g., FTS5 search) while TranscriptService
  // writes hundreds of rows per minute, the WAL file can grow to multiple GB.
  walCheckpointTimer = setInterval(() => {
    try {
      if (db) {
        db.pragma('wal_checkpoint(PASSIVE)')
      }
    } catch (e) {
      log.debug('Periodic WAL checkpoint skipped:', e instanceof Error ? e.message : String(e))
    }
  }, 300_000) // Every 5 minutes
  // OPT-16: Prevent timer from keeping process alive on Windows (zombie process fix)
  if (walCheckpointTimer.unref) walCheckpointTimer.unref()

  log.info('Database initialized successfully')

  return db
}

/**
 * Apply pragmas and bring the schema up to date on a freshly opened connection.
 */
function configureConnection(connection: Database.Database): void {
  // Configure WAL mode for concurrent reads
  connection.pragma('journal_mode = WAL')

  // Performance optimizations
  // NOTE: synchronous=NORMAL with WAL can lose the last transaction on power failure.
  // This is an acceptable tradeoff for desktop recording performance.
  // If strict HIPAA durability is required, change to synchronous=FULL.
  connection.pragma('synchronous = NORMAL') // Balanced safety/speed
  connection.pragma('cache_size = -8000') // 8MB cache (right-sized for typical DB size)
  connection.pragma('temp_store = MEMORY') // Store temp tables in memory

  // Platform-conditional mmap/busy_timeout: NTFS + Windows Defender causes slower I/O
  const isWindows = process.platform === 'win32'
  connection.pragma(`mmap_size = ${isWindows ? 67108864 : 268435456}`) // 64MB on Windows, 256MB on macOS
  connection.pragma('wal_autocheckpoint = 1000') // Checkpoint every 1000 pages
  connection.pragma(`busy_timeout = ${isWindows ? 10000 : 5000}`) // 10s on Windows (Defender file locks), 5s on macOS

  // Enable foreign keys
  connection.pragma('foreign_keys = ON')

  // Initialize schema
  initializeSchema(connection)
}

/**
 * Initialize database schema
 */
function initializeSchema(database: Database.Database): void {
  // Check if schema version table exists
  const versionTableExists = database
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'")
    .get()

  if (!versionTableExists) {
    // Create schema version table
    database.exec(`
      CREATE TABLE schema_version (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER DEFAULT (strftime('%s', 'now'))
      );
    `)
  }

  // Get current schema version
  const currentVersion = database
    .prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1')
    .get() as { version: number } | undefined

  const version = currentVersion?.version || 0

  // The schema is brought up to date on every start, not only when the stored
  // version is behind. DatabaseMigrationService stamps the same schema_version
  // table with its own (higher) numbers, so a version gate here meant nothing
  // added to schema.ts ever reached an existing database — and a search table
  // dropped by a failed repair was never created again.
  //
  // Order matters: tables first, then columns that later releases added to
  // tables an older release created, and only then the indexes, search tables
  // and triggers, which may reference those columns. (Creating the indexes
  // before the columns existed made every database from v0.3.3 or earlier fail
  // with "no such column: embedding_blob" on every launch.)
  //
  // One transaction: a crash half-way leaves the previous schema intact.
  const migrate = database.transaction(() => {
    database.exec(CREATE_TABLES)

    const added = addMissingColumns(database)
    if (added.length > 0) log.info(`Schema: added columns ${added.join(', ')}`)

    const missingFts = FTS_TABLE_NAMES.filter(name => !tableExists(database, name))
    database.exec(CREATE_INDEXES)
    database.exec(CREATE_FTS_TABLES)
    database.exec(CREATE_FTS_TRIGGERS)
    // A search table created over rows that already exist starts out empty.
    for (const name of missingFts) {
      database.exec(`INSERT INTO ${name}(${name}) VALUES('rebuild')`)
    }
    if (missingFts.length > 0 && version > 0) {
      log.info(`Schema: rebuilt search tables ${missingFts.join(', ')}`)
    }

    if (version < SCHEMA_VERSION) {
      database.prepare('INSERT INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION)
    }
  })

  migrate()
  log.info(
    version < SCHEMA_VERSION
      ? `Schema version ${SCHEMA_VERSION} applied (was ${version})`
      : `Schema is up to date (version ${version})`
  )
}

function tableExists(database: Database.Database, name: string): boolean {
  return !!database
    .prepare("SELECT 1 FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?")
    .get(name)
}

interface ColumnInfo {
  name: string
  type: string
  notnull: number
  dflt_value: string | null
  pk: number
}

/**
 * Add every column that schema.ts declares but an existing table lacks.
 *
 * CREATE TABLE IF NOT EXISTS never alters a table that is already there, so a
 * column added to schema.ts used to need a hand-written ALTER for each release
 * that might be upgrading. Instead, build the current schema in a throwaway
 * in-memory database and compare column lists.
 *
 * Returns the columns added, as "table.column".
 */
function addMissingColumns(database: Database.Database): string[] {
  const reference = new Database(':memory:')
  const added: string[] = []
  try {
    reference.exec(CREATE_TABLES)
    const tables = reference
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all() as Array<{ name: string }>

    for (const { name: table } of tables) {
      if (!tableExists(database, table)) continue
      const expected = reference.pragma(`table_info("${table}")`) as ColumnInfo[]
      const existing = new Set(
        (database.pragma(`table_info("${table}")`) as ColumnInfo[]).map(column => column.name)
      )

      for (const column of expected) {
        if (existing.has(column.name) || column.pk) continue
        // ALTER TABLE ADD COLUMN only accepts a constant default, and a NOT
        // NULL column needs one. Anything else is added as a plain nullable
        // column — existing rows read NULL, which the code already handles for
        // rows written before the column existed.
        const hasConstantDefault = column.dflt_value !== null && !column.dflt_value.includes('(')
        let ddl = `ALTER TABLE "${table}" ADD COLUMN "${column.name}" ${column.type}`
        if (hasConstantDefault) {
          ddl += ` ${column.notnull ? 'NOT NULL ' : ''}DEFAULT ${column.dflt_value}`
        }
        database.exec(ddl)
        added.push(`${table}.${column.name}`)
      }
    }
  } finally {
    reference.close()
  }
  return added
}

/**
 * Get the active database connection
 * Throws error if database is not initialized
 */
export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.')
  }
  return db
}

/**
 * Close database connection
 */
export function closeDatabase(): void {
  if (walCheckpointTimer) {
    clearInterval(walCheckpointTimer)
    walCheckpointTimer = null
  }
  if (db) {
    log.info('Closing database connection...')
    // Final checkpoint before close to flush WAL
    try {
      db.pragma('wal_checkpoint(TRUNCATE)')
    } catch (e) {
      log.debug('Final WAL checkpoint skipped:', e instanceof Error ? e.message : String(e))
    }
    db.close()
    db = null
    log.info('Database connection closed')
  }
}

/**
 * Execute a transaction
 * Automatically handles commit/rollback
 */
export function transaction<T>(fn: (db: Database.Database) => T): T {
  const database = getDatabase()
  const txn = database.transaction(fn)
  return txn(database)
}

/**
 * Check database health
 */
export function checkDatabaseHealth(): {
  isHealthy: boolean
  walMode: boolean
  foreignKeys: boolean
  cacheSize: number
  pageCount: number
  pageSize: number
  fileSize: number
} {
  const database = getDatabase()

  const journalMode = database.pragma('journal_mode', { simple: true }) as string
  const foreignKeys = database.pragma('foreign_keys', { simple: true }) as number
  const cacheSize = database.pragma('cache_size', { simple: true }) as number
  const pageCount = database.pragma('page_count', { simple: true }) as number
  const pageSize = database.pragma('page_size', { simple: true }) as number

  const fileSize = pageCount * pageSize

  const walEnabled = journalMode === 'wal'
  const fkEnabled = foreignKeys === 1
  const isHealthy = walEnabled && fkEnabled

  return {
    isHealthy,
    walMode: walEnabled,
    foreignKeys: fkEnabled,
    cacheSize,
    pageCount,
    pageSize,
    fileSize,
  }
}

/**
 * Optimize database (VACUUM and ANALYZE)
 * Should be run periodically to maintain performance
 */
export function optimizeDatabase(): void {
  const database = getDatabase()

  log.info('Optimizing database...')

  // ANALYZE updates query planner statistics
  database.exec('ANALYZE')

  // VACUUM reclaims unused space (only if needed)
  const pageCount = database.pragma('page_count', { simple: true }) as number
  const freelistCount = database.pragma('freelist_count', { simple: true }) as number

  // Only vacuum if more than 10% of pages are free
  if (freelistCount > pageCount * 0.1) {
    log.info('Running VACUUM to reclaim space...')
    database.exec('VACUUM')
  }

  log.info('Database optimization complete')
}

/**
 * WAL checkpoint — call on meeting stop to merge WAL + reclaim disk
 * Mode: 'TRUNCATE' = full merge + truncate WAL file
 *       'PASSIVE'  = non-blocking partial merge (use during recording)
 */
export function walCheckpoint(mode: 'TRUNCATE' | 'PASSIVE' = 'TRUNCATE'): void {
  const database = getDatabase()
  try {
    database.pragma(`wal_checkpoint(${mode})`)
    log.info(`[DB] WAL checkpoint (${mode}) completed`)
  } catch (error) {
    log.warn(`[DB] WAL checkpoint (${mode}) failed:`, error)
  }
}

/**
 * Emergency WAL health check — blueprint §2.5 (L1241-1251)
 * If WAL file exceeds 500MB, force immediate passive checkpoint.
 * Call periodically (e.g. every 10 minutes during meetings).
 */
export async function walHealthCheck(dbPath: string): Promise<void> {
  const fs = await import('fs/promises')
  try {
    const walSize = (await fs.stat(dbPath + '-wal')).size
    if (walSize > 500 * 1024 * 1024) {
      log.warn(`[DB] WAL file is ${(walSize / 1024 / 1024).toFixed(0)}MB — forcing checkpoint`)
      walCheckpoint('PASSIVE')
    }
  } catch {
    // WAL file may not exist yet — this is normal before first write
  }
}

/**
 * Backup database to specified path
 */
export function backupDatabase(backupPath: string): void {
  const database = getDatabase()

  log.info(`Backing up database to: ${backupPath}`)

  // Ensure backup directory exists
  const backupDir = path.dirname(backupPath)
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true })
  }

  // Use VACUUM INTO for a clean copy (SQLite 3.27+).
  // better-sqlite3's .backup() takes a destination Database object, not a file path.
  database.pragma('wal_checkpoint(TRUNCATE)')
  database.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`)

  log.info('Database backup complete')
}
