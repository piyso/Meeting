import { useAppStore } from '../../store/appStore'
import { useRecordingStore } from '../../store/recordingStore'
import { useNavigationStore } from '../../store/navigationStore'
import { useConnectivityStore } from '../../store/connectivityStore'

import React, { Suspense, lazy } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { WindowsTitleBar } from './WindowsTitleBar'

import { ZenRail } from './ZenRail'
import { DynamicIsland } from './DynamicIsland'
import { ErrorBoundary } from './ErrorBoundary'
import { OfflineBanner } from './OfflineBanner'
import { StatusBanner } from './StatusBanner'
import { ToastContainer } from '../ui/Toast'
import { CommandPalette } from '../command/CommandPalette'
import { GlobalContextBar } from '../command/GlobalContextBar'
import { DeviceWallDialog } from '../meeting/DeviceWallDialog'
import { IntelligenceWallDialog } from '../meeting/IntelligenceWallDialog'
import { useAudioSession, stopDeviceCapture } from '../../hooks/useAudioSession'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { saveQuickNote } from '../../utils/quickNotes'

// Determine platform globally
const platform = window.electronAPI?.platform || 'web'

import { useSystemState } from '../../hooks/useSystemState'
import { useSyncEngine } from '../../hooks/useSyncEngine'
import { ConflictMergeDialog } from '../meeting/ConflictMergeDialog'

/**
 * Stop the active recording: release the audio device (flushing its last
 * buffered audio), then let the main process finalise the meeting.
 * Idempotent — the stop button's click, its hold timer and the keyboard
 * shortcut can all land for the same recording; only the first one counts.
 */
async function stopActiveRecording(): Promise<void> {
  const recStore = useRecordingStore.getState()
  if (recStore.recordingState !== 'recording' && recStore.recordingState !== 'paused') return

  // If stopping from paused state, finalize pause duration accounting
  if (recStore.recordingState === 'paused' && recStore.recordingPausedAt) {
    recStore.setRecordingTotalPausedMs(
      recStore.recordingTotalPausedMs + (Date.now() - recStore.recordingPausedAt)
    )
    recStore.setRecordingPausedAt(null)
  }
  const meetingId = recStore.activeMeetingId
  recStore.setRecordingState('processing')

  let failure: string | null = null
  try {
    await stopDeviceCapture()
    if (meetingId) {
      // meeting:stop saves end_time/duration AND stops the audio pipeline
      // internally — no separate audio:stopCapture (avoids a double-stop race)
      const res = await window.electronAPI?.meeting?.stop?.({ meetingId })
      if (res && !res.success) failure = res.error?.message || 'The meeting could not be saved'
    }
  } catch (err) {
    failure = err instanceof Error ? err.message : 'Unexpected error'
  }
  if (failure) {
    useAppStore.getState().addToast({
      type: 'error',
      title: 'Stop recording failed',
      message: failure,
      duration: 6000,
    })
  }

  useRecordingStore.getState().setActiveMeetingId(null)
  // Keep the "processing" state visible briefly, then return to idle — unless
  // a new recording has already been started in the meantime.
  setTimeout(() => {
    if (useRecordingStore.getState().recordingState === 'processing') {
      useRecordingStore.getState().setRecordingState('idle', 'none')
    }
  }, 2000)
}

/** Recording preferences from Settings (defaults: system audio, with microphone fallback) */
async function loadCapturePreferences(): Promise<{
  mode: 'system' | 'microphone'
  fallbackToMicrophone: boolean
}> {
  const read = async (key: string): Promise<unknown> => {
    try {
      const res = await window.electronAPI?.settings?.get({ key })
      return res?.success ? res.data : null
    } catch {
      return null
    }
  }
  const [source, fallback] = await Promise.all([
    read('preferredAudioDevice'),
    read('audioFallbackEnabled'),
  ])
  return {
    mode: source === 'microphone' ? 'microphone' : 'system',
    fallbackToMicrophone: fallback !== false,
  }
}

// Error fallback component for failed lazy loads
const LazyLoadError: React.FC<{ name: string }> = ({ name }) => (
  <div className="ui-app-error-state">
    <p>Failed to load {name}</p>
    <button onClick={() => window.location.reload()}>Reload</button>
  </div>
)

