import React from 'react'
import { ChevronLeft, Square } from 'lucide-react'
import { IconButton } from '../ui/IconButton'
import { Badge } from '../ui/Badge'
import { AudioIndicator } from '../meeting/AudioIndicator'

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

  // Sync dot calculation
  let syncDotBg = 'bg-[var(--color-emerald)]'
  let syncTitle = 'Synced'
  if (!isOnline || syncStatus === 'error') {
    syncDotBg = 'bg-[var(--color-rose)]'
    syncTitle = 'Offline'
  } else if (syncStatus === 'syncing') {
    syncDotBg = 'bg-[var(--color-amber)] animate-pulse'
    syncTitle = 'Syncing'
  }

  return (
    <div
      className="fixed top-[var(--space-8)] h-[var(--h-xl)] right-[var(--space-16)] 
                 surface-glass-premium gpu-promoted rounded-full z-40
                 flex items-center px-[var(--space-16)] justify-between drag-region
                 transition-all duration-300 ease-[var(--ease-fluid)]"
      style={{ left: document.body.classList.contains('focus-mode') ? 'var(--space-16)' : '72px' }}
    >
      {/* Left Section */}
      <div className="flex items-center gap-[var(--space-8)] no-drag">
        {onBack && (
          <IconButton
            icon={<ChevronLeft size={18} />}
            onClick={onBack}
            size="sm"
          />
        )}
        {meetingTitle !== undefined && (
          <input
            className="bg-transparent border-none text-[var(--text-sm)] font-medium text-[var(--color-text-primary)] outline-none w-[200px]"
            value={meetingTitle}
            onChange={(e) => onTitleChange?.(e.target.value)}
            placeholder="Untitled Meeting"
          />
        )}
      </div>

      {/* Center Section */}
      <div className="flex items-center gap-[var(--space-12)] no-drag absolute left-1/2 -translate-x-1/2">
        {isRecording ? (
          <div className="flex items-center gap-[var(--space-8)] bg-[rgba(251,113,133,0.1)] py-1 px-3 rounded-full border border-[rgba(251,113,133,0.2)]">
            <div className="w-2 h-2 rounded-full bg-[var(--color-rose)] animate-pulse" />
            <span className="text-[10px] tracking-widest text-[var(--color-rose)] font-bold uppercase">Rec</span>
            <span className="font-mono text-[var(--text-sm)] text-[var(--color-rose)] ml-1 mr-2">{elapsedTime || '00:00:00'}</span>
            <AudioIndicator audioLevel={audioLevel || 0} isRecording={true} />
            <button 
              onClick={onStopRecording}
              className="ml-2 w-6 h-6 flex items-center justify-center rounded bg-[var(--color-rose)] text-[#000] hover:bg-white transition-colors"
            >
              <Square size={12} fill="currentColor" />
            </button>
          </div>
        ) : (
          <Badge variant="outline" className="opacity-50">⚡ Performance mode</Badge>
        )}
      </div>

      {/* Right Section */}
      <div className="flex items-center no-drag" title={syncTitle}>
        <div className={`w-2 h-2 rounded-full ${syncDotBg}`} />
      </div>
    </div>
  )
}
