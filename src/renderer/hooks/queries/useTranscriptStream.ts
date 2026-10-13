import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import type { TranscriptChunk } from '../../../types/ipc'

/**
 * OPT-19: Uses a single Unified Map stored in a ref for O(1) chunk lookups.
 * React state is only updated at a throttled rate (every 300ms) for rendering.
 * JS Map iteration order guarantees chronological sorting natively.
 */
export function useTranscriptStream(meetingId: string | null) {
  const [renderTick, setRenderTick] = useState(0)

  const {
    data: historicalTranscripts = [],
    isLoading,
    error: queryError,
  } = useQuery({
    queryKey: ['transcripts', meetingId],
    queryFn: async () => {
      if (!meetingId) return []
      const response = await window.electronAPI?.transcript?.get({ meetingId })
      if (!response?.success) {
        throw new Error(response?.error?.message || 'Failed to fetch transcripts')
      }
      return response.data ?? []
    },
    enabled: !!meetingId,
    // Segments are written by the main process while recording, so a cached
    // (pre-recording, usually empty) result must never be served as fresh —
    // re-opening a meeting right after stopping would show no transcript.
    staleTime: 0,
    refetchOnMount: 'always',
  })

  // Track latest meetingId to prevent stale closures in the IPC listener
  const latestMeetingIdRef = useRef(meetingId)
  useEffect(() => {
    latestMeetingIdRef.current = meetingId
  }, [meetingId])

  // Removed throttled 1000ms interval — renderTick is now only incremented when new chunks actually arrive

  const transcriptsMapRef = useRef(new Map<string, TranscriptChunk>())
  const lastTickRef = useRef(0)
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset + subscribe. Declared BEFORE the seeding effect on purpose: effects
  // run in declaration order, and when the query is served from cache the
  // historical rows are already present on the first render — clearing after
  // seeding wiped the transcript every time a meeting was re-opened.
  useEffect(() => {
    transcriptsMapRef.current.clear()
    setRenderTick(t => t + 1)
    if (!meetingId) return

    const unsubscribe = window.electronAPI?.on?.transcriptChunk((chunk: TranscriptChunk) => {
      if (chunk.meetingId !== latestMeetingIdRef.current) return

      // Map preserves insertion order when keys are updated.
      // Since chunks arrive chronologically, they are naturally sorted.
      transcriptsMapRef.current.set(chunk.transcriptId, chunk)

      if (chunk.isFinal) {
        if (throttleTimerRef.current) clearTimeout(throttleTimerRef.current)
        setRenderTick(t => t + 1)
        lastTickRef.current = Date.now()
      } else {
        const now = Date.now()
        if (now - lastTickRef.current > 300) {
          setRenderTick(t => t + 1)
          lastTickRef.current = now
        } else {
          // Trailing edge to ensure the last phantom word isn't permanently dropped
          if (throttleTimerRef.current) clearTimeout(throttleTimerRef.current)
          throttleTimerRef.current = setTimeout(() => {
            setRenderTick(t => t + 1)
            lastTickRef.current = Date.now()
          }, 300)
        }
      }
    })

    return () => {
      unsubscribe?.()
      if (throttleTimerRef.current) clearTimeout(throttleTimerRef.current)
    }
  }, [meetingId])

  // Seed the map with historical transcripts when they load (or when the
  // meeting changes and they are already cached).
  useEffect(() => {
    if (!meetingId || !historicalTranscripts?.length) return

    let added = false
    for (const t of historicalTranscripts) {
      if (t.meeting_id !== meetingId) continue
      // Don't overwrite live chunks that arrived before the DB load
      if (!transcriptsMapRef.current.has(t.id)) {
        transcriptsMapRef.current.set(t.id, {
          ...t,
          transcriptId: t.id,
          meetingId: t.meeting_id,
          speakerId: t.speaker_id ?? undefined,
          startTime: t.start_time,
          endTime: t.end_time,
          isFinal: true,
        } as TranscriptChunk)
        added = true
      }
    }
    if (added) setRenderTick(t => t + 1)
  }, [historicalTranscripts, meetingId])

  // Chronological order. Live chunks and DB rows can interleave (a refetch
  // during recording inserts rows after newer live chunks), so insertion
  // order alone is not reliable.
  const allTranscripts = useMemo(() => {
    const list = Array.from(transcriptsMapRef.current.values())
    let sorted = true
    for (let i = 1; i < list.length; i++) {
      if ((list[i]?.startTime ?? 0) < (list[i - 1]?.startTime ?? 0)) {
        sorted = false
        break
      }
    }
    return sorted ? list : list.sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderTick])

  return { transcripts: allTranscripts, isLoading, error: queryError }
}
