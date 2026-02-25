import React from 'react'
import './layout.css'

interface OfflineBannerProps {
  isOnline: boolean
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({ isOnline }) => {
  if (isOnline) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 h-[28px] bg-[rgba(30,30,34,0.9)] border-t border-[var(--color-border-subtle)] z-30 flex items-center justify-center gap-2 animate-slide-up">
      <div className="w-2 h-2 rounded-full bg-[var(--color-rose)]" />
      <span className="text-[11px] font-medium text-[var(--color-text-tertiary)] uppercase tracking-widest">
        Offline · Working locally
      </span>
    </div>
  )
}
