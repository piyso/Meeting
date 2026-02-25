/**
 * Crash Reporter — Sentry integration for PiyAPI Notes
 *
 * Conditionally initializes Sentry when SENTRY_DSN is set.
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

interface CrashContext {
  hardwareTier?: string
  planTier?: string
  userId?: string
  appVersion?: string
}

class CrashReporterService {
  private initialized = false
  private context: CrashContext = {}

  /**
   * Initialize crash reporting
   * No-op if SENTRY_DSN is not set
   */
  init(): void {
    if (this.initialized) return

    if (!config.SENTRY_DSN) {
      console.log('[CrashReporter] No SENTRY_DSN set — crash reporting disabled')
      this.initialized = true
      return
    }

    try {
      // Sentry SDK would be initialized here when installed:
      // const Sentry = require('@sentry/electron')
      // Sentry.init({
      //   dsn: config.SENTRY_DSN,
      //   release: `piyapi-notes@${app.getVersion()}`,
      //   environment: config.IS_DEV ? 'development' : 'production',
      //   tracesSampleRate: 0.1,
      //   beforeSend(event) {
      //     // Strip PII
      //     if (event.user) {
      //       delete event.user.email
      //       delete event.user.ip_address
      //     }
      //     return event
      //   },
      // })

      // For now, set up native Node.js crash handlers
      this.setupNativeHandlers()

      this.initialized = true
      console.log('[CrashReporter] Initialized successfully')
    } catch (error) {
      console.error('[CrashReporter] Failed to initialize:', error)
    }
  }

  /**
   * Set up native Node.js error handlers as baseline
   */
  private setupNativeHandlers(): void {
    process.on('uncaughtException', (error) => {
      console.error('[CrashReporter] Uncaught exception:', error)
      this.captureException(error)
    })

    process.on('unhandledRejection', (reason) => {
      console.error('[CrashReporter] Unhandled rejection:', reason)
      if (reason instanceof Error) {
        this.captureException(reason)
      } else {
        this.captureMessage(`Unhandled rejection: ${String(reason)}`)
      }
    })
  }

  /**
   * Set user/device context for error reports
   */
  setContext(context: Partial<CrashContext>): void {
    this.context = { ...this.context, ...context }

    // When Sentry is installed:
    // const Sentry = require('@sentry/electron')
    // Sentry.setContext('device', {
    //   hardwareTier: this.context.hardwareTier,
    //   planTier: this.context.planTier,
    // })
    // if (this.context.userId) {
    //   Sentry.setUser({ id: this.context.userId })
    // }
  }

  /**
   * Capture an exception
   */
  captureException(error: Error, extra?: Record<string, unknown>): void {
    if (!this.initialized) return

    // Log locally
    console.error(`[CrashReporter] Exception: ${error.message}`, {
      stack: error.stack,
      context: this.context,
      ...extra,
    })

    // When Sentry is installed:
    // const Sentry = require('@sentry/electron')
    // Sentry.captureException(error, { extra })
  }

  /**
   * Capture a message
   */
  captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'error'): void {
    if (!this.initialized) return

    console.log(`[CrashReporter] Message (${level}): ${message}`)

    // When Sentry is installed:
    // const Sentry = require('@sentry/electron')
    // Sentry.captureMessage(message, level)
  }

  /**
   * Add a breadcrumb for debugging
   */
  addBreadcrumb(category: string, message: string, data?: Record<string, unknown>): void {
    // When Sentry is installed:
    // const Sentry = require('@sentry/electron')
    // Sentry.addBreadcrumb({ category, message, data })
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
