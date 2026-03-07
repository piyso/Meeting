import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import '../views/views.css'
import { Plus, FileText, Search } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { MeetingCard } from '../components/meeting/MeetingCard'
import { NewMeetingDialog } from '../components/meeting/NewMeetingDialog'
import { EmptyState } from '../components/ui/EmptyState'
import { MeetingCardSkeleton } from '../components/ui/Skeletons'
import { Button } from '../components/ui/Button'
import { ContextMenu, MenuItem } from '../components/ui/ContextMenu'
import { SyncStatusBadge } from '../components/ui/SyncStatusBadge'
import { rendererLog } from '../utils/logger'
import { motion } from 'framer-motion'

const log = rendererLog.create('MeetingList')

import { useMeetings } from '../hooks/queries/useMeetings'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'

export default function MeetingListView() {
  const navigate = useAppStore(s => s.navigate)
  const setRecordingState = useAppStore(s => s.setRecordingState)
  const queryClient = useQueryClient()
  const { data: response, isLoading } = useMeetings()
  const meetings = response?.items || []

  const [dialogOpen, setDialogOpen] = useState(false)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; id: string } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [renamingMeetingId, setRenamingMeetingId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [columns, setColumns] = useState(3)

  // Measure container width to determine grid columns dynamically
  useEffect(() => {
    if (!scrollRef.current) return
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        // Scroll container has padding: 48px on left/right
        const availableWidth = entry.contentRect.width - 96
        // Grid: minmax(300px, 1fr) with 24px gap
        // cols * 300 + (cols - 1) * 24 <= availableWidth
        const cols = Math.max(1, Math.floor((availableWidth + 24) / 324))
        setColumns(cols)
      }
    })
    observer.observe(scrollRef.current)
    return () => observer.disconnect()
  }, [])

  const deleteMeeting = useMutation({
    mutationFn: async (id: string) => {
      const res = await window.electronAPI.meeting.delete({ meetingId: id })
      if (!res.success) throw new Error(res.error?.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] })
    },
  })

  /**
   * Quick-start: directly create a meeting and navigate to it.
   * No dialog needed — title auto-generates and can be edited later.
   */
  const handleQuickStart = useCallback(async () => {
    log.info('Starting new meeting (quick start)')
    setRecordingState('starting')
    try {
      const res = await window.electronAPI.meeting.start({})
      if (res.success && res.data) {
        log.info('Meeting created:', res.data.meeting.id)
        queryClient.invalidateQueries({ queryKey: ['meetings'] })
        navigate('meeting-detail', res.data.meeting.id)
      } else {
        log.error('Failed to start meeting:', res.error)
        setRecordingState('idle')
      }
    } catch (err) {
      log.error('Meeting start exception:', err)
      setRecordingState('idle')
    }
  }, [navigate, setRecordingState, queryClient])

  useEffect(() => {
    const handleCmdN = () => handleQuickStart()
    window.addEventListener('open-new-meeting', handleCmdN)
    return () => window.removeEventListener('open-new-meeting', handleCmdN)
  }, [handleQuickStart])

  /**
   * Start meeting from dialog form (with optional title/template)
   */
  const handleStartMeeting = async (config: string | { title?: string }) => {
    setDialogOpen(false)
    setRecordingState('starting')
    const title = typeof config === 'string' ? config : config?.title
    const res = await window.electronAPI.meeting.start({
      title: typeof title === 'string' ? title : undefined,
    })
    if (res.success && res.data) {
      queryClient.invalidateQueries({ queryKey: ['meetings'] })
      navigate('meeting-detail', res.data.meeting.id)
    } else {
      log.error('Failed to start meeting:', res.error)
      setRecordingState('idle')
    }
  }

  const handleContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY, id })
  }

  const renameMeeting = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      // IPC structure usually takes a single object for updates
      return window.electronAPI.meeting.update({ meetingId: id, updates: { title } })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] })
      setRenamingMeetingId(null)
    },
    onError: err => {
      log.error('Failed to rename meeting:', err)
      setRenamingMeetingId(null)
    },
  })

  const getCtxItems = (id: string): MenuItem[] => [
    { label: 'Open', onClick: () => navigate('meeting-detail', id) },
    {
      label: 'Rename',
      onClick: () => {
        setRenamingMeetingId(id)
        setCtxMenu(null)
      },
    },
    { divider: true },
    {
      label: 'Delete',
      onClick: () => deleteMeeting.mutate(id),
      danger: true,
    },
  ]

  interface MeetingItem {
    id: string
    title?: string | null
    created_at: number
    start_time: number
    duration?: number | null
    has_transcript?: boolean | null
    has_notes?: boolean | null
    participant_count?: number | null
  }

  const groupMeetingsByDate = (meetings: MeetingItem[]) => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today.getTime() - 86400000)

    const groups: Record<string, MeetingItem[]> = {}

    for (const m of meetings) {
      const meetingDate = new Date(m.created_at * 1000)
      const meetingDay = new Date(
        meetingDate.getFullYear(),
        meetingDate.getMonth(),
        meetingDate.getDate()
      )

      let label: string
      if (meetingDay.getTime() === today.getTime()) {
        label = 'Today'
      } else if (meetingDay.getTime() === yesterday.getTime()) {
        label = 'Yesterday'
      } else {
        label = meetingDay.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
        })
      }

      const arr = groups[label] ?? (groups[label] = [])
      arr.push(m)
    }

    return groups
  }

  const filteredMeetings = meetings.filter(m => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return m.title && m.title.toLowerCase().includes(q)
  })

  const dateGroups = groupMeetingsByDate(filteredMeetings as MeetingItem[])

  type VirtualRow = { type: 'header'; label: string } | { type: 'row'; items: MeetingItem[] }

  // Flatten date groups into virtualizable rows (headers + chunks of meetings)
  const virtualRows = useMemo(() => {
    const rows: VirtualRow[] = []
    Object.entries(dateGroups).forEach(([label, groupMeetings]) => {
      rows.push({ type: 'header', label })
      for (let i = 0; i < groupMeetings.length; i += columns) {
        rows.push({ type: 'row', items: groupMeetings.slice(i, i + columns) })
      }
    })
    return rows
  }, [dateGroups, columns])

  const rowVirtualizer = useVirtualizer({
    count: virtualRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: i => {
      const row = virtualRows[i]
      if (row && row.type === 'header') return 68
      return 184 // ~160px card (min-height 150) + 24px gap
    },
    overscan: 4,
  })

  if (isLoading) {
    return (
      <div className="ui-view-meeting-list loading">
        <div>
          <h2 className="ui-view-meeting-list-section-title">Today</h2>
          <div className="ui-meeting-grid">
            {Array.from({ length: 3 }).map((_, i) => (
              <MeetingCardSkeleton key={`skeleton-1-${i}`} />
            ))}
          </div>
        </div>
        <div>
          <h2 className="ui-view-meeting-list-section-title">Yesterday</h2>
          <div className="ui-meeting-grid">
            {Array.from({ length: 3 }).map((_, i) => (
              <MeetingCardSkeleton key={`skeleton-2-${i}`} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (meetings.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No meetings yet"
        description="Start your first meeting to begin capturing transcripts and notes."
        action={
          <Button
            variant="primary"
            icon={<Plus size={16} />}
            onClick={handleQuickStart}
            className="no-drag"
          >
            Start New Meeting
          </Button>
        }
      />
    )
  }

  return (
    <div ref={scrollRef} className="ui-view-meeting-list scrollbar-webkit">
      <motion.div
        className="ui-view-meeting-list-header w-full justify-between gap-4"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <button onClick={handleQuickStart} className="ui-hero-start-btn no-drag shrink-0">
          <div className="ui-hero-start-btn-bg"></div>

          <div className="ui-hero-start-btn-content">
            <div className="ui-hero-start-btn-icon-wrapper">
              <Plus size={24} strokeWidth={2.5} />
            </div>

            <div className="ui-hero-start-btn-text-block">
              <span className="ui-hero-start-btn-title">Start New Meeting</span>
              <span className="ui-hero-start-btn-desc">Capture mic and system audio instantly</span>
            </div>

            <div className="ui-hero-start-btn-shortcut">
              <kbd>⌘</kbd>
              <kbd>N</kbd>
            </div>
          </div>
        </button>

        <div className="flex items-center gap-4 no-drag shrink-0">
          <div className="text-[13px] font-medium text-[var(--color-text-secondary)] tracking-wide">
            {meetings.length} meeting{meetings.length !== 1 ? 's' : ''} total
          </div>
          <SyncStatusBadge />
          <div className="relative w-64 group shrink-0">
            <Search
              size={14}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)] transition-colors group-focus-within:text-[var(--color-text-secondary)]"
            />
            <input
              type="text"
              placeholder="Search meetings..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full surface-glass-premium border border-[rgba(255,255,255,0.06)] rounded-full pl-9 pr-4 py-2.5 text-[13px] text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] outline-none transition-all hover:bg-[rgba(255,255,255,0.02)] focus:border-[rgba(255,255,255,0.12)] focus:shadow-[0_4px_24px_rgba(0,0,0,0.2)]"
            />
          </div>
        </div>
      </motion.div>

      <div
        className="ui-view-meeting-list-sections"
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          position: 'relative',
        }}
      >
        {rowVirtualizer.getVirtualItems().map(virtualItem => {
          const row = virtualRows[virtualItem.index]
          if (!row) return null

          return (
            <div
              key={virtualItem.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
                paddingBottom: '24px', // gap equivalent
              }}
            >
              {row.type === 'header' ? (
                <motion.h2
                  className="ui-view-meeting-list-section-title !mb-0 border-none pb-2"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1, duration: 0.4 }}
                >
                  {row.label}
                </motion.h2>
              ) : (
                <motion.div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                    gap: '24px',
                  }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ staggerChildren: 0.05 }}
                >
                  {row.items.map((m: MeetingItem, i: number) => (
                    <MeetingCard
                      key={m.id}
                      id={m.id}
                      title={m.title ?? 'Untitled Meeting'}
                      date={new Date(m.start_time * 1000)}
                      duration={m.duration || 0}
                      hasTranscript={m.has_transcript || false}
                      hasNotes={m.has_notes || false}
                      participantCount={m.participant_count || 1}
                      index={virtualItem.index * columns + i}
                      isRenaming={renamingMeetingId === m.id}
                      onRenameSubmit={(newTitle: string) => {
                        if (newTitle && newTitle !== m.title) {
                          renameMeeting.mutate({ id: m.id, title: newTitle })
                        } else {
                          setRenamingMeetingId(null)
                        }
                      }}
                      onClick={(id: string) => {
                        if (renamingMeetingId) {
                          setRenamingMeetingId(null)
                          return
                        }
                        navigate('meeting-detail', id)
                      }}
                      onContextMenu={handleContextMenu}
                    />
                  ))}
                </motion.div>
              )}
            </div>
          )
        })}
      </div>

      <NewMeetingDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleStartMeeting}
      />

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={getCtxItems(ctxMenu.id)}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  )
}
