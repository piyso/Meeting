import { ipcMain } from 'electron'
import { getDatabase } from '../../database/connection'
import { Logger } from '../../services/Logger'

const log = Logger.create('ExportHandlers')

/**
 * Export handlers for GDPR data export (Starter+)
 * Allows users to export all their data in JSON or Markdown format.
 */
export function registerExportHandlers(): void {
  // export:userData — Export all user data (GDPR Article 20: every tier, no gate)
  ipcMain.handle('export:userData', async (_, params) => {
    try {
      const { dialog } = await import('electron')
      const format = params?.format === 'markdown' ? 'markdown' : 'json'
      const ext = format === 'markdown' ? 'md' : 'json'

      const { filePath } = await dialog.showSaveDialog({
        title: 'Export My Data',
        defaultPath: `bluearkive-export-${new Date().toISOString().split('T')[0]}.${ext}`,
        filters: [{ name: format === 'markdown' ? 'Markdown' : 'JSON', extensions: [ext] }],
      })
      // No path = the dialog was cancelled; nothing was written.
      if (!filePath) return { success: true, data: { content: '', format } }

      // Written straight to the file, in batches (see UserDataExport).
      const { writeUserDataExport } = await import('../../services/UserDataExport')
      const result = await writeUserDataExport(getDatabase(), filePath, format)
      log.info(`Data export written: ${result.bytes} bytes`)

      return {
        success: true,
        data: { content: '', format, filePath, bytes: result.bytes, stats: result.stats },
      }
    } catch (error) {
      log.error('Data export failed', error)
      return {
        success: false,
        error: {
          code: 'EXPORT_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // export:deleteAllData — GDPR right to be forgotten (deletes local + requests cloud deletion)
  ipcMain.handle('export:deleteAllData', async () => {
    try {
      // GDPR Article 17: Right to erasure applies to ALL tiers — including
      // people who use the app locally without ever creating an account.
      // (An earlier revision required a signed-in user here. That blocked
      // local-only users from erasing their own data and protected nothing:
      // any script able to call this handler is already running in a
      // signed-in renderer.)
      // A recording in progress keeps writing rows for a meeting that is about
      // to disappear; every one of those writes would fail from then on.
      const { getAudioPipelineService } = await import('../../services/AudioPipelineService')
      if (getAudioPipelineService().getStatus().isCapturing) {
        return {
          success: false,
          error: {
            code: 'RECORDING_IN_PROGRESS',
            message: 'Stop the recording before deleting all data.',
            timestamp: Date.now(),
          },
        }
      }

      const { getAuthService } = await import('../../services/AuthService')
      const currentUser = await getAuthService().getCurrentUser()

      // Request cloud data deletion (signed-in accounts only)
      let cloudDeleted = false
      let cloudExportUrl: string | undefined
      if (currentUser) {
        try {
          const { getBackend } = await import('../../services/backend/BackendSingleton')
          const backend = getBackend()
          const health = await backend.healthCheck()
          if (health.status === 'healthy') {
            // F6: Create a GDPR export before deletion. The link is returned
            // to the caller — it is never written to the log file.
            try {
              const exportResult = await backend.exportAll('all')
              cloudExportUrl = exportResult?.download_url || undefined
            } catch (exportErr) {
              log.warn('Pre-deletion cloud export failed', exportErr)
            }

            cloudDeleted = await backend.deleteAllData()
          }
        } catch (err) {
          log.warn('Cloud data deletion failed', err)
        }
      }

      // Delete local data
      const db = getDatabase()
      // Every table that holds user content, in FK order (children first).
      const tables = [
        'transcripts',
        'notes',
        'entities',
        'action_items',
        'sentiment_scores',
        'webhook_deliveries', // BEFORE webhooks (FK constraint)
        'webhooks',
        'calendar_events',
        'digests',
        'audio_highlights',
        'sync_queue',
        'sync_remote_ids',
        'query_usage',
        'meeting_templates',
        'devices',
        'audit_logs',
        'encryption_keys',
        'speaker_profiles', // voiceprints — biometric data
        'episodic_memory',
        'telemetry_events',
        'notifications',
        'export_history',
        'backups',
        'settings',
        'meetings', // LAST — parent table referenced by FKs above
      ]

      // Backup files are full copies of the database — remove them too.
      let backupFiles: string[] = []
      try {
        backupFiles = (
          db.prepare('SELECT file_path FROM backups').all() as Array<{ file_path: string }>
        ).map(row => row.file_path)
      } catch {
        // Table may not exist in older DB schemas
      }

      // Tables that still hold rows after the wipe. A table that does not
      // exist (older schema) has nothing to delete; any other failure means
      // personal data is still on disk and must not be reported as deleted.
      const notDeleted: string[] = []
      const wipe = db.transaction(() => {
        for (const table of tables) {
          try {
            db.prepare(`DELETE FROM ${table}`).run()
          } catch (tableErr) {
            const message = tableErr instanceof Error ? tableErr.message : String(tableErr)
            if (!/no such table/i.test(message)) {
              notDeleted.push(table)
              log.error(`Could not delete ${table}:`, message)
            }
          }
        }
        // External-content FTS indexes: 'delete-all' drops every indexed term.
        for (const fts of ['transcripts_fts', 'notes_fts', 'entities_fts', 'action_items_fts']) {
          try {
            db.prepare(`INSERT INTO ${fts}(${fts}) VALUES('delete-all')`).run()
          } catch {
            // FTS table may not exist
          }
        }
      })
      wipe()

      // Deleted rows stay readable in the file's free pages and in the WAL
      // until they are overwritten. Rewrite the file and truncate the log.
      try {
        db.pragma('wal_checkpoint(TRUNCATE)')
        db.exec('VACUUM')
        db.pragma('wal_checkpoint(TRUNCATE)')
      } catch (vacuumErr) {
        log.warn('Post-deletion VACUUM failed', vacuumErr)
      }

      // Files that live outside the database
      const fs = await import('fs')
      const path = await import('path')
      const { app, session } = await import('electron')
      const userData = app.getPath('userData')

      for (const file of backupFiles) {
        fs.rmSync(file, { force: true })
      }
      for (const dir of [
        path.join(userData, 'backups'), // pre-migration and scheduled backups
        path.join(userData, 'cache', 'audio'), // unsaved recording chunks
      ]) {
        try {
          fs.rmSync(dir, { recursive: true, force: true })
        } catch (rmErr) {
          log.warn(`Could not remove ${path.basename(dir)}`, rmErr)
        }
      }

      // The note editor keeps each meeting's document in IndexedDB (plus
      // drafts in localStorage) inside the renderer's storage partition.
      try {
        await session.defaultSession.clearStorageData({
          storages: ['indexdb', 'localstorage'],
        })
      } catch (storageErr) {
        log.warn('Could not clear renderer storage', storageErr)
      }

      // Diagnostic logs name meetings and devices.
      try {
        const { getDiagnosticLogger } = await import('../../services/DiagnosticLogger')
        getDiagnosticLogger().clearLogs()
      } catch (logErr) {
        log.warn('Could not clear diagnostic logs', logErr)
      }

      // The stored copy of the recovery phrase protects data that no longer
      // exists. (The sign-in itself is kept: the account still does.)
      if (currentUser) {
        try {
          const { KeyStorageService, KeyType } = await import('../../services/KeyStorageService')
          await KeyStorageService.deleteKey(KeyType.RECOVERY_PHRASE, currentUser.id)
        } catch (keyErr) {
          log.warn('Could not remove stored recovery phrase', keyErr)
        }
      }

      if (notDeleted.length > 0) {
        return {
          success: false,
          error: {
            code: 'DELETE_INCOMPLETE',
            message:
              `Some data could not be deleted (${notDeleted.join(', ')}). ` +
              'Restart the app and try again.',
            timestamp: Date.now(),
          },
        }
      }

      log.info(`Data deletion complete. Cloud: ${cloudDeleted ? 'yes' : 'no'}`)
      return {
        success: true,
        data: {
          localDeleted: true,
          cloudDeleted,
          cloudExportUrl,
          message: cloudDeleted
            ? 'All local and cloud data has been permanently deleted.'
            : currentUser
              ? 'Local data deleted. Cloud deletion could not be confirmed — try again while online.'
              : 'All local data has been permanently deleted.',
        },
      }
    } catch (error) {
      log.error('Data deletion failed', error)
      return {
        success: false,
        error: {
          code: 'DELETE_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })
}
