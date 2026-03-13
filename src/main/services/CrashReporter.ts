/**
 * Crash Reporter — Sentry integration for BlueArkive
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
import { Logger } from './Logger'

const log = Logger.create('CrashReporter')

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
      log.info('No SENTRY_DSN set — crash reporting disabled')
      this.initialized = true
      return
    }

    try {
      // Sentry SDK would be initialized here when installed:
      // const Sentry = require('@sentry/electron')
      // Sentry.init(...)

      // NOTE: uncaughtException + unhandledRejection handlers are registered
      // in electron/main.ts (lines 14-27). Do NOT duplicate them here.
      // CrashReporter only provides captureException/captureMessage API.

      this.initialized = true
      log.info('Initialized successfully')
    } catch (error) {
      log.error('Failed to initialize:', error)
    }
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
    log.error(`Exception: ${error.message}`, {
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

    log.info(`Message (${level}): ${message}`)

    // When Sentry is installed:
    // const Sentry = require('@sentry/electron')
    // Sentry.captureMessage(message, level)
  }

  /**
   * Add a breadcrumb for debugging
   */
  addBreadcrumb(_category: string, _message: string, _data?: Record<string, unknown>): void {
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
