import React from 'react'
import './layout.css'

interface OfflineBannerProps {
  isOnline: boolean
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({ isOnline }) => {
  if (isOnline) return null

  return (
    <div className="ui-offline-banner animate-slide-up">
      <div className="ui-offline-banner-dot" />
      <span className="ui-offline-banner-text">Offline · Working locally</span>
    </div>
  )
}
