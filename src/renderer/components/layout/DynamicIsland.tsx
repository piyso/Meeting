import React from 'react'
import { ChevronLeft, Square } from 'lucide-react'
import { IconButton } from '../ui/IconButton'
import { AudioIndicator } from '../meeting/AudioIndicator'
import type { ElectronAPI } from '../../../types/ipc'

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

interface DynamicIslandProps {
  recordingState: 'idle' | 'starting' | 'recording' | 'stopping' | 'processing'
  meetingTitle?: string
  elapsedTime?: string
  syncStatus: 'idle' | 'syncing' | 'error'
  isOnline: boolean
  onBack?: () => void
  onStopRecording?: () => void
  onTitleChange?: (title: string) => void
  audioLevel?: number
}

export const DynamicIsland: React.FC<DynamicIslandProps> = ({
  recordingState,
  meetingTitle,
  elapsedTime,
  syncStatus,
  isOnline,
  onBack,
  onStopRecording,
  onTitleChange,
  audioLevel,
}) => {
  const isRecording = recordingState === 'recording'

  // Broadcast our active state to the native floating widget
  React.useEffect(() => {
    // We only broadcast when there's an active recording session or processing state
    if (recordingState !== 'idle') {
      window.electronAPI.widget.updateState({
        isRecording,
        elapsedTime: elapsedTime || '00:00:00',
        lastTranscriptLine:
          recordingState === 'processing' ? 'Processing transcript...' : 'Listening...',
      })
    } else {
      // Ensure widget hides immediately when idle
      window.electronAPI.widget.updateState({
        isRecording: false,
        elapsedTime: '00:00:00',
        lastTranscriptLine: '',
      })
    }
  }, [recordingState, isRecording, elapsedTime])

  // Sync dot calculation
  let syncDotClass = 'ui-dynamic-island-sync-online'
  let syncTitle = 'Synced'
  if (!isOnline || syncStatus === 'error') {
    syncDotClass = 'ui-dynamic-island-sync-offline'
    syncTitle = 'Offline'
  } else if (syncStatus === 'syncing') {
    syncDotClass = 'ui-dynamic-island-sync-syncing animate-pulse'
    syncTitle = 'Syncing'
  }

  return (
    <div
      className="ui-dynamic-island surface-glass-premium gpu-promoted drag-region"
      role="banner"
      aria-label="Meeting status bar"
      style={{ left: document.body.classList.contains('focus-mode') ? 'var(--space-16)' : '72px' }}
    >
      {/* Left Section */}
      <div className="ui-dynamic-island-left no-drag">
        {onBack && <IconButton icon={<ChevronLeft size={18} />} onClick={onBack} size="sm" />}
        {meetingTitle !== undefined && (
          <input
            className="ui-dynamic-island-title-input"
            value={meetingTitle}
            onChange={e => onTitleChange?.(e.target.value)}
            placeholder="Untitled Meeting"
            aria-label="Meeting title"
          />
        )}
      </div>

      {/* Center Section */}
      <div className="ui-dynamic-island-center no-drag">
        {
          isRecording ? (
            <div
              className="ui-dynamic-island-recording"
              role="status"
              aria-live="assertive"
              aria-label={`Recording: ${elapsedTime || '00:00:00'}`}
            >
              <div className="ui-dynamic-island-rec-dot animate-pulse" aria-hidden="true" />
              <span className="ui-dynamic-island-rec-label">Rec</span>
              <span className="ui-dynamic-island-rec-time">{elapsedTime || '00:00:00'}</span>
              <AudioIndicator audioLevel={audioLevel || 0} isRecording={true} />
              <button
                onClick={onStopRecording}
                className="ui-dynamic-island-stop-btn"
                aria-label="Stop recording"
              >
                <Square size={12} fill="currentColor" />
              </button>
            </div>
          ) : recordingState === 'processing' ? (
            <div
              className="ui-dynamic-island-processing flex items-center gap-2 px-3 py-1 bg-[rgba(167,139,250,0.1)] rounded-full border border-[var(--color-violet)] shadow-[0_0_12px_rgba(167,139,250,0.3)]"
              role="status"
              aria-label="Processing meeting"
            >
              <div className="w-2 h-2 rounded-full bg-[var(--color-violet)] animate-pulse" />
              <span className="text-[11px] font-medium text-[var(--color-violet)] tracking-wide uppercase">
                Thinking...
              </span>
            </div>
          ) : null /* Extreme minimalism: Idle state shows nothing */
        }
      </div>

      {/* Right Section (Only show when not in default 'Synced' state) */}
      <div
        className="ui-dynamic-island-right no-drag"
        title={syncTitle}
        aria-label={`Connectivity: ${syncTitle}`}
      >
        {syncTitle !== 'Synced' && <div className={`ui-dynamic-island-sync-dot ${syncDotClass}`} />}
      </div>
    </div>
  )
}
