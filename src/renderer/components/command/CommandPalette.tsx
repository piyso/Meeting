import React, { useState, useEffect, useDeferredValue } from 'react'
import { createPortal } from 'react-dom'
import { Search, FileText, Settings, Maximize, Play } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { Badge } from '../ui/Badge'
import { useSearch } from '../../hooks/queries/useSearch'
import { useMeetings } from '../../hooks/queries/useMeetings'
import './command.css'

interface CommandItem {
  id: string
  type: 'action' | 'meeting'
  icon: React.ReactNode
  label: string
  description?: string
  shortcut?: string
  onSelect: () => void
}

export const CommandPalette: React.FC = () => {
  const { commandPaletteOpen, toggleCommandPalette, toggleFocusMode, navigate } = useAppStore()
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Actions
  const baseActions: CommandItem[] = [
    {
      id: 'a1', type: 'action', icon: <Play size={16} />, label: 'Start New Meeting',
      description: 'Create a new recording session', shortcut: 'Cmd+N',
      onSelect: () => { window.dispatchEvent(new CustomEvent('open-new-meeting')); toggleCommandPalette() }
    },
    {
      id: 'a2', type: 'action', icon: <Settings size={16} />, label: 'Open Settings',
      description: 'Configure audio, models, and preferences', shortcut: 'Cmd+,',
      onSelect: () => { navigate('settings'); toggleCommandPalette() }
    },
    {
      id: 'a3', type: 'action', icon: <Maximize size={16} />, label: 'Toggle Focus Mode',
      description: 'Hide navigation rails to maximize content', shortcut: 'Cmd+Shift+F',
      onSelect: () => { toggleFocusMode(); toggleCommandPalette() }
    }
  ]

  const searchParams = React.useMemo(() => ({ query: deferredQuery }), [deferredQuery])
  const { data: searchResults } = useSearch(searchParams)
  const { data: recentMeetings } = useMeetings({ limit: 4 })

  // Map Results
  const isSearching = deferredQuery.trim().length > 1
  
  const meetingItems: CommandItem[] = isSearching
    ? [
        ...(searchResults?.transcripts || []).map((t) => ({
          id: `t_${t.transcript.id}`,
          type: 'meeting' as const,
          icon: <FileText size={16} />,
          label: t.meeting.title || 'Untitled Meeting',
          description: t.snippet || 'Transcript match',
          onSelect: () => { navigate('meeting-detail', t.meeting.id); toggleCommandPalette() }
        })),
        ...(searchResults?.notes || []).map((n) => ({
          id: `n_${n.note.id}`,
          type: 'meeting' as const,
          icon: <FileText size={16} />,
          label: n.meeting.title || 'Untitled Meeting',
          description: n.snippet || 'Note match',
          onSelect: () => { navigate('meeting-detail', n.meeting.id); toggleCommandPalette() }
        }))
      ]
    : (recentMeetings?.items || []).map((m) => ({
        id: m.id,
        type: 'meeting' as const,
        icon: <FileText size={16} />,
        label: m.title || 'Untitled Meeting',
        description: 'Recent Meeting',
        onSelect: () => { navigate('meeting-detail', m.id); toggleCommandPalette() }
      }))

  const allItems = isSearching
    ? [...baseActions.filter(a => a.label.toLowerCase().includes(deferredQuery.toLowerCase())), ...meetingItems]
    : [...baseActions, ...meetingItems]

  useEffect(() => {
    setSelectedIndex(0)
  }, [deferredQuery])

  useEffect(() => {
    if (!commandPaletteOpen) {
      setQuery('')
      return
    }

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') toggleCommandPalette()
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(s => Math.min(s + 1, allItems.length - 1))
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(s => Math.max(s - 1, 0))
      }
      if (e.key === 'Enter' && allItems[selectedIndex]) {
        e.preventDefault()
        allItems[selectedIndex].onSelect()
      }
    }
    
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [commandPaletteOpen, allItems, selectedIndex, toggleCommandPalette])

  if (!commandPaletteOpen) return null

  const actions = allItems.filter(i => i.type === 'action')
  const meetings = allItems.filter(i => i.type === 'meeting')

  return createPortal(
    <div className="ui-cmd-overlay" onClick={toggleCommandPalette}>
      <div 
        className="ui-cmd-panel surface-glass-premium" 
        onClick={e => e.stopPropagation()}
        role="dialog"
      >
        <div className="ui-cmd-input-row">
          <Search size={20} className="ui-cmd-search-icon" />
          <input
            autoFocus
            className="ui-cmd-input"
            placeholder="Search meetings, transcripts, notes..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        
        <div className="ui-cmd-results">
          {actions.length > 0 && (
            <div className="ui-cmd-section">
              <div className="ui-cmd-section-title">ACTIONS</div>
              {actions.map((item, i) => {
                const globalIndex = i
                return (
                  <button 
                    key={item.id} 
                    className={`ui-cmd-item ${selectedIndex === globalIndex ? 'selected' : ''}`}
                    onClick={item.onSelect}
                    onMouseEnter={() => setSelectedIndex(globalIndex)}
                  >
                    <div className="ui-cmd-item-icon">{item.icon}</div>
                    <div className="ui-cmd-item-text">
                      <div className="ui-cmd-item-label">{item.label}</div>
                      {item.description && <div className="ui-cmd-item-desc">{item.description}</div>}
                    </div>
                    {item.shortcut && <Badge variant="default" className="ml-auto font-mono tracking-tighter opacity-70">{item.shortcut}</Badge>}
                  </button>
                )
              })}
            </div>
          )}

          {meetings.length > 0 && (
            <div className="ui-cmd-section">
              <div className="ui-cmd-section-title">MEETINGS ({meetings.length})</div>
              {meetings.map((item, i) => {
                const globalIndex = actions.length + i
                return (
                  <button 
                    key={item.id} 
                    className={`ui-cmd-item ${selectedIndex === globalIndex ? 'selected' : ''}`}
                    onClick={item.onSelect}
                    onMouseEnter={() => setSelectedIndex(globalIndex)}
                  >
                    <div className="ui-cmd-item-icon">{item.icon}</div>
                    <div className="ui-cmd-item-text">
                      <div className="ui-cmd-item-label">{item.label}</div>
                      {item.description && <div className="ui-cmd-item-desc">{item.description}</div>}
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {allItems.length === 0 && (
            <div className="p-[var(--space-24)] text-center text-[var(--color-text-tertiary)] text-[var(--text-sm)]">
              No results found for "{query}"
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
