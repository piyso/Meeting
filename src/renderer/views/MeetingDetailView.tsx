import { useAppStore } from '../store/appStore'
import { useRecordingStore } from '../store/recordingStore'
import { useNavigationStore } from '../store/navigationStore'
import { useState, useEffect, useRef, useMemo } from 'react'
import { SplitPane } from '../components/ui/SplitPane'
import '../views/views.css'
import { TranscriptPanel } from '../components/meeting/TranscriptPanel'
import { NoteEditor } from '../components/meeting/NoteEditor'
import { PostMeetingDigest } from '../components/meeting/PostMeetingDigest'
import type { TranscriptSegmentProps } from '../components/meeting/TranscriptSegment'

import { useTranscriptStream } from '../hooks/queries/useTranscriptStream'
import { useDigest } from '../hooks/useDigest'
import { isDigestSectionUnavailable, parseActionItems, parseDecisions } from '../utils/digestText'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { EntitySidebar } from '../components/meeting/EntitySidebar'
import { Tooltip } from '../components/ui/Tooltip'
import { SilentPrompter } from '../components/meeting/SilentPrompter'
import { useSilentPrompter } from '../hooks/useSilentPrompter'
import { Tag, ChevronLeft } from 'lucide-react'
import { RecordingToolbar } from '../components/meeting/RecordingToolbar'
import { IconButton } from '../components/ui/IconButton'
import { ErrorBoundary } from '../components/layout/ErrorBoundary'

// #17: Tier-based transcript size limits (chars) — matches TierMappingService
const TIER_TRANSCRIPT_LIMITS: Record<string, number> = {
  free: 5000,
  starter: 15000,
  pro: 50000,
  team: 100000,
  enterprise: Infinity,
}

