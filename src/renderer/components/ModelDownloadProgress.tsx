/**
 * Model Download Progress Component
 *
 * Displays download progress for AI models during first launch.
 * Shows progress bar, download speed, and estimated time remaining.
 */

import React, { useEffect, useState } from 'react'
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
  const [progress, setProgress] = useState<DownloadProgress | null>(null)
  const [startTime] = useState<number>(Date.now())
  const [downloadSpeed, setDownloadSpeed] = useState<number>(0)
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState<string>('Calculating...')

  useEffect(() => {
    // Listen for download progress updates
    const unsubscribe = window.electronAPI.model.onDownloadProgress(
      (progressData: DownloadProgress) => {
        setProgress(progressData)

        // Calculate download speed and ETA
        if (progressData.status === 'downloading' && progressData.percent > 0) {
          const elapsedSeconds = (Date.now() - startTime) / 1000
          const speed = progressData.downloadedMB / elapsedSeconds // MB/s
          setDownloadSpeed(speed)

          const remainingMB = progressData.totalMB - progressData.downloadedMB
          const remainingSeconds = remainingMB / speed
          setEstimatedTimeRemaining(formatTime(remainingSeconds))
        }

        // Call onComplete when download finishes
        if (progressData.status === 'complete' && onComplete) {
          setTimeout(onComplete, 1000) // Delay to show 100% briefly
        }
      }
    )

    return () => {
      unsubscribe()
    }
  }, [startTime, onComplete])

  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds) || seconds < 0) return 'Calculating...'

    if (seconds < 60) {
      return `${Math.round(seconds)}s`
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60)
      const secs = Math.round(seconds % 60)
      return `${minutes}m ${secs}s`
    } else {
      const hours = Math.floor(seconds / 3600)
      const minutes = Math.floor((seconds % 3600) / 60)
      return `${hours}h ${minutes}m`
    }
  }

  if (!progress) {
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
          {progress.status === 'downloading' && `Downloading ${progress.modelName}`}
          {progress.status === 'verifying' && `Verifying ${progress.modelName}`}
          {progress.status === 'complete' && `✓ ${progress.modelName} Ready`}
          {progress.status === 'error' && `✗ Download Failed`}
        </h3>
      </div>

      <div className="progress-bar-container">
        <div
          className={`progress-bar ${progress.status}`}
          style={{ width: `${progress.percent}%` }}
        >
          <span className="progress-text">{progress.percent}%</span>
        </div>
      </div>

      <div className="download-stats">
        {progress.status === 'downloading' && (
          <>
            <div className="stat">
              <span className="stat-label">Downloaded:</span>
              <span className="stat-value">
                {progress.downloadedMB.toFixed(2)} MB / {progress.totalMB.toFixed(2)} MB
              </span>
            </div>
            <div className="stat">
              <span className="stat-label">Speed:</span>
              <span className="stat-value">{downloadSpeed.toFixed(2)} MB/s</span>
            </div>
            <div className="stat">
              <span className="stat-label">Time Remaining:</span>
              <span className="stat-value">{estimatedTimeRemaining}</span>
            </div>
          </>
        )}

        {progress.status === 'verifying' && (
          <div className="stat">
            <span className="stat-label">Status:</span>
            <span className="stat-value">Verifying file integrity...</span>
          </div>
        )}

        {progress.status === 'complete' && (
          <div className="stat success">
            <span className="stat-label">Status:</span>
            <span className="stat-value">Download complete!</span>
          </div>
        )}

        {progress.status === 'error' && (
          <div className="stat error">
            <span className="stat-label">Error:</span>
            <span className="stat-value">{progress.error || 'Unknown error'}</span>
          </div>
        )}
      </div>

      {progress.status === 'error' && (
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
