/**
 * BackupService — Automatic SQLite backups with restore capability
 *
 * Creates timestamped backups of the SQLite database. Supports manual
 * and scheduled backups with configurable retention.
 */

import fs from 'fs'
import path from 'path'
import { createHash } from 'crypto'
import { app } from 'electron'
import { Logger } from './Logger'
import { getDatabaseService } from './DatabaseService'
import { v4 as uuidv4 } from 'uuid'

const log = Logger.create('BackupService')

export interface BackupInfo {
  id: string
  filePath: string
  sizeBytes: number
  createdAt: number
  schemaVersion: number
  checksum: string
}

export class BackupService {
  private backupDir: string
  private timer: ReturnType<typeof setInterval> | null = null
  private static readonly BACKUP_INTERVAL_MS = 6 * 60 * 60 * 1000 // 6 hours
  private static readonly MAX_BACKUPS = 10

  constructor() {
    this.backupDir = path.join(app.getPath('userData'), 'backups')
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true })
    }
  }

  /**
   * Create a backup of the current database.
   */
  async createBackup(): Promise<BackupInfo> {
    const db = getDatabaseService().getDb()

    // Ensure WAL is checkpointed so the backup is consistent
    db.pragma('wal_checkpoint(TRUNCATE)')

    const timestamp = Date.now()
    const fileName = `piynotes-backup-${new Date(timestamp).toISOString().replace(/[:.]/g, '-')}.sqlite`
    const filePath = path.join(this.backupDir, fileName)

    // Validate path contains only safe characters for VACUUM INTO
    const safePath = filePath.replace(/[^a-zA-Z0-9_\-\/\\.\\: ]/g, '')
    if (safePath !== filePath) {
      throw new Error('Backup path contains unsafe characters')
    }

    // Use VACUUM INTO for a clean copy (available in SQLite 3.27+)
    db.exec(`VACUUM INTO '${safePath.replace(/'/g, "''")}'`)

    const stats = fs.statSync(filePath)
    const checksum = this.computeChecksum(filePath)

    const backup: BackupInfo = {
      id: uuidv4(),
      filePath,
      sizeBytes: stats.size,
      createdAt: timestamp,
      schemaVersion: this.getSchemaVersion(),
      checksum,
    }

    // Persist backup metadata
    db.prepare(
      'INSERT INTO backups (id, file_path, size_bytes, created_at, schema_version, checksum) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      backup.id,
      backup.filePath,
      backup.sizeBytes,
      backup.createdAt,
      backup.schemaVersion,
      backup.checksum
    )

    log.info(`Backup created: ${fileName} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`)

    // Enforce retention
    this.enforceRetention()

    return backup
  }

  /**
   * Restore from a backup file.
   */
  async restoreFromBackup(backupId: string): Promise<boolean> {
    const db = getDatabaseService().getDb()
    const backup = db.prepare('SELECT * FROM backups WHERE id = ?').get(backupId) as
      | BackupInfo
      | undefined
    if (!backup) throw new Error(`Backup not found: ${backupId}`)
    if (!fs.existsSync(backup.filePath)) throw new Error(`Backup file missing: ${backup.filePath}`)

    // Close current DB, replace with backup, reopen
    const dbPath = db.name || ''
    db.close()

    // Keep a safety copy of current DB
    const safetyPath = dbPath + '.pre-restore'
    fs.copyFileSync(dbPath, safetyPath)

    try {
      fs.copyFileSync(backup.filePath, dbPath)
      // Reopen the database after successful file replacement.
      // Without this, getDatabaseService().getDb() returns a closed handle.
      getDatabaseService().reopenDb()
      log.info(`Restored from backup: ${backup.filePath}`)
      return true
    } catch (err) {
      // Restore safety copy on failure, then reopen
      fs.copyFileSync(safetyPath, dbPath)
      try {
        getDatabaseService().reopenDb()
      } catch {
        /* best-effort reopen */
      }
      log.error('Restore failed, reverted to pre-restore state:', err)
      throw err
    } finally {
      try {
        fs.unlinkSync(safetyPath)
      } catch {
        /* cleanup */
      }
    }
  }

  /**
   * List all backups.
   */
  listBackups(): BackupInfo[] {
    try {
      const db = getDatabaseService().getDb()
      return db.prepare('SELECT * FROM backups ORDER BY created_at DESC').all() as BackupInfo[]
    } catch {
      return []
    }
  }

  /**
   * Delete a backup.
   */
  deleteBackup(backupId: string): boolean {
    try {
      const db = getDatabaseService().getDb()
      const backup = db.prepare('SELECT * FROM backups WHERE id = ?').get(backupId) as
        | BackupInfo
        | undefined
      if (backup && fs.existsSync(backup.filePath)) {
        fs.unlinkSync(backup.filePath)
      }
      db.prepare('DELETE FROM backups WHERE id = ?').run(backupId)
      return true
    } catch (err) {
      log.warn('Failed to delete backup:', err)
      return false
    }
  }

  /**
   * Start scheduled automatic backups.
   */
  startScheduledBackups(): void {
    if (this.timer) return // Already running
    this.timer = setInterval(() => {
      this.createBackup().catch(err => log.warn('Scheduled backup failed:', err))
    }, BackupService.BACKUP_INTERVAL_MS)
    if (this.timer.unref) this.timer.unref()
    log.info('Scheduled backups started (every 6 hours)')
  }

  stopScheduledBackups(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  // ── Private ──

  private enforceRetention(): void {
    try {
      const db = getDatabaseService().getDb()
      const backups = db
        .prepare('SELECT * FROM backups ORDER BY created_at DESC')
        .all() as BackupInfo[]
      const toDelete = backups.slice(BackupService.MAX_BACKUPS)
      for (const b of toDelete) {
        this.deleteBackup(b.id)
      }
    } catch {
      /* non-critical */
    }
  }

  private getSchemaVersion(): number {
    try {
      const db = getDatabaseService().getDb()
      const row = db.prepare('SELECT MAX(version) as v FROM schema_migrations').get() as
        | { v: number }
        | undefined
      return row?.v ?? 0
    } catch {
      return 0
    }
  }

  private computeChecksum(filePath: string): string {
    try {
      const hash = createHash('sha256')
      // Stream the file in 64KB chunks instead of loading the entire
      // database into memory. A 500MB+ DB would cause OOM otherwise.
      const fd = fs.openSync(filePath, 'r')
      const buf = Buffer.alloc(65536)
      let bytesRead: number
      while ((bytesRead = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
        hash.update(buf.subarray(0, bytesRead))
      }
      fs.closeSync(fd)
      return hash.digest('hex')
    } catch {
      return 'unknown'
    }
  }
}

let instance: BackupService | null = null

export function getBackupService(): BackupService {
  if (!instance) instance = new BackupService()
  return instance
}
