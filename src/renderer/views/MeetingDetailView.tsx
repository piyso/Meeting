import { useState, useEffect, useRef, useMemo } from 'react'
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
import { Tag, ChevronLeft } from 'lucide-react'
import { RecordingToolbar } from '../components/meeting/RecordingToolbar'
import { IconButton } from '../components/ui/IconButton'

export default function MeetingDetailView() {
  const recordingState = useAppStore(s => s.recordingState)
  const selectedMeetingId = useAppStore(s => s.selectedMeetingId)
  const isRecording = recordingState === 'recording' || recordingState === 'paused'
  const isPostMeeting =
    recordingState === 'processing' || (recordingState === 'idle' && !!selectedMeetingId)
  const currentTier = useAppStore(s => s.currentTier)
  const isAiLocked = currentTier === 'free' || currentTier === 'starter'
  const { digest, isGenerating, error: digestError } = useDigest(selectedMeetingId, isAiLocked)

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

  // I19 fix: Fetch actual bookmark highlights from DB instead of hardcoded []
  const { data: highlightsData } = useQuery({
    queryKey: ['highlights', selectedMeetingId],
    queryFn: async () => {
      if (!selectedMeetingId) return []
      const res = await window.electronAPI.highlight?.list?.(selectedMeetingId)
      if (res?.success && res.data) return res.data
      return []
    },
    enabled: !!selectedMeetingId && isPostMeeting,
  })

  const pinnedMoments = useMemo(() => {
    if (!highlightsData || !Array.isArray(highlightsData)) return []
    return highlightsData.map(h => {
      const sec = h.start_time || 0
      const mm = String(Math.floor(sec / 60)).padStart(2, '0')
      const ss = String(Math.floor(sec % 60)).padStart(2, '0')
      return { timestamp: `${mm}:${ss}`, text: h.label || 'Bookmark' }
    })
  }, [highlightsData])

  // Wire latest transcript line to global store for DynamicIsland / Widget
  const setLastTranscriptLine = useAppStore(s => s.setLastTranscriptLine)
  useEffect(() => {
    if ((recordingState === 'recording' || recordingState === 'paused') && transcripts.length > 0) {
      const last = transcripts[transcripts.length - 1] as { speaker_name?: string; text: string }
      const speaker = last.speaker_name || 'Speaker'
      setLastTranscriptLine(`${speaker}: ${last.text}`)
    }
  }, [recordingState, transcripts, setLastTranscriptLine])

  // Fetch meeting data for PostMeetingDigest
  const { data: meetingData } = useQuery({
    queryKey: ['meeting', selectedMeetingId],
    queryFn: async () => {
      if (!selectedMeetingId) return null
      const res = await window.electronAPI?.meeting?.get({ meetingId: selectedMeetingId })
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
  const segments = useMemo(() => {
    return transcripts.map((t, i) => {
      const rec = t as unknown as Record<string, unknown>
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
  }, [transcripts, isRecording])

  if (!selectedMeetingId) {
    return <div className="ui-view-meeting-detail-empty">No Meeting ID selected</div>
  }

  if (isLoading) {
    return <div className="ui-view-meeting-detail-loading">Loading meeting data...</div>
  }

  return (
    <div className="ui-view-meeting-detail animate-fade-in">
      {/* Header: Title */}
      <div className="flex items-center px-6 pt-3 pb-3 border-b border-white/[0.04]">
        <IconButton
          icon={<ChevronLeft size={18} />}
          onClick={() => useAppStore.getState().navigate('meeting-list')}
          tooltip="Back to Meetings"
          className="mr-2 flex-shrink-0"
        />
        <input
          className="bg-transparent border-none text-[18px] font-semibold text-[var(--color-text-primary)] outline-none w-full placeholder-[var(--color-text-tertiary)] tracking-tight focus-visible:ring-2 focus-visible:ring-[var(--color-violet)] focus-visible:ring-offset-4 focus-visible:ring-offset-black rounded-sm transition-shadow"
          value={editableTitle}
          placeholder="Untitled Meeting"
          onChange={e => {
            const newTitle = e.target.value
            setEditableTitle(newTitle)
            // Debounced save — writes to DB after 500ms of no typing
            if (titleSaveTimerRef.current) clearTimeout(titleSaveTimerRef.current)
            titleSaveTimerRef.current = setTimeout(() => {
              if (selectedMeetingId) {
                window.electronAPI?.meeting
                  ?.update({
                    meetingId: selectedMeetingId,
                    updates: { title: newTitle },
                  })
                  .catch(() => {
                    useAppStore.getState().addToast({
                      type: 'error',
                      title: 'Failed to save title',
                      duration: 3000,
                    })
                  })
              }
            }, 500)
          }}
          aria-label="Meeting title"
        />

        <button
          onClick={() => setShowEntities(!showEntities)}
          title="Toggle Entities"
          aria-label="Toggle Entities"
          aria-pressed={showEntities}
          className={`ml-auto flex-shrink-0 p-1.5 rounded-md transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet)] focus-visible:ring-offset-2 focus-visible:ring-offset-black ${
            showEntities
              ? 'bg-[var(--color-violet)] text-white hover:bg-[var(--color-violet)]'
              : 'bg-transparent text-[var(--color-text-tertiary)] hover:bg-white/5 hover:text-white'
          }`}
        >
          <Tag size={16} />
        </button>
      </div>

      <RecordingToolbar
        onStop={() => window.dispatchEvent(new CustomEvent('toggle-recording'))}
        onPause={() => window.dispatchEvent(new CustomEvent('toggle-pause'))}
        onResume={() => window.dispatchEvent(new CustomEvent('toggle-pause'))}
        onBookmark={() => window.dispatchEvent(new CustomEvent('quick-bookmark'))}
      />

      {/* Silent Prompter Absolute Positioned in this container */}
      <div className="relative z-50 inline-block mt-4 ml-4 sm:ml-[72px]">
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
              bottom={<NoteEditor key={selectedMeetingId} meetingId={selectedMeetingId} />}
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
                  decisions={(() => {
                    if (!digest?.decisions) return []
                    if (typeof digest.decisions !== 'string') return digest.decisions
                    try {
                      return JSON.parse(digest.decisions)
                    } catch {
                      return []
                    }
                  })()}
                  actionItems={(() => {
                    if (!digest?.actionItems) return []
                    if (typeof digest.actionItems !== 'string') return digest.actionItems
                    try {
                      return JSON.parse(digest.actionItems)
                    } catch {
                      return []
                    }
                  })()}
                  pinnedMoments={pinnedMoments}
                />
              )}
            </div>
          </div>
        )}

        {/* Far Right Column (Entity Sidebar - slide in) */}
        {showEntities && (
          <div className="ui-view-meeting-detail-side">
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
