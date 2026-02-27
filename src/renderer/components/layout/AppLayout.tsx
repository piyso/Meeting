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
import { useSyncEngine } from '../../hooks/useSyncEngine'

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

export const AppLayout: React.FC = () => {
  const {
    activeView,
    navigate,
    focusMode,
    recordingState,
    isOnline,
    syncStatus,
    setRecordingState,
    selectedMeetingId,
  } = useAppStore()
  const globalContextOpen = useAppStore(s => s.globalContextOpen)
  const toggleGlobalContext = useAppStore(s => s.toggleGlobalContext)

  // State for global API limit dialogs
  const [deviceWallOpen, setDeviceWallOpen] = React.useState(false)
  const [intelligenceWallOpen, setIntelligenceWallOpen] = React.useState(false)

  useSyncEngine() // Boot up sync and network polling

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
        // If settings API unavailable, skip onboarding check
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
      startCapture('system').then(success => {
        if (success) {
          setRecordingState('recording')
        } else {
          setRecordingState('idle')
        }
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

      <ZenRail activeView={activeView} onNavigate={v => navigate(v)} focusMode={focusMode} />

      <DynamicIsland
        recordingState={recordingState}
        isOnline={isOnline}
        syncStatus={syncStatus}
        meetingTitle={undefined}
        elapsedTime={recordingState === 'recording' ? undefined : undefined}
        onBack={activeView === 'meeting-detail' ? () => navigate('meeting-list') : undefined}
        onStopRecording={handleStopRecording}
        audioLevel={currentVolume}
      />

      <OfflineBanner isOnline={isOnline} />

      <main
        className="ui-app-main"
        style={{
          marginLeft: focusMode ? 0 : 56,
          marginTop: 64, // Island height (48) + top gap (8) + padding (8)
        }}
      >
        <ErrorBoundary>
          <Suspense fallback={<div className="ui-app-loader">Loading View...</div>}>
            {activeView === 'meeting-list' && <MeetingListView />}
            {activeView === 'meeting-detail' && <MeetingDetailView />}
            {activeView === 'settings' && <SettingsView />}
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
        currentDevices={3}
        maxDevices={3}
        onUpgrade={() => {
          window.electronAPI?.shell?.openExternal?.('https://piyapi.cloud/billing')
          setDeviceWallOpen(false)
        }}
      />

      <IntelligenceWallDialog
        open={intelligenceWallOpen}
        onClose={() => setIntelligenceWallOpen(false)}
        queriesUsed={100}
        queryLimit={100}
        onUpgrade={() => {
          window.electronAPI?.shell?.openExternal?.('https://piyapi.cloud/billing')
          setIntelligenceWallOpen(false)
        }}
      />
    </div>
  )
}
