/**
 * BackendSingleton — Switchable backend provider registry
 *
 * Supports 3 backend modes:
 *   1. PiyAPIBackend  — Production cloud (default)
 *   2. MockBackend    — Testing & development
 *   3. OfflineBackend — Future: fully offline local-only
 *
 * 7 handler files (graph, digest, export, intelligence, search, note, entity)
 * all share this single instance. Placing it in a handler created tight
 * handler→handler coupling — this service breaks that cycle.
 */

import type { IBackendProvider } from './IBackendProvider'
import { PiyAPIBackend } from './PiyAPIBackend'
import { Logger } from '../Logger'

const log = Logger.create('BackendSingleton')

type BackendType = 'piyapi' | 'mock' | 'offline'

let sharedBackend: IBackendProvider | null = null
let currentType: BackendType = 'piyapi'

/**
 * Get the shared backend instance.
 * Creates PiyAPIBackend lazily on first call unless overridden.
 */
export function getBackend(): IBackendProvider {
  if (!sharedBackend) {
    sharedBackend = createBackend(currentType)
  }
  return sharedBackend
}

/**
 * Switch the active backend provider.
 * Used during testing (mock) or when toggling offline mode.
 */
export function setBackendType(type: BackendType): void {
  if (type === currentType && sharedBackend) return
  currentType = type
  sharedBackend = createBackend(type)
  log.info(`Backend switched to: ${type} (${sharedBackend.getName()})`)
}

/**
 * Set the access token on the shared backend instance.
 * Called during login/sync setup.
 */
export function setBackendToken(token: string, userId: string): void {
  const backend = getBackend()
  backend.setAccessToken(token, userId)
}

/**
 * Inject a custom backend instance (for testing).
 */
export function setBackendInstance(instance: IBackendProvider): void {
  sharedBackend = instance
  log.info(`Backend overridden with custom instance: ${instance.getName()}`)
}

/**
 * Reset the shared backend instance (for testing or logout).
 */
export function resetBackend(): void {
  sharedBackend = null
}

/**
 * Get the current backend type identifier.
 */
export function getBackendType(): BackendType {
  return currentType
}

// ── Factory ──

function createBackend(type: BackendType): IBackendProvider {
  switch (type) {
    case 'piyapi':
      return new PiyAPIBackend()
    case 'mock': {
      // Lazy-load MockBackend to avoid bundling it in production
      const { MockBackend } = require('./MockBackend')
      return new MockBackend()
    }
    case 'offline': {
      // TODO: Implement OfflineBackend for fully local operation
      log.warn('OfflineBackend not yet implemented, falling back to MockBackend')
      const { MockBackend: MB } = require('./MockBackend')
      return new MB()
    }
    default:
      throw new Error(`Unknown backend type: ${type}`)
  }
}
