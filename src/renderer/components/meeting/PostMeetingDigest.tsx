import React, { useState } from 'react'
import { motion, AnimatePresence, Variants } from 'framer-motion'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Download, Copy, Share } from 'lucide-react'

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
  const mins = Math.round(duration / 60)

  const handleExport = async (format: 'markdown' | 'pdf' | 'json') => {
    try {
      const res = await window.electronAPI.meeting.export({
        meetingId,
        format,
        includeAudio: false,
      })
      if (res.success && res.data) {
        log.info('Exported to', res.data.filePath)
      } else {
        log.error('Export failed:', res.error)
      }
    } catch (err) {
      log.error('Export error:', err)
    }
  }

  const containerVariants: Variants = {
    hidden: { opacity: 0, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        staggerChildren: 0.05,
        ease: [0.16, 1, 0.3, 1] as any, // Snappy var(--ease-snappy) JS approximation
      },
    },
    exit: { opacity: 0, y: -10, transition: { duration: 0.15 } },
  }

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 400, damping: 30 } },
  }

  return (
    <div className="ui-digest-container animate-slide-up">
      <div className="ui-digest-header">
        <div className="ui-digest-meta">
          <span>📈 {mins} min</span>
          <span>·</span>
          <span>{participantCount} participants</span>
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
                  transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="ui-digest-content scrollbar-webkit relative min-h-[300px]">
        <AnimatePresence mode="wait">
          {activeTab === 'summary' && (
            <motion.div
              key="summary"
              className="ui-digest-section absolute inset-x-0"
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
              className="ui-digest-section absolute inset-x-0"
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
              <motion.div variants={itemVariants}>
                <Button variant="primary" className="w-full mt-4">
                  Push to Linear / Notion
                </Button>
              </motion.div>
            </motion.div>
          )}

          {activeTab === 'pinned' && (
            <motion.div
              key="pinned"
              className="ui-digest-section absolute inset-x-0"
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="ui-digest-footer">
        <label className="ui-digest-footer-label">Quick Export</label>
        <div className="ui-digest-footer-actions">
          <Button
            variant="secondary"
            icon={<Copy size={14} />}
            className="ui-digest-footer-btn"
            onClick={() => handleExport('markdown')}
          >
            MD
          </Button>
          <Button
            variant="secondary"
            icon={<Download size={14} />}
            className="ui-digest-footer-btn"
            onClick={() => handleExport('pdf')}
          >
            PDF
          </Button>
          <Button
            variant="secondary"
            icon={<Share size={14} />}
            className="ui-digest-footer-btn"
            onClick={() => handleExport('json')}
          >
            JSON
          </Button>
        </div>
      </div>
    </div>
  )
}
