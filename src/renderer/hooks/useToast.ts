import { useCallback } from 'react'
import { useAppStore } from '../store/appStore'

/**
 * useToast — thin wrapper over appStore toast actions.
 *
 * Auto-dismiss is handled inside `appStore.addToast` (setTimeout per toast).
 * This hook intentionally does NOT add its own timers to avoid double-removal.
 */
export function useToast() {
  const toasts = useAppStore(s => s.toasts)
  const addToast = useAppStore(s => s.addToast)
  const removeToast = useAppStore(s => s.removeToast)

  const toast = useCallback(
    (
      type: 'info' | 'success' | 'warning' | 'error',
      title: string,
      message?: string,
      undoAction?: () => void,
      undoLabel?: string
    ) => {
      addToast({ type, title, message, undoAction, undoLabel })
    },
    [addToast]
  )

  return { toasts, toast, removeToast }
}
