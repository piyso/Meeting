import React, { useState, useEffect } from 'react'
import { Plus, FileText } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { MeetingCard } from '../components/meeting/MeetingCard'
import { NewMeetingDialog } from '../components/meeting/NewMeetingDialog'
import { EmptyState } from '../components/ui/EmptyState'
import { MeetingCardSkeleton } from '../components/ui/Skeletons'
import { Button } from '../components/ui/Button'
import { ContextMenu, MenuItem } from '../components/ui/ContextMenu'
import { Badge } from '../components/ui/Badge'
import { rendererLog } from '../utils/logger'

const log = rendererLog.create('MeetingList')

import { useMeetings } from '../hooks/queries/useMeetings'
import { useMutation, useQueryClient } from '@tanstack/react-query'

export default function MeetingListView() {
  const { navigate, setRecordingState } = useAppStore()
  const queryClient = useQueryClient()
  const { data: response, isLoading } = useMeetings()
  const meetings = response?.items || []

  const [dialogOpen, setDialogOpen] = useState(false)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; id: string } | null>(null)

  const deleteMeeting = useMutation({
    mutationFn: async (id: string) => {
      const res = await window.electronAPI.meeting.delete({ meetingId: id })
      if (!res.success) throw new Error(res.error?.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] })
    },
  })

  useEffect(() => {
    const handleCmdN = () => setDialogOpen(true)
    window.addEventListener('open-new-meeting', handleCmdN)
    return () => window.removeEventListener('open-new-meeting', handleCmdN)
  }, [])

  const handleStartMeeting = async (config: string | { title?: string }) => {
    setDialogOpen(false)
    setRecordingState('starting')
    const title = typeof config === 'string' ? config : config?.title
    const res = await window.electronAPI.meeting.start({
      title: typeof title === 'string' ? title : undefined,
    })
    if (res.success && res.data) {
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

  const getCtxItems = (id: string): MenuItem[] => [
    { label: 'Open', onClick: () => navigate('meeting-detail', id) },
    {
      label: 'Rename',
      onClick: () => {
        log.info('Rename not yet implemented for meeting', id)
      },
      divider: true,
    },
    {
      label: 'Duplicate',
      onClick: () => {
        log.info('Duplicate not yet implemented for meeting', id)
      },
      divider: true,
    },
    {
      label: 'Delete',
      onClick: () => {
        deleteMeeting.mutate(id)
        setCtxMenu(null)
      },
      danger: true,
    },
  ]

  if (isLoading) {
    return (
      <div className="ui-view-meeting-list loading hidden-scrollbar">
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
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setDialogOpen(true)}>
            Start New Meeting
          </Button>
        }
      />
    )
  }

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

  const dateGroups = groupMeetingsByDate(meetings)

  return (
    <div className="ui-view-meeting-list scrollbar-webkit">
      <div className="ui-view-meeting-list-header">
        <button
          onClick={() => setDialogOpen(true)}
          className="ui-view-meeting-list-start-btn surface-glass-premium gpu-promoted premium-hover"
        >
          <div className="ui-view-meeting-list-start-icon">
            <Plus size={14} strokeWidth={3} />
          </div>
          <span className="ui-view-meeting-list-start-text">Start New Meeting</span>
          <Badge variant="outline" className="ml-2 font-mono tracking-tighter opacity-70">
            ⌘N
          </Badge>
        </button>
      </div>

      <div className="ui-view-meeting-list-sections">
        {Object.entries(dateGroups).map(([label, groupMeetings]) => (
          <section key={label}>
            <h2 className="ui-view-meeting-list-section-title">{label}</h2>
            <div className="ui-meeting-grid">
              {groupMeetings.map((m: MeetingItem, i: number) => (
                <MeetingCard
                  key={m.id}
                  id={m.id}
                  title={m.title ?? 'Untitled Meeting'}
                  date={new Date(m.start_time * 1000)}
                  duration={m.duration || 0}
                  hasTranscript={m.has_transcript || false}
                  hasNotes={m.has_notes || false}
                  participantCount={m.participant_count || 1}
                  index={i}
                  onClick={(id: string) => navigate('meeting-detail', id)}
                  onContextMenu={handleContextMenu}
                />
              ))}
            </div>
          </section>
        ))}
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
