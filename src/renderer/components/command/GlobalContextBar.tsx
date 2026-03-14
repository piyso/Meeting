import React, { useEffect, useRef, useState, useDeferredValue } from 'react'
import { createPortal } from 'react-dom'
import { Sparkles, FileText, Loader2 } from 'lucide-react'
import { useSemanticSearch } from '../../hooks/queries/useSearch'
import { useAppStore } from '../../store/appStore'
import './command.css'

interface GlobalContextBarProps {
  open: boolean
  onClose: () => void
}

export const GlobalContextBar: React.FC<GlobalContextBarProps> = ({ open, onClose }) => {
  const [query, setQuery] = useState('')
  const queryRef = useRef(query)
  queryRef.current = query
  const deferredQuery = useDeferredValue(query)
  const navigate = useAppStore(s => s.navigate)

  const searchParams = React.useMemo(() => ({ query: deferredQuery }), [deferredQuery])
  const { data: results, isLoading, isFetching } = useSemanticSearch(searchParams)

  const isSimulating = isLoading || isFetching

  useEffect(() => {
    if (!open) setQuery('')

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Enter' && queryRef.current.trim()) {
        // Future: could trigger an explicit 'ask' to the LLM
      }
    }

    if (open) window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="ui-cmd-overlay" onClick={onClose}>
      <div
        className="ui-global-context-bar surface-glass-premium slide-up"
        role="dialog"
        aria-modal="false"
        onClick={e => e.stopPropagation()}
      >
        <div className="ui-cmd-input-row !border-none">
          <Sparkles
            size={20}
            className="ui-cmd-search-icon"
            style={{ color: 'var(--color-violet)' }}
          />
          <input
            autoFocus
            className="ui-cmd-input"
            placeholder="Ask across all meetings..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>

        {deferredQuery && !isSimulating && results && results.length > 0 && (
          <div className="px-[var(--space-16)] pb-[var(--space-16)] mt-2 border-t border-[var(--color-border-subtle)] pt-[var(--space-16)] stagger-child">
            <p className="text-[var(--text-sm)] text-[var(--color-text-secondary)] leading-relaxed">
              {/* Combine top snippets or rely on backend to return a synthesized summary */}
              {results[0]?.snippet || 'Found relevant context in your meetings.'}
            </p>

            <div className="mt-[var(--space-12)] flex flex-wrap gap-2">
              {results.map((r, i) => (
                <button
                  key={i}
                  onClick={() => {
                    navigate('meeting-detail', r.meeting.id)
                    onClose()
                  }}
                  className="flex items-center gap-1 bg-[var(--color-bg-glass)] border border-[var(--color-border-subtle)] px-2 py-1 rounded text-[11px] text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-panel)] transition-colors cursor-pointer"
                >
                  <FileText size={10} /> {r.meeting.title || 'Untitled'}
                  <span className="opacity-50 ml-1">
                    {(Math.min(r.relevance, 1) * 100).toFixed(0)}%
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {deferredQuery && !isSimulating && (!results || results.length === 0) && (
          <div className="px-[var(--space-16)] pb-[var(--space-16)] mt-2 border-t border-[var(--color-border-subtle)] pt-[var(--space-16)]">
            <p className="text-[var(--text-sm)] text-[var(--color-text-tertiary)]">
              No semantic match found across meetings.
            </p>
          </div>
        )}

        {isSimulating && deferredQuery.trim().length > 2 && (
          <div className="px-[var(--space-16)] pb-[var(--space-16)] mt-2 border-t border-[var(--color-border-subtle)] pt-[var(--space-16)] flex gap-2 items-center">
            <Loader2 size={16} className="text-[var(--color-violet)] animate-spin" />
            <span className="text-[var(--text-sm)] text-[var(--color-text-tertiary)]">
              Searching semantic index...
            </span>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
