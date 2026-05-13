import { useState, useEffect, useCallback, useRef } from 'react'

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

  // P3-9 FIX: Shared isMounted ref protects BOTH the useEffect auto-generate
  // AND the manual regenerate() callback from setState-on-unmounted.
  // Previously, only the useEffect had a mount guard; the generate callback
  // could still fire after unmount if called from a stale closure.
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  /** Shared digest generation logic */
  const generateDigest = useCallback(async () => {
    if (!meetingId) return
    if (!isMountedRef.current) return
    setIsGenerating(true)
    setError(null)

    try {
      const result = await window.electronAPI?.digest?.generate?.({
        meetingId,
      })
      if (!isMountedRef.current) return
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
      if (isMountedRef.current) setError((err as Error).message)
    } finally {
      if (isMountedRef.current) setIsGenerating(false)
    }
  }, [meetingId])

  // H-10 AUDIT: Auto-generate on mount/meeting change
  useEffect(() => {
    if (meetingId && !skip) {
      generateDigest()
    }
  }, [meetingId, skip, generateDigest])

  return { digest, isGenerating, error, regenerate: generateDigest }
}
