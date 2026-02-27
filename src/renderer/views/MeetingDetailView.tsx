import { SplitPane } from '../components/ui/SplitPane'
import { TranscriptPanel } from '../components/meeting/TranscriptPanel'
import { NoteEditor } from '../components/meeting/NoteEditor'
import { PostMeetingDigest } from '../components/meeting/PostMeetingDigest'
import { useAppStore } from '../store/appStore'
import { useTranscriptStream } from '../hooks/queries/useTranscriptStream'
import { useDigest } from '../hooks/useDigest'
import { useQuery } from '@tanstack/react-query'

export default function MeetingDetailView() {
  const { recordingState, selectedMeetingId } = useAppStore()
  const isRecording = recordingState === 'recording'
  const isPostMeeting = recordingState === 'processing' || recordingState === 'idle'
  const { digest, isGenerating, error: digestError } = useDigest(selectedMeetingId)

  // Real transcript data from hooks (replaces MOCK_SEGMENTS)
  const { transcripts, isLoading } = useTranscriptStream(selectedMeetingId)

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

  interface TranscriptItem {
    transcriptId?: string
    id?: string
    speaker?: string
    startTime?: number
    start_time?: number
    text?: string
  }

  // Transform transcript data into segment format for TranscriptPanel
  const segments = transcripts.map((t: TranscriptItem, i: number) => ({
    id: t.transcriptId || t.id || `s-${i}`,
    speakerName: t.speaker || 'Unknown Speaker',
    speakerColor: (['violet', 'teal', 'amber', 'rose'] as const)[i % 4] || 'violet',
    timestamp: formatTimestamp(t.startTime || t.start_time || 0),
    text: t.text || '',
    isPinned: false,
    isEdited: false,
    isLive: isRecording && i === transcripts.length - 1,
  }))

  if (!selectedMeetingId) {
    return <div className="ui-view-meeting-detail-empty">No Meeting ID selected</div>
  }

  if (isLoading) {
    return <div className="ui-view-meeting-detail-loading">Loading meeting data...</div>
  }

  return (
    <div className="ui-view-meeting-detail animate-fade-in">
      {/* Left Column (Transcript + Notes split) */}
      <div className={`ui-view-meeting-detail-main ${isPostMeeting ? 'split' : 'full'}`}>
        <div className="ui-view-meeting-detail-panel surface-glass-premium">
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
          <div className="ui-view-meeting-detail-panel surface-glass-premium">
            {isGenerating ? (
              <div className="flex flex-col h-full items-center justify-center p-8 gap-4">
                <div className="w-8 h-8 rounded-full border-t-2 border-l-2 border-[var(--color-violet)] animate-spin" />
                <span className="text-[var(--color-violet)] text-sm font-medium animate-pulse">
                  ✨ Generating AI Digest...
                </span>
              </div>
            ) : digestError ? (
              <div className="flex flex-col h-full items-center justify-center p-8 gap-4 text-center">
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
                // Pinned moments logic to be connected from useNotes hook
                pinnedMoments={[]}
              />
            )}
          </div>
        </div>
      )}
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
