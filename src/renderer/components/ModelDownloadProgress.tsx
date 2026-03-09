/**
 * Model Download Progress Component
 *
 * Displays download progress for AI models during first launch.
 * Tracks multiple parallel downloads (ASR + LLM) independently
 * to prevent UI flickering from interleaved progress events.
 */

import React, { useEffect, useState, useCallback } from 'react'
import { Button } from './ui/Button'
import './ModelDownloadProgress.css'

interface ModelDownloadProgressProps {
  onComplete?: () => void
}

interface DownloadProgress {
  modelName: string
  percent: number
  downloadedMB: number
  totalMB: number
  status: 'downloading' | 'verifying' | 'complete' | 'error'
  error?: string
}

export const ModelDownloadProgress: React.FC<ModelDownloadProgressProps> = ({ onComplete }) => {
  // Track each model independently to prevent flicker from interleaved events
  const [models, setModels] = useState<Map<string, DownloadProgress>>(new Map())
  const [startTime] = useState<number>(Date.now())

  const handleProgress = useCallback(
    (progressData: DownloadProgress) => {
      setModels(prev => {
        const next = new Map(prev)
        next.set(progressData.modelName, progressData)
        return next
      })

      // Check if ALL models are complete
      setModels(prev => {
        const allComplete = prev.size > 0 && [...prev.values()].every(m => m.status === 'complete')
        if (allComplete && onComplete) {
          setTimeout(onComplete, 1000)
        }
        return prev
      })
    },
    [onComplete]
  )

  useEffect(() => {
    const unsubscribe = window.electronAPI.model.onDownloadProgress(handleProgress)
    return () => {
      unsubscribe()
    }
  }, [handleProgress])

  // Calculate combined progress across all models
  const allModels = [...models.values()]
  const totalMB = allModels.reduce((sum, m) => sum + m.totalMB, 0)
  const downloadedMB = allModels.reduce((sum, m) => sum + m.downloadedMB, 0)
  const combinedPercent = totalMB > 0 ? Math.round((downloadedMB / totalMB) * 100) : 0

  // Download speed and ETA based on combined data
  const elapsedSeconds = (Date.now() - startTime) / 1000
  const speed = elapsedSeconds > 0 ? downloadedMB / elapsedSeconds : 0
  const remainingMB = totalMB - downloadedMB
  const remainingSeconds = speed > 0 ? remainingMB / speed : 0

  const hasError = allModels.some(m => m.status === 'error')
  const isVerifying = allModels.some(m => m.status === 'verifying')
  const allComplete = allModels.length > 0 && allModels.every(m => m.status === 'complete')

  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds) || seconds < 0) return 'Calculating...'
    if (seconds < 60) return `${Math.round(seconds)}s`
    if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60)
      const secs = Math.round(seconds % 60)
      return `${minutes}m ${secs}s`
    }
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return `${hours}h ${minutes}m`
  }

  if (allModels.length === 0) {
    return (
      <div className="model-download-progress">
        <div className="download-header">
          <h3>Preparing Download...</h3>
        </div>
      </div>
    )
  }

  return (
    <div className="model-download-progress">
      <div className="download-header">
        <h3>
          {allComplete && '✓ All Models Ready'}
          {hasError && '✗ Download Failed'}
          {!allComplete && !hasError && isVerifying && 'Verifying Models...'}
          {!allComplete &&
            !hasError &&
            !isVerifying &&
            `Downloading AI Models (${combinedPercent}%)`}
        </h3>
      </div>

      {/* Combined progress bar */}
      <div className="progress-bar-container">
        <div
          className={`progress-bar ${allComplete ? 'complete' : hasError ? 'error' : 'downloading'}`}
          style={{ width: `${allComplete ? 100 : combinedPercent}%` }}
        >
          <span className="progress-text">{allComplete ? 100 : combinedPercent}%</span>
        </div>
      </div>

      {/* Per-model status lines */}
      <div className="download-models">
        {allModels.map(m => (
          <div key={m.modelName} className={`model-line ${m.status}`}>
            <span className="model-name">{m.modelName}</span>
            <span className="model-status">
              {m.status === 'downloading' && `${m.percent}%`}
              {m.status === 'verifying' && 'Verifying...'}
              {m.status === 'complete' && '✓'}
              {m.status === 'error' && '✗'}
            </span>
          </div>
        ))}
      </div>

      <div className="download-stats">
        {!allComplete && !hasError && (
          <>
            <div className="stat">
              <span className="stat-label">Downloaded:</span>
              <span className="stat-value">
                {downloadedMB.toFixed(1)} MB / {totalMB.toFixed(1)} MB
              </span>
            </div>
            {speed > 0 && (
              <div className="stat">
                <span className="stat-label">Speed:</span>
                <span className="stat-value">{speed.toFixed(2)} MB/s</span>
              </div>
            )}
            {speed > 0 && (
              <div className="stat">
                <span className="stat-label">Time Remaining:</span>
                <span className="stat-value">{formatTime(remainingSeconds)}</span>
              </div>
            )}
          </>
        )}

        {allComplete && (
          <div className="stat success">
            <span className="stat-label">Status:</span>
            <span className="stat-value">All models downloaded and verified!</span>
          </div>
        )}

        {hasError && (
          <div className="stat error">
            <span className="stat-label">Error:</span>
            <span className="stat-value">
              {allModels.find(m => m.status === 'error')?.error || 'Unknown error'}
            </span>
          </div>
        )}
      </div>

      {hasError && (
        <div className="error-actions flex gap-3 mt-4">
          <Button variant="primary" onClick={() => window.location.reload()}>
            Retry Download
          </Button>
          <Button variant="secondary" onClick={onComplete}>
            Skip (Use Cloud Transcription)
          </Button>
        </div>
      )}
    </div>
  )
}
