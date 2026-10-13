/**
 * Logger Service — Structured logging for BlueArkive
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

/** JSON.stringify replacer that keeps the useful parts of Error objects. */
function errorReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Error) {
    const extra = value as Error & { code?: unknown; status?: unknown }
    return {
      name: value.name,
      message: value.message,
      ...(extra.code !== undefined ? { code: extra.code } : {}),
      ...(extra.status !== undefined ? { status: extra.status } : {}),
      stack: value.stack,
    }
  }
  return value
}

class LoggerInstance {
  private module: string
  private static logFilePath: string | null = null
  private static logStream: fs.WriteStream | null = null
  private static bytesWritten = 0

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
      LoggerInstance.logFilePath = path.join(logDir, 'bluearkive.log')

      // Rotate if too large
      if (
        fs.existsSync(LoggerInstance.logFilePath) &&
        fs.statSync(LoggerInstance.logFilePath).size > MAX_LOG_SIZE
      ) {
        const rotatedPath = LoggerInstance.logFilePath + '.old'
        if (fs.existsSync(rotatedPath)) fs.unlinkSync(rotatedPath)
        fs.renameSync(LoggerInstance.logFilePath, rotatedPath)
      }

      const stream = fs.createWriteStream(LoggerInstance.logFilePath, { flags: 'a' })
      // A full disk or revoked permission must cost us the log file, not the app:
      // an unhandled stream 'error' is an uncaught exception in the main process.
      stream.on('error', () => {
        if (LoggerInstance.logStream === stream) LoggerInstance.logStream = null
      })
      LoggerInstance.logStream = stream
      LoggerInstance.bytesWritten = fs.existsSync(LoggerInstance.logFilePath)
        ? fs.statSync(LoggerInstance.logFilePath).size
        : 0
    } catch {
      // File logging not available (e.g., during tests)
    }
  }

  /** Close the current file, keep it as .old, and start a fresh one. */
  private static rotate(): void {
    const filePath = LoggerInstance.logFilePath
    if (!filePath) return
    try {
      LoggerInstance.logStream?.end()
      LoggerInstance.logStream = null
      const rotatedPath = filePath + '.old'
      if (fs.existsSync(rotatedPath)) fs.unlinkSync(rotatedPath)
      if (fs.existsSync(filePath)) fs.renameSync(filePath, rotatedPath)
    } catch {
      /* keep appending to the existing file */
    }
    LoggerInstance.bytesWritten = 0
    LoggerInstance.initFileLogging()
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
        // JSON.stringify(new Error('x')) is "{}" — message and stack are not
        // enumerable — so an error nested in a data object (`{ reason }`,
        // `{ error }`) used to be logged with no description at all.
        return `${base} ${JSON.stringify(data, errorReplacer)}`
      } catch {
        return `${base} [unstringifiable data]`
      }
    }
    return base
  }

  private write(level: LogLevel, message: string, data?: unknown): void {
    if (!this.shouldLog(level)) return

    const formatted = this.format(level, message, data)

    // Console output. stdout/stderr can be closed (terminal gone, launched
    // from Finder); a failed console write must never propagate.
    try {
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
    } catch {
      /* stdio unavailable */
    }

    // File output
    if (LoggerInstance.logStream) {
      try {
        LoggerInstance.logStream.write(formatted + '\n')
        LoggerInstance.bytesWritten += formatted.length + 1
        // The app lives in the tray for days; rotating only at startup let
        // the file grow without bound.
        if (LoggerInstance.bytesWritten > MAX_LOG_SIZE) LoggerInstance.rotate()
      } catch {
        /* file logging unavailable */
      }
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
