import React, { useState, useEffect, useRef } from 'react'
import { SplitPane } from '../components/ui/SplitPane'
import '../views/views.css'
import { TranscriptPanel } from '../components/meeting/TranscriptPanel'
import { NoteEditor } from '../components/meeting/NoteEditor'
import { PostMeetingDigest } from '../components/meeting/PostMeetingDigest'
import { useAppStore } from '../store/appStore'
import { useTranscriptStream } from '../hooks/queries/useTranscriptStream'
import { useDigest } from '../hooks/useDigest'
import { useQuery } from '@tanstack/react-query'

import { EntitySidebar } from '../components/meeting/EntitySidebar'
import { Tooltip } from '../components/ui/Tooltip'
import { SilentPrompter } from '../components/meeting/SilentPrompter'
import { useSilentPrompter } from '../hooks/useSilentPrompter'
import { Tag } from 'lucide-react'

export default function MeetingDetailView() {
  const recordingState = useAppStore(s => s.recordingState)
  const selectedMeetingId = useAppStore(s => s.selectedMeetingId)
  const isRecording = recordingState === 'recording'
  const isPostMeeting = recordingState === 'processing' || recordingState === 'idle'
  const { digest, isGenerating, error: digestError } = useDigest(selectedMeetingId)

  const [showEntities, setShowEntities] = useState(false)

  // Editable title state with debounced save
  const [editableTitle, setEditableTitle] = useState('')
  const titleSaveTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Cleanup title save timer on unmount
  useEffect(() => {
    return () => {
      if (titleSaveTimerRef.current) clearTimeout(titleSaveTimerRef.current)
    }
  }, [])

  // Real transcript data from hooks
  const { transcripts, isLoading } = useTranscriptStream(selectedMeetingId)

  // AI Coach: generates contextual suggestions every 2 min during recording
  // Rotates through: question → action → decision → title
  // Pushes tips to DynamicIsland ("🧠 Coach Active") + SilentPrompter overlay
  const { suggestion, dismiss: dismissSuggestion } = useSilentPrompter(
    selectedMeetingId,
    isRecording,
    transcripts
  )

  // Track latest transcripts in a ref for polling interval
  const transcriptsRef = React.useRef(transcripts)
  useEffect(() => {
    transcriptsRef.current = transcripts
  }, [transcripts])

  // Wire latest transcript line to global store for DynamicIsland / Widget
  const setLastTranscriptLine = useAppStore(s => s.setLastTranscriptLine)
  useEffect(() => {
    if (isRecording && transcripts.length > 0) {
      const last = transcripts[transcripts.length - 1] as { speaker_name?: string; text: string }
      const speaker = last.speaker_name || 'Speaker'
      setLastTranscriptLine(`${speaker}: ${last.text}`)
    }
  }, [isRecording, transcripts, setLastTranscriptLine])

  // Fetch meeting data for PostMeetingDigest
  const { data: meetingData } = useQuery({
    queryKey: ['meeting', selectedMeetingId],
    queryFn: async () => {
      if (!selectedMeetingId) return null
      const res = await window.electronAPI.meeting.get({ meetingId: selectedMeetingId })
      return res.success ? res.data : null
    },
    enabled: !!selectedMeetingId,
  })

  // Sync editable title when meeting data loads
  useEffect(() => {
    if (meetingData?.title) {
      setEditableTitle(meetingData.title)
    }
  }, [meetingData?.title])

  // Transform transcript data into segment format for TranscriptPanel
  // Transcripts are a union of (Transcript | TranscriptChunk) with overlapping fields
  const segments = transcripts.map((t, i) => {
    const rec = t as Record<string, unknown>
    return {
      id: String(rec.transcriptId || rec.id || `s-${i}`),
      speakerName: String(rec.speaker_name || 'Unknown Speaker'),
      speakerColor: (['violet', 'teal', 'amber', 'rose'] as const)[i % 4] || 'violet',
      timestamp: formatTimestamp(Number(rec.startTime || rec.start_time || 0)),
      text: String(rec.text || ''),
      isPinned: false,
      isEdited: false,
      isLive: isRecording && i === transcripts.length - 1,
    }
  })

  if (!selectedMeetingId) {
    return <div className="ui-view-meeting-detail-empty">No Meeting ID selected</div>
  }

  if (isLoading) {
    return <div className="ui-view-meeting-detail-loading">Loading meeting data...</div>
  }

  return (
    <div className="ui-view-meeting-detail animate-fade-in">
      {/* Header: Title */}
      <div className="flex items-center px-4 pt-2">
        <input
          className="bg-transparent border-none text-xl font-semibold text-[var(--color-text-primary)] outline-none w-full placeholder-[var(--color-text-tertiary)]"
          value={editableTitle}
          placeholder="Untitled Meeting"
          onChange={e => {
            const newTitle = e.target.value
            setEditableTitle(newTitle)
            // Debounced save — writes to DB after 500ms of no typing
            if (titleSaveTimerRef.current) clearTimeout(titleSaveTimerRef.current)
            titleSaveTimerRef.current = setTimeout(() => {
              if (selectedMeetingId) {
                window.electronAPI.meeting
                  .update({
                    meetingId: selectedMeetingId,
                    updates: { title: newTitle },
                  })
                  .catch(() => {}) // Silent — title save is non-critical
              }
            }, 500)
          }}
          aria-label="Meeting title"
        />

        <button
          onClick={() => setShowEntities(!showEntities)}
          title="Toggle Entities"
          style={{
            background: showEntities ? 'var(--color-violet)' : 'transparent',
            color: showEntities ? '#fff' : 'var(--color-text-tertiary)',
            border: 'none',
            padding: '6px',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s',
            marginLeft: 'auto',
          }}
        >
          <Tag size={18} />
        </button>
      </div>

      {/* Silent Prompter Absolute Positioned in this container */}
      <div className="relative z-50 inline-block mt-4 ml-[72px]">
        <Tooltip
          content="Live AI Coach: Automatically suggests questions and actions during your meeting"
          position="bottom"
          delay={300}
        >
          <div>
            <SilentPrompter suggestion={suggestion} onDismiss={dismissSuggestion} />
          </div>
        </Tooltip>
      </div>

      <div className="ui-view-meeting-detail-columns">
        {/* Left Column (Transcript + Notes split) */}
        <div className={`ui-view-meeting-detail-main ${isPostMeeting ? 'split' : 'full'}`}>
          <div className="ui-view-meeting-detail-panel sovereign-glass-panel">
            <SplitPane
              defaultRatio={0.55}
              minTopHeight={200}
              top={<TranscriptPanel segments={segments} isRecording={isRecording} />}
              bottom={<NoteEditor meetingId={selectedMeetingId} />}
            />
          </div>
        </div>

        {/* Right Column (Digest - slide in on complete) */}
        {isPostMeeting && (
          <div className="ui-view-meeting-detail-side">
            <div className="ui-view-meeting-detail-panel sovereign-glass-panel">
              {isGenerating ? (
                <div className="flex flex-col h-full items-center justify-center p-[var(--space-32)] gap-[var(--space-16)]">
                  <div className="w-8 h-8 rounded-full border-t-2 border-l-2 border-[var(--color-violet)] animate-spin" />
                  <span className="text-[var(--color-violet)] text-sm font-medium animate-pulse">
                    ✨ Generating AI Digest...
                  </span>
                </div>
              ) : digestError ? (
                <div className="flex flex-col h-full items-center justify-center p-[var(--space-32)] gap-[var(--space-16)] text-center">
                  <span className="text-[var(--color-rose)] text-sm font-medium">
                    Failed to generate digest
                  </span>
                  <span className="text-[var(--color-text-tertiary)] text-xs">{digestError}</span>
                </div>
              ) : (
                <PostMeetingDigest
                  meetingId={selectedMeetingId}
                  duration={meetingData?.duration || 0}
                  participantCount={meetingData?.participant_count || 1}
                  summary={digest?.summary}
                  decisions={
                    digest?.decisions
                      ? typeof digest.decisions === 'string'
                        ? JSON.parse(digest.decisions)
                        : digest.decisions
                      : []
                  }
                  actionItems={
                    digest?.actionItems
                      ? typeof digest.actionItems === 'string'
                        ? JSON.parse(digest.actionItems)
                        : digest.actionItems
                      : []
                  }
                  // TODO: Wire to future audio_highlights table for precise moment playback
                  pinnedMoments={[]}
                />
              )}
            </div>
          </div>
        )}

        {/* Far Right Column (Entity Sidebar - slide in) */}
        {showEntities && (
          <div className="ui-view-meeting-detail-side" style={{ minWidth: 280, paddingLeft: 0 }}>
            <EntitySidebar meetingId={selectedMeetingId} onClose={() => setShowEntities(false)} />
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Format seconds timestamp into MM:SS display string
 */
function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}
