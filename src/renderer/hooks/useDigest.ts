import { useState, useEffect, useCallback } from 'react'

/**
 * Hook that drives PostMeetingDigest by calling the digest:generate IPC handler.
 * Auto-generates summary, action items, and decisions when meeting stops.
 */
export function useDigest(meetingId: string | null) {
  const [digest, setDigest] = useState<{
    summary?: string
    actionItems?: string
    decisions?: string
    generatedAt?: string
  } | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generate = useCallback(async () => {
    if (!meetingId) return
    setIsGenerating(true)
    setError(null)

    try {
      const result = await window.electronAPI?.digest?.generate?.({
        meetingId,
      })
      if (result?.success && result.data) {
        setDigest(
          result.data as unknown as {
            summary?: string
            actionItems?: string
            decisions?: string
            generatedAt?: string
          }
        )
      } else {
        setError(result?.error?.message || 'Failed to generate digest')
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsGenerating(false)
    }
  }, [meetingId])

  // Auto-generate on mount (when meeting stops and this hook is used)
  useEffect(() => {
    if (meetingId) {
      generate()
    }
  }, [meetingId, generate])

  return { digest, isGenerating, error, regenerate: generate }
}
