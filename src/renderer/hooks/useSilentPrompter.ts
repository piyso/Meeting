import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * Hook that generates AI suggestions every 2 minutes during recording.
 * Drives the SilentPrompter component.
 *
 * Every 2 minutes, sends last 5 minutes of transcript context to the local AI engine
 * and gets a suggested question for the user.
 */
export function useSilentPrompter(
  meetingId: string | null,
  isRecording: boolean,
  transcripts: Array<{ text: string; startTime: number }>
) {
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

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

    try {
      // Call local AI engine via intelligence IPC
      const result = await window.electronAPI?.intelligence?.meetingSuggestion?.({
        meetingId,
        recentContext: recentText.slice(0, 1000), // pass context cleanly
      })

      if (result?.success && result.data?.suggestion) {
        const text = result.data.suggestion
        // Don't show error messages as suggestions
        if (!text.startsWith('⚠️') && !text.toLowerCase().includes('error')) {
          setSuggestion(text)
        }
      }
    } catch {
      // Silently fail — suggestions are non-critical
    }
  }, [meetingId, transcripts])

  useEffect(() => {
    if (isRecording && meetingId) {
      // Generate first suggestion after 2 minutes
      intervalRef.current = setInterval(generateSuggestion, 2 * 60 * 1000)

      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current)
      }
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
      setSuggestion(null)
      return undefined
    }
  }, [isRecording, meetingId, generateSuggestion])

  const dismiss = useCallback(() => {
    setSuggestion(null)
  }, [])

  return { suggestion, dismiss }
}
