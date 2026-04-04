import React, { useEffect, useState, useCallback } from 'react'
import { Button } from './ui/Button'
import { Cpu, HardDriveDownload, Orbit, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'
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

  const completeFiredRef = React.useRef(false)

  const handleProgress = useCallback(
    (progressData: DownloadProgress) => {
      setModels(prev => {
        const next = new Map(prev)
        next.set(progressData.modelName, progressData)

        // Check completion inside the SAME updater — state is fresh here
        const allComplete = next.size > 0 && [...next.values()].every(m => m.status === 'complete')
        if (allComplete && onComplete && !completeFiredRef.current) {
          completeFiredRef.current = true
          setTimeout(onComplete, 1000)
        }

        return next
      })
    },
    [onComplete]
  )

  useEffect(() => {
    const unsubscribe = window.electronAPI?.model?.onDownloadProgress?.(handleProgress)
    return () => {
      unsubscribe?.()
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
      <div className="model-download-wrapper">
        <div className="model-download-progress initializing">
          <Orbit className="pulsing-icon" size={48} />
          <h3>Establishing Cognitive Substrate...</h3>
          <p>Preparing to download core AI models.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="model-download-wrapper">
      <div
        className={`model-download-progress ${allComplete ? 'state-complete' : hasError ? 'state-error' : 'state-active'}`}
      >
        <div className="download-header">
          <div className="header-icon-container">
            {allComplete ? (
              <CheckCircle2 size={32} className="text-emerald" />
            ) : hasError ? (
              <AlertTriangle size={32} className="text-amber" />
            ) : isVerifying ? (
              <Cpu size={32} className="text-violet pulsing-icon" />
            ) : (
              <HardDriveDownload size={32} className="text-violet" />
            )}
          </div>
          <div className="header-text">
            <h3>
              {allComplete && 'Memory Fabric Integrated'}
              {hasError && 'Substrate Initialization Failed'}
              {!allComplete && !hasError && isVerifying && 'Verifying Neural Weights...'}
              {!allComplete && !hasError && !isVerifying && 'Initializing Core Models'}
            </h3>
            <p className="subtitle">
              {allComplete
                ? 'System ready for autonomous operation.'
                : 'Local-first architecture requires downloading initial components.'}
            </p>
          </div>
          {!allComplete && !hasError && !isVerifying && (
            <div className="progress-percentage">{combinedPercent}%</div>
          )}
        </div>

        {/* Combined progress bar */}
        <div className="progress-bar-container">
          <div className="progress-bar-track">
            <div
              className={`progress-bar-fill ${allComplete ? 'complete' : hasError ? 'error' : 'downloading'}`}
              style={{ width: `${allComplete ? 100 : combinedPercent}%` }}
            >
              <div className="progress-glow"></div>
            </div>
          </div>
        </div>

        {/* Per-model status lines */}
        <div className="download-models-card">
          {allModels.map(m => (
            <div key={m.modelName} className={`model-line ${m.status}`}>
              <div className="model-info">
                <Cpu size={16} className="model-icon" />
                <span className="model-name">{m.modelName}</span>
              </div>
              <span className="model-status">
                {m.status === 'downloading' && (
                  <span className="flex items-center gap-2">{m.percent}%</span>
                )}
                {m.status === 'verifying' && (
                  <span className="flex items-center gap-2">
                    <Loader2 size={14} className="spin-icon" /> Verifying
                  </span>
                )}
                {m.status === 'complete' && <CheckCircle2 size={16} className="text-emerald" />}
                {m.status === 'error' && <AlertTriangle size={16} className="text-amber" />}
              </span>
            </div>
          ))}
        </div>

        <div className="download-stats-grid">
          {!allComplete && !hasError && (
            <>
              <div className="stat-box">
                <span className="stat-label">DATA POOL</span>
                <span className="stat-value monitor-font">
                  {(downloadedMB / 1024).toFixed(2)} / {(totalMB / 1024).toFixed(2)} GB
                </span>
              </div>
              <div className="stat-box">
                <span className="stat-label">BANDWIDTH</span>
                <span className="stat-value monitor-font">
                  {speed > 0 ? `${speed.toFixed(1)} MB/s` : '---'}
                </span>
              </div>
              <div className="stat-box">
                <span className="stat-label">EST. TIME</span>
                <span className="stat-value monitor-font">
                  {speed > 0 ? formatTime(remainingSeconds) : '---'}
                </span>
              </div>
            </>
          )}

          {allComplete && (
            <div className="stat-box success-box full-width">
              <span className="stat-label">SYSTEM STATUS</span>
              <span className="stat-value text-emerald">
                All models downloaded and verified successfully.
              </span>
            </div>
          )}

          {hasError && (
            <div className="stat-box error-box full-width">
              <span className="stat-label">ERROR LOG</span>
              <span className="stat-value text-amber monitor-font">
                {allModels.find(m => m.status === 'error')?.error || 'ERR_CONNECTION_DROPPED'}
              </span>
            </div>
          )}
        </div>

        {hasError && (
          <div className="error-actions">
            <Button
              variant="primary"
              onClick={() => window.location.reload()}
              className="w-full justify-center"
            >
              Re-initialize Connection
            </Button>
            <Button variant="secondary" onClick={onComplete} className="w-full justify-center mt-3">
              Bypass (Use Cloud Fallback)
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
