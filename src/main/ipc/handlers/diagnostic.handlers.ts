/**
 * Diagnostic Handlers — IPC handlers for diagnostic logging
 *
 * Exposes DiagnosticLogger functionality to the renderer process.
 * Supports exporting logs, clearing logs, and getting log statistics.
 * Includes health:check for system-wide diagnostics and health:fix for
 * proactive repair actions (mic permission, screen recording, auth, network).
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
  fixAction?: string
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
          message: 'Access denied by macOS',
          fix: 'Open System Settings → Privacy → Microphone → Enable BlueArkive',
          fixAction: 'request-microphone',
        })
      } else {
        results.push({
          system: 'Microphone',
          status: 'warn',
          message: 'Not yet requested — click Fix to grant access',
          fix: 'Grant microphone access',
          fixAction: 'request-microphone',
        })
      }
    } else {
      // Windows/Linux: Electron auto-grants microphone access.
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
          fix: 'Open System Settings to enable',
          fixAction: 'open-screen-recording',
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

    // 5. Network — multi-stage check for precise diagnostics
    const isMockMode = process.env.USE_MOCK_DATA === 'true'
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
        results.push({
          system: 'Network',
          status: 'ok',
          message: isMockMode
            ? 'Connected (mock mode active — cloud sync disabled)'
            : 'Connected to cloud',
        })
      } else {
        results.push({
          system: 'Network',
          status: 'warn',
          message: `Cloud returned HTTP ${resp.status}${isMockMode ? ' (mock mode active)' : ''}`,
          fix:
            resp.status === 403
              ? 'API key may be expired — check .env'
              : 'Check cloud service status',
        })
      }
    } catch (networkErr: unknown) {
      // Differentiate DNS failure, timeout, and connection refused
      const errMsg = networkErr instanceof Error ? networkErr.message : String(networkErr)
      let diagnosis = 'Cannot reach cloud servers'
      let fixAdvice = 'Check your internet connection'

      if (errMsg.includes('abort') || errMsg.includes('AbortError')) {
        diagnosis = 'Cloud connection timed out (>5s)'
        fixAdvice = 'Check firewall or proxy settings'
      } else if (errMsg.includes('ENOTFOUND') || errMsg.includes('getaddrinfo')) {
        diagnosis = 'DNS resolution failed — cannot find cloud server'
        fixAdvice = 'Check internet connection or DNS settings'
      } else if (errMsg.includes('ECONNREFUSED')) {
        diagnosis = 'Connection refused by cloud server'
        fixAdvice = 'Cloud service may be down — try again later'
      } else if (errMsg.includes('CERT') || errMsg.includes('SSL') || errMsg.includes('TLS')) {
        diagnosis = 'SSL/TLS certificate error'
        fixAdvice = 'Check system clock and certificate settings'
      }

      // Fallback: check if general internet works
      let hasInternet = false
      try {
        const fallbackCtrl = new AbortController()
        const fallbackTimeout = setTimeout(() => fallbackCtrl.abort(), 3000)
        const fallbackResp = await fetch('https://www.google.com/generate_204', {
          method: 'HEAD',
          signal: fallbackCtrl.signal,
        })
        clearTimeout(fallbackTimeout)
        hasInternet = fallbackResp.ok || fallbackResp.status === 204
      } catch {
        hasInternet = false
      }

      if (hasInternet) {
        diagnosis += ' (internet is working — Supabase may be unreachable)'
        fixAdvice = config.SUPABASE_URL
          ? 'Verify SUPABASE_URL in .env is correct'
          : 'Configure SUPABASE_URL in .env to enable cloud'
      }

      if (isMockMode) {
        // In mock mode, network failure is expected and non-critical
        results.push({
          system: 'Network',
          status: 'warn',
          message: `Mock mode active — ${diagnosis.toLowerCase()}`,
          fix: 'Set USE_MOCK_DATA=false in .env to enable cloud connectivity',
        })
      } else {
        results.push({
          system: 'Network',
          status: 'error',
          message: diagnosis,
          fix: fixAdvice,
          fixAction: 'retry-network',
        })
      }
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

  // ══════════════════════════════════════════════════════════════
  // health:fix — Proactive repair actions triggered from HealthDashboard
  // ══════════════════════════════════════════════════════════════
  ipcMain.handle('health:fix', async (_event, action: string) => {
    log.info(`Health fix requested: ${action}`)

    switch (action) {
      case 'request-microphone': {
        if (process.platform === 'darwin') {
          try {
            const granted = await systemPreferences.askForMediaAccess('microphone')
            log.info(`Microphone permission result: ${granted ? 'granted' : 'denied'}`)
            return {
              success: true,
              data: {
                granted,
                message: granted
                  ? 'Microphone access granted'
                  : 'Microphone access denied — enable in System Settings',
              },
            }
          } catch (err) {
            log.error('Failed to request microphone access:', err)
            return {
              success: false,
              error: {
                code: 'MIC_REQUEST_FAILED',
                message: (err as Error).message,
                timestamp: Date.now(),
              },
            }
          }
        }
        return { success: true, data: { granted: true, message: 'Microphone managed by OS' } }
      }

      case 'open-screen-recording': {
        try {
          if (process.platform === 'darwin') {
            await shell.openExternal(
              'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
            )
          } else if (process.platform === 'win32') {
            await shell.openExternal('ms-settings:privacy-microphone')
          }
          return { success: true, data: { message: 'System Settings opened' } }
        } catch (err) {
          return {
            success: false,
            error: {
              code: 'OPEN_SETTINGS_FAILED',
              message: (err as Error).message,
              timestamp: Date.now(),
            },
          }
        }
      }

      case 'open-auth': {
        // Signal renderer to navigate to onboarding/login
        try {
          const { BrowserWindow } = await import('electron')
          const win = BrowserWindow.getAllWindows()[0]
          if (win) {
            win.webContents.send('navigate:onboarding')
          }
          return { success: true, data: { message: 'Opening sign-in flow' } }
        } catch (err) {
          return {
            success: false,
            error: {
              code: 'NAVIGATE_FAILED',
              message: (err as Error).message,
              timestamp: Date.now(),
            },
          }
        }
      }

      case 'retry-network': {
        // Re-run network check only and return result
        try {
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 5000)
          const networkUrl = config.SUPABASE_URL
            ? `${config.SUPABASE_URL}/rest/v1/`
            : 'https://api.piyapi.cloud/health'
          const resp = await fetch(networkUrl, { method: 'HEAD', signal: controller.signal })
          clearTimeout(timeout)
          const ok = resp.ok || resp.status === 401
          return {
            success: true,
            data: {
              connected: ok,
              status: resp.status,
              message: ok ? 'Cloud is reachable' : `Cloud returned ${resp.status}`,
            },
          }
        } catch (err) {
          return {
            success: false,
            error: {
              code: 'NETWORK_RETRY_FAILED',
              message: (err as Error).message,
              timestamp: Date.now(),
            },
          }
        }
      }

      default:
        return {
          success: false,
          error: {
            code: 'UNKNOWN_FIX_ACTION',
            message: `Unknown fix action: ${action}`,
            timestamp: Date.now(),
          },
        }
    }
  })
}
