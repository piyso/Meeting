import React, { useEffect, useRef } from 'react'

interface AudioIndicatorProps {
  audioLevel: number // 0-1
  isRecording: boolean
}

/**
 * Shared worker instance pool — prevents creating a new Worker on every mount.
 * Workers are expensive to instantiate. This cache ensures at most one
 * worker exists per AudioIndicator lifetime.
 */
const workerPool = {
  worker: null as Worker | null,
  refCount: 0,
  acquire(): Worker {
    if (!this.worker) {
      this.worker = new Worker(
        new URL('../../workers/audio-indicator.worker.ts', import.meta.url),
        { type: 'module' }
      )
    }
    this.refCount++
    return this.worker
  },
  release(): void {
    this.refCount--
    if (this.refCount <= 0 && this.worker) {
      this.worker.terminate()
      this.worker = null
      this.refCount = 0
    }
  },
}

export const AudioIndicator: React.FC<AudioIndicatorProps> = ({ audioLevel, isRecording }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hasTransferred = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || hasTransferred.current) return

    const worker = workerPool.acquire()

    try {
      const offscreen = canvas.transferControlToOffscreen()
      worker.postMessage({ type: 'init', canvas: offscreen }, [offscreen])
      hasTransferred.current = true
    } catch {
      // Canvas may already be transferred (React StrictMode double-mount)
    }

    return () => {
      workerPool.release()
      hasTransferred.current = false
    }
  }, [])

  useEffect(() => {
    if (workerPool.worker) {
      workerPool.worker.postMessage({
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
