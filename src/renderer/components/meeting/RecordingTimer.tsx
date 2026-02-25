import React, { useState, useEffect } from 'react'

interface RecordingTimerProps {
  startTime: number | null
  isRecording: boolean
}

export const RecordingTimer: React.FC<RecordingTimerProps> = ({ startTime, isRecording }) => {
  const [elapsed, setElapsed] = useState('00:00:00')

  useEffect(() => {
    if (!isRecording || !startTime) return
    
    let animationId: number
    const update = () => {
      const ms = Date.now() - startTime
      const totalSeconds = Math.floor(ms / 1000)
      const hours = Math.floor(totalSeconds / 3600)
      const minutes = Math.floor((totalSeconds % 3600) / 60)
      const seconds = totalSeconds % 60
      
      setElapsed(
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      )
      animationId = requestAnimationFrame(update)
    }
    
    animationId = requestAnimationFrame(update)
    return () => cancelAnimationFrame(animationId)
  }, [startTime, isRecording])

  return (
    <span className={`font-mono text-[var(--text-sm)] tracking-widest ${isRecording ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-tertiary)]'}`}>
      {elapsed}
    </span>
  )
}