// Code-split heavy views
const MeetingListView = lazy(() =>
  import('../../views/MeetingListView').catch(() => ({
    default: () => <LazyLoadError name="Meeting List" />,
  }))
)
const MeetingDetailView = lazy(() =>
  import('../../views/MeetingDetailView').catch(() => ({
    default: () => <LazyLoadError name="Meeting Detail" />,
  }))
)
const SettingsView = lazy(() =>
  import('../../views/SettingsView').catch(() => ({
    default: () => <LazyLoadError name="Settings" />,
  }))
)
const OnboardingFlow = lazy(() =>
  import('../OnboardingFlow')
    .then(m => ({ default: m.OnboardingFlow }))
    .catch(() => ({ default: () => <LazyLoadError name="Onboarding" /> }))
)

const KnowledgeGraphView = lazy(() =>
  import('../../views/KnowledgeGraphView').catch(() => ({
    default: () => <LazyLoadError name="Knowledge Graph" />,
  }))
)
const WeeklyDigestView = lazy(() =>
  import('../../views/WeeklyDigestView').catch(() => ({
    default: () => <LazyLoadError name="Weekly Digest" />,
  }))
)
const AskMeetingsView = lazy(() =>
  import('../../views/AskMeetingsView').catch(() => ({
    default: () => <LazyLoadError name="Ask Meetings" />,
  }))
)
const PricingView = lazy(() =>
  import('../../views/PricingView')
    .then(m => ({ default: m.PricingView }))
    .catch(() => ({
      default: () => <LazyLoadError name="Pricing" />,
    }))
)

