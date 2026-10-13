import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAppStore } from '../store/appStore'
import { useNavigationStore } from '../store/navigationStore'
import { rendererLog } from '../utils/logger'

const log = rendererLog.create('LaunchRequests')

/**
 * Requests that reach the app from outside it: a `bluearkive://` link, or a
 * `.pnotes` meeting file opened from the desktop.
 *
 * Either may be what started the app, so the main process holds them until
 * this hook has registered its listeners and said so (`rendererReady`).
 * Mount it once, at the root.
 */
export function useLaunchRequests(): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    const api = window.electronAPI
    const toast = useAppStore.getState().addToast
    /** Signing in comes first; a link must not be a way around it. */
    const inApp = () => useNavigationStore.getState().activeView !== 'onboarding'

    const openMeeting = async (meetingId: string): Promise<void> => {
      const res = await api?.meeting?.get({ meetingId }).catch(() => null)
      if (res?.success && res.data) {
        useNavigationStore.getState().navigate('meeting-detail', meetingId)
      } else {
        toast({
          type: 'warning',
          title: 'Meeting not found',
          message: 'That link points to a meeting that is not on this device.',
          duration: 5000,
        })
      }
    }

    const unsubLink = api?.on?.deepLink?.(link => {
      let url: URL
      try {
        url = new URL(link)
      } catch {
        return
      }
      if (url.protocol !== 'bluearkive:' || !inApp()) return
      // bluearkive://meeting/<id> parses with "meeting" as the host.
      const [first] = url.pathname.split('/').filter(Boolean)
      switch (url.host) {
        case 'meeting':
        case 'note': // bluearkive://note/<meeting id>[/<note id>] — notes live in their meeting
          if (first) void openMeeting(decodeURIComponent(first))
          break
        case 'settings':
          useNavigationStore.getState().navigate('settings')
          break
        default:
          log.warn('Ignored link with unknown route:', url.host)
      }
    })

    const unsubImport = api?.meeting?.onImported?.(event => {
      if (event?.error || !event?.result) {
        toast({
          type: 'error',
          title: 'Meeting not imported',
          message: event?.error || 'The file could not be read.',
          duration: 6000,
        })
        return
      }
      const { result } = event
      void queryClient.invalidateQueries({ queryKey: ['meetings'] })
      toast({
        type: result.status === 'imported' ? 'success' : 'info',
        title: result.status === 'imported' ? 'Meeting imported' : 'Already in your library',
        message: result.title || undefined,
        duration: 4000,
      })
      if (inApp()) useNavigationStore.getState().navigate('meeting-detail', result.meetingId)
    })

    // Listeners of every component mounted in this commit are in place by now
    // (children's effects run before their parents').
    api?.window?.rendererReady?.()

    return () => {
      unsubLink?.()
      unsubImport?.()
    }
  }, [queryClient])
}
