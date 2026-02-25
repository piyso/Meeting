/**
 * Diagnostic Logger Service
 * Task 12.6: Save test results for diagnostics
 *
 * Logs audio test results and diagnostic information to files for support troubleshooting.
 * Features:
 * - Logs test results with timestamps
 * - Platform and system information
 * - Audio device details
 * - Error messages and stack traces
 * - Log rotation to prevent excessive disk usage
 * - User-accessible log location
 */

import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import * as os from 'os'

interface DiagnosticLogEntry {
  timestamp: string
  type: 'test_result' | 'error' | 'info' | 'device_info'
  platform: string
  data: any
}

interface AudioTestDiagnostic {
  timestamp: string
  platform: string
  systemInfo: {
    os: string
    osVersion: string
    arch: string
    totalMemory: string
    freeMemory: string
  }
  systemAudio: {
    available: boolean
    tested: boolean
    error?: string
    deviceInfo?: any
  }
  microphone: {
    available: boolean
    tested: boolean
    error?: string
    deviceInfo?: any
  }
  recommendation: string
  audioLevels?: {
    systemAudioMaxLevel?: number
    microphoneMaxLevel?: number
  }
  deviceSwitchHistory?: Array<{
    from: string
    to: string
    timestamp: number
  }>
}

class DiagnosticLogger {
  private static instance: DiagnosticLogger | null = null
  private logDir: string
  private currentLogFile: string
  private maxLogSize: number = 10 * 1024 * 1024 // 10MB per log file
  private maxLogFiles: number = 5 // Keep last 5 log files

  private constructor() {
    // Store logs in user data directory
    const userDataPath = app.getPath('userData')
    this.logDir = path.join(userDataPath, 'logs')
    this.currentLogFile = path.join(this.logDir, 'diagnostics.log')

    // Ensure log directory exists
    this.ensureLogDirectory()

    // Rotate logs if needed
    this.rotateLogsIfNeeded()
  }

