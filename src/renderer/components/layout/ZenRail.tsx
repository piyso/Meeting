import React from 'react'
import { FileText, Search, Settings } from 'lucide-react'
import { IconButton } from '../ui/IconButton'

interface ZenRailProps {
  activeView: 'meeting-list' | 'meeting-detail' | 'settings' | 'onboarding'
  onNavigate: (view: 'meeting-list' | 'settings') => void
  focusMode: boolean
}

export const ZenRail: React.FC<ZenRailProps> = ({ activeView, onNavigate, focusMode }) => {
  return (
    <nav
      className={`ui-zen-rail surface-glass-premium gpu-promoted ${focusMode ? 'focus-mode' : ''}`}
      style={{ contain: 'layout style paint' }}
    >
      <div className="ui-zen-rail-item">
        {activeView === 'meeting-list' && <div className="ui-zen-rail-active-indicator" />}
        <IconButton
          icon={<FileText size={18} />}
          active={activeView === 'meeting-list'}
          onClick={() => onNavigate('meeting-list')}
          tooltip="Meetings"
        />
      </div>

      <div className="ui-zen-rail-item">
        <IconButton
          icon={<Search size={18} />}
          onClick={() => window.dispatchEvent(new CustomEvent('open-command-palette'))}
          tooltip="Search (Cmd+K)"
        />
      </div>

      <div className="ui-zen-rail-item ui-zen-rail-bottom">
        {activeView === 'settings' && <div className="ui-zen-rail-active-indicator" />}
        <IconButton
          icon={<Settings size={18} />}
          active={activeView === 'settings'}
          onClick={() => onNavigate('settings')}
          tooltip="Settings"
        />
      </div>
    </nav>
  )
}
