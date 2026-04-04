import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { modKey } from '../utils/platformShortcut'
import '../views/views.css'
import { Plus, FileText, Search, MicOff } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { MeetingCard } from '../components/meeting/MeetingCard'
import { NewMeetingDialog } from '../components/meeting/NewMeetingDialog'
import { CalendarStrip } from '../components/calendar/CalendarStrip'
import { EmptyState } from '../components/ui/EmptyState'
import { MeetingCardSkeleton } from '../components/ui/Skeletons'
import { Button } from '../components/ui/Button'
import { ContextMenu, MenuItem } from '../components/ui/ContextMenu'
import { rendererLog } from '../utils/logger'
import { motion, AnimatePresence } from 'framer-motion'

const log = rendererLog.create('MeetingList')

import { useMeetings } from '../hooks/queries/useMeetings'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'

export default function MeetingListView() {
  const navigate = useAppStore(s => s.navigate)
  const setRecordingState = useAppStore(s => s.setRecordingState)
  const recordingState = useAppStore(s => s.recordingState)
  const activeMeetingId = useAppStore(s => s.activeMeetingId)
  const queryClient = useQueryClient()
  const { data: response, isLoading } = useMeetings()
  const meetingsData = response?.items
  const meetings = useMemo(() => meetingsData ?? [], [meetingsData])

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
        // Grid: minmax(280px, 1fr) with 20px gap
        const cols = Math.max(1, Math.floor((availableWidth + 20) / 300))
        setColumns(cols)
      }
    })
    observer.observe(scrollRef.current)
    return () => observer.disconnect()
  }, [])

  const deleteMeeting = useMutation({
    mutationFn: async (id: string) => {
      const res = await window.electronAPI?.meeting?.delete({ meetingId: id })
      if (!res?.success) throw new Error(res?.error?.message || 'Delete failed')
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
      const res = await window.electronAPI?.meeting?.start({})
      if (res?.success && res.data) {
        log.info('Meeting created:', res.data.meeting.id)
        useAppStore.getState().setActiveMeetingId(res.data.meeting.id)
        // P12 fix: Set recording start time immediately so DynamicIsland timer
        // starts without waiting for audio capture initialization
        useAppStore.getState().setRecordingStartTime(Date.now())
        queryClient.invalidateQueries({ queryKey: ['meetings'] })
        navigate('meeting-detail', res.data.meeting.id)
      } else {
        log.error('Failed to start meeting:', res?.error)
        useAppStore.getState().addToast({
          type: 'error',
          title: 'Failed to start meeting',
          message: res?.error?.message || 'Unknown error',
          duration: 5000,
        })
        setRecordingState('idle')
      }
    } catch (err) {
      log.error('Meeting start exception:', err)
      useAppStore.getState().addToast({
        type: 'error',
        title: 'Failed to start meeting',
        message: err instanceof Error ? err.message : 'An unexpected error occurred',
        duration: 5000,
      })
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
    try {
      const title = typeof config === 'string' ? config : config?.title
      const res = await window.electronAPI?.meeting?.start({
        title: typeof title === 'string' ? title : undefined,
      })
      if (res?.success && res.data) {
        useAppStore.getState().setActiveMeetingId(res.data.meeting.id)
        useAppStore.getState().setRecordingStartTime(Date.now())
        queryClient.invalidateQueries({ queryKey: ['meetings'] })
        navigate('meeting-detail', res.data.meeting.id)
      } else {
        log.error('Failed to start meeting:', res?.error)
        useAppStore.getState().addToast({
          type: 'error',
          title: 'Failed to start meeting',
          message: res?.error?.message || 'Unknown error',
          duration: 5000,
        })
        setRecordingState('idle')
      }
    } catch (err) {
      log.error('Meeting start exception:', err)
      useAppStore.getState().addToast({
        type: 'error',
        title: 'Failed to start meeting',
        message: err instanceof Error ? err.message : 'An unexpected error occurred',
        duration: 5000,
      })
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
      return window.electronAPI?.meeting?.update({ meetingId: id, updates: { title } })
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
      onClick: () => {
        if (
          window.confirm(
            'Delete this meeting? All transcripts, notes, and entities will be permanently removed.'
          )
        ) {
          deleteMeeting.mutate(id)
        }
      },
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

  const groupMeetingsByDate = useCallback((meetings: MeetingItem[]) => {
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
        label = meetingDay.toLocaleDateString(undefined, {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
        })
      }

      const arr = groups[label] ?? (groups[label] = [])
      arr.push(m)
    }

    return groups
  }, []) // Empty deps because it doesn't depend on external props, just a helper

  const filteredMeetings = useMemo(() => {
    return meetings.filter(m => {
      if (!searchQuery) return true
      const q = searchQuery.toLowerCase()
      return m.title && m.title.toLowerCase().includes(q)
    })
  }, [meetings, searchQuery])

  const dateGroups = useMemo(() => {
    return groupMeetingsByDate(filteredMeetings as MeetingItem[])
  }, [filteredMeetings, groupMeetingsByDate])

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
    <div ref={scrollRef} className="ui-view-meeting-list sovereign-scrollbar">
      <motion.div
        className="ui-view-meeting-list-header"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 350, damping: 28, mass: 0.8 }}
      >
        {/* --- LEFT: Hero Button --- */}
        <AnimatePresence mode="wait">
          {recordingState !== 'idle' && activeMeetingId ? (
            <motion.button
              key="active-banner"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 350, damping: 28, mass: 0.8 }}
              onClick={() => navigate('meeting-detail', activeMeetingId)}
              className="ui-hero-start-btn no-drag shrink-0 border border-[var(--color-amber)] bg-[rgba(245,158,11,0.05)] hover:bg-[rgba(245,158,11,0.1)] transition-colors group"
            >
              <div className="ui-hero-start-btn-content relative z-10 w-full flex items-center justify-between px-2">
                <div className="flex items-center gap-4">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[rgba(245,158,11,0.1)] text-[var(--color-amber)]">
                    <div
                      className={`w-3 h-3 rounded-full ${recordingState === 'paused' ? 'bg-[var(--color-amber)]' : 'bg-red-500 animate-pulse'}`}
                    />
                  </div>
                  <div className="flex flex-col items-start gap-0.5">
                    <span className="font-medium text-[var(--color-text-primary)] text-[15px] tracking-tight">
                      Active session
                    </span>
                    <span className="text-[13px] text-[var(--color-text-secondary)]">
                      {recordingState === 'paused' ? 'Paused' : 'Recording in progress'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[var(--color-amber)] text-[13px] font-medium opacity-80 group-hover:opacity-100 transition-opacity translate-x-1 pr-2">
                  Return to Meeting
                  <Plus className="rotate-45" size={16} />
                </div>
              </div>
              {/* Background Glow */}
              <div className="absolute inset-0 bg-gradient-to-r from-[var(--color-amber)]/0 to-[var(--color-amber)]/5 opacity-50 pointer-events-none rounded-full"></div>
            </motion.button>
          ) : (
            <motion.button
              key="start-btn"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 350, damping: 28, mass: 0.8 }}
              onClick={handleQuickStart}
              className="ui-hero-start-btn no-drag shrink-0"
            >
              <div className="ui-hero-start-btn-bg"></div>

              <div className="ui-hero-start-btn-content">
                <div className="ui-hero-start-btn-icon-wrapper">
                  <Plus size={24} strokeWidth={2.5} />
                </div>

                <div className="ui-hero-start-btn-text-block">
                  <span className="ui-hero-start-btn-title">Start New Meeting</span>
                  <span className="ui-hero-start-btn-desc">
                    Capture mic and system audio instantly
                  </span>
                </div>

                <div className="ui-hero-start-btn-shortcut">
                  <kbd>{modKey}</kbd>
                  <kbd>N</kbd>
                </div>
              </div>
            </motion.button>
          )}
        </AnimatePresence>

        {/* --- RIGHT: Search + Count --- */}
        <div className="flex flex-col items-end gap-2 no-drag shrink-0">
          <div className="relative group">
            <Search
              size={13}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8E8E93] group-focus-within:text-white transition-colors"
            />
            <input
              type="text"
              placeholder="Search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="ui-meeting-search-input"
            />
          </div>
          <span className="text-[12px] text-[#636366] select-none pr-1">
            {meetings.length} meeting{meetings.length !== 1 ? 's' : ''}
          </span>
        </div>
      </motion.div>

      {/* --- TIMELINE STRIP --- */}
      <div className="px-6 mb-2 mt-[-8px]">
        <CalendarStrip
          selectedDate={new Date()}
          onSelectDate={() => {}}
          meetingDates={meetings.map(m => new Date(m.start_time * 1000))}
        />
      </div>

      <div
        className="ui-view-meeting-list-sections"
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          position: 'relative',
        }}
      >
        {meetings.length === 0 ? (
          <div className="mt-8 animate-fade-in mx-6">
            <EmptyState
              icon={MicOff}
              title="No Meetings Recorded Yet"
              description="Start your first Sovereign recording session to begin populating your cosmic local memory."
              action={
                <Button variant="primary" onClick={() => setDialogOpen(true)}>
                  Start First Session
                </Button>
              }
            />
          </div>
        ) : filteredMeetings.length === 0 ? (
          <div className="mt-8 animate-fade-in mx-6">
            <EmptyState
              icon={Search}
              title="No search results"
              description={`We couldn't find any meetings matching "${searchQuery}".`}
            />
          </div>
        ) : (
          rowVirtualizer.getVirtualItems().map(virtualItem => {
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
                    transition={{
                      delay: 0.1,
                      type: 'spring',
                      stiffness: 350,
                      damping: 28,
                      mass: 0.8,
                    }}
                  >
                    {row.label}
                  </motion.h2>
                ) : (
                  <motion.div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                      gap: '20px',
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
          })
        )}
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
