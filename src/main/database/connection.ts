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
import { INITIALIZE_SCHEMA, SCHEMA_VERSION } from './schema'
import { Logger } from '../services/Logger'
const log = Logger.create('Database')

let db: Database.Database | null = null

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

  // Create database connection
  db = new Database(dbPath, {
    readonly: config?.readonly || false,
    fileMustExist: config?.fileMustExist || false,
    timeout: config?.timeout || 5000,
    verbose: config?.verbose,
  })

  // Configure WAL mode for concurrent reads
  db.pragma('journal_mode = WAL')

  // Performance optimizations
  // NOTE: synchronous=NORMAL with WAL can lose the last transaction on power failure.
  // This is an acceptable tradeoff for desktop recording performance.
  // If strict HIPAA durability is required, change to synchronous=FULL.
  db.pragma('synchronous = NORMAL') // Balanced safety/speed
  db.pragma('cache_size = -64000') // 64MB cache
  db.pragma('temp_store = MEMORY') // Store temp tables in memory
  db.pragma('mmap_size = 2000000000') // 2GB memory-mapped I/O
  db.pragma('wal_autocheckpoint = 1000') // Checkpoint every 1000 pages

  // Enable foreign keys
  db.pragma('foreign_keys = ON')

  // Initialize schema
  initializeSchema(db)

  log.info('Database initialized successfully')

  return db
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

  if (version < SCHEMA_VERSION) {
    log.info(`Applying schema version ${SCHEMA_VERSION}...`)

    // Execute schema initialization
    database.exec(INITIALIZE_SCHEMA)

    // Update schema version
    database.prepare('INSERT INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION)

    log.info(`Schema version ${SCHEMA_VERSION} applied successfully`)
  } else {
    log.info(`Schema is up to date (version ${version})`)
  }
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
  if (db) {
    log.info('Closing database connection...')
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

  return {
    isHealthy: true,
    walMode: journalMode === 'wal',
    foreignKeys: foreignKeys === 1,
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
    /* WAL file may not exist yet */
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

  // Use SQLite backup API
  database.backup(backupPath)

  log.info('Database backup complete')
}
