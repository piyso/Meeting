import React, { useEffect, useRef } from 'react'

export interface SourcePopoverData {
  meetingTitle: string
  meetingDate?: number
  sourceContext?: string
  meetingId: string
}

interface SourceContextPopoverProps {
  data: SourcePopoverData
  anchorRect: DOMRect
  onClose: () => void
  onOpenMeeting: (id: string) => void
}

const formatDate = (ts: number) => {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export const SourceContextPopover: React.FC<SourceContextPopoverProps> = ({
  data,
  anchorRect,
  onClose,
  onOpenMeeting,
}) => {
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const handleScroll = () => onClose()
    
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEsc)
    document.addEventListener('scroll', handleScroll, true)
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEsc)
      document.removeEventListener('scroll', handleScroll, true)
    }
  }, [onClose])

  // Position popover above or below the anchor depending on available space
  const spaceAbove = anchorRect.top
  const spaceBelow = window.innerHeight - anchorRect.bottom
  const positionAbove = spaceAbove > 200 || spaceAbove > spaceBelow
  
  const style: React.CSSProperties = {
    position: 'fixed',
    ...(positionAbove
      ? { bottom: window.innerHeight - anchorRect.top + 8 }
      : { top: anchorRect.bottom + 8 }),
    left: Math.max(
      16,
      Math.min(anchorRect.left + anchorRect.width / 2 - 160, window.innerWidth - 336)
    ),
    zIndex: 999,
  }

  return (
    <div ref={popoverRef} className="ui-digest-source-popover" style={style}>
      <div className="ui-digest-source-popover-header">
        <span className="ui-digest-source-popover-title">{data.meetingTitle}</span>
        {data.meetingDate && (
          <span className="ui-digest-source-popover-date">{formatDate(data.meetingDate)}</span>
        )}
      </div>
      {data.sourceContext && (
        <blockquote className="ui-digest-source-popover-quote">{data.sourceContext}</blockquote>
      )}
      <button
        className="ui-digest-source-popover-open"
        onClick={() => {
          onOpenMeeting(data.meetingId)
          onClose()
        }}
      >
        Open Full Meeting →
      </button>
    </div>
  )
}
