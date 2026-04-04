/**
 * Crash Reporter — Sentry integration for BlueArkive
 *
 * G7: Activated Sentry SDK (@sentry/electron).
 * Conditionally initializes when SENTRY_DSN is set.
 * Graceful no-op in development (when DSN is empty).
 *
 * Features:
 * - Captures unhandled rejections + uncaught exceptions
 * - Attaches hardware tier + plan tier as context
 * - Breadcrumbs for IPC calls
 * - Session tracking
 *
 * Usage:
 *   import { CrashReporter } from './services/CrashReporter'
 *   CrashReporter.init()  // Call once in main.ts
 */

import { config } from '../config/environment'
import { app } from 'electron'
import { Logger } from './Logger'

const log = Logger.create('CrashReporter')

// Lazy-loaded Sentry module reference
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Sentry: any = null

interface CrashContext {
  hardwareTier?: string
  planTier?: string
  userId?: string
  appVersion?: string
}

class CrashReporterService {
  private initialized = false
  private sentryAvailable = false
  private context: CrashContext = {}

  /**
   * Initialize crash reporting
   * No-op if SENTRY_DSN is not set
   */
  init(): void {
    if (this.initialized) return

    if (!config.SENTRY_DSN) {
      log.info('No SENTRY_DSN set — crash reporting disabled')
      this.initialized = true
      return
    }

    try {
      // G7: Load @sentry/electron dynamically to handle missing native module gracefully

      Sentry = require('@sentry/electron')
      Sentry.init({
        dsn: config.SENTRY_DSN,
        release: `bluearkive@${this.getAppVersion()}`,
        environment: config.IS_DEV ? 'development' : 'production',
        // Don't send events in dev unless DSN is explicitly set
        enabled: true,
        // Attach stack traces to non-Error events
        attachStacktrace: true,
        // Sample rate for performance monitoring (0 = disabled, 1 = 100%)
        tracesSampleRate: config.IS_DEV ? 1.0 : 0.1,
        // Filter events before sending
        beforeSend(event: { environment?: string }) {
          // Don't send development events unless intentional
          if (event.environment === 'development' && !config.SENTRY_DSN) {
            return null
          }
          return event
        },
      })

      this.sentryAvailable = true
      this.initialized = true
      log.info('Sentry initialized successfully', { dsn: config.SENTRY_DSN.slice(0, 20) + '...' })
    } catch (error) {
      // @sentry/electron native module may fail to load on some platforms
      log.warn('Sentry SDK failed to load (crash reporting disabled):', error)
      this.sentryAvailable = false
      this.initialized = true
    }
  }

  /**
   * Set user/device context for error reports
   */
  setContext(context: Partial<CrashContext>): void {
    this.context = { ...this.context, ...context }

    if (this.sentryAvailable && Sentry) {
      Sentry.setContext('device', {
        hardwareTier: this.context.hardwareTier,
        planTier: this.context.planTier,
      })
      if (this.context.userId) {
        Sentry.setUser({ id: this.context.userId })
      }
    }
  }

  /**
   * Capture an exception
   */
  captureException(error: Error, extra?: Record<string, unknown>): void {
    if (!this.initialized) return

    // Always log locally
    log.error(`Exception: ${error.message}`, {
      stack: error.stack,
      context: this.context,
      ...extra,
    })

    if (this.sentryAvailable && Sentry) {
      Sentry.captureException(error, { extra })
    }
  }

  /**
   * Capture a message
   */
  captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'error'): void {
    if (!this.initialized) return

    log.info(`Message (${level}): ${message}`)

    if (this.sentryAvailable && Sentry) {
      Sentry.captureMessage(message, level)
    }
  }

  /**
   * Add a breadcrumb for debugging
   */
  addBreadcrumb(category: string, message: string, data?: Record<string, unknown>): void {
    if (this.sentryAvailable && Sentry) {
      Sentry.addBreadcrumb({ category, message, data })
    }
  }

  /**
   * Get app version for context
   */
  getAppVersion(): string {
    try {
      return app.getVersion()
    } catch {
      return 'unknown'
    }
  }
}

/** Singleton crash reporter */
export const CrashReporter = new CrashReporterService()
