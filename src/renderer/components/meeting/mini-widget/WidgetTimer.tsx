import React, { useState } from 'react'

export const WidgetTimer = React.memo(
  ({
    recordingStartTime,
    recordingTotalPausedMs,
  }: {
    recordingStartTime?: number | null
    recordingTotalPausedMs?: number
  }) => {
    const [elapsedTime, setElapsedTime] = useState('00:00:00')

    React.useEffect(() => {
      if (!recordingStartTime) return

      const updateTimer = () => {
        const ms = Date.now() - recordingStartTime - (recordingTotalPausedMs || 0)
        const totalSec = Math.max(0, Math.floor(ms / 1000))
        const h = Math.floor(totalSec / 3600)
        const m = Math.floor((totalSec % 3600) / 60)
        const s = totalSec % 60
        const currentElapsedStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`

        setElapsedTime(currentElapsedStr)
      }

      updateTimer()
      const interval = setInterval(updateTimer, 1000)
      return () => clearInterval(interval)
    }, [recordingStartTime, recordingTotalPausedMs])

    return <>{elapsedTime}</>
  }
)
