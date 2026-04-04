/**
 * ConflictMergeDialog — Manual conflict resolution UI
 *
 * Shown when ConflictResolver detects concurrent edits that
 * cannot be auto-merged by Yjs CRDT. Displays local vs remote
 * versions side-by-side with 3 resolution strategies:
 *   - Keep Local
 *   - Keep Remote
 *   - Manual Merge (editable merged version)
 *
 * Integration:
 *   Renderer receives `sync:conflict` IPC event with ConflictInfo,
 *   then shows this dialog. Resolution is sent back via `sync:resolveConflict`.
 */

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { GitMerge, Check, X, ArrowLeft, ArrowRight } from 'lucide-react'

interface ConflictInfo {
  noteId: string
  localVersion: string
  remoteVersion: string
  autoResolved: boolean
}

type ResolutionStrategy = 'keep_local' | 'keep_remote' | 'merge'

interface ConflictMergeDialogProps {
  conflict: ConflictInfo
  onResolve: (strategy: ResolutionStrategy, mergedContent?: string) => void
  onCancel: () => void
}

export const ConflictMergeDialog: React.FC<ConflictMergeDialogProps> = ({
  conflict,
  onResolve,
  onCancel,
}) => {
  const [strategy, setStrategy] = useState<ResolutionStrategy>('keep_local')
  const [mergedContent, setMergedContent] = useState(conflict.localVersion)

  const handleResolve = () => {
    if (strategy === 'merge') {
      onResolve('merge', mergedContent)
    } else {
      onResolve(strategy)
    }
  }

  // ── Keyboard shortcuts ──
  // Enter = apply resolution, Escape = cancel,
  // ArrowLeft = keep local, ArrowRight = keep remote
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept keyboard events when the merge textarea is focused
      const target = e.target as HTMLElement
      if (target.tagName === 'TEXTAREA') return

      switch (e.key) {
        case 'Enter':
          e.preventDefault()
          handleResolve()
          break
        case 'Escape':
          e.preventDefault()
          onCancel()
          break
        case 'ArrowLeft':
          e.preventDefault()
          setStrategy('keep_local')
          setMergedContent(conflict.localVersion)
          break
        case 'ArrowRight':
          e.preventDefault()
          setStrategy('keep_remote')
          setMergedContent(conflict.remoteVersion)
          break
        case 'Tab': {
          const dialog = document.getElementById('conflict-merge-dialog')
          if (!dialog) break
          const focusableElements = dialog.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
          if (focusableElements.length === 0) break

          const firstElement = focusableElements[0]
          const lastElement = focusableElements[focusableElements.length - 1]

          if (!firstElement || !lastElement) break

          if (!e.shiftKey && document.activeElement === lastElement) {
            firstElement.focus()
            e.preventDefault()
          } else if (e.shiftKey && document.activeElement === firstElement) {
            lastElement.focus()
            e.preventDefault()
          }
          break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    // Auto-focus the dialog to trap initial focus
    const dialog = document.getElementById('conflict-merge-dialog')
    if (dialog && !dialog.contains(document.activeElement)) {
      dialog.focus()
    }

    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strategy, mergedContent, conflict])

  return (
    <AnimatePresence>
      <motion.div
        key="conflict-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        id="conflict-merge-overlay"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
        }}
      >
        <motion.div
          key="conflict-dialog"
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          id="conflict-merge-dialog"
          style={{
            width: '90vw',
            maxWidth: '900px',
            maxHeight: '80vh',
            background: 'var(--color-bg-primary, #0f0f17)',
            border: '1px solid rgba(139,92,246,0.3)',
            borderRadius: '16px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <GitMerge size={22} style={{ color: '#f59e0b' }} />
            <h2
              style={{
                margin: 0,
                fontSize: 'var(--text-lg, 17px)',
                fontWeight: 700,
                color: 'var(--color-text-primary)',
              }}
            >
              Merge Conflict Detected
            </h2>
            <button
              onClick={onCancel}
              style={{
                marginLeft: 'auto',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-text-tertiary)',
              }}
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          <p
            style={{
              fontSize: 'var(--text-sm, 13px)',
              color: 'var(--color-text-secondary)',
              marginBottom: '16px',
            }}
          >
            This note was edited on another device while you were offline. Choose how to resolve:
          </p>

          {/* Strategy buttons */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            {[
              {
                key: 'keep_local' as const,
                icon: <ArrowLeft size={14} />,
                label: 'Keep Local',
                shortcut: '←',
              },
              {
                key: 'keep_remote' as const,
                icon: <ArrowRight size={14} />,
                label: 'Keep Remote',
                shortcut: '→',
              },
              {
                key: 'merge' as const,
                icon: <GitMerge size={14} />,
                label: 'Manual Merge',
                shortcut: '',
              },
            ].map(opt => (
              <button
                key={opt.key}
                onClick={() => {
                  setStrategy(opt.key)
                  if (opt.key === 'keep_local') setMergedContent(conflict.localVersion)
                  if (opt.key === 'keep_remote') setMergedContent(conflict.remoteVersion)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border:
                    strategy === opt.key
                      ? '1px solid var(--color-violet, #8b5cf6)'
                      : '1px solid rgba(255,255,255,0.1)',
                  background:
                    strategy === opt.key ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.03)',
                  color:
                    strategy === opt.key
                      ? 'var(--color-violet, #8b5cf6)'
                      : 'var(--color-text-secondary)',
                  fontSize: 'var(--text-sm, 13px)',
                  fontWeight: strategy === opt.key ? 600 : 400,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {opt.icon} {opt.label}
                {opt.shortcut && (
                  <span style={{ opacity: 0.5, fontSize: '11px', marginLeft: 4 }}>
                    {opt.shortcut}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Diff view */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: strategy === 'merge' ? '1fr 1fr 1fr' : '1fr 1fr',
              gap: '12px',
              flex: 1,
              overflow: 'hidden',
              marginBottom: '16px',
            }}
          >
            {/* Local */}
            <div
              style={{
                padding: '12px',
                borderRadius: '10px',
                background: 'rgba(34,197,94,0.05)',
                border:
                  strategy === 'keep_local'
                    ? '1px solid rgba(34,197,94,0.4)'
                    : '1px solid rgba(255,255,255,0.06)',
                overflow: 'auto',
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase' as const,
                  color: '#22c55e',
                  marginBottom: '8px',
                  letterSpacing: '0.5px',
                }}
              >
                ● Local (this device)
              </div>
              <pre
                style={{
                  fontSize: '12px',
                  color: 'var(--color-text-secondary)',
                  whiteSpace: 'pre-wrap',
                  margin: 0,
                  fontFamily: 'inherit',
                }}
              >
                {conflict.localVersion || '(empty)'}
              </pre>
            </div>

            {/* Remote */}
            <div
              style={{
                padding: '12px',
                borderRadius: '10px',
                background: 'rgba(59,130,246,0.05)',
                border:
                  strategy === 'keep_remote'
                    ? '1px solid rgba(59,130,246,0.4)'
                    : '1px solid rgba(255,255,255,0.06)',
                overflow: 'auto',
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase' as const,
                  color: '#3b82f6',
                  marginBottom: '8px',
                  letterSpacing: '0.5px',
                }}
              >
                ● Remote (other device)
              </div>
              <pre
                style={{
                  fontSize: '12px',
                  color: 'var(--color-text-secondary)',
                  whiteSpace: 'pre-wrap',
                  margin: 0,
                  fontFamily: 'inherit',
                }}
              >
                {conflict.remoteVersion || '(empty)'}
              </pre>
            </div>

            {/* Merge textarea (only in merge mode) */}
            {strategy === 'merge' && (
              <div
                style={{
                  padding: '12px',
                  borderRadius: '10px',
                  background: 'rgba(139,92,246,0.05)',
                  border: '1px solid rgba(139,92,246,0.3)',
                  overflow: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase' as const,
                    color: '#8b5cf6',
                    marginBottom: '8px',
                    letterSpacing: '0.5px',
                  }}
                >
                  ● Merged Result
                </div>
                <textarea
                  id="conflict-merge-editor"
                  value={mergedContent}
                  onChange={e => setMergedContent(e.target.value)}
                  className="surface-glass-premium transition-all focus:shadow-[0_0_0_1px_var(--color-glow-violet)]"
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: '1px solid rgba(139,92,246,0.3)',
                    padding: '8px',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--color-text-primary)',
                    fontSize: '12px',
                    fontFamily: 'inherit',
                    resize: 'none',
                    outline: 'none',
                  }}
                />
              </div>
            )}
          </div>

          {/* Actions */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              alignItems: 'center',
            }}
          >
            <span
              style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginRight: 'auto' }}
            >
              ← → to switch • Enter to apply • Esc to cancel
            </span>
            <button
              onClick={onCancel}
              style={{
                padding: '8px 18px',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'transparent',
                color: 'var(--color-text-secondary)',
                fontSize: 'var(--text-sm, 13px)',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              id="conflict-resolve-btn"
              onClick={handleResolve}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 18px',
                borderRadius: '8px',
                border: 'none',
                background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                color: '#fff',
                fontWeight: 600,
                fontSize: 'var(--text-sm, 13px)',
                cursor: 'pointer',
              }}
            >
              <Check size={14} /> Apply Resolution
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
