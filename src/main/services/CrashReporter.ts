/**
 * Crash Reporter — Sentry integration for BlueArkive
 *
 * Crash reports leave the device, so they are sent only when
 *   - the build was given a SENTRY_DSN, and
 *   - the user has switched "Send crash reports" on (Settings › Privacy;
 *     off until they do).
 * Until both hold the Sentry SDK is not even started — no sessions, no
 * events, no connection.
 *
 * What a report carries is cut down to what debugging needs: the error and
 * its stack, app version, platform, hardware and plan tier, and a one-way
 * hash in place of the account id. No hostname, no IP address, no home
 * directory in file paths, no breadcrumb payloads, no performance traces.
 * Errors are also always written to the local log.
 *
 * Usage:
 *   CrashReporter.init()              // once, at startup
 *   CrashReporter.setConsent(allowed) // once the setting is known, and whenever it changes
 */

import crypto from 'crypto'
import os from 'os'
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

/** Breadcrumbs recorded before the SDK starts (startup happens before consent is known). */
const MAX_EARLY_BREADCRUMBS = 30

/** Replace the user's home directory (which contains their account name) in any text. */
export function scrubPaths(text: string, home: string = os.homedir()): string {
  if (!home || home === '/' || home.length < 3) return text
  let scrubbed = text.split(home).join('~')
  // Windows paths also turn up with forward slashes and inside file:// URLs.
  const forward = home.replace(/\\/g, '/')
  if (forward !== home) scrubbed = scrubbed.split(forward).join('~')
  return scrubbed
}

/** Apply `scrubPaths` to every string inside a JSON-like value. */
export function scrubDeep<T>(value: T, home?: string, depth = 0): T {
  if (typeof value === 'string') return scrubPaths(value, home) as unknown as T
  if (!value || typeof value !== 'object' || depth > 8) return value
  if (Array.isArray(value)) {
    return value.map(item => scrubDeep(item, home, depth + 1)) as unknown as T
  }
  const result: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    result[key] = scrubDeep(item, home, depth + 1)
  }
  return result as T
}

/** A stable stand-in for an account id: reports can be counted per user, not traced to one. */
export function anonymousId(userId: string): string {
  return crypto.createHash('sha256').update(`bluearkive-crash:${userId}`).digest('hex').slice(0, 16)
}

/** What is taken out of every event before it is sent. */
export function scrubEvent<T extends Record<string, unknown>>(event: T, home?: string): T {
  const scrubbed = scrubDeep(event, home) as Record<string, unknown>
  delete scrubbed.server_name // the computer's hostname
  delete scrubbed.request
  const user = scrubbed.user as { id?: unknown } | undefined
  scrubbed.user = typeof user?.id === 'string' ? { id: user.id } : undefined
  const breadcrumbs = scrubbed.breadcrumbs
  if (Array.isArray(breadcrumbs)) {
    // What happened, not what it was done with.
    scrubbed.breadcrumbs = breadcrumbs.map((crumb: Record<string, unknown>) => ({
      timestamp: crumb.timestamp,
      category: crumb.category,
      level: crumb.level,
      type: crumb.type,
      message: crumb.message,
    }))
  }
  return scrubbed as T
}

class CrashReporterService {
  private initialized = false
  private sentryAvailable = false
  private consent = false
  private context: CrashContext = {}
  private earlyBreadcrumbs: Array<{ category: string; message: string; timestamp: number }> = []

  /**
   * Note that the app has started. Nothing is sent and the SDK is not loaded
   * until setConsent(true).
   */
  init(): void {
    if (this.initialized) return
    this.initialized = true
    if (!config.SENTRY_DSN) {
      log.info('No SENTRY_DSN set — crash reporting is not part of this build')
    }
  }

  /** Whether this build can send crash reports at all. */
  isConfigured(): boolean {
    return !!config.SENTRY_DSN
  }

  /**
   * Apply the user's choice. Turning it on starts the SDK (once); turning it
   * off stops anything further from being sent.
   */
  setConsent(allowed: boolean): void {
    this.consent = allowed
    if (!config.SENTRY_DSN) return

    if (allowed && !this.sentryAvailable) {
      this.startSentry()
    } else if (Sentry) {
      try {
        const options = Sentry.getClient?.()?.getOptions?.()
        if (options) options.enabled = allowed
      } catch (err) {
        log.debug('Could not switch the crash reporter:', err)
      }
    }
    log.info(`Crash reports are ${allowed ? 'on' : 'off'}`)
  }

  private startSentry(): void {
    try {
      // G7: Load @sentry/electron dynamically to handle missing native module gracefully
      Sentry = require('@sentry/electron')
      Sentry.init({
        dsn: config.SENTRY_DSN,
        release: `bluearkive@${this.getAppVersion()}`,
        environment: config.IS_DEV ? 'development' : 'production',
        enabled: true,
        attachStacktrace: true,
        sendDefaultPii: false,
        // Traces carry URLs and timings of what the user did; errors are enough.
        tracesSampleRate: 0,
        beforeSend: (event: Record<string, unknown>) => (this.consent ? scrubEvent(event) : null),
        beforeBreadcrumb: (crumb: Record<string, unknown>) =>
          this.consent
            ? {
                timestamp: crumb.timestamp,
                category: crumb.category,
                level: crumb.level,
                type: crumb.type,
                message:
                  typeof crumb.message === 'string' ? scrubPaths(crumb.message) : crumb.message,
              }
            : null,
      })

      this.sentryAvailable = true
      for (const crumb of this.earlyBreadcrumbs.splice(0)) Sentry.addBreadcrumb(crumb)
      this.applyContext()
      log.info('Crash reporting started')
    } catch (error) {
      // @sentry/electron native module may fail to load on some platforms
      log.warn('Sentry SDK failed to load (crash reporting disabled):', error)
      this.sentryAvailable = false
    }
  }

  private applyContext(): void {
    if (!this.sentryAvailable || !Sentry) return
    Sentry.setContext('device', {
      hardwareTier: this.context.hardwareTier,
      planTier: this.context.planTier,
    })
    Sentry.setUser(this.context.userId ? { id: anonymousId(this.context.userId) } : null)
  }

  /**
   * Set user/device context for error reports
   */
  setContext(context: Partial<CrashContext>): void {
    this.context = { ...this.context, ...context }
    this.applyContext()
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
   * Add a breadcrumb for debugging. `data` is accepted for the local log's
   * sake only — breadcrumb payloads are never sent.
   */
  addBreadcrumb(category: string, message: string, _data?: Record<string, unknown>): void {
    if (this.sentryAvailable && Sentry) {
      Sentry.addBreadcrumb({ category, message })
      return
    }
    if (!config.SENTRY_DSN) return
    this.earlyBreadcrumbs.push({ category, message, timestamp: Date.now() / 1000 })
    if (this.earlyBreadcrumbs.length > MAX_EARLY_BREADCRUMBS) this.earlyBreadcrumbs.shift()
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
