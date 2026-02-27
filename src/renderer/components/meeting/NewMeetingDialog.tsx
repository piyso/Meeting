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
    const dropped = Array.from(e.dataTransfer.files).filter(
      f => f.name.endsWith('.pdf') || f.name.endsWith('.md') || f.name.endsWith('.txt')
    )
    if (dropped.length) {
      setFiles(prev => [...prev, ...dropped].slice(0, 3)) // Max 3
    }
  }, [])

  return (
    <Dialog open={open} onClose={onClose} title="Start Meeting" width={520}>
      <div className="ui-new-meeting-content">
        <Input
          label="Meeting Title"
          placeholder="Optional — AI suggests after 60s"
          value={title}
          onChange={e => setTitle(e.target.value)}
          autoFocus
        />

        <div>
          <label className="ui-new-meeting-label">Template</label>
          <div className="ui-new-meeting-templates hidden-scrollbar">
            {TEMPLATES.map(t => (
              <button
                key={t.id}
                onClick={() => setTemplate(t.id)}
                className={`ui-new-meeting-template-btn ${template === t.id ? 'active' : ''}`}
              >
                <span className="ui-new-meeting-template-icon">{t.icon}</span>
                <span className="ui-new-meeting-template-label">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="ui-new-meeting-label">Context Documents (optional)</label>
          <div
            className={`ui-new-meeting-dropzone ${isDragging ? 'dragging' : ''}`}
            onDragOver={e => {
              e.preventDefault()
              setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <p className="ui-new-meeting-dropzone-text">
              Drop .pdf, .md, or .txt files here (max 3 files)
            </p>
          </div>

          {files.length > 0 && (
            <div className="ui-new-meeting-files">
              {files.map((f, i) => (
                <div key={i} className="ui-new-meeting-file">
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

        <div className="ui-new-meeting-footer">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
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