export default function MeetingDetailView() {
  const recordingState = useRecordingStore().recordingState
  const selectedMeetingId = useNavigationStore().selectedMeetingId
  const isRecording = recordingState === 'recording' || recordingState === 'paused'
  // Fetch meeting data first so isPostMeeting can depend on it
  const { data: meetingData, refetch: refetchMeeting } = useQuery({
    queryKey: ['meeting', selectedMeetingId],
    queryFn: async () => {
      if (!selectedMeetingId) return null
      const res = await window.electronAPI?.meeting?.get({ meetingId: selectedMeetingId })
      return res?.success ? res.data : null
    },
    enabled: !!selectedMeetingId,
  })

  // Stopping a recording gives the meeting its end time and duration. Reload
  // the row then — with the cached (still "open") row the finished meeting kept
  // showing "Start recording to see live transcription" and no digest.
  const previousRecordingStateRef = useRef(recordingState)
  useEffect(() => {
    const previous = previousRecordingStateRef.current
    previousRecordingStateRef.current = recordingState
    const wasActive = previous === 'recording' || previous === 'paused' || previous === 'processing'
    if (wasActive && (recordingState === 'processing' || recordingState === 'idle')) {
      void refetchMeeting()
    }
  }, [recordingState, refetchMeeting])

  const isPostMeeting =
    recordingState === 'processing' ||
    (recordingState === 'idle' && !!selectedMeetingId && meetingData?.end_time != null)

  const currentTier = useAppStore(s => s.currentTier)
  // Only free tier is locked — Starter has cloudAI + weeklyDigest, digest uses local Qwen fallback
  const isAiLocked = currentTier === 'free'
  const {
    digest,
    isGenerating,
    error: digestError,
    regenerate: regenerateDigest,
  } = useDigest(selectedMeetingId, isAiLocked)

  const [showEntities, setShowEntities] = useState(false)

  // Editable title state with debounced save
  const [editableTitle, setEditableTitle] = useState('')
  const syncedTitleRef = useRef('')
  const titleSaveTimerRef = useRef<NodeJS.Timeout | null>(null)

  // A pending (debounced) title edit is flushed — not dropped — when the view
  // unmounts or switches to another meeting, so a rename followed by a quick
  // "Back" is still saved.
  const pendingTitleRef = useRef<{ meetingId: string; title: string } | null>(null)
  const flushTitleSave = useRef(() => {
    if (titleSaveTimerRef.current) {
      clearTimeout(titleSaveTimerRef.current)
      titleSaveTimerRef.current = null
    }
    const pending = pendingTitleRef.current
    pendingTitleRef.current = null
    if (!pending) return
    const revert = () => {
      // Only touch the input if the user is still on that meeting
      if (useNavigationStore.getState().selectedMeetingId === pending.meetingId) {
        setEditableTitle(syncedTitleRef.current)
      }
      useAppStore.getState().addToast({
        type: 'error',
        title: 'Failed to save title',
        duration: 3000,
      })
    }
    window.electronAPI?.meeting
      ?.update({ meetingId: pending.meetingId, updates: { title: pending.title } })
      .then(res => {
        if (res && !res.success) revert()
        else syncedTitleRef.current = pending.title
      })
      .catch(revert)
  }).current

  useEffect(() => {
    // Runs on unmount and whenever the selected meeting changes
    return () => flushTitleSave()
  }, [selectedMeetingId, flushTitleSave])

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
      const res = await window.electronAPI?.highlight?.list?.(selectedMeetingId)
      if (res?.success && res.data) return res.data
      return []
    },
    enabled: !!selectedMeetingId,
  })

  const pinnedMoments = useMemo(() => {
    if (!highlightsData || !Array.isArray(highlightsData)) return []
    return [...highlightsData]
      .sort((a, b) => (a.start_time ?? 0) - (b.start_time ?? 0))
      .map(h => ({
        timestamp: formatTimestamp(
          toMeetingOffsetSeconds(h.start_time ?? 0, meetingData?.start_time)
        ),
        text: h.label || 'Bookmark',
      }))
  }, [highlightsData, meetingData?.start_time])

  // The digest's decisions and action items arrive as lines of text written by
  // the model, not JSON: parsing them as JSON left both lists permanently empty.
  const parsedDecisions = useMemo(() => parseDecisions(digest?.decisions), [digest?.decisions])
  const parsedActionItems = useMemo(
    () => parseActionItems(digest?.actionItems),
    [digest?.actionItems]
  )
  const actionItemsUnavailable = isDigestSectionUnavailable(digest?.actionItems)

  // Wire latest transcript line to global store for DynamicIsland / Widget
  const setLastTranscriptLine = useRecordingStore().setLastTranscriptLine
  // P1-5 FIX: Throttle updates to prevent excessive Zustand re-renders.
  // During active recording, transcripts arrive at ~50-100/min. Without throttling,
  // every subscriber to lastTranscriptLine re-renders on each segment.
  const lastUpdateRef = useRef(0)
  useEffect(() => {
    if ((recordingState === 'recording' || recordingState === 'paused') && transcripts.length > 0) {
      const now = Date.now()
      if (now - lastUpdateRef.current < 500) return // Throttle: max 2 updates/sec
      lastUpdateRef.current = now
      const last = transcripts[transcripts.length - 1] as { speaker_name?: string; text: string }
      const speaker = last.speaker_name || 'Speaker'
      setLastTranscriptLine(`${speaker}: ${last.text}`)
    }
  }, [recordingState, transcripts, setLastTranscriptLine])

  // Sync editable title when meeting data loads. Keyed on the meeting id too,
  // so switching to an untitled meeting clears the previous meeting's title.
  useEffect(() => {
    const title = meetingData?.title ?? ''
    setEditableTitle(title)
    syncedTitleRef.current = title
  }, [meetingData?.id, meetingData?.title])

  interface BaseTranscript {
    id?: string
    transcriptId?: string
    text?: string
    speaker_name?: string | null
    speakerName?: string | null
    speaker_id?: string | null
    speakerId?: string | null
    startTime?: number
    start_time?: number
  }

  // One colour per speaker for the whole meeting (assigned in order of first
  // appearance), instead of cycling by row — the same person kept changing colour.
  const speakerColorsRef = useRef(new Map<string, TranscriptSegmentProps['speakerColor']>())
  useEffect(() => {
    speakerColorsRef.current = new Map()
  }, [selectedMeetingId])

  // Star button on a segment = a bookmark (highlight) on exactly that segment's
  // time range. Keyed by start time so it survives reloads.
  const pinnedByStart = useMemo(() => {
    const map = new Map<string, string>()
    if (Array.isArray(highlightsData)) {
      for (const h of highlightsData) map.set(pinKey(h.start_time ?? 0), h.id)
    }
    return map
  }, [highlightsData])

  const queryClient = useQueryClient()
  const pinStateRef = useRef({ transcripts, pinnedByStart, meetingId: selectedMeetingId })
  pinStateRef.current = { transcripts, pinnedByStart, meetingId: selectedMeetingId }
  const pinBusyRef = useRef(new Set<string>())

  // Stable identity — TranscriptSegment is memoised on its props
  const handleTogglePin = useRef(async (segmentId: string) => {
    const { transcripts: rows, pinnedByStart: pinned, meetingId } = pinStateRef.current
    if (!meetingId || pinBusyRef.current.has(segmentId)) return
    const row = rows.find((t, i) => {
      const rec = t as BaseTranscript
      return String(rec.transcriptId || rec.id || `s-${i}`) === segmentId
    }) as (BaseTranscript & { endTime?: number; end_time?: number }) | undefined
    if (!row) return
    const start = Number(row.startTime ?? row.start_time ?? 0)
    const rawEnd = Number(row.endTime ?? row.end_time ?? 0)
    const end = rawEnd > start ? rawEnd : start + 1
    const existingId = pinned.get(pinKey(start))

    pinBusyRef.current.add(segmentId)
    // Show the star immediately; the refetch below replaces this with the real row
    const queryKey = ['highlights', meetingId]
    type HighlightRow = NonNullable<typeof highlightsData>[number]
    const previous = queryClient.getQueryData<HighlightRow[]>(queryKey)
    queryClient.setQueryData<HighlightRow[]>(queryKey, (current = []) =>
      existingId
        ? current.filter(h => h.id !== existingId)
        : [
            ...current,
            {
              id: `pending-${segmentId}`,
              meeting_id: meetingId,
              start_time: start,
              end_time: end,
              label: String(row.text || '').slice(0, 160) || 'Bookmark',
              color: '#7c3aed',
              created_at: Math.floor(Date.now() / 1000),
            } as HighlightRow,
          ]
    )
    try {
      const res = existingId
        ? await window.electronAPI?.highlight?.delete(existingId)
        : await window.electronAPI?.highlight?.create({
            meetingId,
            startTime: start,
            endTime: end,
            label: String(row.text || '').slice(0, 160) || 'Bookmark',
          })
      if (res && !res.success) throw new Error(res.error?.message || 'Request failed')
      await queryClient.invalidateQueries({ queryKey })
    } catch (err) {
      queryClient.setQueryData(queryKey, previous)
      useAppStore.getState().addToast({
        type: 'error',
        title: existingId ? 'Could not remove bookmark' : 'Could not bookmark this moment',
        message: err instanceof Error ? err.message : undefined,
        duration: 3000,
      })
    } finally {
      pinBusyRef.current.delete(segmentId)
    }
  }).current

  // Map-based structural sharing to prevent excessive garbage collection and re-renders
  const segmentsMapRef = useRef(new Map<string, TranscriptSegmentProps>())
  const segments = useMemo(() => {
    const nextMap = new Map<string, TranscriptSegmentProps>()
    const oldMap = segmentsMapRef.current

    const speakerColors = speakerColorsRef.current
    const newSegments = transcripts.map((t, i) => {
      const rec = t as BaseTranscript
      const id = String(rec.transcriptId || rec.id || `s-${i}`)
      const isLive = isRecording && i === transcripts.length - 1
      const text = String(rec.text || '')
      const speakerName = String(rec.speaker_name || rec.speakerName || 'Speaker')
      const speakerKey = String(rec.speaker_id || rec.speakerId || speakerName)
      let speakerColor = speakerColors.get(speakerKey)
      if (!speakerColor) {
        speakerColor = SPEAKER_COLORS[speakerColors.size % SPEAKER_COLORS.length] ?? 'violet'
        speakerColors.set(speakerKey, speakerColor)
      }

      const rawStart = Number(rec.startTime ?? rec.start_time ?? 0)
      const isPinned = pinnedByStart.has(pinKey(rawStart))

      const old = oldMap.get(id)
      if (
        old &&
        old.text === text &&
        old.isLive === isLive &&
        old.isPinned === isPinned &&
        old.speakerName === speakerName &&
        old.speakerColor === speakerColor
      ) {
        nextMap.set(id, old)
        return old
      }

      const fresh = {
        id,
        speakerName,
        speakerColor,
        timestamp: formatTimestamp(toMeetingOffsetSeconds(rawStart, meetingData?.start_time)),
        text,
        isPinned,
        isEdited: false,
        isLive,
      }
      nextMap.set(id, fresh)
      return fresh
    })

    segmentsMapRef.current = nextMap
    return newSegments
  }, [transcripts, isRecording, meetingData?.start_time, pinnedByStart])

  // #17: Real-time transcript limit indicator
  const transcriptLimit = TIER_TRANSCRIPT_LIMITS[currentTier] ?? 5000
  // Replace O(n) reduce with running counter tracking across updates if we want,
  // but for simplicity and memory safety using a ref synced with array lengths
  const totalTranscriptChars = useMemo(() => {
    let sum = 0
    for (let i = 0; i < transcripts.length; i++) {
      sum += ((transcripts[i] as BaseTranscript).text || '').length
    }
    return sum
  }, [transcripts])
  const limitPercent = Math.min((totalTranscriptChars / transcriptLimit) * 100, 100)
  const limitColor =
    limitPercent >= 90
      ? 'var(--color-red, #ef4444)'
      : limitPercent >= 80
        ? 'var(--color-amber, #f59e0b)'
        : 'var(--color-violet, #8b5cf6)'

  if (!selectedMeetingId) {
    return (
      <ErrorBoundary viewName="MeetingDetailView">
        <div className="ui-view-meeting-detail-empty">No Meeting ID selected</div>
      </ErrorBoundary>
    )
  }

  if (isLoading) {
    return (
      <ErrorBoundary viewName="MeetingDetailView">
        <div className="ui-view-meeting-detail-loading">Loading meeting data...</div>
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary viewName="MeetingDetailView">
      <div className="ui-view-meeting-detail animate-fade-in">
        {/* Header: Title */}
        <div className="flex items-center px-6 pt-3 pb-3 border-b border-white/[0.04]">
          <IconButton
            icon={<ChevronLeft size={18} />}
            onClick={() => useNavigationStore.getState().navigate('meeting-list')}
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
              if (selectedMeetingId) {
                pendingTitleRef.current = { meetingId: selectedMeetingId, title: newTitle }
                titleSaveTimerRef.current = setTimeout(flushTitleSave, 500)
              }
            }}
            onBlur={flushTitleSave}
            onKeyDown={e => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
            maxLength={200}
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

        {/* #17: Transcript Limit Indicator — shows during recording (hidden for Infinity/Enterprise) */}
        {isRecording && transcriptLimit !== Infinity && (
          <div className="px-6 py-1.5 border-b border-white/[0.04] flex items-center gap-3">
            <div
              className="flex-1 h-1 rounded-full overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.06)' }}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${limitPercent}%`, background: limitColor }}
              />
            </div>
            <span className="text-[11px] font-medium tabular-nums" style={{ color: limitColor }}>
              {(totalTranscriptChars / 1000).toFixed(1)}k / {transcriptLimit / 1000}k chars
            </span>
          </div>
        )}

        <RecordingToolbar
          onStop={() => window.dispatchEvent(new CustomEvent('toggle-recording'))}
          onPause={() => window.dispatchEvent(new CustomEvent('toggle-pause'))}
          onResume={() => window.dispatchEvent(new CustomEvent('toggle-pause'))}
          onBookmark={() => window.dispatchEvent(new CustomEvent('quick-bookmark'))}
        />

        <div className="flex justify-center z-50 pointer-events-none mb-4 shrink-0">
          <Tooltip
            content="Live AI Coach: Automatically suggests questions and actions during your meeting"
            position="bottom"
            delay={300}
          >
            <div className="pointer-events-auto">
              <SilentPrompter suggestion={suggestion} onDismiss={dismissSuggestion} />
            </div>
          </Tooltip>
        </div>

        <div className="ui-view-meeting-detail-columns">
          {/* Left Column (Transcript + Notes split) */}
          <div className={`ui-view-meeting-detail-main ${isPostMeeting ? 'split' : 'full'}`}>
            <div className="ui-view-meeting-detail-panel sovereign-glass-panel">
              <ErrorBoundary viewName="TranscriptPanel">
                {isPostMeeting && transcripts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-tertiary)] gap-3">
                    <Tag size={32} className="opacity-20" />
                    <p>No transcript data recorded for this meeting.</p>
                  </div>
                ) : (
                  <SplitPane
                    defaultRatio={0.55}
                    minTopHeight={200}
                    top={
                      <TranscriptPanel
                        segments={segments}
                        isRecording={isRecording}
                        onPin={handleTogglePin}
                      />
                    }
                    bottom={
                      <ErrorBoundary viewName="NoteEditor">
                        <NoteEditor key={selectedMeetingId} meetingId={selectedMeetingId} />
                      </ErrorBoundary>
                    }
                  />
                )}
              </ErrorBoundary>
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
                    <button
                      type="button"
                      className="text-[var(--color-violet)] text-xs font-medium underline-offset-2 hover:underline"
                      onClick={() => void regenerateDigest()}
                    >
                      Try again
                    </button>
                  </div>
                ) : (
                  <PostMeetingDigest
                    meetingId={selectedMeetingId}
                    duration={meetingData?.duration || 0}
                    participantCount={meetingData?.participant_count || 1}
                    summary={digest?.summary}
                    decisions={parsedDecisions}
                    actionItems={parsedActionItems}
                    actionItemsUnavailable={actionItemsUnavailable}
                    onRegenerate={() => void regenerateDigest()}
                    aiLocked={isAiLocked}
                    onUpgrade={() => useNavigationStore.getState().navigate('pricing')}
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
    </ErrorBoundary>
  )
}

const SPEAKER_COLORS = ['violet', 'teal', 'amber', 'rose', 'sky', 'lime'] as const

/** Bookmarks are matched to segments by start time, to millisecond precision */
const pinKey = (startSeconds: number) => startSeconds.toFixed(3)

/**
 * Segment times are stored as seconds from the start of the recording. Rows
 * written by older builds / imports may carry absolute Unix seconds instead —
 * convert those to an offset so the UI never shows "29863171:38".
 */
function toMeetingOffsetSeconds(time: number, meetingStartSec?: number | null): number {
  if (!Number.isFinite(time) || time < 0) return 0
  const ABSOLUTE_THRESHOLD = 1_000_000_000 // ~2001 in Unix seconds; no meeting is 31 years long
  if (time < ABSOLUTE_THRESHOLD) return time
  if (meetingStartSec && time >= meetingStartSec) return time - meetingStartSec
  return 0
}

/**
 * Format seconds timestamp into MM:SS (or H:MM:SS past the hour) display string
 */
function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(total / 3600)
  const mins = Math.floor((total % 3600) / 60)
  const secs = total % 60
  const mm = mins.toString().padStart(2, '0')
  const ss = secs.toString().padStart(2, '0')
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`
}
