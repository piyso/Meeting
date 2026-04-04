/**
 * safeIPC — Normalizes potentially-undefined IPC responses.
 *
 * Problem: Every `window.electronAPI?.namespace?.method()` can return
 * `undefined` if the bridge, namespace, or method doesn't exist.
 * Without this wrapper, accessing `.success` or `.error` crashes.
 *
 * Usage:
 *   const res = await safeIPC(window.electronAPI?.meeting?.start(params))
 *   if (res.success) { ... }  // Always safe — res is never undefined
 */

import type { IPCResponse } from '../../types/ipc'

const makeUnavailableError = () => ({
  code: 'IPC_UNAVAILABLE' as const,
  message: 'API unavailable — bridge or handler not found',
  timestamp: Date.now(),
})

/**
 * Wraps an IPC call that may return `undefined` and normalizes it
 * to a guaranteed `IPCResponse<T>` with `success: false` on failure.
 */
export async function safeIPC<T>(
  call: Promise<IPCResponse<T> | undefined> | IPCResponse<T> | undefined
): Promise<IPCResponse<T>> {
  try {
    const result = await call
    if (!result) {
      return { success: false, error: makeUnavailableError() }
    }
    return result
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'IPC_EXCEPTION',
        message: err instanceof Error ? err.message : 'Unknown IPC error',
        timestamp: Date.now(),
      },
    }
  }
}

/**
 * Type guard: narrows an IPCResponse to a successful one with data.
 * Useful for eliminating `as unknown as` casts.
 *
 * Usage:
 *   const res = await safeIPC(...)
 *   if (isIPCSuccess(res)) {
 *     res.data // ← TypeScript knows data exists and is T
 *   }
 */
export function isIPCSuccess<T>(
  res: IPCResponse<T>
): res is IPCResponse<T> & { success: true; data: T } {
  return res.success === true && res.data !== undefined && res.data !== null
}
