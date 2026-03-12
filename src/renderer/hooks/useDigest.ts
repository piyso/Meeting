import { useState, useEffect, useCallback } from 'react'

/**
 * Hook that drives PostMeetingDigest by calling the digest:generate IPC handler.
 * Auto-generates summary, action items, and decisions when meeting stops.
 */
export function useDigest(meetingId: string | null, skip = false) {
  interface DigestData {
    summary?: string
    actionItems?: string
    decisions?: string
    generatedAt?: string
  }

  const [digest, setDigest] = useState<DigestData | null>(null)
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
        // Extract fields explicitly instead of unsafe `as unknown as` cast
        const raw = result.data as unknown as Record<string, unknown>
        setDigest({
          summary: typeof raw.summary === 'string' ? raw.summary : undefined,
          actionItems:
            typeof raw.actionItems === 'string'
              ? raw.actionItems
              : typeof raw.action_items === 'string'
                ? raw.action_items
                : undefined,
          decisions: typeof raw.decisions === 'string' ? raw.decisions : undefined,
          generatedAt:
            typeof raw.generatedAt === 'string'
              ? raw.generatedAt
              : typeof raw.generatedAt === 'number'
                ? new Date(raw.generatedAt).toISOString()
                : typeof raw.generated_at === 'string'
                  ? raw.generated_at
                  : typeof raw.generated_at === 'number'
                    ? new Date(raw.generated_at as number).toISOString()
                    : undefined,
        })
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
    if (meetingId && !skip) {
      generate()
    }
  }, [meetingId, generate, skip])

  return { digest, isGenerating, error, regenerate: generate }
}
