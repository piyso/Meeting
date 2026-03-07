import React from 'react'
import { FileText, Search, Settings, Brain, CalendarDays, MessageSquare, Lock } from 'lucide-react'
import { IconButton } from '../ui/IconButton'

interface ZenRailProps {
  activeView:
    | 'meeting-list'
    | 'meeting-detail'
    | 'settings'
    | 'onboarding'
    | 'knowledge-graph'
    | 'weekly-digest'
    | 'ask-meetings'
    | 'pricing'
  onNavigate: (view: ZenRailProps['activeView']) => void
  focusMode: boolean
  userTier?: string
  onUpgrade?: () => void
}

export const ZenRail: React.FC<ZenRailProps> = ({
  activeView,
  onNavigate,
  focusMode,
  userTier,
  onUpgrade,
}) => {
  const showUpgrade = userTier && (userTier === 'free' || userTier === 'starter')

  return (
    <nav className={`ui-zen-rail ${focusMode ? 'focus-mode' : ''}`}>
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
        {activeView === 'knowledge-graph' && <div className="ui-zen-rail-active-indicator" />}
        <div className="relative">
          <IconButton
            icon={<Brain size={18} />}
            active={activeView === 'knowledge-graph'}
            onClick={() => onNavigate('knowledge-graph')}
            tooltip="Knowledge Graph"
          />
          {showUpgrade && (
            <div className="absolute -top-1 -right-1 bg-[var(--color-bg-base)] rounded-full p-[2px] shadow-sm z-10">
              <Lock size={10} className="text-[var(--color-amber)]" />
            </div>
          )}
        </div>
      </div>

      <div className="ui-zen-rail-item">
        {activeView === 'weekly-digest' && <div className="ui-zen-rail-active-indicator" />}
        <div className="relative">
          <IconButton
            icon={<CalendarDays size={18} />}
            active={activeView === 'weekly-digest'}
            onClick={() => onNavigate('weekly-digest')}
            tooltip="Weekly Digest"
          />
          {showUpgrade && (
            <div className="absolute -top-1 -right-1 bg-[var(--color-bg-base)] rounded-full p-[2px] shadow-sm z-10">
              <Lock size={10} className="text-[var(--color-amber)]" />
            </div>
          )}
        </div>
      </div>

      <div className="ui-zen-rail-item">
        {activeView === 'ask-meetings' && <div className="ui-zen-rail-active-indicator" />}
        <IconButton
          icon={<MessageSquare size={18} />}
          active={activeView === 'ask-meetings'}
          onClick={() => onNavigate('ask-meetings')}
          tooltip="Ask Meetings"
        />
      </div>

      <div className="ui-zen-rail-item">
        <IconButton
          icon={<Search size={18} />}
          onClick={() => window.dispatchEvent(new CustomEvent('open-command-palette'))}
          tooltip="Search (Cmd+K)"
        />
      </div>

      {showUpgrade && (
        <div className="ui-zen-rail-item">
          <button
            onClick={onUpgrade}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              borderRadius: 12,
              background:
                'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(59, 130, 246, 0.15))',
              border: '1px solid rgba(139, 92, 246, 0.3)',
              color: '#d8b4fe',
              cursor: 'pointer',
              transition: 'all 0.3s cubic-bezier(0.25, 1, 0.5, 1)',
              boxShadow:
                '0 4px 12px rgba(139, 92, 246, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'scale(1.05)'
              e.currentTarget.style.boxShadow =
                '0 8px 20px rgba(139, 92, 246, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
              e.currentTarget.style.background =
                'linear-gradient(135deg, rgba(139, 92, 246, 0.25), rgba(59, 130, 246, 0.25))'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'scale(1)'
              e.currentTarget.style.boxShadow =
                '0 4px 12px rgba(139, 92, 246, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
              e.currentTarget.style.background =
                'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(59, 130, 246, 0.15))'
            }}
            title={`Upgrade to Pro — You're on ${userTier.charAt(0).toUpperCase() + userTier.slice(1)}`}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
              <path d="M5 3v4M3 5h4" />
            </svg>
          </button>
        </div>
      )}

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
