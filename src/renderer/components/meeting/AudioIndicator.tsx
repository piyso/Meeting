import React, { useEffect, useRef } from 'react'

interface AudioIndicatorProps {
  audioLevel: number // 0-1
  isRecording: boolean
}

export const AudioIndicator: React.FC<AudioIndicatorProps> = ({ audioLevel, isRecording }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const workerRef = useRef<Worker | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Instantiate worker
    const worker = new Worker(new URL('../../workers/audio-indicator.worker.ts', import.meta.url), {
      type: 'module',
    })
    const offscreen = canvas.transferControlToOffscreen()

    worker.postMessage({ type: 'init', canvas: offscreen }, [offscreen])
    workerRef.current = worker

    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({
        type: 'update',
        isRecording,
        audioLevel,
      })
    }
  }, [audioLevel, isRecording])

  return (
    <canvas
      ref={canvasRef}
      width={60}
      height={32}
      className="shrink-0"
      style={{ width: '60px', height: '32px' }}
    />
  )
}