  public static getInstance(): DiagnosticLogger {
    if (!DiagnosticLogger.instance) {
      DiagnosticLogger.instance = new DiagnosticLogger()
    }
    return DiagnosticLogger.instance
  }

  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true })
      console.log(`[DiagnosticLogger] Created log directory: ${this.logDir}`)
    }
  }

  private rotateLogsIfNeeded(): void {
    try {
      if (!fs.existsSync(this.currentLogFile)) {
        return
      }

      const stats = fs.statSync(this.currentLogFile)
      if (stats.size >= this.maxLogSize) {
        this.rotateLogs()
      }
    } catch (error) {
      console.error('[DiagnosticLogger] Failed to check log size:', error)
    }
  }

  private rotateLogs(): void {
    try {
      // Get all log files
      const logFiles = fs
        .readdirSync(this.logDir)
        .filter(file => file.startsWith('diagnostics') && file.endsWith('.log'))
        .sort()
        .reverse()

      // Delete old log files if we have too many
      if (logFiles.length >= this.maxLogFiles) {
        const filesToDelete = logFiles.slice(this.maxLogFiles - 1)
        filesToDelete.forEach(file => {
          const filePath = path.join(this.logDir, file)
          fs.unlinkSync(filePath)
          console.log(`[DiagnosticLogger] Deleted old log file: ${file}`)
        })
      }

      // Rotate current log file
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const rotatedFile = path.join(this.logDir, `diagnostics-${timestamp}.log`)
      fs.renameSync(this.currentLogFile, rotatedFile)
      console.log(`[DiagnosticLogger] Rotated log file to: ${rotatedFile}`)
    } catch (error) {
      console.error('[DiagnosticLogger] Failed to rotate logs:', error)
    }
  }

  private writeLog(entry: DiagnosticLogEntry): void {
    try {
      this.rotateLogsIfNeeded()

      const logLine = JSON.stringify(entry) + '\n'
      fs.appendFileSync(this.currentLogFile, logLine, 'utf8')
    } catch (error) {
      console.error('[DiagnosticLogger] Failed to write log:', error)
    }
  }

  /**
   * Log audio test results for diagnostics
   */
  public logAudioTestResult(diagnostic: AudioTestDiagnostic): void {
    const entry: DiagnosticLogEntry = {
      timestamp: new Date().toISOString(),
      type: 'test_result',
      platform: os.platform(),
      data: diagnostic,
    }

    this.writeLog(entry)
    console.log('[DiagnosticLogger] Logged audio test result')
  }

  /**
   * Log error information
   */
  public logError(error: Error, context?: string): void {
    const entry: DiagnosticLogEntry = {
      timestamp: new Date().toISOString(),
      type: 'error',
      platform: os.platform(),
      data: {
        message: error.message,
        stack: error.stack,
        context,
      },
    }

    this.writeLog(entry)
    console.log('[DiagnosticLogger] Logged error:', error.message)
  }

  /**
   * Log general information
   */
  public logInfo(message: string, data?: any): void {
    const entry: DiagnosticLogEntry = {
      timestamp: new Date().toISOString(),
      type: 'info',
      platform: os.platform(),
      data: {
        message,
        ...data,
      },
    }

    this.writeLog(entry)
  }

  /**
   * Log device information
   */
  public logDeviceInfo(devices: any[]): void {
    const entry: DiagnosticLogEntry = {
      timestamp: new Date().toISOString(),
      type: 'device_info',
      platform: os.platform(),
      data: {
        devices,
        systemInfo: this.getSystemInfo(),
      },
    }

    this.writeLog(entry)
    console.log('[DiagnosticLogger] Logged device information')
  }

  /**
   * Get system information for diagnostics
   */
  private getSystemInfo(): any {
    return {
      os: os.platform(),
      osVersion: os.release(),
      arch: os.arch(),
      totalMemory: `${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB`,
      freeMemory: `${(os.freemem() / 1024 / 1024 / 1024).toFixed(2)} GB`,
      cpus: os.cpus().length,
      cpuModel: os.cpus()[0]?.model || 'Unknown',
    }
  }

  /**
   * Get the path to the log directory
   */
  public getLogDirectory(): string {
    return this.logDir
  }

  /**
   * Get the path to the current log file
   */
  public getCurrentLogFile(): string {
    return this.currentLogFile
  }

  /**
   * Export all logs as a single archive (for support)
   */
  public async exportLogs(): Promise<string> {
    try {
      const exportDir = path.join(this.logDir, 'exports')
      if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir, { recursive: true })
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const exportFile = path.join(exportDir, `diagnostics-export-${timestamp}.json`)

      // Read all log files
      const logFiles = fs
        .readdirSync(this.logDir)
        .filter(file => file.startsWith('diagnostics') && file.endsWith('.log'))

      const allLogs: DiagnosticLogEntry[] = []

      for (const file of logFiles) {
        const filePath = path.join(this.logDir, file)
        const content = fs.readFileSync(filePath, 'utf8')
        const lines = content.split('\n').filter(line => line.trim())

        for (const line of lines) {
          try {
            const entry = JSON.parse(line)
            allLogs.push(entry)
          } catch (error) {
            console.error('[DiagnosticLogger] Failed to parse log line:', error)
          }
        }
      }

      // Write export file
      const exportData = {
        exportedAt: new Date().toISOString(),
        systemInfo: this.getSystemInfo(),
        totalEntries: allLogs.length,
        logs: allLogs,
      }

      fs.writeFileSync(exportFile, JSON.stringify(exportData, null, 2), 'utf8')
      console.log(`[DiagnosticLogger] Exported logs to: ${exportFile}`)

      return exportFile
    } catch (error) {
      console.error('[DiagnosticLogger] Failed to export logs:', error)
      throw error
    }
  }

  /**
   * Clear all logs (for privacy)
   */
  public clearLogs(): void {
    try {
      const logFiles = fs
        .readdirSync(this.logDir)
        .filter(file => file.startsWith('diagnostics') && file.endsWith('.log'))

      for (const file of logFiles) {
        const filePath = path.join(this.logDir, file)
        fs.unlinkSync(filePath)
      }

      console.log('[DiagnosticLogger] Cleared all logs')
    } catch (error) {
      console.error('[DiagnosticLogger] Failed to clear logs:', error)
      throw error
    }
  }

  /**
   * Get log statistics
   */
  public getLogStats(): {
    totalFiles: number
    totalSize: string
    oldestLog: string | null
    newestLog: string | null
  } {
    try {
      const logFiles = fs
        .readdirSync(this.logDir)
        .filter(file => file.startsWith('diagnostics') && file.endsWith('.log'))

      let totalSize = 0
      let oldestTime = Infinity
      let newestTime = 0

      for (const file of logFiles) {
        const filePath = path.join(this.logDir, file)
        const stats = fs.statSync(filePath)
        totalSize += stats.size
        oldestTime = Math.min(oldestTime, stats.mtimeMs)
        newestTime = Math.max(newestTime, stats.mtimeMs)
      }

      return {
        totalFiles: logFiles.length,
        totalSize: `${(totalSize / 1024 / 1024).toFixed(2)} MB`,
        oldestLog: oldestTime !== Infinity ? new Date(oldestTime).toISOString() : null,
        newestLog: newestTime !== 0 ? new Date(newestTime).toISOString() : null,
      }
    } catch (error) {
      console.error('[DiagnosticLogger] Failed to get log stats:', error)
      return {
        totalFiles: 0,
        totalSize: '0 MB',
        oldestLog: null,
        newestLog: null,
      }
    }
  }
}

export function getDiagnosticLogger(): DiagnosticLogger {
  return DiagnosticLogger.getInstance()
}

export { DiagnosticLogger }
export type { AudioTestDiagnostic }