export const AppLayout: React.FC = () => {
  const activeView = useNavigationStore(s => s.activeView)
  const navigate = useNavigationStore(s => s.navigate)
  const queryClient = useQueryClient()

  // ── Platform CSS Injection ─────────────────────────────────
  React.useEffect(() => {
    document.body.setAttribute('data-platform', platform)
  }, [])

  // ── Global keyboard shortcuts (Cmd+N, Cmd+K, Cmd+Shift+R, etc.) ──
  useKeyboardShortcuts()

  const focusMode = useAppStore(s => s.focusMode)
  const recordingState = useRecordingStore(s => s.recordingState)
  const isOnline = useConnectivityStore(s => s.isOnline)
  const syncStatus = useConnectivityStore(s => s.syncStatus)
  const setRecordingState = useRecordingStore(s => s.setRecordingState)
  const selectedMeetingId = useNavigationStore(s => s.selectedMeetingId)
  const globalContextOpen = useAppStore(s => s.globalContextOpen)
  const toggleGlobalContext = useAppStore(s => s.toggleGlobalContext)

  // Prevent flash of onboarding for returning users
  const [initializing, setInitializing] = React.useState(true)
  const [statusBannerVisible, setStatusBannerVisible] = React.useState(false)

  // State for global API limit dialogs
  const [deviceWallOpen, setDeviceWallOpen] = React.useState(false)
  const [intelligenceWallOpen, setIntelligenceWallOpen] = React.useState(false)

  // User tier + quota data for upgrade prompts and wall dialogs
  const userTier = useAppStore(s => s.currentTier)
  const deviceCount = useAppStore(s => s.deviceInfo.count)
  const quotaData = useAppStore(s => s.quotaData)

  // Conflict resolution state
  const [conflictInfo, setConflictInfo] = React.useState<{
    noteId: string
    localVersion: string
    remoteVersion: string
    autoResolved: boolean
  } | null>(null)

  // Session expiring warning state
  const [sessionExpiringMs, setSessionExpiringMs] = React.useState<number | null>(null)

  useSyncEngine() // Boot up sync and network polling
  useSystemState() // Boot up system state polling

  // Listen for sync:conflict and session:expired events from main process
  React.useEffect(() => {
    const handleConflict = (data: {
      noteId: string
      localVersion: string
      remoteVersion: string
      autoResolved: boolean
    }) => {
      if (!data.autoResolved) {
        setConflictInfo(data)
      }
    }

    const handleSessionExpired = () => {
      navigate('onboarding')
    }

    const handleSessionExpiring = (data: { remainingMs: number }) => {
      setSessionExpiringMs(data.remainingMs)
    }

    const handleGlobalShortcut = async () => {
      // Only one recording at a time (the shortcut also fires while recording)
      if (useRecordingStore.getState().recordingState !== 'idle') return
      // Trigger recording just like in MeetingListView.tsx handleQuickStart
      setRecordingState('starting')
      try {
        const res = await window.electronAPI?.meeting?.start({})
        if (res?.success && res.data) {
          useRecordingStore.getState().setActiveMeetingId(res.data.meeting.id)
          useRecordingStore.getState().setRecordingStartTime(Date.now())
          navigate('meeting-detail', res.data.meeting.id)
        } else {
          useAppStore.getState().addToast({
            type: 'error',
            title: 'Failed to start meeting',
            message: res?.error?.message,
            duration: 5000,
          })
          setRecordingState('idle')
        }
      } catch (err) {
        useAppStore.getState().addToast({
          type: 'error',
          title: 'Failed to start meeting',
          message: err instanceof Error ? err.message : 'An unexpected error occurred',
          duration: 5000,
        })
        setRecordingState('idle')
      }
    }

    // toggle-recording: start if idle, stop if recording
    const handleToggleRecording = async () => {
      const state = useRecordingStore.getState().recordingState
      if (state === 'recording' || state === 'paused') {
        await stopActiveRecording()
      } else if (state === 'idle') {
        handleGlobalShortcut()
      }
    }

    // quick-export: export current meeting as markdown
    const handleQuickExport = async () => {
      const recStore = useRecordingStore.getState()
      const navStore = useNavigationStore.getState()
      const mid = navStore.selectedMeetingId || recStore.activeMeetingId
      if (!mid) return
      try {
        const res = await window.electronAPI?.meeting?.export?.({
          meetingId: mid,
          format: 'markdown',
        })
        if (!res?.success) throw new Error(res?.error?.message || 'Export failed')
        // No path = the save dialog was cancelled; nothing was written.
        if (!res.data?.filePath) return
        useAppStore.getState().addToast({
          type: 'success',
          title: 'Exported as Markdown',
          message: `Saved as ${res.data.filePath.split(/[\\/]/).pop() ?? res.data.filename}`,
          duration: 3000,
        })
        window.electronAPI?.shell?.showItemInFolder?.(res.data.filePath)
      } catch (err) {
        useAppStore.getState().addToast({
          type: 'error',
          title: 'Export failed',
          message: err instanceof Error ? err.message : undefined,
          duration: 4000,
        })
      }
    }

    // Subscribe to IPC events via window.electronAPI event listeners
    const unsubConflict = window.electronAPI?.sync?.onConflict?.(handleConflict)
    const unsubSession = window.electronAPI?.auth?.onSessionExpired?.(handleSessionExpired)
    const unsubExpiring = window.electronAPI?.auth?.onSessionExpiring?.(handleSessionExpiring)
    const unsubShortcut = window.electronAPI?.meeting?.onGlobalShortcutStart?.(handleGlobalShortcut)

    // Listen for CustomEvents from keyboard shortcuts & command palette
    window.addEventListener('toggle-recording', handleToggleRecording)
    window.addEventListener('quick-export', handleQuickExport)

    return () => {
      unsubConflict?.()
      unsubSession?.()
      unsubExpiring?.()
      unsubShortcut?.()
      window.removeEventListener('toggle-recording', handleToggleRecording)
      window.removeEventListener('quick-export', handleQuickExport)
    }
  }, [navigate, setRecordingState])

  // ── Session activity tracking ─────────────────────────────
  // Report user activity to main process to prevent session timeout.
  // Throttled to max 1 IPC call per 60s to avoid flooding.
  React.useEffect(() => {
    let lastReport = 0
    const THROTTLE_MS = 60_000 // 1 minute

    const reportActivity = () => {
      const now = Date.now()
      if (now - lastReport > THROTTLE_MS) {
        lastReport = now
        window.electronAPI?.auth?.recordActivity?.().catch(() => {})
        // Clear session-expiring banner since user is active
        setSessionExpiringMs(null)
      }
    }

    window.addEventListener('keydown', reportActivity)
    window.addEventListener('mousemove', reportActivity)
    window.addEventListener('click', reportActivity)

    return () => {
      window.removeEventListener('keydown', reportActivity)
      window.removeEventListener('mousemove', reportActivity)
      window.removeEventListener('click', reportActivity)
    }
  }, [])

  // ── Bookmark Execution Logic ────────────────────────────
  const executeBookmark = React.useCallback(async () => {
    const recStore = useRecordingStore.getState()

    if (
      recStore.recordingState !== 'recording' ||
      !recStore.activeMeetingId ||
      !recStore.recordingStartTime
    )
      return

    // Position in the recording — paused time is not part of it
    const elapsedMs = Date.now() - recStore.recordingStartTime - recStore.recordingTotalPausedMs
    const endTimeSec = Math.max(1, elapsedMs / 1000)
    const startTimeSec = Math.max(0, endTimeSec - 30) // Last 30 seconds

    try {
      const res = await window.electronAPI?.highlight?.create({
        meetingId: recStore.activeMeetingId,
        startTime: startTimeSec,
        endTime: endTimeSec,
        label: '📌 Bookmarked moment',
      })
      if (res && !res.success) throw new Error(res.error?.message || 'Bookmark failed')
      useAppStore
        .getState()
        .addToast({ type: 'success', title: '📌 Moment bookmarked', duration: 2000 })
    } catch {
      useAppStore
        .getState()
        .addToast({ type: 'error', title: 'Failed to bookmark', duration: 3000 })
    }
  }, [])

  // ── ⌘+Shift+B bookmark shortcut + Widget IPC ────────────
  React.useEffect(() => {
    const handleBookmarkShortcut = async (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        await executeBookmark()
      }
    }

    const handlePauseShortcut = async (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('toggle-pause'))
      }
    }

    const handleQuickBookmark = async () => {
      await executeBookmark()
    }

    window.addEventListener('quick-bookmark', handleQuickBookmark)

    const unsubBookmarkIPC = window.electronAPI?.on?.bookmarkRequested?.(() => {
      executeBookmark()
    })

    const unsubPauseIPC = window.electronAPI?.on?.pauseRequested?.(() => {
      window.dispatchEvent(new CustomEvent('toggle-pause'))
    })

    // A note typed into the floating widget. Nothing listened for this before,
    // so the text was silently dropped.
    const unsubQuickNoteIPC = window.electronAPI?.on?.quickNoteRequested?.((text: string) => {
      const meetingId = useRecordingStore.getState().activeMeetingId
      const failed = (message: string) =>
        useAppStore
          .getState()
          .addToast({ type: 'error', title: 'Note not saved', message, duration: 5000 })
      if (!meetingId) {
        failed('There is no recording in progress to attach it to.')
        return
      }
      if (typeof text !== 'string' || !text.trim()) return
      saveQuickNote(meetingId, text)
        .then(saved => {
          if (!saved) {
            failed('The note could not be stored. Try again from the meeting page.')
            return
          }
          void queryClient.invalidateQueries({ queryKey: ['notes', meetingId] })
          useAppStore
            .getState()
            .addToast({ type: 'success', title: '📝 Note added', duration: 2000 })
        })
        .catch(err => failed(err instanceof Error ? err.message : 'Unexpected error'))
    })

    window.addEventListener('keydown', handleBookmarkShortcut)
    window.addEventListener('keydown', handlePauseShortcut)

    return () => {
      window.removeEventListener('keydown', handleBookmarkShortcut)
      window.removeEventListener('keydown', handlePauseShortcut)
      window.removeEventListener('quick-bookmark', handleQuickBookmark)
      if (unsubBookmarkIPC) unsubBookmarkIPC()
      if (unsubPauseIPC) unsubPauseIPC()
      if (unsubQuickNoteIPC) unsubQuickNoteIPC()
    }
  }, [executeBookmark, queryClient])

  // First-launch detection: check if onboarding is completed AND user is authenticated
  React.useEffect(() => {
    const checkFirstLaunch = async () => {
      try {
        const result = await window.electronAPI?.settings?.get({
          key: 'onboarding_completed',
        } as { key: string })
        if (!result?.success || !result?.data) {
          // Never onboarded — show onboarding
          navigate('onboarding')
        } else {
          // Onboarding completed — but is the user still authenticated?
          try {
            const authResult = await window.electronAPI?.auth?.isAuthenticated?.()
            if (!authResult?.success || !authResult?.data?.authenticated) {
              // People who chose to use the app without an account are never
              // "signed out" — only an account whose session ended must sign in again.
              const localOnly = await window.electronAPI?.settings?.get({ key: 'local_only_mode' })
              if (!(localOnly?.success && localOnly.data === true)) {
                // Session expired or user logged out — require re-login
                navigate('onboarding')
              }
            }
          } catch {
            // Auth check failed (e.g., Supabase not configured) — allow through in offline mode
          }
        }
      } catch {
        // If settings API fails (e.g., DB not ready), default to showing onboarding
        navigate('onboarding')
      } finally {
        setInitializing(false)
      }
    }
    checkFirstLaunch()
  }, [navigate])

  const activeMeetingIdForAudio = useRecordingStore(s => s.activeMeetingId)
  const meetingId =
    activeMeetingIdForAudio || (activeView === 'meeting-detail' ? selectedMeetingId : null)
  const {
    startCapture,
    stopCapture: _stopCapture,
    pauseCapture,
    resumeCapture,
  } = useAudioSession(meetingId)

  // React to store state to trigger actual backend capture
  React.useEffect(() => {
    let active = true
    // Wait for the new meeting's id. `meetingId` falls back to the meeting on
    // screen, and 'starting' is set before meeting:start has answered — so
    // starting from the hotkey while an older meeting was open began capturing
    // into that older meeting, and the real start then failed as "already
    // capturing".
    if (recordingState === 'starting' && activeMeetingIdForAudio && meetingId) {
      const failedMeetingId = meetingId
      const failStart = (reason?: string) => {
        if (!active) return
        // The meeting row was created just before capture was attempted and
        // has nothing in it — remove it instead of leaving an empty,
        // never-ending meeting in the list.
        const wasJustCreated = useRecordingStore.getState().activeMeetingId === failedMeetingId
        setRecordingState('idle', 'none')
        useAppStore.getState().addToast({
          type: 'error',
          title: 'Could not start recording',
          message: reason || 'No audio source is available.',
          duration: 7000,
        })
        if (wasJustCreated) {
          void (async () => {
            try {
              // Safety net: never remove a meeting the pipeline is in fact recording
              const status = await window.electronAPI?.audio?.getStatus?.()
              if (
                status?.success &&
                status.data?.isCapturing &&
                status.data.meetingId === failedMeetingId
              ) {
                return
              }
              if (useNavigationStore.getState().selectedMeetingId === failedMeetingId) {
                navigate('meeting-list')
              }
              await window.electronAPI?.meeting?.delete?.({ meetingId: failedMeetingId })
            } catch {
              // best effort — an empty meeting left behind is harmless
            } finally {
              queryClient.invalidateQueries({ queryKey: ['meetings'] })
            }
          })()
        }
      }
      loadCapturePreferences()
        .then(prefs =>
          startCapture(prefs.mode, { fallbackToMicrophone: prefs.fallbackToMicrophone })
        )
        .then(started => {
          if (!active) return
          if (!started) {
            failStart()
            return
          }
          setRecordingState('recording', started.source)
          if (started.fallbackReason) {
            // System audio was asked for but only the microphone is being recorded:
            // say so — otherwise the other participants silently go missing.
            // On macOS the usual cause is the Screen Recording permission, which
            // only the user can grant; any other cause is shown as it is.
            const needsPermission =
              platform === 'darwin' && /permission|not allowed|denied/i.test(started.fallbackReason)
            useAppStore.getState().addToast({
              type: 'warning',
              title: 'Recording your microphone only',
              message: needsPermission
                ? 'Meeting audio needs Screen Recording permission (System Settings → Privacy & Security). Click to open it.'
                : `System audio is unavailable: ${started.fallbackReason}`,
              duration: 10000,
              ...(needsPermission
                ? {
                    undoLabel: 'Open Settings',
                    undoAction: () => {
                      window.electronAPI?.audio?.openScreenRecordingSettings?.()
                    },
                  }
                : {}),
            })
          }
        })
        .catch(err => failStart(err instanceof Error ? err.message : undefined))
    }
    return () => {
      active = false
    }
  }, [
    recordingState,
    activeMeetingIdForAudio,
    meetingId,
    startCapture,
    setRecordingState,
    navigate,
    queryClient,
  ])

  // The main process can end a capture on its own (tray/widget, quit, device
  // loss). Release the audio device here too, so the microphone never stays
  // open after the pipeline has stopped.
  React.useEffect(() => {
    const unsub = window.electronAPI?.on?.audioEvent?.(
      (event: { type?: string; meetingId?: string }) => {
        if (event?.type !== 'stopped') return
        void stopDeviceCapture()

        // A stop that did not come from this window's Stop button (which moves
        // to 'processing' before it asks): the main process has already closed
        // the meeting, so only the UI is left showing "recording" with the
        // timer running. Bring it back to idle.
        const recStore = useRecordingStore.getState()
        const stillShownAsRecording =
          recStore.recordingState === 'recording' || recStore.recordingState === 'paused'
        if (stillShownAsRecording && recStore.activeMeetingId === event.meetingId) {
          recStore.setRecordingState('processing')
          recStore.setActiveMeetingId(null)
          void queryClient.invalidateQueries({ queryKey: ['meetings'] })
          setTimeout(() => {
            if (useRecordingStore.getState().recordingState === 'processing') {
              useRecordingStore.getState().setRecordingState('idle', 'none')
            }
          }, 2000)
        }
      }
    )
    return () => unsub?.()
  }, [queryClient])

  // Meetings downloaded from the account (a new device, or Settings → Restore):
  // every list on screen is out of date.
  React.useEffect(() => {
    const unsub = window.electronAPI?.sync?.onRestored?.(event => {
      void queryClient.invalidateQueries()
      if (event?.automatic && event.meetings > 0) {
        useAppStore.getState().addToast({
          type: 'success',
          title: 'Meetings restored',
          message: `${event.meetings} meeting${event.meetings === 1 ? '' : 's'} from your account ${event.meetings === 1 ? 'is' : 'are'} now on this device.`,
          duration: 6000,
        })
      }
    })
    return () => unsub?.()
  }, [queryClient])

  // Stop recording via API hook and complete UI state shift
  const handleStopRecording = React.useCallback(() => stopActiveRecording(), [])

  // Pause/Resume recording
  const handlePauseRecording = React.useCallback(async () => {
    const recStore = useRecordingStore.getState()
    // Use activeMeetingId from store — not the view-dependent meetingId
    // This ensures pause works even when user navigates away from meeting-detail
    if (!recStore.activeMeetingId) return
    const currentState = recStore.recordingState
    if (currentState === 'recording') {
      try {
        await pauseCapture()
        recStore.setRecordingPausedAt(Date.now())
        setRecordingState('paused')
        useAppStore
          .getState()
          .addToast({ type: 'info', title: '⏸ Recording paused', duration: 2000 })
      } catch {
        useAppStore.getState().addToast({ type: 'error', title: 'Failed to pause', duration: 3000 })
      }
    } else if (currentState === 'paused') {
      try {
        await resumeCapture()
        if (recStore.recordingPausedAt) {
          recStore.setRecordingTotalPausedMs(
            recStore.recordingTotalPausedMs + (Date.now() - recStore.recordingPausedAt)
          )
          recStore.setRecordingPausedAt(null)
        }
        setRecordingState('recording')
        useAppStore
          .getState()
          .addToast({ type: 'success', title: '▶ Recording resumed', duration: 2000 })
      } catch {
        useAppStore
          .getState()
          .addToast({ type: 'error', title: 'Failed to resume', duration: 3000 })
      }
    }
  }, [pauseCapture, resumeCapture, setRecordingState])

  // Attach window event listener for toggle-pause so the effect above can trigger it,
  // or so keyboard shortcuts can trigger it globally.
  React.useEffect(() => {
    const onTogglePause = () => handlePauseRecording()
    window.addEventListener('toggle-pause', onTogglePause)
    return () => window.removeEventListener('toggle-pause', onTogglePause)
  }, [handlePauseRecording])

  // Wire wall dialog triggers from CustomEvents
  React.useEffect(() => {
    const onShowIntelligenceWall = () => setIntelligenceWallOpen(true)
    window.addEventListener('show-intelligence-wall', onShowIntelligenceWall)
    return () => window.removeEventListener('show-intelligence-wall', onShowIntelligenceWall)
  }, [])

  // Show minimal loading screen while checking onboarding status
  if (initializing) {
    return (
      <div className="ui-app-layout ui-app-initializing">
        <div className="ui-app-initializing-text">Initializing...</div>
      </div>
    )
  }

  // ── Full-screen onboarding (no ZenRail, no DynamicIsland, no margins) ──
  if (activeView === 'onboarding') {
    return (
      <div className="ui-app-onboarding">
        <ErrorBoundary>
          <Suspense fallback={<div className="ui-app-loader">Loading...</div>}>
            <OnboardingFlow />
          </Suspense>
        </ErrorBoundary>
      </div>
    )
  }

  return (
    <div className="ui-app-layout">
      {platform === 'win32' ? (
        <WindowsTitleBar />
      ) : (
        <div className="ui-app-drag-region drag-region" />
      )}

      <ErrorBoundary viewName="ZenRail">
        <ZenRail
          activeView={activeView}
          onNavigate={v => navigate(v)}
          focusMode={focusMode}
          userTier={userTier}
          onUpgrade={() => navigate('pricing')}
        />
      </ErrorBoundary>

      <ErrorBoundary viewName="DynamicIsland">
        <DynamicIsland
          recordingState={recordingState}
          syncStatus={syncStatus}
          onStopRecording={handleStopRecording}
          onPauseRecording={handlePauseRecording}
        />
      </ErrorBoundary>

      <OfflineBanner isOnline={isOnline} />
      <StatusBanner onVisibilityChange={setStatusBannerVisible} />

      {/* Session Expiring Warning Banner */}
      {sessionExpiringMs !== null && (
        <div className="ui-app-session-banner">
          <span>
            ⚠️ Your session will expire in {Math.ceil(sessionExpiringMs / 60_000)} minutes due to
            inactivity.
          </span>
          <button
            onClick={() => {
              window.electronAPI?.auth?.recordActivity?.().catch(() => {})
              setSessionExpiringMs(null)
            }}
          >
            Stay Active
          </button>
        </div>
      )}

      <main
        className="ui-app-main"
        style={{
          position: 'absolute',
          left: focusMode ? 0 : 104, // 20px float + 68px pill width + 16px gap
          right: focusMode ? 0 : 104, // Symmetrical margin to keep content center aligned with screen center (and Dynamic Island)
          top: 72 + (statusBannerVisible ? 36 : 0), // Shift down when health banner is visible
          bottom: 0,
        }}
      >
        <ErrorBoundary viewName="Main View">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeView}
              initial={{ opacity: 0, y: 12, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -12, filter: 'blur(8px)' }}
              transition={{ type: 'spring', stiffness: 350, damping: 30, mass: 0.8 }}
              className="w-full h-full"
            >
              <Suspense fallback={<div className="ui-app-loader">Loading View...</div>}>
                {activeView === 'meeting-list' && <MeetingListView />}
                {activeView === 'meeting-detail' && <MeetingDetailView />}
                {activeView === 'settings' && <SettingsView />}
                {activeView === 'knowledge-graph' && <KnowledgeGraphView />}
                {activeView === 'weekly-digest' && <WeeklyDigestView />}
                {activeView === 'ask-meetings' && <AskMeetingsView />}
                {activeView === 'pricing' && <PricingView />}
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </ErrorBoundary>
      </main>

      <ToastContainer />
      <CommandPalette />
      <GlobalContextBar open={globalContextOpen} onClose={() => toggleGlobalContext()} />

      {/* Global API Limit & Upgrade Catchers */}
      <DeviceWallDialog
        open={deviceWallOpen}
        onClose={() => setDeviceWallOpen(false)}
        currentDevices={deviceCount}
        maxDevices={userTier === 'free' ? 1 : userTier === 'starter' ? 2 : 999}
        onUpgrade={() => {
          navigate('pricing')
          setDeviceWallOpen(false)
        }}
      />

      <IntelligenceWallDialog
        open={intelligenceWallOpen}
        onClose={() => setIntelligenceWallOpen(false)}
        queriesUsed={quotaData.used}
        queryLimit={quotaData.limit === Infinity ? 999 : quotaData.limit}
        onUpgrade={() => {
          navigate('pricing')
          setIntelligenceWallOpen(false)
        }}
      />

      {/* Conflict Resolution Dialog (sync:conflict) */}
      {conflictInfo && (
        <ConflictMergeDialog
          conflict={conflictInfo}
          onResolve={async (strategy, mergedContent) => {
            try {
              await window.electronAPI?.sync?.resolveConflict?.({
                noteId: conflictInfo.noteId,
                strategy,
                mergedContent,
                localVersion: conflictInfo.localVersion,
                remoteVersion: conflictInfo.remoteVersion,
              })
            } catch {
              // Resolution failed — close dialog anyway
            }
            setConflictInfo(null)
          }}
          onCancel={() => setConflictInfo(null)}
        />
      )}
    </div>
  )
}
