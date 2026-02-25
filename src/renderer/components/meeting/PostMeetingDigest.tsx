import React, { useState } from 'react'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Download, Copy, Share } from 'lucide-react'

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
  meetingId, duration, participantCount, summary, decisions, actionItems, pinnedMoments
}) => {
  const [activeTab, setActiveTab] = useState<'summary' | 'actions' | 'pinned'>('summary')
  const mins = Math.round(duration / 60)

  const handleExport = async (format: 'markdown' | 'pdf' | 'json') => {
    try {
      const res = await window.electronAPI.meeting.export({
        meetingId,
        format,
        includeAudio: false
      })
      if (res.success && res.data) {
        // Show success toast (assume global or local UI handles it)
        console.log('Exported to', res.data.filePath)
      } else {
        console.error('Export failed:', res.error)
      }
    } catch (err) {
      console.error('Export error:', err)
    }
  }

  return (
    <div className="h-full flex flex-col bg-[var(--color-bg-panel)] overflow-hidden animate-slide-up">
      <div className="px-[var(--space-20)] pt-[var(--space-24)] pb-[var(--space-16)] border-b border-[var(--color-border-subtle)]">
        <div className="flex items-center gap-2 mb-[var(--space-16)] text-[var(--color-text-secondary)] text-[var(--text-sm)]">
          <span>📈 {mins} min</span>
          <span>·</span>
          <span>{participantCount} participants</span>
        </div>
        
        <div className="flex gap-[var(--space-24)] border-b border-[var(--color-bg-glass)]">
          {(['summary', 'actions', 'pinned'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-[var(--text-sm)] font-medium transition-colors relative ${activeTab === tab ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'}`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              {activeTab === tab && (
                <div className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-[var(--color-violet)] rounded-t-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-[var(--space-24)] scrollbar-webkit">
        {activeTab === 'summary' && (
          <div className="space-y-[var(--space-24)]">
            {summary && (
              <section>
                <h3 className="text-[var(--text-sm)] font-semibold mb-2">Executive Summary</h3>
                <p className="text-[var(--text-base)] text-[var(--color-text-primary)] leading-relaxed">{summary}</p>
              </section>
            )}
            
            {decisions && decisions.length > 0 && (
              <section>
                <h3 className="text-[var(--text-sm)] font-semibold mb-3">Key Decisions</h3>
                <ul className="space-y-3">
                  {decisions.map((d, i) => (
                    <li key={i} className={`flex items-start gap-3 text-[var(--text-sm)] ${d.changed ? 'pl-3 border-l-2 border-[var(--color-amber)]' : ''}`}>
                      <span className="text-[var(--color-text-tertiary)] mt-1">•</span>
                      <div>
                        {d.changed && <Badge variant="warning" className="mb-1 !text-[9px]">Changed</Badge>}
                        <div className={`${d.changed ? 'opacity-50 line-through text-[var(--text-xs)] mb-1' : 'hidden'}`}>{d.previousValue}</div>
                        <div className="text-[var(--color-text-primary)] leading-tight">{d.text}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        {activeTab === 'actions' && (
          <div className="space-y-4">
            {actionItems?.map((a, i) => (
              <div key={i} className="flex gap-3 items-start p-3 rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-glass)]">
                <input type="checkbox" defaultChecked={a.completed} className="mt-1 ui-toggle-checkbox accent-[var(--color-violet)]" />
                <div className="flex flex-col gap-1">
                  <div className="text-[var(--text-sm)] leading-tight">
                    <span className="font-semibold text-[var(--color-violet)]">{a.assignee}: </span>
                    {a.text}
                  </div>
                  {a.dueDate && <span className="text-[var(--text-xs)] text-[var(--color-text-tertiary)]">{a.dueDate}</span>}
                </div>
              </div>
            ))}
            <Button variant="primary" className="w-full mt-4">Push to Linear / Notion</Button>
          </div>
        )}

        {activeTab === 'pinned' && (
          <div className="space-y-4">
            {pinnedMoments?.map((p, i) => (
              <div key={i} className="flex gap-3 items-start text-[var(--text-sm)] group cursor-pointer hover:bg-[var(--color-bg-glass)] p-2 -mx-2 rounded transition-colors">
                <Badge variant="outline" className="font-mono mt-[-2px]">{p.timestamp}</Badge>
                <div className="text-[var(--color-text-primary)] leading-tight">{p.text}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-[var(--space-16)] border-t border-[var(--color-border-subtle)] bg-[rgba(0,0,0,0.2)]">
        <label className="text-[10px] uppercase tracking-widest text-[var(--color-text-tertiary)] font-semibold mb-2 block">Quick Export</label>
        <div className="flex gap-2">
          <Button variant="secondary" icon={<Copy size={14}/>} className="flex-1 font-mono text-xs" onClick={() => handleExport('markdown')}>MD</Button>
          <Button variant="secondary" icon={<Download size={14}/>} className="flex-1 font-mono text-xs" onClick={() => handleExport('pdf')}>PDF</Button>
          <Button variant="secondary" icon={<Share size={14}/>} className="flex-1 font-mono text-xs" onClick={() => handleExport('json')}>JSON</Button>
        </div>
      </div>
    </div>
  )
}
