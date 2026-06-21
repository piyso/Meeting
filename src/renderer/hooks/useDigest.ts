import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

/** Normalizes a timestamp value (string or number) into an ISO string. */
function extractTimestamp(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return new Date(value).toISOString()
  return undefined
}

interface DigestData {
  summary?: string
  actionItems?: string
  decisions?: string
  generatedAt?: string
}

export function useDigest(meetingId: string | null, isLocked = false) {
  const queryClient = useQueryClient()

  const {
    data: digest = null,
    isFetching: isGenerating,
    error: queryError,
  } = useQuery({
    queryKey: ['digest', meetingId],
    queryFn: async (): Promise<DigestData | null> => {
      if (!meetingId) return null
      const result = await window.electronAPI?.digest?.generate?.({ meetingId })
      if (result?.success && result.data) {
        const raw = result.data as unknown as Record<string, unknown>
        return {
          summary: typeof raw.summary === 'string' ? raw.summary : undefined,
          actionItems:
            typeof raw.actionItems === 'string'
              ? raw.actionItems
              : typeof raw.action_items === 'string'
                ? raw.action_items
                : undefined,
          decisions: typeof raw.decisions === 'string' ? raw.decisions : undefined,
          generatedAt: extractTimestamp(raw.generatedAt) ?? extractTimestamp(raw.generated_at),
        }
      }
      throw new Error(result?.error?.message || 'Failed to generate digest')
    },
    enabled: !!meetingId && !isLocked,
    staleTime: Infinity, // Keep cached for the session
  })

  const regenerate = useCallback(async () => {
    if (!meetingId) return
    await queryClient.invalidateQueries({ queryKey: ['digest', meetingId] })
  }, [meetingId, queryClient])

  return {
    digest,
    isGenerating,
    error: queryError ? (queryError as Error).message : null,
    regenerate,
  }
}
