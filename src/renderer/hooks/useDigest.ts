import { useState, useEffect, useCallback } from 'react'

/**
 * Hook that drives PostMeetingDigest by calling the digest:generate IPC handler.
 * Auto-generates summary, action items, and decisions when meeting stops.
 */

/** Normalizes a timestamp value (string or number) into an ISO string. */
function extractTimestamp(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return new Date(value).toISOString()
  return undefined
}

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
          generatedAt: extractTimestamp(raw.generatedAt) ?? extractTimestamp(raw.generated_at),
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

  // H-10 AUDIT: Track mounted state to prevent setState on unmounted component.
  // If the user navigates away during digest generation, the async IPC call
  // completes and tries to call setDigest/setError on an unmounted component.
  useEffect(() => {
    let isMounted = true
    if (meetingId && !skip) {
      ;(async () => {
        setIsGenerating(true)
        setError(null)
        try {
          const result = await window.electronAPI?.digest?.generate?.({
            meetingId,
          })
          if (!isMounted) return
          if (result?.success && result.data) {
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
              generatedAt: extractTimestamp(raw.generatedAt) ?? extractTimestamp(raw.generated_at),
            })
          } else {
            setError(result?.error?.message || 'Failed to generate digest')
          }
        } catch (err) {
          if (isMounted) setError((err as Error).message)
        } finally {
          if (isMounted) setIsGenerating(false)
        }
      })()
    }
    return () => {
      isMounted = false
    }
  }, [meetingId, skip])

  return { digest, isGenerating, error, regenerate: generate }
}
