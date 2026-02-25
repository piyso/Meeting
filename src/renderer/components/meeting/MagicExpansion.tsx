import React from 'react'
import { X, Sparkles } from 'lucide-react'

interface MagicExpansionProps {
  content: string
  sourceSegmentIds: string[]
  onReject: () => void
}

export const MagicExpansion: React.FC<MagicExpansionProps> = ({ content, sourceSegmentIds, onReject }) => {
  
  const highlightSources = () => {
    // Custom event to tell TranscriptPanel to target these DOM IDs
    window.dispatchEvent(new CustomEvent('highlight-segments', { detail: { ids: sourceSegmentIds }}))
  }

  return (
    <div className="group relative mt-2 mb-4 pl-[var(--space-12)] border-l-2 border-[rgba(167,139,250,0.4)] hover:border-[var(--color-violet)] transition-colors py-1">
      <div className="flex gap-[var(--space-8)] items-start">
        <button 
          onClick={highlightSources}
          className="mt-1 shrink-0 w-6 h-6 flex items-center justify-center rounded-[var(--radius-sm)] bg-[rgba(167,139,250,0.1)] text-[var(--color-violet)] hover:bg-[var(--color-violet)] hover:text-white transition-colors"
          title="View Source Transcript"
        >
          <Sparkles size={12} fill="currentColor" />
        </button>
        
        <div className="flex-1 text-[var(--color-violet)] italic text-[var(--text-base)] leading-relaxed min-h-[24px]">
          {content}
        </div>

        <button 
          onClick={onReject}
          className="opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-tertiary)] hover:bg-[rgba(251,113,133,0.1)] hover:text-[var(--color-rose)]"
          title="Reject (Ctrl+Z)"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
