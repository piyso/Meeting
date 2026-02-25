/**
 * Logger Service — Structured logging for PiyAPI Notes
 *
 * Features:
 * - Log levels: debug, info, warn, error
 * - Environment-based filtering via LOG_LEVEL
 * - Structured output with ISO timestamp + module tag
 * - File logging via Electron's app log path
 * - Drop-in replacement for console.log
 *
 * Usage:
 *   import { Logger } from '../services/Logger'
 *   const log = Logger.create('SyncManager')
 *   log.info('Sync started', { userId, batchSize: 50 })
 *   log.error('Sync failed', error)
 */

import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { config } from '../config/environment'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

/** Maximum log file size before rotation (5MB) */
const MAX_LOG_SIZE = 5 * 1024 * 1024

class LoggerInstance {
  private module: string
  private static logFilePath: string | null = null
  private static logStream: fs.WriteStream | null = null

  constructor(module: string) {
    this.module = module
  }

  /** Initialize file logging (call once during app startup) */
  static initFileLogging(): void {
    try {
      const logDir = app.getPath('logs')
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true })
      }
      LoggerInstance.logFilePath = path.join(logDir, 'piyapi-notes.log')

      // Rotate if too large
      if (
        fs.existsSync(LoggerInstance.logFilePath) &&
        fs.statSync(LoggerInstance.logFilePath).size > MAX_LOG_SIZE
      ) {
        const rotatedPath = LoggerInstance.logFilePath + '.old'
        if (fs.existsSync(rotatedPath)) fs.unlinkSync(rotatedPath)
        fs.renameSync(LoggerInstance.logFilePath, rotatedPath)
      }

      LoggerInstance.logStream = fs.createWriteStream(LoggerInstance.logFilePath, { flags: 'a' })
    } catch {
      // File logging not available (e.g., during tests)
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[config.LOG_LEVEL]
  }

  private format(level: LogLevel, message: string, data?: unknown): string {
    const timestamp = new Date().toISOString()
    const base = `${timestamp} [${level.toUpperCase().padEnd(5)}] [${this.module}] ${message}`
    if (data !== undefined) {
      if (data instanceof Error) {
        return `${base} — ${data.message}\n${data.stack || ''}`
      }
      try {
        return `${base} ${JSON.stringify(data)}`
      } catch {
        return `${base} [unstringifiable data]`
      }
    }
    return base
  }

  private write(level: LogLevel, message: string, data?: unknown): void {
    if (!this.shouldLog(level)) return

    const formatted = this.format(level, message, data)

    // Console output
    switch (level) {
      case 'debug':
        console.debug(formatted)
        break
      case 'info':
        console.log(formatted)
        break
      case 'warn':
        console.warn(formatted)
        break
      case 'error':
        console.error(formatted)
        break
    }

    // File output
    if (LoggerInstance.logStream) {
      LoggerInstance.logStream.write(formatted + '\n')
    }
  }

  debug(message: string, data?: unknown): void {
    this.write('debug', message, data)
  }

  info(message: string, data?: unknown): void {
    this.write('info', message, data)
  }

  warn(message: string, data?: unknown): void {
    this.write('warn', message, data)
  }

  error(message: string, data?: unknown): void {
    this.write('error', message, data)
  }
}

/**
 * Logger factory — creates module-scoped loggers
 *
 * @example
 * const log = Logger.create('SyncManager')
 * log.info('Sync complete', { count: 42 })
 */
export const Logger = {
  /** Create a module-scoped logger */
  create(module: string): LoggerInstance {
    return new LoggerInstance(module)
  },

  /** Initialize file logging (call once in main.ts) */
  initFileLogging(): void {
    LoggerInstance.initFileLogging()
  },
}
