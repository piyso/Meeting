import React, { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, X, ChevronRight } from 'lucide-react'
import { useAppStore } from '../../store/appStore'

interface StatusBannerProps {
  onViewDetails?: () => void
  onVisibilityChange?: (visible: boolean) => void
}

export const StatusBanner: React.FC<StatusBannerProps> = ({
  onViewDetails,
  onVisibilityChange,
}) => {
  const [issues, setIssues] = useState<{ errors: number; warnings: number }>({
    errors: 0,
    warnings: 0,
  })
  const [dismissed, setDismissed] = useState(false)
  const [visible, setVisible] = useState(false)
  const navigate = useAppStore(s => s.navigate)

  const runCheck = useCallback(async () => {
    try {
      const res = await window.electronAPI?.diagnostic?.healthCheck()
      if (res?.success && res.data) {
        const errors = res.data.results.filter(r => r.status === 'error').length
        const warnings = res.data.results.filter(r => r.status === 'warn').length
        setIssues({ errors, warnings })
        if (errors > 0 || warnings > 0) {
          setVisible(true)
        }
      }
    } catch {
      // unavailable
    }
  }, [])

  useEffect(() => {
    // Run health check 3 seconds after mount to not block first paint
    const timer = setTimeout(runCheck, 3000)
    return () => clearTimeout(timer)
  }, [runCheck])

  // Auto-dismiss after 30 seconds
  useEffect(() => {
    if (visible && !dismissed) {
      const timer = setTimeout(() => setDismissed(true), 30000)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [visible, dismissed])

  const shouldShow = visible && !dismissed && (issues.errors > 0 || issues.warnings > 0)

  // Notify parent whenever visibility changes
  useEffect(() => {
    onVisibilityChange?.(shouldShow)
  }, [shouldShow, onVisibilityChange])

  if (!shouldShow) {
    return null
  }

  const total = issues.errors + issues.warnings
  const isError = issues.errors > 0

  const handleViewDetails = () => {
    if (onViewDetails) {
      onViewDetails()
    } else {
      navigate('settings')
    }
    setDismissed(true)
  }

  return (
    <div
      id="status-banner"
      className="flex items-center justify-between px-4 py-2 text-[13px] font-medium animate-slide-down"
      style={{
        position: 'fixed',
        top: 64,
        left: 104,
        right: 0,
        zIndex: 35,
        background: isError
          ? 'linear-gradient(90deg, rgba(255,69,58,0.12), rgba(255,69,58,0.06))'
          : 'linear-gradient(90deg, rgba(255,159,10,0.12), rgba(255,159,10,0.06))',
        borderBottom: `1px solid ${isError ? 'rgba(255,69,58,0.2)' : 'rgba(255,159,10,0.2)'}`,
      }}
    >
      <div className="flex items-center gap-2">
        <AlertTriangle
          size={14}
          className={isError ? 'text-[var(--color-rose)]' : 'text-[var(--color-amber)]'}
        />
        <span className={isError ? 'text-[var(--color-rose)]' : 'text-[var(--color-amber)]'}>
          {total} issue{total > 1 ? 's' : ''} detected
        </span>
        <button
          onClick={handleViewDetails}
          className="flex items-center gap-0.5 text-[var(--color-sky)] hover:underline cursor-pointer bg-transparent border-none font-medium text-[13px] p-0"
        >
          View Details
          <ChevronRight size={12} />
        </button>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] cursor-pointer bg-transparent border-none p-1 rounded transition-colors"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  )
}
