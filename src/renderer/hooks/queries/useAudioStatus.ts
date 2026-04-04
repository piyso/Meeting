import { useState, useEffect, useRef, useMemo } from 'react'
import type { AudioEvent } from '../../../types/ipc'

/**
 * OPT-20: Volume level is stored in a ref and synced to React state
 * at a throttled rate (5 FPS) instead of triggering 30 renders/second.
 * Only recording state changes and errors trigger immediate re-renders.
 */
export function useAudioStatus(meetingId: string | null) {
  const [isRecording, setIsRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const volumeRef = useRef(0)
  const [volumeTick, setVolumeTick] = useState(0)

  // Throttled volume reporting — update React state at 5 FPS max, not 30 FPS
  useEffect(() => {
    if (!isRecording) return
    const interval = setInterval(() => setVolumeTick(t => t + 1), 500) // OPT: was 200ms — 2 FPS is enough for volume bars
    return () => clearInterval(interval)
  }, [isRecording])

  useEffect(() => {
    if (!meetingId) {
      setIsRecording(false)
      volumeRef.current = 0
      return
    }

    const unsubscribe = window.electronAPI?.on?.audioEvent((event: AudioEvent) => {
      if (event.meetingId !== meetingId) return

      switch (event.type) {
        case 'started':
          setIsRecording(true)
          setError(null)
          break
        case 'stopped':
          setIsRecording(false)
          volumeRef.current = 0
          break
        case 'level':
          // Store in ref — no React render per level event
          if (event.level) {
            const level = event.level as { rms?: number; max?: number }
            const levelVal = level?.rms || level?.max || 0
            volumeRef.current = levelVal > 0 ? levelVal : 0
          }
          break
        case 'error':
          setIsRecording(false)
          setError(event.error?.message || 'Audio error occurred')
          break
      }
    })

    return () => unsubscribe?.()
  }, [meetingId])

  // Read volume from ref on throttled tick — only recomputes when tick changes
  const currentVolume = useMemo(() => volumeRef.current, [volumeTick]) // eslint-disable-line react-hooks/exhaustive-deps

  return { isRecording, currentVolume, error }
}
