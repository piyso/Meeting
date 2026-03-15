import React, { useState } from 'react'
import { motion, AnimatePresence, Variants } from 'framer-motion'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Download, Copy, Share, TrendingUp, Loader2 } from 'lucide-react'
import { useAppStore } from '../../store/appStore'

import { rendererLog } from '../../utils/logger'
const log = rendererLog.create('PostDigest')

interface PostMeetingDigestProps {
  meetingId: string
  duration: number
  participantCount: number
  summary?: string
  decisions?: Array<{ text: string; changed?: boolean; previousValue?: string }>
  actionItems?: Array<{ text: string; assignee: string; dueDate?: string; completed: boolean }>
  pinnedMoments?: Array<{ timestamp: string; text: string }>
}

export const PostMeetingDigest: React.FC<PostMeetingDigestProps> = ({
  meetingId,
  duration,
  participantCount,
  summary,
  decisions,
  actionItems,
  pinnedMoments,
}) => {
  const [activeTab, setActiveTab] = useState<'summary' | 'actions' | 'pinned'>('summary')
  const [exportingType, setExportingType] = useState<'markdown' | 'pdf' | 'json' | null>(null)
  const addToast = useAppStore(s => s.addToast)
  const mins = Math.round(duration / 60) || null

  const handleExport = async (format: 'markdown' | 'pdf' | 'json') => {
    setExportingType(format)
    try {
      const res = await window.electronAPI?.meeting?.export({
        meetingId,
        format,
        includeAudio: false,
      })
      if (res?.success && res.data) {
        log.info('Exported', format, '→', res.data.filename, `(${res.data.content.length} chars)`)
        addToast({
          type: 'success',
          title: 'Export complete',
          message: `Saved as ${res.data.filename || format.toUpperCase()}`,
          duration: 4000,
        })
      } else {
        log.error('Export failed:', res?.error)
        addToast({
          type: 'error',
          title: 'Export failed',
          message: res.error?.message || 'Unknown error',
          duration: 5000,
        })
      }
    } catch (err) {
      log.error('Export error:', err)
      addToast({
        type: 'error',
        title: 'Export failed',
        message: err instanceof Error ? err.message : 'Unexpected error',
        duration: 5000,
      })
    } finally {
      setExportingType(null)
    }
  }

  const containerVariants: Variants = {
    hidden: { opacity: 0, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        staggerChildren: 0.05,
        ease: [0.16, 1, 0.3, 1] as [number, number, number, number], // Snappy var(--ease-snappy) JS approximation
      },
    },
    exit: { opacity: 0, y: -10, transition: { duration: 0.15 } },
  }

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { type: 'spring', stiffness: 350, damping: 28, mass: 0.8 },
    },
  }

  return (
    <div className="ui-digest-container animate-slide-up">
      <div className="ui-digest-header">
        <div className="ui-digest-meta">
          <div className="ui-digest-meta-primary">
            <TrendingUp size={14} />
            <span>{mins ? `${mins} min` : '< 1 min'}</span>
          </div>
          <span>·</span>
          <span>
            {participantCount} participant{participantCount !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="ui-digest-tabs relative">
          {(['summary', 'actions', 'pinned'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`ui-digest-tab relative ${activeTab === tab ? 'active' : ''}`}
            >
              <span className="relative z-10">{tab.charAt(0).toUpperCase() + tab.slice(1)}</span>
              {activeTab === tab && (
                <motion.div
                  layoutId="activeTabIndicator"
                  className="ui-digest-tab-indicator absolute inset-0 z-0 bg-[var(--color-bg-active)] rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)]"
                  initial={false}
                  transition={{ type: 'spring', stiffness: 350, damping: 28, mass: 0.8 }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="ui-digest-content scrollbar-webkit">
        <AnimatePresence mode="wait">
          {activeTab === 'summary' && (
            <motion.div
              key="summary"
              className="ui-digest-section px-6"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              {summary && (
                <motion.section variants={itemVariants}>
                  <h3 className="ui-digest-section-title">Executive Summary</h3>
                  <p className="ui-digest-text">{summary}</p>
                </motion.section>
              )}

              {decisions && decisions.length > 0 && (
                <motion.section variants={itemVariants}>
                  <h3 className="ui-digest-section-title">Key Decisions</h3>
                  <ul className="ui-digest-list">
                    {decisions.map((d, i) => (
                      <motion.li
                        key={i}
                        variants={itemVariants}
                        className={`ui-digest-list-item ${d.changed ? 'changed' : ''}`}
                      >
                        <span className="ui-digest-list-bullet">•</span>
                        <div className="ui-digest-list-content">
                          {d.changed && (
                            <Badge variant="warning" className="mb-1 !text-[9px]">
                              Changed
                            </Badge>
                          )}
                          <div
                            className={`${d.changed ? 'opacity-50 line-through text-[var(--text-xs)] mb-1' : 'hidden'}`}
                          >
                            {d.previousValue}
                          </div>
                          <div className="ui-digest-text">{d.text}</div>
                        </div>
                      </motion.li>
                    ))}
                  </ul>
                </motion.section>
              )}
            </motion.div>
          )}

          {activeTab === 'actions' && (
            <motion.div
              key="actions"
              className="ui-digest-section px-6"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              {actionItems?.map((a, i) => (
                <motion.div key={i} variants={itemVariants} className="ui-digest-action-card">
                  <input
                    type="checkbox"
                    defaultChecked={a.completed}
                    className="mt-1 ui-toggle-checkbox accent-[var(--color-violet)]"
                  />
                  <div className="ui-digest-action-content">
                    <div className="ui-digest-action-text">
                      <span className="ui-digest-action-assignee">{a.assignee}: </span>
                      {a.text}
                    </div>
                    {a.dueDate && <span className="ui-digest-action-due">{a.dueDate}</span>}
                  </div>
                </motion.div>
              ))}
              {(!actionItems || actionItems.length === 0) && (
                <motion.div
                  variants={itemVariants}
                  className="ui-digest-text"
                  style={{ opacity: 0.5, textAlign: 'center', padding: '24px 0' }}
                >
                  No action items detected in this meeting.
                </motion.div>
              )}
              <motion.div variants={itemVariants} className="mt-6">
                <h4 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-3 px-1">
                  Sync Integrations
                </h4>
                <div className="flex flex-col gap-3">
                  {/* Linear Integration Row */}
                  <button className="surface-glass-premium flex items-center justify-between px-3.5 py-3 rounded-[var(--radius-lg)] border border-[rgba(255,255,255,0.06)] hover:-translate-y-[1px] hover:border-indigo-500/30 hover:shadow-[0_4px_20px_rgba(99,102,241,0.15)] transition-all duration-300 group">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-[#5E6AD2]/20 flex items-center justify-center text-[#5E6AD2]">
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0" />
                          <path d="M12 7v5l3 3" />
                        </svg>
                      </div>
                      <span className="text-[14px] font-medium text-[var(--color-text-primary)] group-hover:text-white transition-colors">
                        Linear
                      </span>
                    </div>
                    <div className="opacity-0 translate-x-1 group-hover:translate-x-0 group-hover:opacity-100 transition-all duration-300 bg-[rgba(255,255,255,0.03)] p-1.5 rounded-md">
                      <TrendingUp size={14} className="text-[#5E6AD2]" />
                    </div>
                  </button>

                  {/* Notion Integration Row */}
                  <button className="surface-glass-premium flex items-center justify-between px-3.5 py-3 rounded-[var(--radius-lg)] border border-[rgba(255,255,255,0.06)] hover:-translate-y-[1px] hover:border-slate-400/30 hover:shadow-[0_4px_20px_rgba(255,255,255,0.05)] transition-all duration-300 group">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-200/20 flex items-center justify-center text-slate-300">
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M4 4h16v16H4z" />
                          <path d="M4 8h16" />
                          <path d="M8 4v16" />
                        </svg>
                      </div>
                      <span className="text-[14px] font-medium text-[var(--color-text-primary)] group-hover:text-white transition-colors">
                        Notion
                      </span>
                    </div>
                    <div className="opacity-0 translate-x-1 group-hover:translate-x-0 group-hover:opacity-100 transition-all duration-300 bg-[rgba(255,255,255,0.03)] p-1.5 rounded-md">
                      <TrendingUp size={14} className="text-slate-300" />
                    </div>
                  </button>

                  {/* Connect More Sub-Action */}
                  <button className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-[rgba(255,255,255,0.1)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[rgba(255,255,255,0.02)] transition-colors group mt-1">
                    <div className="w-5 h-5 rounded flex items-center justify-center">
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </div>
                    <span className="text-[12px] font-medium">Connect more tools...</span>
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}

          {activeTab === 'pinned' && (
            <motion.div
              key="pinned"
              className="ui-digest-section px-6"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              {pinnedMoments?.map((p, i) => (
                <motion.div key={i} variants={itemVariants} className="ui-digest-pinned-moment">
                  <Badge variant="outline" className="font-mono mt-[-2px]">
                    {p.timestamp}
                  </Badge>
                  <div className="ui-digest-pinned-text">{p.text}</div>
                </motion.div>
              ))}
              {(!pinnedMoments || pinnedMoments.length === 0) && (
                <motion.div
                  variants={itemVariants}
                  className="ui-digest-text"
                  style={{ opacity: 0.5, textAlign: 'center', padding: '24px 0' }}
                >
                  No bookmarked moments for this meeting.
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="ui-digest-footer">
        <label className="ui-digest-footer-label">Quick Export</label>
        <div className="ui-digest-footer-actions">
          <Button
            variant="secondary"
            icon={
              exportingType === 'markdown' ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Copy size={14} />
              )
            }
            className={`ui-digest-footer-btn transition-all duration-200 ${exportingType === 'markdown' ? 'opacity-80 scale-95' : ''}`}
            onClick={() => handleExport('markdown')}
            disabled={exportingType !== null}
          >
            {exportingType === 'markdown' ? 'Exporting...' : 'MD'}
          </Button>
          <Button
            variant="secondary"
            icon={
              exportingType === 'pdf' ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Download size={14} />
              )
            }
            className={`ui-digest-footer-btn transition-all duration-200 ${exportingType === 'pdf' ? 'opacity-80 scale-95' : ''}`}
            onClick={() => handleExport('pdf')}
            disabled={exportingType !== null}
          >
            {exportingType === 'pdf' ? 'Exporting...' : 'PDF'}
          </Button>
          <Button
            variant="secondary"
            icon={
              exportingType === 'json' ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Share size={14} />
              )
            }
            className={`ui-digest-footer-btn transition-all duration-200 ${exportingType === 'json' ? 'opacity-80 scale-95' : ''}`}
            onClick={() => handleExport('json')}
            disabled={exportingType !== null}
          >
            {exportingType === 'json' ? 'Exporting...' : 'JSON'}
          </Button>
        </div>
      </div>
    </div>
  )
}
