/**
 * Migration Service
 *
 * One-time migration from the old `piyapi-notes` app to the new `bluearkive` app.
 * Handles two critical migrations:
 *
 *   1. **Database**: Copies `~/Library/Application Support/piyapi-notes/data/piyapi-notes.db`
 *      → `~/Library/Application Support/bluearkive/data/bluearkive.db`
 *
 *   2. **Keytar credentials**: Reads all credentials stored under the old service
 *      name `piyapi-notes` and writes them under the new service name `bluearkive`.
 *
 * Safety guarantees:
 *   - Idempotent: Uses a marker file to never run twice.
 *   - Non-destructive: Copies data, never deletes the old directory.
 *   - Fail-safe: If any step fails, the app continues normally (new users unaffected).
 *   - Runs BEFORE database initialization in electron/main.ts.
 */

import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { Logger } from './Logger'

const log = Logger.create('Migration')

/** Old app identifiers (pre-rebrand) */
const OLD_APP_NAME = 'piyapi-notes'
const OLD_DB_FILENAME = 'piyapi-notes.db'
const OLD_KEYTAR_SERVICE = 'piyapi-notes'

/** New app identifiers */
const NEW_DB_FILENAME = 'bluearkive.db'
const NEW_KEYTAR_SERVICE = 'bluearkive'

/** Marker file — prevents re-running migration */
const MIGRATION_MARKER = '.migration-v1-complete'

/**
 * Run all migrations if needed.
 * Call this BEFORE getDatabaseService() in electron/main.ts.
 *
 * Safe to call on every app start — it checks the marker file first.
 */
export async function migrateIfNeeded(): Promise<void> {
  const newUserData = app.getPath('userData')
  const markerPath = path.join(newUserData, MIGRATION_MARKER)

  // Already migrated — skip everything
  if (fs.existsSync(markerPath)) {
    return
  }

  // Build the old userData path by replacing the app name in the path
  // macOS: ~/Library/Application Support/<name>
  // Windows: %APPDATA%/<name>
  // Linux: ~/.config/<name>
  const oldUserData = newUserData.replace(path.basename(newUserData), OLD_APP_NAME)

  // If the old directory doesn't exist, this is a fresh install — no migration needed
  if (!fs.existsSync(oldUserData)) {
    writeMarker(markerPath)
    return
  }

  log.info(`Detected old app data at: ${oldUserData}`)
  log.info(`Migrating to: ${newUserData}`)

  try {
    migrateDatabase(oldUserData, newUserData)
  } catch (error) {
    log.error('Database migration failed (non-fatal):', error)
  }

  try {
    // Wrap keytar migration in a timeout — macOS may show a Keychain access
    // dialog that blocks the main thread. If the user doesn't respond within
    // 10 seconds, skip keytar migration (non-destructive; marker still written
    // so it won't retry). The app will function without migrated credentials.
    await Promise.race([
      migrateKeytarCredentials(),
      new Promise<void>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error('Keytar migration timed out (10s) — possible Keychain dialog blocking')
            ),
          10_000
        )
      ),
    ])
  } catch (error) {
    log.error('Keytar migration failed (non-fatal):', error)
  }

  // Mark migration as complete
  writeMarker(markerPath)
  log.info('Migration complete.')
}

/**
 * Copy the old database file and its WAL/SHM companions to the new location.
 *
 * Only runs if:
 *   - The old DB file exists
 *   - The new DB file does NOT exist (avoids overwriting new data)
 */
