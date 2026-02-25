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

// Code-split heavy views
const MeetingListView = lazy(() => import('../../views/MeetingListView').catch(() => ({ default: () => <div>MeetingList Placeholder</div> })))
const MeetingDetailView = lazy(() => import('../../views/MeetingDetailView').catch(() => ({ default: () => <div>MeetingDetail Placeholder</div> })))
const SettingsView = lazy(() => import('../../views/SettingsView').catch(() => ({ default: () => <div>Settings Placeholder</div> })))

export const AppLayout: React.FC = () => {
  const { 
    activeView, 
    navigate, 
    focusMode, 
    recordingState, 
    isOnline, 
    syncStatus,
    setRecordingState 
  } = useAppStore()

  // State for global API limit dialogs
  const [deviceWallOpen, setDeviceWallOpen] = React.useState(false)
  const [intelligenceWallOpen, setIntelligenceWallOpen] = React.useState(false)

  useSyncEngine() // Boot up sync and network polling

  const meetingId = activeView === 'meeting-detail' ? useAppStore.getState().selectedMeetingId : null
  const { startCapture, stopCapture } = useAudioSession(meetingId)
  const { currentVolume } = useAudioStatus(meetingId)

  // React to store state to trigger actual backend capture
  React.useEffect(() => {
    if (recordingState === 'starting' && meetingId) {
      startCapture('system').then((success) => {
        if (success) {
          setRecordingState('recording')
        } else {
          // Failure or lack of permissions
          setRecordingState('idle')
        }
      })
    }
  }, [recordingState, meetingId, startCapture, setRecordingState])

  // Stop recording via API hook and complete UI state shift
  const handleStopRecording = async () => {
    setRecordingState('processing')
    if (meetingId) {
      await stopCapture()
    }
    setTimeout(() => setRecordingState('idle'), 2000)
  }

  return (
    <div className="w-full h-full flex overflow-hidden bg-[var(--color-bg-root)] text-[var(--color-text-primary)] relative">
      <div className="absolute top-0 left-0 right-0 h-8 drag-region z-[9999]" />
      
      <ZenRail 
        activeView={activeView} 
        onNavigate={(v) => navigate(v)} 
        focusMode={focusMode} 
      />
      
      <DynamicIsland
        recordingState={recordingState}
        isOnline={isOnline}
        syncStatus={syncStatus}
        meetingTitle={activeView === 'meeting-detail' ? "Project Sync" : undefined}
        elapsedTime={recordingState === 'recording' ? "00:12:45" : undefined}
        onBack={activeView === 'meeting-detail' ? () => navigate('meeting-list') : undefined}
        onStopRecording={handleStopRecording}
        audioLevel={currentVolume}
      />
      
      <OfflineBanner isOnline={isOnline} />
      
      <main 
        className="flex-1 overflow-hidden transition-all duration-300 ease-[var(--ease-fluid)] p-[var(--space-16)]"
        style={{
          marginLeft: focusMode ? 0 : 56,
          marginTop: 64, // Island height (48) + top gap (8) + padding (8)
        }}
      >
        <ErrorBoundary>
          <Suspense fallback={<div className="w-full h-full flex items-center justify-center text-[var(--color-text-tertiary)]">Loading View...</div>}>
            {activeView === 'meeting-list' && <MeetingListView />}
            {activeView === 'meeting-detail' && <MeetingDetailView />}
            {activeView === 'settings' && <SettingsView />}
          </Suspense>
        </ErrorBoundary>
      </main>

      <ToastContainer />
      <CommandPalette />
      <GlobalContextBar 
        open={useAppStore(s => s.globalContextOpen)} 
        onClose={() => useAppStore.getState().toggleGlobalContext()} 
      />

      {/* Global API Limit & Upgrade Catchers */}
      <DeviceWallDialog
        open={deviceWallOpen}
        onClose={() => setDeviceWallOpen(false)}
        currentDevices={3}
        maxDevices={3}
        onUpgrade={() => {
          console.log('Open billing portal')
          setDeviceWallOpen(false)
        }}
      />
      
      <IntelligenceWallDialog
        open={intelligenceWallOpen}
        onClose={() => setIntelligenceWallOpen(false)}
        queriesUsed={100}
        queryLimit={100}
        onUpgrade={() => {
          console.log('Open billing portal')
          setIntelligenceWallOpen(false)
        }}
      />
    </div>
  )
}
