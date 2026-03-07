/**
 * BackendSingleton — Shared PiyAPIBackend instance
 *
 * Extracted from graph.handlers.ts to eliminate circular imports.
 * 7 handler files (graph, digest, export, intelligence, search, note, entity)
 * all need the same PiyAPIBackend instance. Placing it in a handler created
 * tight handler→handler coupling. This service breaks that cycle.
 */

import { PiyAPIBackend } from './PiyAPIBackend'

let sharedBackend: PiyAPIBackend | null = null

/**
 * Get the shared PiyAPIBackend instance.
 * Creates one lazily on first call.
 */
export function getBackend(): PiyAPIBackend {
  if (!sharedBackend) {
    sharedBackend = new PiyAPIBackend()
  }
  return sharedBackend
}

/**
 * Set the access token on the shared backend instance.
 * Called during login/sync setup.
 */
export function setBackendToken(token: string, userId: string): void {
  getBackend().setAccessToken(token, userId)
}

/**
 * Reset the shared backend instance (for testing or logout).
 */
export function resetBackend(): void {
  sharedBackend = null
}