function migrateDatabase(oldUserData: string, newUserData: string): void {
  const oldDbPath = path.join(oldUserData, 'data', OLD_DB_FILENAME)
  const newDbDir = path.join(newUserData, 'data')
  const newDbPath = path.join(newDbDir, NEW_DB_FILENAME)

  // Guard: old DB must exist
  if (!fs.existsSync(oldDbPath)) {
    log.info('No old database found — skipping DB migration.')
    return
  }

  // Guard: do NOT overwrite if new DB already has data
  if (fs.existsSync(newDbPath)) {
    const newSize = fs.statSync(newDbPath).size
    if (newSize > 4096) {
      // More than an empty SQLite header
      log.info('New database already has data — skipping DB migration.')
      return
    }
  }

  // Ensure new data directory exists
  if (!fs.existsSync(newDbDir)) {
    fs.mkdirSync(newDbDir, { recursive: true })
  }

  // Copy the main database file
  log.info(`Copying database: ${oldDbPath} → ${newDbPath}`)
  fs.copyFileSync(oldDbPath, newDbPath)

  // Copy WAL and SHM companion files if they exist
  const companions = ['-wal', '-shm']
  for (const suffix of companions) {
    const oldCompanion = oldDbPath + suffix
    if (fs.existsSync(oldCompanion)) {
      fs.copyFileSync(oldCompanion, newDbPath + suffix)
      log.info(`Copied companion: ${OLD_DB_FILENAME}${suffix}`)
    }
  }

  // Also copy the models directory if it exists
  const oldModelsDir = path.join(oldUserData, 'models')
  const newModelsDir = path.join(newUserData, 'models')
  if (fs.existsSync(oldModelsDir) && !fs.existsSync(newModelsDir)) {
    copyDirectoryRecursive(oldModelsDir, newModelsDir)
    log.info('Copied models directory.')
  }

  log.info('Database migration complete.')
}

/**
 * Migrate keytar credentials from the old service name to the new one.
 *
 * Reads all credentials stored under `piyapi-notes` and writes each one
 * under `bluearkive`. Does NOT delete the old credentials (non-destructive).
 */
async function migrateKeytarCredentials(): Promise<void> {
  let keytar: {
    findCredentials: (service: string) => Promise<Array<{ account: string; password: string }>>
    getPassword: (service: string, account: string) => Promise<string | null>
    setPassword: (service: string, account: string, password: string) => Promise<void>
  }

  try {
    const TIMEOUT_MS = 5_000
    const mod = await new Promise<typeof import('keytar')>((resolve, reject) => {
      let settled = false
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true
          reject(new Error('Keytar load timed out'))
        }
      }, TIMEOUT_MS)
      import('keytar')
        .then(m => {
          if (!settled) {
            settled = true
            clearTimeout(timer)
            resolve(m)
          }
        })
        .catch(e => {
          if (!settled) {
            settled = true
            clearTimeout(timer)
            reject(e)
          }
        })
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    keytar = (mod as any).default || mod
  } catch {
    log.info('Keytar not available — skipping credential migration.')
    return
  }

  // Find all credentials stored under the old service name
  const oldCredentials = await keytar.findCredentials(OLD_KEYTAR_SERVICE)

  if (oldCredentials.length === 0) {
    log.info('No old keytar credentials found — skipping.')
    return
  }

  log.info(`Found ${oldCredentials.length} credential(s) to migrate.`)

  for (const cred of oldCredentials) {
    // Check if the credential already exists under the new service
    const existing = await keytar.getPassword(NEW_KEYTAR_SERVICE, cred.account)
    if (existing) {
      log.info(`Credential "${cred.account}" already exists — skipping.`)
      continue
    }

    await keytar.setPassword(NEW_KEYTAR_SERVICE, cred.account, cred.password)
    log.info(`Migrated credential: "${cred.account}"`)
  }

  log.info('Keytar migration complete.')
}

/**
 * Write the migration marker file.
 */
function writeMarker(markerPath: string): void {
  try {
    const dir = path.dirname(markerPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(markerPath, `Migrated from ${OLD_APP_NAME} at ${new Date().toISOString()}\n`)
  } catch {
    // Non-critical — migration will re-run next launch (harmless due to guards)
  }
}

/**
 * Recursively copy a directory.
 */
function copyDirectoryRecursive(src: string, dest: string): void {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true })
  }

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)

    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}
