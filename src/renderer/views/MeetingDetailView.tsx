
import { SplitPane } from '../components/ui/SplitPane'
import { TranscriptPanel } from '../components/meeting/TranscriptPanel'
import { NoteEditor } from '../components/meeting/NoteEditor'
import { PostMeetingDigest } from '../components/meeting/PostMeetingDigest'
import { useAppStore } from '../store/appStore'
import { useTranscriptStream } from '../hooks/queries/useTranscriptStream'

export default function MeetingDetailView() {
  const { recordingState, selectedMeetingId } = useAppStore()
  const isRecording = recordingState === 'recording'
  const isPostMeeting = recordingState === 'processing' || recordingState === 'idle'

  // Real transcript data from hooks (replaces MOCK_SEGMENTS)
  const { transcripts, isLoading } = useTranscriptStream(selectedMeetingId)

  // Transform transcript data into segment format for TranscriptPanel
  const segments = transcripts.map((t: any, i: number) => ({
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
    return <div className="p-8 text-[var(--color-text-tertiary)]">No Meeting ID selected</div>
  }

  if (isLoading) {
    return <div className="p-8 text-[var(--color-text-tertiary)]">Loading meeting data...</div>
  }

  return (
    <div className="w-full h-full flex gap-[var(--space-16)] animate-fade-in">
      {/* Left Column (Transcript + Notes split) */}
      <div className={`h-full transition-all duration-500 ease-[var(--ease-spring)] ${isPostMeeting ? 'w-[60%]' : 'w-full'}`}>
        <div className="w-full h-full surface-glass-premium rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] overflow-hidden shadow-2xl">
          <SplitPane
            defaultRatio={0.55}
            minTopHeight={200}
            top={
              <TranscriptPanel
                segments={segments}
                isRecording={isRecording}
              />
            }
            bottom={
              <NoteEditor meetingId={selectedMeetingId} />
            }
          />
        </div>
      </div>

      {/* Right Column (Digest - slide in on complete) */}
      {isPostMeeting && (
        <div className="w-[40%] h-full">
          <div className="w-full h-full surface-glass-premium rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] overflow-hidden shadow-2xl">
            <PostMeetingDigest
              meetingId={selectedMeetingId}
              duration={0}
              participantCount={0}
            />
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
