import { useState, useEffect, useCallback, useRef } from 'react'
import { useAppStore } from '../store/appStore'

/** Prompt modes that rotate during a meeting */
const PROMPT_MODES = ['question', 'action', 'decision', 'title'] as const
type PromptMode = (typeof PROMPT_MODES)[number]

/**
 * Hook that generates AI suggestions every 2 minutes during recording.
 * Rotates through 4 modes: question → action → decision → title
 */
export function useSilentPrompter(
  meetingId: string | null,
  isRecording: boolean,
  transcripts: Array<{ text: string; startTime?: number; start_time?: number }>
) {
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [suggestionMode, setSuggestionMode] = useState<PromptMode | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const modeIndexRef = useRef(0)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Stable refs — avoids useCallback/useEffect dependency churn
  const transcriptsRef = useRef(transcripts)
  transcriptsRef.current = transcripts
  // P1-13 FIX: Track isRecording via ref so the interval callback can
  // check it without being in the useCallback dependency array.
  const isRecordingRef = useRef(isRecording)
  isRecordingRef.current = isRecording

  const generateSuggestion = useCallback(async () => {
    const currentTranscripts = transcriptsRef.current
    // P1-13 FIX: Guard against race where interval fires just as isRecording
    // transitions to false. Without this, a suggestion fires after recording stops.
    if (!meetingId || !isRecordingRef.current || currentTranscripts.length === 0) return

    // Get last 5 minutes of transcript
    const now =
      currentTranscripts[currentTranscripts.length - 1]?.startTime ??
      currentTranscripts[currentTranscripts.length - 1]?.start_time ??
      0
    const fiveMinAgo = now - 300
    const recentText = currentTranscripts
      .filter(t => (t.startTime ?? t.start_time ?? 0) >= fiveMinAgo)
      .map(t => t.text)
      .join(' ')

    if (recentText.trim().length < 50) return // Not enough context

    // Rotate through prompt modes
    const currentMode = PROMPT_MODES[modeIndexRef.current % PROMPT_MODES.length]
    modeIndexRef.current++

    try {
      const result = await window.electronAPI?.intelligence?.meetingSuggestion?.({
        meetingId,
        // P1-4 FIX: Slice from END to capture the most recent context.
        // Previously .slice(0, 1000) sent the oldest chars of the 5-min window,
        // causing the AI coach to generate suggestions based on stale discussion.
        recentContext: recentText.slice(-1000),
        promptMode: currentMode,
      })

      if (result?.success && result.data?.suggestion) {
        const text = result.data.suggestion
        if (!text.startsWith('⚠️') && !text.toLowerCase().includes('error')) {
          setSuggestion(text)
          setSuggestionMode(currentMode ?? null)
          useAppStore.getState().setLiveCoachTip(text)
          // Auto-dismiss stale tips after 30 seconds
          if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
          dismissTimerRef.current = setTimeout(() => {
            setSuggestion(null)
            setSuggestionMode(null)
            useAppStore.getState().setLiveCoachTip(null)
          }, 30_000)
        }
      }
    } catch {
      // Silently fail — suggestions are non-critical
    }
  }, [meetingId]) // Only depends on meetingId — transcripts read from ref

  useEffect(() => {
    if (isRecording && meetingId) {
      // Reset mode rotation on new recording
      modeIndexRef.current = 0
      // Generate first suggestion after 2 minutes
      intervalRef.current = setInterval(generateSuggestion, 2 * 60 * 1000)

      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current)
        if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
      }
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
      setSuggestion(null)
      setSuggestionMode(null)
      useAppStore.getState().setLiveCoachTip(null)
      return undefined
    }
  }, [isRecording, meetingId, generateSuggestion])

  const dismiss = useCallback(() => {
    setSuggestion(null)
    setSuggestionMode(null)
    useAppStore.getState().setLiveCoachTip(null)
  }, [])

  return { suggestion, suggestionMode, dismiss }
}
