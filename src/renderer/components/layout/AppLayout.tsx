import React, { Suspense, lazy } from 'react'
import { WindowsTitleBar } from './WindowsTitleBar'
import { useAppStore } from '../../store/appStore'
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
import { useAudioSession } from '../../hooks/useAudioSession'

// Determine platform globally
const platform = window.electronAPI?.platform || 'web'

import { useSystemState } from '../../hooks/useSystemState'
import { useSyncEngine } from '../../hooks/useSyncEngine'
import { ConflictMergeDialog } from '../meeting/ConflictMergeDialog'

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
  const activeView = useAppStore(s => s.activeView)
  const navigate = useAppStore(s => s.navigate)

  // ── Platform CSS Injection ─────────────────────────────────
  React.useEffect(() => {
    document.body.setAttribute('data-platform', platform)
  }, [])
  const focusMode = useAppStore(s => s.focusMode)
  const recordingState = useAppStore(s => s.recordingState)
  const isOnline = useAppStore(s => s.isOnline)
  const syncStatus = useAppStore(s => s.syncStatus)
  const setRecordingState = useAppStore(s => s.setRecordingState)
  const selectedMeetingId = useAppStore(s => s.selectedMeetingId)
  const globalContextOpen = useAppStore(s => s.globalContextOpen)
  const toggleGlobalContext = useAppStore(s => s.toggleGlobalContext)

  // Prevent flash of onboarding for returning users
  const [initializing, setInitializing] = React.useState(true)

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
      // Trigger recording just like in MeetingListView.tsx handleQuickStart
      setRecordingState('starting')
      try {
        const res = await window.electronAPI?.meeting?.start({})
        if (res?.success && res.data) {
          useAppStore.getState().setActiveMeetingId(res.data.meeting.id)
          useAppStore.getState().setRecordingStartTime(Date.now())
          navigate('meeting-detail', res.data.meeting.id)
        } else {
          useAppStore.getState().addToast({
            type: 'error',
            title: 'Failed to start meeting',
            duration: 5000,
          })
          setRecordingState('idle')
        }
      } catch (err) {
        useAppStore.getState().addToast({
          type: 'error',
          title: 'Failed to start meeting',
          message: 'An unexpected error occurred',
          duration: 5000,
        })
        setRecordingState('idle')
      }
    }

    // toggle-recording: start if idle, stop if recording
    const handleToggleRecording = async () => {
      const state = useAppStore.getState()
      if (state.recordingState === 'recording' || state.recordingState === 'paused') {
        // Finalize pause accounting before stopping (mirrors handleStopRecording)
        if (state.recordingState === 'paused' && state.recordingPausedAt) {
          state.setRecordingTotalPausedMs(
            state.recordingTotalPausedMs + (Date.now() - state.recordingPausedAt)
          )
          state.setRecordingPausedAt(null)
        }
        setRecordingState('processing')
        try {
          if (state.activeMeetingId) {
            // meeting:stop saves end_time/duration AND stops audio internally (L159-164
            // of meeting.handlers.ts) — no need to call audio:stopCapture separately
            await window.electronAPI?.meeting?.stop?.({ meetingId: state.activeMeetingId })
          }
        } catch {
          useAppStore.getState().addToast({
            type: 'error',
            title: 'Stop recording failed',
            message: 'Recording may need manual cleanup',
            duration: 5000,
          })
        }
        useAppStore.getState().setActiveMeetingId(null)
        setTimeout(() => setRecordingState('idle'), 2000)
      } else if (state.recordingState === 'idle') {
        handleGlobalShortcut()
      }
    }

    // quick-export: export current meeting as markdown
    const handleQuickExport = async () => {
      const state = useAppStore.getState()
      const mid = state.selectedMeetingId || state.activeMeetingId
      if (!mid) return
      try {
        await window.electronAPI?.meeting?.export?.({ meetingId: mid, format: 'markdown' })
        state.addToast({ type: 'success', title: '📄 Exported as Markdown', duration: 2000 })
      } catch {
        state.addToast({ type: 'error', title: 'Export failed', duration: 3000 })
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
    const state = useAppStore.getState()
    if (state.recordingState !== 'recording' || !state.activeMeetingId || !state.recordingStartTime)
      return

    const elapsedMs = Date.now() - state.recordingStartTime
    const endTimeSec = elapsedMs / 1000
    const startTimeSec = Math.max(0, endTimeSec - 30) // Last 30 seconds

    try {
      await window.electronAPI?.highlight?.create({
        meetingId: state.activeMeetingId,
        startTime: startTimeSec,
        endTime: endTimeSec,
        label: '📌 Bookmarked moment',
      })
      state.addToast({ type: 'success', title: '📌 Moment bookmarked', duration: 2000 })
    } catch {
      state.addToast({ type: 'error', title: 'Failed to bookmark', duration: 3000 })
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

    window.addEventListener('keydown', handleBookmarkShortcut)
    window.addEventListener('keydown', handlePauseShortcut)

    return () => {
      window.removeEventListener('keydown', handleBookmarkShortcut)
      window.removeEventListener('keydown', handlePauseShortcut)
      window.removeEventListener('quick-bookmark', handleQuickBookmark)
      if (unsubBookmarkIPC) unsubBookmarkIPC()
      if (unsubPauseIPC) unsubPauseIPC()
    }
  }, [executeBookmark])

  // First-launch detection: check if onboarding is completed
  React.useEffect(() => {
    const checkFirstLaunch = async () => {
      try {
        const result = await window.electronAPI?.settings?.get({
          key: 'onboarding_completed',
        } as { key: string })
        if (!result?.success || !result?.data) {
          navigate('onboarding')
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

  const meetingId = activeView === 'meeting-detail' ? selectedMeetingId : null
  const {
    startCapture,
    stopCapture: _stopCapture,
    pauseCapture,
    resumeCapture,
  } = useAudioSession(meetingId)

  // React to store state to trigger actual backend capture
  React.useEffect(() => {
    if (recordingState === 'starting' && meetingId) {
      startCapture('system')
        .then(success => {
          if (success) {
            setRecordingState('recording')
          } else {
            setRecordingState('idle')
          }
        })
        .catch(() => {
          setRecordingState('idle')
        })
    }
  }, [recordingState, meetingId, startCapture, setRecordingState])

  // Stop recording via API hook and complete UI state shift
  const handleStopRecording = React.useCallback(async () => {
    // If stopping from paused state, finalize pause duration accounting
    const state = useAppStore.getState()
    if (state.recordingState === 'paused' && state.recordingPausedAt) {
      state.setRecordingTotalPausedMs(
        state.recordingTotalPausedMs + (Date.now() - state.recordingPausedAt)
      )
      state.setRecordingPausedAt(null)
    }
    setRecordingState('processing')
    try {
      if (state.activeMeetingId) {
        // meeting.stop() saves end_time/duration AND stops audio internally
        // No separate stopCapture() needed — avoids double-stop race condition (C3)
        await window.electronAPI?.meeting?.stop?.({ meetingId: state.activeMeetingId })
      }
    } catch {
      useAppStore.getState().addToast({
        type: 'error',
        title: 'Stop recording failed',
        message: 'Recording may need manual cleanup',
        duration: 5000,
      })
    }
    useAppStore.getState().setActiveMeetingId(null)
    setTimeout(() => setRecordingState('idle'), 2000)
  }, [setRecordingState])

  // Pause/Resume recording
  const handlePauseRecording = React.useCallback(async () => {
    const state = useAppStore.getState()
    // Use activeMeetingId from store — not the view-dependent meetingId
    // This ensures pause works even when user navigates away from meeting-detail
    if (!state.activeMeetingId) return
    const currentState = state.recordingState
    if (currentState === 'recording') {
      try {
        await pauseCapture()
        state.setRecordingPausedAt(Date.now())
        setRecordingState('paused')
        state.addToast({ type: 'info', title: '⏸ Recording paused', duration: 2000 })
      } catch {
        state.addToast({ type: 'error', title: 'Failed to pause', duration: 3000 })
      }
    } else if (currentState === 'paused') {
      try {
        await resumeCapture()
        if (state.recordingPausedAt) {
          state.setRecordingTotalPausedMs(
            state.recordingTotalPausedMs + (Date.now() - state.recordingPausedAt)
          )
          state.setRecordingPausedAt(null)
        }
        setRecordingState('recording')
        state.addToast({ type: 'success', title: '▶ Recording resumed', duration: 2000 })
      } catch {
        state.addToast({ type: 'error', title: 'Failed to resume', duration: 3000 })
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
          onBack={activeView === 'meeting-detail' ? () => navigate('meeting-list') : undefined}
          onStopRecording={handleStopRecording}
          onPauseRecording={handlePauseRecording}
        />
      </ErrorBoundary>

      <OfflineBanner isOnline={isOnline} />
      <StatusBanner />

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
          right: 0,
          top: 72, // Island height (48) + top gap (8) + spacing (16)
          bottom: 0,
        }}
      >
        <ErrorBoundary viewName="Main View">
          <Suspense fallback={<div className="ui-app-loader">Loading View...</div>}>
            {activeView === 'meeting-list' && <MeetingListView />}
            {activeView === 'meeting-detail' && <MeetingDetailView />}
            {activeView === 'settings' && <SettingsView />}
            {activeView === 'knowledge-graph' && <KnowledgeGraphView />}
            {activeView === 'weekly-digest' && <WeeklyDigestView />}
            {activeView === 'ask-meetings' && <AskMeetingsView />}
            {activeView === 'pricing' && <PricingView />}
          </Suspense>
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
