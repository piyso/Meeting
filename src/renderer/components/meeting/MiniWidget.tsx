import React from 'react'
import { Square, Maximize2 } from 'lucide-react'

interface MiniWidgetProps {
  isRecording: boolean
  elapsedTime: string
  lastTranscriptLine: string
  onRestore: () => void
  onStop: () => void
}

export const MiniWidget: React.FC<MiniWidgetProps> = ({
  isRecording,
  elapsedTime,
  lastTranscriptLine,
  onRestore,
  onStop,
}) => {
  // Phase 1 implementation visualizes this inside the app shell
  // Phase 2 will port this to an isolated Electron BrowserWindow

  return (
    <div
      className="fixed bottom-0 right-0 w-[280px] h-[72px] rounded-[var(--radius-xl)] px-[var(--space-16)] py-[var(--space-12)] flex flex-col justify-center widget-draggable"
      onClick={e => {
        // Prevent restore if clicking stop button
        if (!(e.target as HTMLElement).closest('button')) onRestore()
      }}
    >
      {/* Row 1: Status */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          {isRecording ? (
            <div className="w-2 h-2 rounded-full bg-[var(--color-rose)] animate-pulse shadow-[0_0_8px_var(--color-glow-rose)]" />
          ) : (
            <div className="w-2 h-2 rounded-full bg-[var(--color-emerald)]" />
          )}
          <span
            className={`text-[10px] font-bold tracking-widest uppercase ${isRecording ? 'text-[var(--color-rose)]' : 'text-[var(--color-emerald)]'}`}
          >
            {isRecording ? 'Rec' : 'Idle'}
          </span>
          <span className="font-mono text-[var(--text-sm)] text-[var(--color-text-primary)] ml-1">
            {elapsedTime}
          </span>
        </div>

        <div className="flex gap-1">
          {isRecording && (
            <button
              onClick={e => {
                e.stopPropagation()
                onStop()
              }}
              className="w-[22px] h-[22px] rounded bg-[var(--color-rose)] flex items-center justify-center text-[#000] hover:bg-white transition-colors widget-nodrag"
            >
              <Square size={10} fill="currentColor" />
            </button>
          )}
          <button
            onClick={e => {
              e.stopPropagation()
              onRestore()
            }}
            className="w-[22px] h-[22px] rounded bg-[rgba(255,255,255,0.1)] flex items-center justify-center text-[var(--color-text-secondary)] hover:text-white transition-colors transform rotate-90 widget-nodrag"
            title="Restore Window"
          >
            <Maximize2 size={12} />
          </button>
        </div>
      </div>

      {/* Row 2: Transcript Preview */}
      <div className="truncate text-[var(--text-xs)] text-[var(--color-text-secondary)]">
        <span className="text-[var(--color-violet)] font-medium">Alex: </span>
        {lastTranscriptLine || 'Waiting for speech...'}
      </div>
    </div>
  )
}
