/**
 * Renderer Logger
 *
 * Lightweight logger for the renderer process.
 * Wraps console methods with a tag prefix and respects log level.
 * In production, only warn/error are emitted.
 */

// Vite injects import.meta.env at build time; fallback for non-Vite envs

const isDev =
  !!(globalThis as unknown as Record<string, unknown>).__VUE_DEVTOOLS_GLOBAL_HOOK__ ||
  process.env.NODE_ENV !== 'production'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const MIN_LEVEL: LogLevel = isDev ? 'debug' : 'warn'

function shouldLog(level: LogLevel): boolean {
  return LOG_PRIORITY[level] >= LOG_PRIORITY[MIN_LEVEL]
}

function createLogger(tag: string) {
  const prefix = `[${tag}]`
  return {
    debug: (...args: unknown[]) => {
      if (shouldLog('debug')) console.debug(prefix, ...args)
    },
    info: (...args: unknown[]) => {
      if (shouldLog('info')) console.info(prefix, ...args)
    },
    warn: (...args: unknown[]) => {
      if (shouldLog('warn')) console.warn(prefix, ...args)
    },
    error: (...args: unknown[]) => {
      if (shouldLog('error')) console.error(prefix, ...args)
    },
  }
}

export const rendererLog = {
  create: createLogger,
}
