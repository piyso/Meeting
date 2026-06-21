import { create } from 'zustand'

export interface RecordingState {
  recordingState: 'idle' | 'starting' | 'recording' | 'paused' | 'stopping' | 'processing'
  activeMeetingId: string | null
  audioMode: 'system' | 'microphone' | 'none'
  recordingStartTime: number | null
  recordingPausedAt: number | null
  recordingTotalPausedMs: number
  lastTranscriptLine: string | null
  liveCoachTip: string | null
  entityCount: number
  noteCount: number
  audioRms: number

  setRecordingState: (
    state: RecordingState['recordingState'],
    mode?: RecordingState['audioMode']
  ) => void
  setActiveMeetingId: (id: string | null) => void
  setRecordingStartTime: (time: number | null) => void
  setRecordingPausedAt: (time: number | null) => void
  setRecordingTotalPausedMs: (ms: number) => void
  setLastTranscriptLine: (line: string | null) => void
  setLiveCoachTip: (tip: string | null) => void
  setEntityCount: (count: number) => void
  setNoteCount: (count: number) => void
  setAudioRms: (rms: number) => void
}

export const useRecordingStore = create<RecordingState>()(set => ({
  recordingState: 'idle',
  activeMeetingId: null,
  audioMode: 'none',
  recordingStartTime: null,
  recordingPausedAt: null,
  recordingTotalPausedMs: 0,
  lastTranscriptLine: null,
  liveCoachTip: null,
  entityCount: 0,
  noteCount: 0,
  audioRms: 0,

  setRecordingState: (recordingState, audioMode) =>
    set(s => ({
      recordingState,
      activeMeetingId: recordingState === 'idle' ? null : s.activeMeetingId,
      audioMode: audioMode ?? s.audioMode,
      recordingStartTime: recordingState === 'idle' ? null : s.recordingStartTime,
      recordingPausedAt: recordingState === 'idle' ? null : s.recordingPausedAt,
      recordingTotalPausedMs: recordingState === 'idle' ? 0 : s.recordingTotalPausedMs,
      lastTranscriptLine: recordingState === 'idle' ? null : s.lastTranscriptLine,
      liveCoachTip: recordingState === 'idle' ? null : s.liveCoachTip,
      entityCount: recordingState === 'idle' ? 0 : s.entityCount,
      noteCount: recordingState === 'idle' ? 0 : s.noteCount,
    })),
  setActiveMeetingId: activeMeetingId => set({ activeMeetingId }),
  setRecordingStartTime: recordingStartTime => set({ recordingStartTime }),
  setRecordingPausedAt: recordingPausedAt => set({ recordingPausedAt }),
  setRecordingTotalPausedMs: recordingTotalPausedMs => set({ recordingTotalPausedMs }),
  setLastTranscriptLine: lastTranscriptLine => set({ lastTranscriptLine }),
  setLiveCoachTip: liveCoachTip => set({ liveCoachTip }),
  setEntityCount: entityCount => set({ entityCount }),
  setNoteCount: noteCount => set({ noteCount }),
  setAudioRms: audioRms => set({ audioRms }),
}))
