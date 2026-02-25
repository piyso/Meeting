/**
 * Audio Fallback Notification Component
 *
 * Displays a notification when audio capture falls back from one source to another.
 * Supports the complete fallback chain: System Audio → Microphone → Cloud
 */

import React, { useEffect, useState } from 'react'
import './AudioFallbackNotification.css'

interface FallbackInfo {
  from: 'system' | 'microphone' | 'cloud'
  to: 'microphone' | 'cloud' | 'error'
  reason: string
  requiresUserAction: boolean
  guidance?: {
    title: string
    steps: string[]
    link?: string
  }
}

export const AudioFallbackNotification: React.FC = () => {
  const [fallbackInfo, setFallbackInfo] = useState<FallbackInfo | null>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    // Listen for fallback notifications from main process (Task 13.2)
    if (window.electronAPI?.audio?.onFallbackOccurred) {
      window.electronAPI.audio.onFallbackOccurred((info: FallbackInfo) => {
        console.log('Received fallback notification:', info)
        setFallbackInfo(info)
        setIsVisible(true)

        // Auto-hide after 15 seconds (longer for cloud fallback which requires action)
        const hideDelay = info.requiresUserAction ? 20000 : 10000
        setTimeout(() => {
          setIsVisible(false)
        }, hideDelay)
      })
    }

    // Legacy fallback notification support (for backward compatibility)
    if (window.electronAPI?.ipcRenderer) {
      const unsubscribe = window.electronAPI.ipcRenderer.on(
        'audio:fallbackNotification',
        (
          _event: unknown,
          data: { type: 'microphone' | 'cloud'; message: string; details: string }
        ) => {
          console.log('Received legacy fallback notification:', data)
          // Convert legacy format to new format
          setFallbackInfo({
            from: 'system',
            to: data.type,
            reason: data.details,
            requiresUserAction: data.type === 'cloud',
          })
          setIsVisible(true)

          setTimeout(() => {
            setIsVisible(false)
          }, 10000)
        }
      )

      return () => {
        if (unsubscribe) {
          unsubscribe()
        }
      }
    }

    return undefined
  }, [])

  const handleClose = () => {
    setIsVisible(false)
  }

  const handleOpenSettings = async () => {
    try {
      if (fallbackInfo?.guidance?.link) {
        // Open external link if provided
        await window.electronAPI.shell.openExternal(fallbackInfo.guidance.link)
      } else {
        // Default to sound settings
        await window.electronAPI.audio.openSoundSettings()
      }
    } catch (error) {
      console.error('Failed to open settings:', error)
    }
  }

  if (!fallbackInfo || !isVisible) {
    return null
  }

  // Determine icon and title based on fallback type
  const getIcon = () => {
    if (fallbackInfo.to === 'microphone') return '🎤'
    if (fallbackInfo.to === 'cloud') return '☁️'
    return '⚠️'
  }

  const getTitle = () => {
    if (fallbackInfo.from === 'system' && fallbackInfo.to === 'microphone') {
      return 'Using Microphone Instead'
    }
    if (fallbackInfo.from === 'microphone' && fallbackInfo.to === 'cloud') {
      return 'Cloud Transcription Required'
    }
    if (fallbackInfo.from === 'system' && fallbackInfo.to === 'cloud') {
      return 'Local Audio Unavailable'
    }
    return 'Audio Source Changed'
  }

  const getMessage = () => {
    if (fallbackInfo.to === 'microphone') {
      return 'System audio capture failed. Recording from microphone instead.'
    }
    if (fallbackInfo.to === 'cloud') {
      return 'Local audio capture failed. Please enable cloud transcription to continue.'
    }
    return fallbackInfo.reason
  }

  return (
    <div
      className={`audio-fallback-notification ${fallbackInfo.requiresUserAction ? 'requires-action' : ''}`}
    >
      <div className="notification-content">
        <div className="notification-icon">{getIcon()}</div>
        <div className="notification-text">
          <div className="notification-title">{getTitle()}</div>
          <div className="notification-details">{getMessage()}</div>
          {fallbackInfo.reason && (
            <div className="notification-reason">Reason: {fallbackInfo.reason}</div>
          )}
        </div>
        <div className="notification-actions">
          {fallbackInfo.requiresUserAction && (
            <button className="btn-settings" onClick={handleOpenSettings}>
              {fallbackInfo.to === 'cloud' ? 'Open Settings' : 'Fix Audio'}
            </button>
          )}
          {!fallbackInfo.requiresUserAction && fallbackInfo.to === 'microphone' && (
            <button className="btn-settings" onClick={handleOpenSettings}>
              Fix System Audio
            </button>
          )}
          <button className="btn-close" onClick={handleClose}>
            ✕
          </button>
        </div>
      </div>
      {fallbackInfo.guidance && (
        <div className="notification-guidance">
          <div className="guidance-title">{fallbackInfo.guidance.title}</div>
          <ol className="guidance-steps">
            {fallbackInfo.guidance.steps.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
