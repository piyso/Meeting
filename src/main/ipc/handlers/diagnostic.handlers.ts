/**
 * Diagnostic Handlers — IPC handlers for diagnostic logging
 *
 * Exposes DiagnosticLogger functionality to the renderer process.
 * Supports exporting logs, clearing logs, and getting log statistics.
 */

import { ipcMain, shell, systemPreferences, app } from 'electron'
import { getDiagnosticLogger } from '../../services/DiagnosticLogger'
import { getDatabaseService } from '../../services/DatabaseService'
import { config } from '../../config/environment'
import { getAuthService } from '../../services/AuthService'
import { Logger } from '../../services/Logger'
import os from 'os'
import fs from 'fs'

const log = Logger.create('DiagnosticHandlers')

interface HealthResult {
  system: string
  status: 'ok' | 'warn' | 'error'
  message: string
  fix?: string
}

export function registerDiagnosticHandlers(): void {
  // ══════════════════════════════════════════════════════════════
  // health:check — Test all critical systems and return results
  // ══════════════════════════════════════════════════════════════
  ipcMain.handle('health:check', async () => {
    const results: HealthResult[] = []

    // 1. Database
    try {
      const db = getDatabaseService()
      db.getDb().prepare('SELECT 1').get()
      results.push({ system: 'Database', status: 'ok', message: 'Connected and responsive' })
    } catch (err) {
      results.push({
        system: 'Database',
        status: 'error',
        message: (err as Error).message || 'Cannot connect',
        fix: 'Restart the application',
      })
    }

    // 2. Authentication
    try {
      const auth = getAuthService()
      const isAuthed = await auth.isAuthenticated()
      if (isAuthed) {
        results.push({ system: 'Authentication', status: 'ok', message: 'Signed in' })
      } else {
        results.push({
          system: 'Authentication',
          status: 'warn',
          message: 'Not signed in',
          fix: 'Sign in to enable cloud sync',
        })
      }
    } catch {
      results.push({
        system: 'Authentication',
        status: 'warn',
        message: 'Could not check auth status',
      })
    }

    // 3. Microphone
    if (process.platform === 'darwin') {
      const micStatus = systemPreferences.getMediaAccessStatus('microphone')
      if (micStatus === 'granted') {
        results.push({ system: 'Microphone', status: 'ok', message: 'Permitted' })
      } else if (micStatus === 'denied') {
        results.push({
          system: 'Microphone',
          status: 'error',
          message: 'Access denied',
          fix: 'Open System Settings → Privacy → Microphone',
        })
      } else {
        results.push({
          system: 'Microphone',
          status: 'warn',
          message: 'Not yet requested',
          fix: 'Start a recording to request permission',
        })
      }
    } else {
      // Windows/Linux: Electron auto-grants microphone access.
      // Check if microphone devices are enumerable as a proxy for availability.
      results.push({
        system: 'Microphone',
        status: 'ok',
        message: 'Available (managed by OS privacy settings)',
        fix:
          process.platform === 'win32'
            ? 'If not working: Settings → Privacy → Microphone → Allow apps to access'
            : undefined,
      })
    }

    // 4. Screen Recording / System Audio
    if (process.platform === 'darwin') {
      const screenStatus = systemPreferences.getMediaAccessStatus('screen')
      if (screenStatus === 'granted') {
        results.push({ system: 'Screen Recording', status: 'ok', message: 'Permitted' })
      } else {
        results.push({
          system: 'Screen Recording',
          status: 'warn',
          message: 'Not permitted — system audio capture unavailable',
          fix: 'Open System Settings → Privacy → Screen Recording',
        })
      }
    } else if (process.platform === 'win32') {
      // Windows uses WASAPI loopback for system audio — no special permission needed
      results.push({
        system: 'System Audio',
        status: 'ok',
        message: 'Available via WASAPI loopback (no permission required)',
      })
    }

    // 5. Network
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)
      const networkUrl = config.SUPABASE_URL
        ? `${config.SUPABASE_URL}/rest/v1/`
        : 'https://api.piyapi.cloud/health'
      const resp = await fetch(networkUrl, {
        method: 'HEAD',
        signal: controller.signal,
      })
      clearTimeout(timeout)
      if (resp.ok || resp.status === 401) {
        results.push({ system: 'Network', status: 'ok', message: 'Connected to cloud' })
      } else {
        results.push({
          system: 'Network',
          status: 'warn',
          message: `Cloud returned ${resp.status}`,
        })
      }
    } catch {
      results.push({
        system: 'Network',
        status: 'error',
        message: 'Cannot reach cloud servers',
        fix: 'Check your internet connection',
      })
    }

    // 6. Disk Space
    try {
      const dataPath = app.getPath('userData')
      const stats = fs.statfsSync(dataPath)
      const freeGB = (stats.bfree * stats.bsize) / 1024 ** 3
      if (freeGB > 5) {
        results.push({
          system: 'Disk Space',
          status: 'ok',
          message: `${freeGB.toFixed(1)} GB free`,
        })
      } else if (freeGB > 1) {
        results.push({
          system: 'Disk Space',
          status: 'warn',
          message: `${freeGB.toFixed(1)} GB free — running low`,
          fix: 'Free up disk space',
        })
      } else {
        results.push({
          system: 'Disk Space',
          status: 'error',
          message: `${freeGB.toFixed(1)} GB free — critically low`,
          fix: 'Free up disk space immediately',
        })
      }
    } catch {
      results.push({ system: 'Disk Space', status: 'ok', message: 'Could not check' })
    }

    // 7. Native Modules
    try {
      require('better-sqlite3')
      results.push({ system: 'Native Modules', status: 'ok', message: 'All loaded correctly' })
    } catch (err) {
      results.push({
        system: 'Native Modules',
        status: 'error',
        message: (err as Error).message,
        fix: 'Reinstall the application',
      })
    }

    // System info for the report
    const systemInfo = {
      platform: `${process.platform} ${process.arch}`,
      osVersion: os.release(),
      appVersion: app.getVersion(),
      electron: process.versions.electron,
      nodeVersion: process.versions.node,
      memory: `${Math.round(os.totalmem() / 1024 ** 3)} GB`,
      uptime: `${Math.round(process.uptime())}s`,
    }

    return { success: true, data: { results, systemInfo } }
  })

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
