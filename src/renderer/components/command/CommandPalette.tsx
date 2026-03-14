import React, { useState, useEffect, useDeferredValue } from 'react'
import { modLabel } from '../../utils/platformShortcut'
import { createPortal } from 'react-dom'
import {
  Search,
  FileText,
  Settings,
  Maximize,
  Mic,
  Download,
  Shield,
  Layout,
  Brain,
  CalendarDays,
  MessageSquare,
} from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { Badge } from '../ui/Badge'
import { useSearch, useSemanticSearch } from '../../hooks/queries/useSearch'
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
  const commandPaletteOpen = useAppStore(s => s.commandPaletteOpen)
  const toggleCommandPalette = useAppStore(s => s.toggleCommandPalette)
  const toggleFocusMode = useAppStore(s => s.toggleFocusMode)
  const navigate = useAppStore(s => s.navigate)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Debounce search queries by 300ms to prevent IPC spam from rapid typing
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(deferredQuery), 300)
    return () => clearTimeout(timer)
  }, [deferredQuery])

  // Actions
  const baseActions: CommandItem[] = React.useMemo(
    () => [
      {
        id: 'a1',
        type: 'action',
        icon: <Mic size={16} />,
        label: 'Start New Meeting',
        description: 'Create a new archiving session',
        shortcut: `${modLabel}+N`,
        onSelect: () => {
          window.dispatchEvent(new CustomEvent('open-new-meeting'))
          toggleCommandPalette()
        },
      },
      {
        id: 'a2',
        type: 'action',
        icon: <Settings size={16} />,
        label: 'Open Settings',
        description: 'Configure audio, models, and preferences',
        shortcut: `${modLabel}+,`,
        onSelect: () => {
          navigate('settings')
          toggleCommandPalette()
        },
      },
      {
        id: 'a3',
        type: 'action',
        icon: <Maximize size={16} />,
        label: 'Toggle Focus Mode',
        description: 'Hide navigation rails to maximize content',
        shortcut: `${modLabel}+Shift+F`,
        onSelect: () => {
          toggleFocusMode()
          toggleCommandPalette()
        },
      },
      {
        id: 'a4',
        type: 'action',
        icon: <Mic size={16} />,
        label: 'Start Archiving',
        description: 'Start or stop the current archiving session',
        shortcut: `${modLabel}+Shift+R`,
        onSelect: () => {
          window.dispatchEvent(new CustomEvent('toggle-recording'))
          toggleCommandPalette()
        },
      },
      {
        id: 'a5',
        type: 'action',
        icon: <Download size={16} />,
        label: 'Quick Export as Markdown',
        description: 'Export the current meeting notes instantly',
        shortcut: `${modLabel}+Shift+E`,
        onSelect: () => {
          window.dispatchEvent(new CustomEvent('quick-export'))
          toggleCommandPalette()
        },
      },
      {
        id: 'a6',
        type: 'action',
        icon: <Shield size={16} />,
        label: 'Open Privacy Dashboard',
        description: 'View trust & security settings',
        onSelect: () => {
          navigate('settings')
          toggleCommandPalette()
        },
      },
      {
        id: 'a7',
        type: 'action',
        icon: <Layout size={16} />,
        label: 'Toggle Floating Widget',
        description: 'Show or hide the native floating widget',
        shortcut: `${modLabel}+Shift+M`,
        onSelect: () => {
          window.electronAPI?.window?.restoreMain()
          toggleCommandPalette()
        },
      },
      {
        id: 'a8',
        type: 'action',
        icon: <Brain size={16} />,
        label: 'Open Knowledge Graph',
        description: 'Explore entities and relationships across meetings',
        onSelect: () => {
          navigate('knowledge-graph')
          toggleCommandPalette()
        },
      },
      {
        id: 'a9',
        type: 'action',
        icon: <CalendarDays size={16} />,
        label: 'Open Weekly Digest',
        description: 'View your weekly meeting summary and insights',
        onSelect: () => {
          navigate('weekly-digest')
          toggleCommandPalette()
        },
      },
      {
        id: 'a10',
        type: 'action',
        icon: <MessageSquare size={16} />,
        label: 'Ask Your Meetings',
        description: 'Ask AI questions about your meeting history',
        onSelect: () => {
          navigate('ask-meetings')
          toggleCommandPalette()
        },
      },
    ],
    [toggleCommandPalette, toggleFocusMode, navigate]
  )

  const searchParams = React.useMemo(() => ({ query: debouncedSearch }), [debouncedSearch])
  const { data: searchResults } = useSearch(searchParams)
  const { data: semanticResults } = useSemanticSearch(searchParams)
  const { data: recentMeetings } = useMeetings({ limit: 4 })

  // Map Results
  const isSearching = debouncedSearch.trim().length > 1

  const meetingItems: CommandItem[] = React.useMemo(
    () =>
      isSearching
        ? [
            ...(semanticResults || []).map(s => ({
              id: `sem_${s.meeting.id}`,
              type: 'meeting' as const,
              icon: <Brain size={16} className="text-[var(--color-sky)]" />,
              label: s.meeting.title || 'Untitled Meeting',
              description: s.snippet || 'Semantic match',
              onSelect: () => {
                navigate('meeting-detail', s.meeting.id)
                toggleCommandPalette()
              },
            })),
            ...(searchResults?.transcripts || []).map(t => ({
              id: `t_${t.transcript.id}`,
              type: 'meeting' as const,
              icon: <FileText size={16} />,
              label: t.meeting.title || 'Untitled Meeting',
              description: t.snippet || 'Transcript match',
              onSelect: () => {
                navigate('meeting-detail', t.meeting.id)
                toggleCommandPalette()
              },
            })),
            ...(searchResults?.notes || []).map(n => ({
              id: `n_${n.note.id}`,
              type: 'meeting' as const,
              icon: <FileText size={16} />,
              label: n.meeting.title || 'Untitled Meeting',
              description: n.snippet || 'Note match',
              onSelect: () => {
                navigate('meeting-detail', n.meeting.id)
                toggleCommandPalette()
              },
            })),
          ]
        : (recentMeetings?.items || []).map(m => ({
            id: m.id,
            type: 'meeting' as const,
            icon: <FileText size={16} />,
            label: m.title || 'Untitled Meeting',
            description: 'Recent Meeting',
            onSelect: () => {
              navigate('meeting-detail', m.id)
              toggleCommandPalette()
            },
          })),
    [isSearching, semanticResults, searchResults, recentMeetings, navigate, toggleCommandPalette]
  )

  const allItems = React.useMemo(() => {
    if (isSearching) {
      return [
        ...baseActions.filter(a => a.label.toLowerCase().includes(deferredQuery.toLowerCase())),
        ...meetingItems,
      ]
    }
    return [...baseActions, ...meetingItems]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSearching, deferredQuery, meetingItems, baseActions])

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
        allItems[selectedIndex]?.onSelect()
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
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="ui-cmd-input-row">
          <Search size={20} className="ui-cmd-search-icon" />
          <input
            autoFocus
            className="ui-cmd-input"
            placeholder="Search meetings, transcripts, notes..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            aria-label="Search meetings, actions, and transcripts"
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
                      {item.description && (
                        <div className="ui-cmd-item-desc">{item.description}</div>
                      )}
                    </div>
                    {item.shortcut && (
                      <Badge
                        variant="default"
                        className="ml-auto font-mono tracking-tighter opacity-70"
                      >
                        {item.shortcut}
                      </Badge>
                    )}
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
                      {item.description && (
                        <div className="ui-cmd-item-desc">{item.description}</div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {allItems.length === 0 && (
            <div className="ui-cmd-empty-state">No results found for "{query}"</div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
