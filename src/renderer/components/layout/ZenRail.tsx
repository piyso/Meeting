import React from 'react'
import { FileText, Search, Settings } from 'lucide-react'
import { IconButton } from '../ui/IconButton'

interface ZenRailProps {
  activeView: 'meeting-list' | 'meeting-detail' | 'settings'
  onNavigate: (view: 'meeting-list' | 'settings') => void
  focusMode: boolean
}

export const ZenRail: React.FC<ZenRailProps> = ({ activeView, onNavigate, focusMode }) => {
  return (
    <nav
      className={`
        fixed left-0 top-0 bottom-0 w-[56px] pt-[56px] pb-[var(--space-16)] px-[var(--space-8)]
        surface-glass-premium gpu-promoted rounded-r-[var(--radius-lg)] z-50
        flex flex-col items-center gap-[var(--space-8)]
        transition-transform duration-300 ease-[var(--ease-fluid)]
        ${focusMode ? '-translate-x-[56px]' : 'translate-x-0'}
      `}
      style={{ contain: 'layout style paint' }}
    >
      <div className="relative w-full flex justify-center">
        {activeView === 'meeting-list' && (
          <div className="absolute left-[-8px] top-1/2 -translate-y-1/2 w-[2px] h-[16px] rounded-full bg-[var(--color-violet)]" />
        )}
        <IconButton
          icon={<FileText size={18} />}
          active={activeView === 'meeting-list'}
          onClick={() => onNavigate('meeting-list')}
          tooltip="Meetings"
        />
      </div>

      <div className="relative w-full flex justify-center">
        <IconButton
          icon={<Search size={18} />}
          onClick={() => window.dispatchEvent(new CustomEvent('open-command-palette'))}
          tooltip="Search (Cmd+K)"
        />
      </div>

      <div className="mt-auto relative w-full flex justify-center">
        {activeView === 'settings' && (
          <div className="absolute left-[-8px] top-1/2 -translate-y-1/2 w-[2px] h-[16px] rounded-full bg-[var(--color-violet)]" />
        )}
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
