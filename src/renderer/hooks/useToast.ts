import { useEffect, useCallback } from 'react'
import { useAppStore } from '../store/appStore'

export function useToast() {
  const toasts = useAppStore(s => s.toasts)
  const addToast = useAppStore(s => s.addToast)
  const removeToast = useAppStore(s => s.removeToast)

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    toasts.forEach(toast => {
      const duration = toast.duration ?? 5000
      const timer = setTimeout(() => removeToast(toast.id), duration)
      timers.push(timer)
    })
    return () => timers.forEach(clearTimeout)
  }, [toasts, removeToast])

  const toast = useCallback(
    (type: 'info' | 'success' | 'warning' | 'error', title: string, message?: string) => {
      addToast({ type, title, message })
    },
    [addToast]
  )

  return { toasts, toast, removeToast }
}
