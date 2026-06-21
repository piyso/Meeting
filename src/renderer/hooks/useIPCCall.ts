import { useAppStore } from '../store/appStore'
import { useNavigationStore } from '../store/navigationStore'
/**
 * useIPCCall — Centralized IPC call hook
 *
 * Provides unified loading, error, and retry handling for any
 * `() => Promise<IPCResponse<T>>` call. Automatically triggers
 * toast notifications on errors and handles common error codes
 * (e.g., AUTH_EXPIRED → redirect to onboarding).
 *
 * @example
 *   const { data, loading, error, execute } = useIPCCall(
 *     () => window.electronAPI.meeting.list({ limit: 20 }),
 *   )
 *
 *   // Execute on mount or user action:
 *   useEffect(() => { execute() }, [execute])
 *
 *   // Auto-execute variant:
 *   const { data, loading } = useIPCCall(
 *     () => window.electronAPI.device.getCurrent(),
 *     { immediate: true },
 *   )
 */

import { useState, useCallback, useRef, useEffect } from 'react'

import type { IPCResponse } from '../../types/ipc'

interface UseIPCCallOptions {
  /** If true, execute the call immediately on mount. Default: false. */
  immediate?: boolean
  /** Custom error message to show in toast. If null, suppresses toast. */
  errorMessage?: string | null
  /** Duration for error toast in ms. Default: 5000. */
  toastDuration?: number
  /** If true, silently swallows errors without toast. Default: false. */
  silent?: boolean
  /** If true, prevents concurrent duplicate calls. Default: true. */
  deduplicate?: boolean
}

interface UseIPCCallResult<T> {
  /** Response data on success, null otherwise. */
  data: T | null
  /** True while the IPC call is in flight. */
  loading: boolean
  /** Error message string on failure, null otherwise. */
  error: string | null
  /** Error code from IPC response (e.g. 'NOT_FOUND', 'AUTH_EXPIRED'). */
  errorCode: string | null
  /** Execute the IPC call. Returns the data on success, null on failure. */
  execute: (...args: unknown[]) => Promise<T | null>
  /** Retry the last call (alias for execute). */
  retry: () => Promise<T | null>
  /** Reset state to initial (clear data, error, loading). */
  reset: () => void
  /** Cancel the in-flight request (if any). */
  cancel: () => void
}

export function useIPCCall<T>(
  caller: (...args: unknown[]) => Promise<IPCResponse<T>>,
  options: UseIPCCallOptions = {}
): UseIPCCallResult<T> {
  const {
    immediate = false,
    errorMessage,
    toastDuration = 5000,
    silent = false,
    deduplicate = true,
  } = options

  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)

  const addToast = useAppStore(s => s.addToast)
  const navigate = useNavigationStore(s => s.navigate)

  // Keep refs stable across re-renders
  const callerRef = useRef(caller)
  callerRef.current = caller

  // 11.2 FIX: Request deduplication — track in-flight request ID to prevent
  // stale responses from overwriting newer requests.
  const requestIdRef = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  const inFlightRef = useRef(false)

  const execute = useCallback(
    async (...args: unknown[]): Promise<T | null> => {
      // 11.2 FIX: Prevent concurrent duplicate calls
      if (deduplicate && inFlightRef.current) {
        return null
      }

      // Cancel any previous in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }

      const requestId = ++requestIdRef.current
      const abortController = new AbortController()
      abortControllerRef.current = abortController
      inFlightRef.current = true

      setLoading(true)
      setError(null)
      setErrorCode(null)

      try {
        const result = await callerRef.current(...args)

        // 11.2 FIX: Stale response guard — only apply state if this is still
        // the most recent request.
        if (requestId !== requestIdRef.current) {
          setLoading(false)
          inFlightRef.current = false
          return null
        }

        if (result?.success) {
          const responseData = (result.data ?? null) as T | null
          setData(responseData)
          setLoading(false)
          return responseData
        }

        // ── Handle IPC error ──
        const code = result?.error?.code ?? 'UNKNOWN'
        const message = result?.error?.message ?? 'An unexpected error occurred'

        setErrorCode(code)
        setError(message)
        setData(null)

        const isAuthError = message.includes('Not authenticated') || code === 'UNAUTHORIZED'

        // Global error code handling
        if (code === 'AUTH_EXPIRED' || code === 'SESSION_EXPIRED') {
          navigate('onboarding')
          if (!silent) {
            addToast({
              type: 'warning',
              title: 'Session Expired',
              message: 'Please sign in again.',
              duration: toastDuration,
            })
          }
        } else if (isAuthError && !silent) {
          // P3-2 FIX: Show a non-intrusive warning for auth errors instead
          // of silently swallowing them. Users need to know when their session
          // expires during a meeting recording.
          addToast({
            type: 'warning',
            title: 'Authentication Required',
            message: 'Some features require sign-in. Please re-authenticate.',
            duration: 8000,
          })
        } else if (!silent && !isAuthError) {
          // Other errors — show error toast
          addToast({
            type: 'error',
            title: errorMessage ?? 'Operation Failed',
            message,
            duration: toastDuration,
          })
        }

        setLoading(false)
        return null
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Network or IPC error'

        setErrorCode('NETWORK_ERROR')
        setError(message)
        setData(null)

        const isAuthError = message.includes('Not authenticated')

        if (!silent && !isAuthError) {
          addToast({
            type: 'error',
            title: errorMessage ?? 'Connection Error',
            message,
            duration: toastDuration,
          })
        }

        if (requestId === requestIdRef.current) {
          setLoading(false)
          inFlightRef.current = false
        }
        return null
      } finally {
        if (requestId === requestIdRef.current) {
          inFlightRef.current = false
          abortControllerRef.current = null
        }
      }
    },
    [navigate, addToast, silent, errorMessage, toastDuration, deduplicate]
  )

  const retry = useCallback(() => execute(), [execute])

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    inFlightRef.current = false
    setLoading(false)
  }, [])

  const reset = useCallback(() => {
    cancel()
    setData(null)
    setLoading(false)
    setError(null)
    setErrorCode(null)
  }, [cancel])

  // Auto-execute on mount if immediate is true
  useEffect(() => {
    if (immediate) {
      execute()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { data, loading, error, errorCode, execute, retry, reset, cancel }
}
