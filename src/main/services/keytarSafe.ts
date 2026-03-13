/**
 * Keytar Safe Wrapper
 *
 * Provides a timeout-guarded import of the keytar native module.
 * macOS can show a Keychain access dialog that blocks the main thread
 * indefinitely. This wrapper ensures keytar calls never hang the app.
 *
 * Usage:
 *   import { keytarSafe } from './keytarSafe'
 *   const keytar = await keytarSafe()
 *   if (keytar) {
 *     await keytar.getPassword('service', 'account')
 *   }
 */

import { Logger } from './Logger'

const log = Logger.create('KeytarSafe')

/** Timeout for keytar import (ms). macOS Keychain dialog can block. */
const KEYTAR_TIMEOUT_MS = 5_000

/** Cached keytar module — loaded once and reused */
let _cachedKeytar: typeof import('keytar') | null = null
let _loadAttempted = false

/**
 * Safely import keytar with a timeout.
 *
 * - On success: returns the keytar module and caches it for future calls.
 * - On timeout: returns null (no hang).
 * - On error (e.g. wrong arch): returns null.
 *
 * The timer is properly cleaned up to avoid unhandled rejections.
 */
export async function keytarSafe(): Promise<typeof import('keytar') | null> {
  // Fast path: return cached module
  if (_cachedKeytar) return _cachedKeytar
  // Don't retry if we already failed — avoid repeated timeout waits
  if (_loadAttempted) return null

  _loadAttempted = true

  try {
    const result = await new Promise<typeof import('keytar')>((resolve, reject) => {
      let settled = false

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true
          reject(new Error(`Keytar timed out after ${KEYTAR_TIMEOUT_MS}ms`))
        }
      }, KEYTAR_TIMEOUT_MS)

      import('keytar')
        .then(mod => {
          if (!settled) {
            settled = true
            clearTimeout(timer)
            resolve(mod.default || mod)
          }
        })
        .catch(err => {
          if (!settled) {
            settled = true
            clearTimeout(timer)
            reject(err)
          }
        })
    })

    _cachedKeytar = result
    return _cachedKeytar
  } catch (err) {
    log.warn('Keytar unavailable:', err instanceof Error ? err.message : String(err))
    return null
  }
}
