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

import { useMeetings } from '../hooks/queries/useMeetings'
import { useMutation, useQueryClient } from '@tanstack/react-query'

export default function MeetingListView() {
  const { navigate, setRecordingState } = useAppStore()
  const queryClient = useQueryClient()
  const { data: response, isLoading } = useMeetings()
  const meetings = response?.items || []

  const [dialogOpen, setDialogOpen] = useState(false)
  const [ctxMenu, setCtxMenu] = useState<{ x: number, y: number, id: string } | null>(null)

  const deleteMeeting = useMutation({
    mutationFn: async (id: string) => {
      const res = await window.electronAPI.meeting.delete({ meetingId: id })
      if (!res.success) throw new Error(res.error?.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] })
    }
  })

  useEffect(() => {
    const handleCmdN = () => setDialogOpen(true)
    window.addEventListener('open-new-meeting', handleCmdN)
    return () => window.removeEventListener('open-new-meeting', handleCmdN)
  }, [])

  const handleStartMeeting = async (config: any) => {
    setDialogOpen(false)
    setRecordingState('starting')
    const title = typeof config === 'string' ? config : config?.title
    const res = await window.electronAPI.meeting.start({ title: typeof title === 'string' ? title : undefined })
    if (res.success && res.data) {
      navigate('meeting-detail', res.data.meeting.id)
    } else {
      console.error('Failed to start meeting:', res.error)
      setRecordingState('idle')
    }
  }

  const handleContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY, id })
  }

  const getCtxItems = (id: string): MenuItem[] => [
    { label: 'Open', onClick: () => navigate('meeting-detail', id) },
    { label: 'Rename', onClick: () => console.log('Rename', id), divider: true },
    { label: 'Duplicate', onClick: () => console.log('Duplicate', id), divider: true },
    { label: 'Delete', onClick: () => { deleteMeeting.mutate(id); setCtxMenu(null) }, danger: true }
  ]

  if (isLoading) {
    return (
      <div className="max-w-[960px] mx-auto pt-[var(--space-16)] space-y-[var(--space-32)] w-full h-full overflow-y-auto">
        <div>
          <h2 className="text-[var(--text-xs)] tracking-widest text-[var(--color-text-tertiary)] uppercase font-semibold mb-[var(--space-16)]">Today</h2>
          <div className="ui-meeting-grid">
            {Array.from({ length: 3 }).map((_, i) => <MeetingCardSkeleton key={`skeleton-1-${i}`} />)}
          </div>
        </div>
        <div>
          <h2 className="text-[var(--text-xs)] tracking-widest text-[var(--color-text-tertiary)] uppercase font-semibold mb-[var(--space-16)]">Yesterday</h2>
          <div className="ui-meeting-grid">
            {Array.from({ length: 3 }).map((_, i) => <MeetingCardSkeleton key={`skeleton-2-${i}`} />)}
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
        action={<Button variant="primary" icon={<Plus size={16}/>} onClick={() => setDialogOpen(true)}>Start New Meeting</Button>}
      />
    )
  }

  // Real date grouping using actual meeting timestamps
  const groupMeetingsByDate = (meetings: any[]) => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today.getTime() - 86400000)

    const groups: Record<string, any[]> = {}

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

      if (!groups[label]) groups[label] = []
      groups[label]!.push(m)
    }

    return groups
  }

  const dateGroups = groupMeetingsByDate(meetings)

  return (
    <div className="max-w-[960px] mx-auto pb-32 h-full overflow-y-auto pr-4 scrollbar-webkit">
      <div className="flex justify-center mb-[var(--space-32)] sticky top-0 z-10 pt-[var(--space-16)] bg-gradient-to-b from-[var(--color-bg-root)] to-transparent pb-4">
        <button 
          onClick={() => setDialogOpen(true)}
          className="surface-glass-premium gpu-promoted rounded-full flex items-center gap-[var(--space-8)] px-[var(--space-20)] h-[var(--h-xl)] border border-[var(--color-border-subtle)] premium-hover"
        >
          <div className="w-6 h-6 rounded-full bg-[var(--color-violet)] flex items-center justify-center text-white">
            <Plus size={14} strokeWidth={3} />
          </div>
          <span className="font-medium text-[var(--text-sm)]">Start New Meeting</span>
          <Badge variant="outline" className="ml-2 font-mono tracking-tighter opacity-70">⌘N</Badge>
        </button>
      </div>

      <div className="space-y-[var(--space-32)]">
        {Object.entries(dateGroups).map(([label, groupMeetings]) => (
          <section key={label}>
            <h2 className="text-[var(--text-xs)] tracking-widest text-[var(--color-text-tertiary)] uppercase font-semibold mb-[var(--space-16)]">{label}</h2>
            <div className="ui-meeting-grid">
              {groupMeetings.map((m: any, i: number) => (
                <MeetingCard 
                  key={m.id} 
                  {...m}
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
