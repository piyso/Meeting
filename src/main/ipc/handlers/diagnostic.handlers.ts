/**
 * Diagnostic Handlers — IPC handlers for diagnostic logging
 *
 * Exposes DiagnosticLogger functionality to the renderer process.
 * Supports exporting logs, clearing logs, and getting log statistics.
 */

import { ipcMain, shell } from 'electron'
import { getDiagnosticLogger } from '../../services/DiagnosticLogger'
import { Logger } from '../../services/Logger'

const log = Logger.create('DiagnosticHandlers')

export function registerDiagnosticHandlers(): void {
  // diagnostic:export — Export all diagnostic logs as an archive
  ipcMain.handle('diagnostic:export', async () => {
    try {
      const logger = getDiagnosticLogger()
      const archivePath = await logger.exportLogs()
      return { success: true, data: { path: archivePath } }
    } catch (error) {
      log.error('Failed to export diagnostics', error)
      return {
        success: false,
        error: {
          code: 'DIAGNOSTIC_EXPORT_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // diagnostic:clear — Clear all diagnostic logs
  ipcMain.handle('diagnostic:clear', async () => {
    try {
      const logger = getDiagnosticLogger()
      logger.clearLogs()
      return { success: true, data: undefined }
    } catch (error) {
      log.error('Failed to clear diagnostics', error)
      return {
        success: false,
        error: {
          code: 'DIAGNOSTIC_CLEAR_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // diagnostic:stats — Get log statistics
  ipcMain.handle('diagnostic:stats', async () => {
    try {
      const logger = getDiagnosticLogger()
      const stats = logger.getLogStats()
      return { success: true, data: stats }
    } catch (error) {
      log.error('Failed to get diagnostic stats', error)
      return {
        success: false,
        error: {
          code: 'DIAGNOSTIC_STATS_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // diagnostic:openFolder — Open the log directory in file explorer
  ipcMain.handle('diagnostic:openFolder', async () => {
    try {
      const logger = getDiagnosticLogger()
      const logDir = logger.getLogDirectory()
      await shell.openPath(logDir)
      return { success: true, data: undefined }
    } catch (error) {
      log.error('Failed to open diagnostics folder', error)
      return {
        success: false,
        error: {
          code: 'DIAGNOSTIC_OPEN_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // diagnostic:getSystemInfo — Get system info for support
  ipcMain.handle('diagnostic:getSystemInfo', async () => {
    try {
      const logger = getDiagnosticLogger()
      const info = logger.getSystemInfo()
      return { success: true, data: info }
    } catch (error) {
      log.error('Failed to get system info', error)
      return {
        success: false,
        error: {
          code: 'DIAGNOSTIC_SYSTEM_INFO_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // diagnostic:rebuildFts — Rebuild FTS5 search indexes
  ipcMain.handle('diagnostic:rebuildFts', async () => {
    try {
      const { getDatabaseService } = await import('../../services/DatabaseService')
      const result = getDatabaseService().rebuildFtsIndexes()
      log.info('FTS rebuild result:', result)
      return { success: true, data: result }
    } catch (error) {
      log.error('Failed to rebuild FTS indexes', error)
      return {
        success: false,
        error: {
          code: 'FTS_REBUILD_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })
}
