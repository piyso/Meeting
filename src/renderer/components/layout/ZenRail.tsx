import React from 'react'
import { modLabel } from '../../utils/platformShortcut'
import { FileText, Search, Settings, Brain, CalendarDays, MessageSquare, Lock } from 'lucide-react'
import { IconButton } from '../ui/IconButton'
import { useAppStore } from '../../store/appStore'

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
  const toggleCommandPalette = useAppStore(s => s.toggleCommandPalette)

  // Determine which views are locked based on tier
  const isViewLocked = (view: string): boolean => {
    if (!userTier || userTier === 'pro' || userTier === 'team' || userTier === 'enterprise')
      return false
    if (userTier === 'free') {
      // Free: KG is read-only (allowed), Digest and Ask are locked
      return view === 'weekly-digest' || view === 'ask-meetings'
    }
    if (userTier === 'starter') {
      // Starter: has Digest now, but Ask is still locked (needs hybrid search)
      return view === 'ask-meetings'
    }
    return false
  }

  // Handle navigation with tier check
  const handleNavigate = (view: ZenRailProps['activeView']) => {
    if (isViewLocked(view)) {
      // Show upgrade prompt instead of navigating
      onUpgrade?.()
      return
    }
    onNavigate(view)
  }

  return (
    <nav className={`ui-zen-rail ${focusMode ? 'focus-mode' : ''}`} aria-label="Main navigation">
      <div className="ui-zen-rail-item">
        <IconButton
          icon={<FileText size={18} />}
          active={activeView === 'meeting-list'}
          onClick={() => handleNavigate('meeting-list')}
          tooltip="Meetings"
        />
      </div>

      <div className="ui-zen-rail-item">
        <div className="relative">
          <IconButton
            icon={<Brain size={18} />}
            active={activeView === 'knowledge-graph'}
            onClick={() => handleNavigate('knowledge-graph')}
            tooltip="Knowledge Graph"
          />
        </div>
      </div>

      <div className="ui-zen-rail-item">
        <div className="relative">
          <IconButton
            icon={<CalendarDays size={18} />}
            active={activeView === 'weekly-digest'}
            onClick={() => handleNavigate('weekly-digest')}
            tooltip="Weekly Digest"
          />
          {isViewLocked('weekly-digest') && (
            <div className="absolute -top-1 -right-1 bg-[var(--color-bg-base)] rounded-full p-[2px] shadow-sm z-10">
              <Lock size={10} className="text-[var(--color-amber)]" />
            </div>
          )}
        </div>
      </div>

      <div className="ui-zen-rail-item">
        <div className="relative">
          <IconButton
            icon={<MessageSquare size={18} />}
            active={activeView === 'ask-meetings'}
            onClick={() => handleNavigate('ask-meetings')}
            tooltip="Ask Meetings"
          />
          {isViewLocked('ask-meetings') && (
            <div className="absolute -top-1 -right-1 bg-[var(--color-bg-base)] rounded-full p-[2px] shadow-sm z-10">
              <Lock size={10} className="text-[var(--color-amber)]" />
            </div>
          )}
        </div>
      </div>

      <div className="ui-zen-rail-item">
        <IconButton
          icon={<Search size={18} />}
          onClick={toggleCommandPalette}
          tooltip={`Search (${modLabel}+K)`}
        />
      </div>

      {showUpgrade && (
        <div className="ui-zen-rail-item">
          <button
            onClick={onUpgrade}
            className="ui-zen-rail-upgrade-btn"
            title={`Upgrade to Pro — You're on ${(userTier ?? 'free').charAt(0).toUpperCase() + (userTier ?? 'free').slice(1)}`}
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
        <IconButton
          icon={<Settings size={18} />}
          active={activeView === 'settings'}
          onClick={() => handleNavigate('settings')}
          tooltip="Settings"
        />
      </div>
    </nav>
  )
}
