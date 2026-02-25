import React, { useState, useCallback } from 'react'
import { Play, X } from 'lucide-react'
import { Dialog } from '../ui/Dialog'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/IconButton'

export interface NewMeetingConfig {
  title: string
  template: 'blank' | '1on1' | 'standup' | 'client-call' | 'brainstorm'
  contextFiles: File[]
}

interface NewMeetingDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (config: NewMeetingConfig) => void
}

const TEMPLATES = [
  { id: 'blank', icon: '📝', label: 'Blank' },
  { id: '1on1', icon: '👥', label: '1:1' },
  { id: 'standup', icon: '🏃', label: 'Standup' },
  { id: 'client-call', icon: '📞', label: 'Client Call' },
  { id: 'brainstorm', icon: '💡', label: 'Brainstorm' },
] as const

export const NewMeetingDialog: React.FC<NewMeetingDialogProps> = ({ open, onClose, onSubmit }) => {
  const [title, setTitle] = useState('')
  const [template, setTemplate] = useState<NewMeetingConfig['template']>('blank')
  const [files, setFiles] = useState<File[]>([])
  const [isDragging, setIsDragging] = useState(false)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const dropped = Array.from(e.dataTransfer.files).filter(f => 
      f.name.endsWith('.pdf') || f.name.endsWith('.md') || f.name.endsWith('.txt')
    )
    if (dropped.length) {
      setFiles(prev => [...prev, ...dropped].slice(0, 3)) // Max 3
    }
  }, [])

  return (
    <Dialog open={open} onClose={onClose} title="Start Meeting" width={520}>
      <div className="space-y-[var(--space-24)]">
        <Input 
          label="Meeting Title" 
          placeholder="Optional — AI suggests after 60s" 
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />

        <div>
          <label className="text-[var(--text-xs)] text-[var(--color-text-secondary)] mb-[var(--space-8)] block font-medium">
            Template
          </label>
          <div className="flex gap-[var(--space-12)] overflow-x-auto pb-2 scrollbar-none">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => setTemplate(t.id)}
                className={`
                  flex shrink-0 flex-col items-center justify-center w-[88px] h-[72px] rounded-[var(--radius-md)]
                  transition-all duration-200 border
                  ${template === t.id 
                    ? 'border-[var(--color-violet)] bg-[rgba(167,139,250,0.05)] shadow-[0_0_12px_rgba(167,139,250,0.15)]' 
                    : 'border-[var(--color-border-subtle)] bg-transparent hover:bg-[var(--color-bg-glass-hover)]'}
                `}
              >
                <span className="text-[20px] mb-1">{t.icon}</span>
                <span className={`text-[11px] font-medium ${template === t.id ? 'text-[var(--color-violet)]' : 'text-[var(--color-text-secondary)]'}`}>
                  {t.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[var(--text-xs)] text-[var(--color-text-secondary)] mb-[var(--space-8)] block font-medium">
            Context Documents (optional)
          </label>
          <div 
            className={`
              border-2 border-dashed rounded-[var(--radius-md)] p-[var(--space-24)] text-center transition-all
              ${isDragging ? 'border-[var(--color-violet)] bg-[rgba(167,139,250,0.05)]' : 'border-[var(--color-border-subtle)] bg-[var(--color-bg-glass)]'}
            `}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <p className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">
              Drop .pdf, .md, or .txt files here (max 3 files)
            </p>
          </div>
          
          {files.length > 0 && (
            <div className="mt-[var(--space-12)] space-y-2">
              {files.map((f, i) => (
                <div key={i} className="flex flex-row items-center justify-between text-[var(--text-xs)] text-[var(--color-text-primary)] bg-[var(--color-bg-glass)] px-3 py-2 rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)]">
                  <span className="truncate pr-4">{f.name}</span>
                  <IconButton 
                    icon={<X size={14} />} 
                    size="sm" 
                    onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))} 
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-[var(--space-12)] pt-[var(--space-8)] border-t border-[var(--color-border-subtle)]">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button 
            variant="primary" 
            icon={<Play size={16} fill="currentColor" />}
            onClick={() => {
              onSubmit({ title, template, contextFiles: files })
              onClose()
            }}
          >
            Start Meeting
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
