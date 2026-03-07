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
  transcripts: Array<{ text: string; startTime: number }>
) {
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [suggestionMode, setSuggestionMode] = useState<PromptMode | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const modeIndexRef = useRef(0)

  const generateSuggestion = useCallback(async () => {
    if (!meetingId || transcripts.length === 0) return

    // Get last 5 minutes of transcript
    const now = transcripts[transcripts.length - 1]?.startTime || 0
    const fiveMinAgo = now - 300
    const recentText = transcripts
      .filter(t => t.startTime >= fiveMinAgo)
      .map(t => t.text)
      .join(' ')

    if (recentText.length < 50) return // Not enough context

    // Rotate through prompt modes
    const currentMode = PROMPT_MODES[modeIndexRef.current % PROMPT_MODES.length]
    modeIndexRef.current++

    try {
      const result = await window.electronAPI?.intelligence?.meetingSuggestion?.({
        meetingId,
        recentContext: recentText.slice(0, 1000),
        promptMode: currentMode,
      })

      if (result?.success && result.data?.suggestion) {
        const text = result.data.suggestion
        if (!text.startsWith('⚠️') && !text.toLowerCase().includes('error')) {
          setSuggestion(text)
          setSuggestionMode(currentMode ?? null)
          useAppStore.getState().setLiveCoachTip(text)
        }
      }
    } catch {
      // Silently fail — suggestions are non-critical
    }
  }, [meetingId, transcripts])

  useEffect(() => {
    if (isRecording && meetingId) {
      // Reset mode rotation on new recording
      modeIndexRef.current = 0
      // Generate first suggestion after 2 minutes
      intervalRef.current = setInterval(generateSuggestion, 2 * 60 * 1000)

      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current)
      }
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
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
