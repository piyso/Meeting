import React, { useState, useEffect } from 'react'

interface RecordingTimerProps {
  startTime: number | null
  isRecording: boolean
}

export const RecordingTimer: React.FC<RecordingTimerProps> = ({ startTime, isRecording }) => {
  const [elapsed, setElapsed] = useState('00:00:00')

  useEffect(() => {
    if (!isRecording || !startTime) return

    // OPT: Use setInterval at 1Hz instead of rAF@60FPS.
    // The timer only changes once per second — 60 FPS was causing
    // 59 unnecessary React re-renders per second.
    const update = () => {
      const ms = Date.now() - startTime
      const totalSeconds = Math.floor(ms / 1000)
      const hours = Math.floor(totalSeconds / 3600)
      const minutes = Math.floor((totalSeconds % 3600) / 60)
      const seconds = totalSeconds % 60

      setElapsed(
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      )
    }

    update() // Immediate first tick
    const intervalId = setInterval(update, 1000)
    return () => clearInterval(intervalId)
  }, [startTime, isRecording])

  return (
    <span
      className={`font-mono text-[var(--text-sm)] tracking-widest ${isRecording ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-tertiary)]'}`}
    >
      {elapsed}
    </span>
  )
}
