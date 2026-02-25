/**
 * Database Migration System
 *
 * Manages database schema migrations with version tracking.
 * Migrations are applied sequentially and tracked in the schema_version table.
 */

import Database from 'better-sqlite3'

/**
 * Migration definition
 */
export interface Migration {
  version: number
  name: string
  up: string
  down?: string
}

/**
 * Migration registry
 * Add new migrations here in sequential order
 */
export const MIGRATIONS: Migration[] = [
  // Migration 1: Initial schema (handled by schema.ts)
  {
    version: 1,
    name: 'initial_schema',
    up: '-- Initial schema created by schema.ts',
    down: undefined,
  },

  // Future migrations will be added here
  // Example:
  // {
  //   version: 2,
  //   name: 'add_meeting_tags_index',
  //   up: 'CREATE INDEX idx_meetings_tags ON meetings(tags);',
  //   down: 'DROP INDEX IF EXISTS idx_meetings_tags;'
  // }
]

/**
 * Get current database schema version
 */
export function getCurrentVersion(db: Database.Database): number {
  try {
    const result = db
      .prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1')
      .get() as { version: number } | undefined

    return result?.version || 0
  } catch (error) {
    // schema_version table doesn't exist yet
    return 0
  }
}

/**
 * Get pending migrations
 */
export function getPendingMigrations(db: Database.Database): Migration[] {
  const currentVersion = getCurrentVersion(db)
  return MIGRATIONS.filter(m => m.version > currentVersion)
}

/**
 * Apply a single migration
 */
export function applyMigration(db: Database.Database, migration: Migration): void {
  console.log(`Applying migration ${migration.version}: ${migration.name}`)

  const applyMigrationTxn = db.transaction(() => {
    // Execute migration SQL
    if (migration.up && migration.up !== '-- Initial schema created by schema.ts') {
      db.exec(migration.up)
    }

    // Record migration in schema_version table
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(migration.version)

    console.log(`Migration ${migration.version} applied successfully`)
  })

  applyMigrationTxn()
}

/**
 * Apply all pending migrations
 */
export function applyPendingMigrations(db: Database.Database): void {
  const pending = getPendingMigrations(db)

  if (pending.length === 0) {
    console.log('No pending migrations')
    return
  }

  console.log(`Applying ${pending.length} pending migration(s)...`)

  for (const migration of pending) {
    applyMigration(db, migration)
  }

  console.log('All migrations applied successfully')
}

/**
 * Rollback a migration (if down migration is defined)
 */
export function rollbackMigration(db: Database.Database, version: number): void {
  const migration = MIGRATIONS.find(m => m.version === version)

  if (!migration) {
    throw new Error(`Migration version ${version} not found`)
  }

  if (!migration.down) {
    throw new Error(`Migration ${version} does not have a rollback defined`)
  }

  console.log(`Rolling back migration ${version}: ${migration.name}`)

  const rollbackTxn = db.transaction(() => {
    // Execute rollback SQL
    db.exec(migration.down!)

    // Remove migration record
    db.prepare('DELETE FROM schema_version WHERE version = ?').run(version)

    console.log(`Migration ${version} rolled back successfully`)
  })

  rollbackTxn()
}

/**
 * Get migration history
 */
export function getMigrationHistory(db: Database.Database): Array<{
  version: number
  applied_at: number
}> {
  try {
    return db
      .prepare('SELECT version, applied_at FROM schema_version ORDER BY version ASC')
      .all() as Array<{ version: number; applied_at: number }>
  } catch (error) {
    return []
  }
}

/**
 * Validate migration integrity
 * Ensures all migrations up to current version are present
 */
export function validateMigrations(db: Database.Database): {
  isValid: boolean
  errors: string[]
} {
  const currentVersion = getCurrentVersion(db)
  const errors: string[] = []

  // Check that all migrations up to current version exist
  for (let v = 1; v <= currentVersion; v++) {
    const migration = MIGRATIONS.find(m => m.version === v)
    if (!migration) {
      errors.push(`Missing migration for version ${v}`)
    }
  }

  // Check for duplicate versions
  const versions = MIGRATIONS.map(m => m.version)
  const uniqueVersions = new Set(versions)
  if (versions.length !== uniqueVersions.size) {
    errors.push('Duplicate migration versions detected')
  }

  // Check that versions are sequential
  const sortedVersions = [...versions].sort((a, b) => a - b)
  for (let i = 0; i < sortedVersions.length; i++) {
    if (sortedVersions[i] !== i + 1) {
      errors.push(
        `Migration versions are not sequential (expected ${i + 1}, found ${sortedVersions[i]})`
      )
      break
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}

/**
 * Reset database to specific version
 * WARNING: This will rollback all migrations after the target version
 */
export function resetToVersion(db: Database.Database, targetVersion: number): void {
  const currentVersion = getCurrentVersion(db)

  if (targetVersion > currentVersion) {
    throw new Error(
      `Cannot reset to version ${targetVersion}: current version is ${currentVersion}`
    )
  }

  if (targetVersion === currentVersion) {
    console.log(`Already at version ${targetVersion}`)
    return
  }

  console.log(`Resetting database from version ${currentVersion} to ${targetVersion}...`)

  // Rollback migrations in reverse order
  for (let v = currentVersion; v > targetVersion; v--) {
    rollbackMigration(db, v)
  }

  console.log(`Database reset to version ${targetVersion}`)
}
