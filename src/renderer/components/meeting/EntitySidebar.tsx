import React, { useEffect, useMemo, useState } from 'react'
import type { Entity } from '../../../types/database'
import {
  Hash,
  User,
  Building,
  MapPin,
  Search,
  Tag,
  DollarSign,
  Calendar,
  FileText,
  Globe,
} from 'lucide-react'
import { IconButton } from '../ui/IconButton'
import { useAppStore } from '../../store/appStore'

interface EntitySidebarProps {
  meetingId: string
  onClose?: () => void
}

export const EntitySidebar: React.FC<EntitySidebarProps> = ({ meetingId, onClose }) => {
  const [entities, setEntities] = useState<Entity[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const currentTier = useAppStore(s => s.currentTier)

  const recordingState = useAppStore(s => s.recordingState)
  const isRecording = recordingState === 'recording' || recordingState === 'paused'

  const [filter, setFilter] = useState('')

  useEffect(() => {
    async function fetchEntities() {
      setIsLoading(true)
      try {
        const res = await window.electronAPI?.entity?.get({ meetingId })
        if (res.success && res.data) {
          setEntities(res.data)
        } else {
          setError(res.error?.message || 'Failed to load entities')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setIsLoading(false)
      }
    }

    if (meetingId) {
      fetchEntities()
    }

    // I20 fix: Poll for new entities every 15s during active recording
    // so newly discovered entities appear without requiring sidebar close/reopen
    if (meetingId && isRecording) {
      const interval = setInterval(fetchEntities, 15_000)
      return () => clearInterval(interval)
    }
    return undefined
  }, [meetingId, isRecording])

  // Group and filter entities (memoized — can be large)
  const grouped = useMemo(
    () =>
      entities.reduce(
        (acc, entity) => {
          if (filter && !entity.text.toLowerCase().includes(filter.toLowerCase())) return acc

          const type = entity.type
          if (!type) return acc
          if (!acc[type]) acc[type] = new Map()

          // De-dupe by text
          const textLower = entity.text.toLowerCase()
          const existing = acc[type]?.get(textLower)
          if (!existing || (entity.confidence || 0) > (existing.confidence || 0)) {
            acc[type]?.set(textLower, entity)
          }
          return acc
        },
        {} as Record<string, Map<string, Entity>>
      ),
    [entities, filter]
  )

  const getTypeIcon = (type: string) => {
    switch (type.toUpperCase()) {
      case 'PERSON':
        return <User size={14} />
      case 'ORGANIZATION':
        return <Building size={14} />
      case 'LOCATION':
        return <MapPin size={14} />
      case 'AMOUNT':
        return <DollarSign size={14} />
      case 'DATE':
        return <Calendar size={14} />
      case 'DOCUMENT':
        return <FileText size={14} />
      case 'URL':
        return <Globe size={14} />
      default:
        return <Hash size={14} />
    }
  }

  const getTypeColor = (type: string) => {
    switch (type.toUpperCase()) {
      case 'PERSON':
        return '#10b981' // emerald
      case 'ORGANIZATION':
        return '#3b82f6' // blue
      case 'LOCATION':
        return '#f59e0b' // amber
      case 'NPI':
      case 'TAX_ID':
      case 'DEA_NUMBER':
        return '#ef4444' // red/high risk
      default:
        return '#8b5cf6' // violet
    }
  }

  return (
    <div className="ui-entity-sidebar">
      <div className="ui-entity-sidebar-header">
        <h3 className="ui-entity-sidebar-title">
          <Tag size={16} color="var(--color-violet)" /> Detected Entities
        </h3>
        {onClose && (
          <IconButton
            icon={<span style={{ fontSize: 14 }}>✕</span>}
            onClick={onClose}
            tooltip="Close"
            className="ui-entity-close-btn bg-transparent hover:bg-white/10"
          />
        )}
      </div>

      <div className="ui-entity-search-container">
        <div className="ui-entity-search-box">
          <Search size={14} color="#888" />
          <input
            type="text"
            className="ui-entity-search-input"
            placeholder="Search entities..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        </div>
      </div>

      <div className="ui-entity-content">
        {isLoading ? (
          <div className="ui-entity-msg">Loading entities...</div>
        ) : error ? (
          <div className="ui-entity-err">{error}</div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="ui-entity-msg">
            {filter ? 'No matches found.' : 'No entities detected yet.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {Object.entries(grouped)
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([type, entityMap]) => {
                const items = Array.from(entityMap.values()).sort(
                  (a, b) => (b.confidence || 0) - (a.confidence || 0)
                )

                return (
                  <div key={type}>
                    <div className="ui-entity-category">
                      <span style={{ color: getTypeColor(type) }}>{getTypeIcon(type)}</span>
                      <span className="ml-1">{type.replace('_', ' ')}</span>
                      <span className="ui-entity-category-count ml-1">({items.length})</span>
                      {(type === 'ORGANIZATION' || type === 'LOCATION') &&
                        (currentTier === 'free' || currentTier === 'starter') && (
                          <span className="ml-2 text-[10px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--color-amber)]/10 text-[var(--color-amber)] border border-[var(--color-amber)]/20 shadow-sm font-medium tracking-wide">
                            🔒 Cloud-Enriched
                          </span>
                        )}
                    </div>
                    <div className="ui-entity-chip-container">
                      {items.map(entity => (
                        <span key={entity.id} className="ui-entity-chip">
                          {entity.text}
                          {entity.confidence && (
                            <span className="ui-entity-chip-conf">
                              {Math.round(entity.confidence * 100)}%
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
          </div>
        )}
      </div>
    </div>
  )
}
