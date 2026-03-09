import React, { Suspense, lazy } from 'react'
import { useAppStore } from '../../store/appStore'
import { ZenRail } from './ZenRail'
import { DynamicIsland } from './DynamicIsland'
import { ErrorBoundary } from './ErrorBoundary'
import { OfflineBanner } from './OfflineBanner'
import { ToastContainer } from '../ui/Toast'
import { CommandPalette } from '../command/CommandPalette'
import { GlobalContextBar } from '../command/GlobalContextBar'
import { DeviceWallDialog } from '../meeting/DeviceWallDialog'
import { IntelligenceWallDialog } from '../meeting/IntelligenceWallDialog'
import { useAudioSession } from '../../hooks/useAudioSession'
import { useAudioStatus } from '../../hooks/queries/useAudioStatus'
import { useSystemState } from '../../hooks/useSystemState'
import { useSyncEngine } from '../../hooks/useSyncEngine'
import { ConflictMergeDialog } from '../meeting/ConflictMergeDialog'

// Error fallback component for failed lazy loads
const LazyLoadError: React.FC<{ name: string }> = ({ name }) => (
  <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-muted, #888)' }}>
    <p style={{ fontSize: 14 }}>Failed to load {name}</p>
    <button
      onClick={() => window.location.reload()}
      style={{
        marginTop: 8,
        padding: '6px 16px',
        borderRadius: 6,
        border: '1px solid var(--color-border, #333)',
        background: 'transparent',
        color: 'inherit',
        cursor: 'pointer',
        fontSize: 13,
      }}
    >
      Reload
    </button>
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
  const focusMode = useAppStore(s => s.focusMode)
  const recordingState = useAppStore(s => s.recordingState)
  const isOnline = useAppStore(s => s.isOnline)
  const syncStatus = useAppStore(s => s.syncStatus)
  const setRecordingState = useAppStore(s => s.setRecordingState)
  const selectedMeetingId = useAppStore(s => s.selectedMeetingId)
  const globalContextOpen = useAppStore(s => s.globalContextOpen)
  const toggleGlobalContext = useAppStore(s => s.toggleGlobalContext)

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
        const res = await window.electronAPI.meeting.start({})
        if (res.success && res.data) {
          navigate('meeting-detail', res.data.meeting.id)
        } else {
          setRecordingState('idle')
        }
      } catch (err) {
        setRecordingState('idle')
      }
    }

    // toggle-recording: start if idle, stop if recording
    const handleToggleRecording = async () => {
      const state = useAppStore.getState()
      if (state.recordingState === 'recording') {
        // Inline stop logic — avoids depending on handleStopRecording declaration order
        setRecordingState('processing')
        try {
          if (state.activeMeetingId) {
            await window.electronAPI?.audio?.stopCapture?.({ meetingId: state.activeMeetingId })
          }
        } catch {
          /* ignore */
        }
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
      if (e.metaKey && e.shiftKey && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        await executeBookmark()
      }
    }

    const unsubBookmarkIPC = window.electronAPI?.on?.bookmarkRequested?.(() => {
      executeBookmark()
    })

    window.addEventListener('keydown', handleBookmarkShortcut)
    return () => {
      window.removeEventListener('keydown', handleBookmarkShortcut)
      if (unsubBookmarkIPC) unsubBookmarkIPC()
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
      }
    }
    checkFirstLaunch()
  }, [navigate])

  const meetingId = activeView === 'meeting-detail' ? selectedMeetingId : null
  const { startCapture, stopCapture } = useAudioSession(meetingId)
  const { currentVolume } = useAudioStatus(meetingId)

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
    setRecordingState('processing')
    if (meetingId) {
      await stopCapture()
    }
    setTimeout(() => setRecordingState('idle'), 2000)
  }, [meetingId, stopCapture, setRecordingState])

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
      <div className="ui-app-drag-region drag-region" />

      <ZenRail
        activeView={activeView}
        onNavigate={v => navigate(v)}
        focusMode={focusMode}
        userTier={userTier}
        onUpgrade={() => navigate('pricing')}
      />

      <DynamicIsland
        recordingState={recordingState}
        syncStatus={syncStatus}
        onBack={activeView === 'meeting-detail' ? () => navigate('meeting-list') : undefined}
        onStopRecording={handleStopRecording}
        audioLevel={currentVolume}
      />

      <OfflineBanner isOnline={isOnline} />

      {/* Session Expiring Warning Banner */}
      {sessionExpiringMs !== null && (
        <div
          style={{
            position: 'fixed',
            top: 56,
            left: 88,
            right: 0,
            zIndex: 100,
            background: 'linear-gradient(135deg, #b45309, #92400e)',
            color: 'white',
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          <span>
            ⚠️ Your session will expire in {Math.ceil(sessionExpiringMs / 60_000)} minutes due to
            inactivity.
          </span>
          <button
            onClick={() => {
              window.electronAPI?.auth?.recordActivity?.().catch(() => {})
              setSessionExpiringMs(null)
            }}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: '1px solid rgba(255,255,255,0.3)',
              color: 'white',
              padding: '4px 14px',
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 12,
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
