import { useState, useEffect } from 'react'
import type { AudioEvent } from '../../../types/ipc'

export function useAudioStatus(meetingId: string | null) {
  const [isRecording, setIsRecording] = useState(false)
  const [currentVolume, setCurrentVolume] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!meetingId) {
      setIsRecording(false)
      setCurrentVolume(0)
      return
    }

    const unsubscribe = window.electronAPI.on.audioEvent((event: AudioEvent) => {
      if (event.meetingId !== meetingId) return

      switch (event.type) {
        case 'started':
          setIsRecording(true)
          setError(null)
          break
        case 'stopped':
          setIsRecording(false)
          setCurrentVolume(0)
          break
        case 'level':
          // We assume level has some properties like rms or max depending on AudioLevelUpdate
          if (event.level) {
            const level = event.level as { rms?: number; max?: number }
            const levelVal = level?.rms || level?.max || 0
            setCurrentVolume(levelVal > 0 ? levelVal : 0)
          }
          break
        case 'error':
          setIsRecording(false)
          setError(event.error?.message || 'Audio error occurred')
          break
      }
    })

    return () => unsubscribe()
  }, [meetingId])

  return { isRecording, currentVolume, error }
}
