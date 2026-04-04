import { useState, useEffect } from 'react'
import { useAppStore } from '../store/appStore'

/**
 * Shared recording timer hook — eliminates duplicate timer logic
 * between DynamicIsland and RecordingToolbar.
 *
 * Returns:
 * - `elapsed`: raw elapsed milliseconds (excluding paused time)
 * - `elapsedStr`: formatted string like "00:05:32"
 */
export function useRecordingTimer() {
  const recordingState = useAppStore(s => s.recordingState)
  const recordingStartTime = useAppStore(s => s.recordingStartTime)
  const recordingPausedAt = useAppStore(s => s.recordingPausedAt)
  const recordingTotalPausedMs = useAppStore(s => s.recordingTotalPausedMs)

  const [elapsed, setElapsed] = useState(0)

  const isActive = recordingState === 'recording' || recordingState === 'paused'
  const isPaused = recordingState === 'paused'

  useEffect(() => {
    if (!isActive || !recordingStartTime) {
      setElapsed(0)
      return
    }

    if (isPaused && recordingPausedAt) {
      // Freeze timer at paused moment
      setElapsed(recordingPausedAt - recordingStartTime - recordingTotalPausedMs)
      return
    }

    const tick = () =>
      setElapsed(Math.max(0, Date.now() - recordingStartTime - recordingTotalPausedMs))
    tick() // immediate first tick
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [isActive, isPaused, recordingStartTime, recordingPausedAt, recordingTotalPausedMs])

  return {
    elapsed,
    elapsedStr: formatElapsed(elapsed),
  }
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}
