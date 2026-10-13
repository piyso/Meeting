/**
 * Keytar Safe Wrapper
 *
 * The single place the OS keychain module is loaded from. Both AuthService
 * (through keytarSafe) and KeyStorageService use it, so they always agree on
 * where secrets live.
 *
 * Usage:
 *   import { keytarSafe } from './keytarSafe'
 *   const keytar = await keytarSafe()
 *   if (keytar) {
 *     await keytar.getPassword('service', 'account')
 *   }
 *
 * If the native module cannot be loaded (wrong architecture, missing system
 * library) an in-memory store with the same interface is returned instead:
 * the app stays usable for the session, but nothing is remembered across a
 * restart — the user has to sign in again. That is reported once as an error.
 */

import { Logger } from './Logger'

const log = Logger.create('KeytarSafe')

type Keytar = typeof import('keytar')

/** Upper bound for loading the native module (ms). */
const KEYTAR_TIMEOUT_MS = 5_000

const memoryStore = new Map<string, Map<string, string>>()

/** Same interface as keytar, kept in process memory only. */
const memoryKeytar: Keytar = {
  async setPassword(service, account, password) {
    if (!memoryStore.has(service)) memoryStore.set(service, new Map())
    memoryStore.get(service)?.set(account, password)
  },
  async getPassword(service, account) {
    return memoryStore.get(service)?.get(account) ?? null
  },
  async deletePassword(service, account) {
    return memoryStore.get(service)?.delete(account) ?? false
  },
  async findPassword(service) {
    const first = memoryStore.get(service)?.values().next()
    return first && !first.done ? first.value : null
  },
  async findCredentials(service) {
    const entries = memoryStore.get(service)
    if (!entries) return []
    return Array.from(entries.entries()).map(([account, password]) => ({ account, password }))
  },
}

let usingMemoryFallback = false

/**
 * One load, shared by every caller. The promise itself is cached: a second
 * caller arriving while the first load was still in flight used to be told
 * "keychain unavailable" (the old code set a flag before awaiting), which made
 * a signed-in user look signed out for that call.
 */
let loading: Promise<Keytar> | null = null

async function loadKeytar(): Promise<Keytar> {
  try {
    return await new Promise<Keytar>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Keytar timed out after ${KEYTAR_TIMEOUT_MS}ms`)),
        KEYTAR_TIMEOUT_MS
      )
      import('keytar')
        .then(mod => resolve((mod as unknown as { default?: Keytar }).default || mod))
        .catch(reject)
        .finally(() => clearTimeout(timer))
    })
  } catch (err) {
    usingMemoryFallback = true
    log.error(
      'OS keychain unavailable — sign-in and encryption keys will not be remembered after a restart:',
      err instanceof Error ? err.message : String(err)
    )
    return memoryKeytar
  }
}

/**
 * The keychain module (or its in-memory stand-in). Never rejects.
 *
 * The return type keeps `| null` for the many existing callers that guard on
 * it; a null is no longer produced.
 */
export function keytarSafe(): Promise<Keytar | null> {
  if (!loading) loading = loadKeytar()
  return loading
}

/** True when secrets are only held in memory because the OS keychain could not be loaded. */
export function isKeychainUnavailable(): boolean {
  return usingMemoryFallback
}

/** Forget everything held in the in-memory stand-in (sign-out, quit). */
export function clearMemoryKeychain(): void {
  memoryStore.clear()
}
