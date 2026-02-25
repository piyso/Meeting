import { useState } from 'react'
import { Mic, Type, Brain, Shield, HardDrive, User } from 'lucide-react'
import { Select } from '../ui/Select'
import { Toggle } from '../ui/Toggle'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'

export const SettingsView: React.FC = () => {
  // Mock states for Phase 1 visual shell
  const [mic, setMic] = useState('default')
  const [autoStart, setAutoStart] = useState(false)
  const [saveAudio, setSaveAudio] = useState(true)
  
  const sections = [
    {
      id: 'recording',
      title: 'Recording',
      icon: <Mic size={20} className="text-[var(--color-violet)]" />,
      content: (
        <>
          <div className="flex items-center justify-between h-[40px]">
            <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">Microphone</span>
            <div className="w-64"><Select value={mic} onChange={(e) => setMic(e.target.value)} options={[{label: 'Default Mic', value: 'default'}, {label: 'MacBook Air Microphone', value: 'internal'}]} /></div>
          </div>
          <div className="flex items-center justify-between h-[40px]">
            <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">Auto-start</span>
            <Toggle checked={autoStart} onChange={(e) => setAutoStart(e.target.checked)} />
          </div>
          <div className="flex items-center justify-between h-[40px]">
            <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">Save audio files</span>
            <Toggle checked={saveAudio} onChange={(e) => setSaveAudio(e.target.checked)} />
          </div>
        </>
      )
    },
    {
      id: 'transcription',
      title: 'Transcription',
      icon: <Type size={20} className="text-[var(--color-teal)]" />,
      content: (
        <>
          <div className="flex items-center justify-between h-[40px]">
            <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">Language</span>
            <div className="w-64"><Select value="en" onChange={() => {}} options={[{label: 'English', value: 'en'}]} /></div>
          </div>
          <div className="flex items-center justify-between h-[40px]">
            <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">Show confidence</span>
            <Toggle checked={false} onChange={() => {}} />
          </div>
          <div className="flex items-center justify-between h-[40px]">
            <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">Delay</span>
            <div className="w-64"><Select value="low" onChange={() => {}} options={[{label: 'Low', value: 'low'}]} /></div>
          </div>
        </>
      )
    },
    {
      id: 'intelligence',
      title: 'Intelligence',
      icon: <Brain size={20} className="text-[var(--color-sky)]" />,
      content: (
        <>
          <div className="flex items-center justify-between h-[40px]">
            <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">Auto-expand notes</span>
            <Toggle checked={false} onChange={() => {}} />
          </div>
          <div className="flex items-center justify-between h-[40px]">
            <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">Expansion style</span>
            <div className="w-64"><Select value="detailed" onChange={() => {}} options={[{label: 'Detailed', value: 'detailed'}]} /></div>
          </div>
          <div className="flex items-center justify-between h-[40px]">
            <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">Show timestamps</span>
            <Toggle checked={true} onChange={() => {}} />
          </div>
        </>
      )
    },
    {
      id: 'sync',
      title: 'Sync & Privacy',
      icon: <Shield size={20} className="text-[var(--color-amber)]" />,
      content: (
        <>
          <div className="flex items-center justify-between h-[40px]">
            <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">Auto-sync</span>
            <Toggle checked={false} onChange={() => {}} />
          </div>
          <div className="flex items-center justify-between h-[40px]">
            <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">Data location</span>
            <span className="font-mono text-[var(--text-xs)] text-[var(--color-text-tertiary)] bg-[var(--color-bg-glass)] px-2 py-1 rounded">/Users/local/Library/PiyAPI</span>
          </div>
          <div className="flex items-center justify-between h-[40px]">
            <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">Encryption</span>
            <Badge variant="success">AES-256-GCM ✓</Badge>
          </div>
        </>
      )
    },
    {
      id: 'storage',
      title: 'Storage',
      icon: <HardDrive size={20} className="text-[var(--color-text-secondary)]" />,
      content: (
        <>
          <div className="flex items-center justify-between h-[40px]">
            <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">Local usage</span>
            <div className="flex items-center gap-3">
              <div className="w-[200px] h-[6px] bg-[var(--color-bg-glass)] rounded-full overflow-hidden">
                <div className="h-full bg-[var(--color-violet)]" style={{ width: '23%' }} />
              </div>
              <span className="text-[var(--text-xs)] text-[var(--color-text-tertiary)] w-12 text-right">2.3 GB</span>
            </div>
          </div>
          <div className="flex items-center justify-between h-[40px]">
            <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">Cloud usage</span>
            <div className="flex items-center gap-3">
              <div className="w-[200px] h-[6px] bg-[var(--color-bg-glass)] rounded-full overflow-hidden">
                <div className="h-full bg-[var(--color-violet)]" style={{ width: '8%' }} />
              </div>
              <span className="text-[var(--text-xs)] text-[var(--color-text-tertiary)] w-12 text-right">800 MB</span>
            </div>
          </div>
          <div className="flex items-center justify-between h-[40px] mt-2">
            <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">Clear old meetings</span>
            <Button variant="secondary" size="sm">Clear {'>'} 90 days</Button>
          </div>
        </>
      )
    },
    {
      id: 'account',
      title: 'Account',
      icon: <User size={20} className="text-[var(--color-text-secondary)]" />,
      content: (
        <>
          <div className="flex items-center justify-between h-[40px]">
            <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">Devices</span>
            <span className="text-[var(--text-sm)] text-[var(--color-text-primary)]">1 of 2</span>
          </div>
          <div className="flex items-center justify-between h-[40px]">
            <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">Add device</span>
            <Button variant="secondary" size="sm">Manage</Button>
          </div>
          <div className="flex items-center justify-between h-[40px]">
            <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">GDPR export</span>
            <Button variant="secondary" size="sm">Export Data</Button>
          </div>
          <div className="flex items-center justify-between h-[40px]">
            <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">Delete account</span>
            <Button variant="danger" size="sm">Delete</Button>
          </div>
        </>
      )
    }
  ]

  return (
    <div className="max-w-[640px] mx-auto space-y-[var(--space-32)] pb-[var(--space-32)] animate-fade-in">
      {sections.map(sec => (
        <section key={sec.id} className="animate-slide-up" style={{ animationFillMode: 'both' }}>
          <div className="flex items-center gap-3 mb-[var(--space-12)]">
            {sec.icon}
            <h2 className="text-[var(--text-lg)] font-semibold tracking-tight">{sec.title}</h2>
          </div>
          <div className="h-[1px] w-full bg-[var(--color-border-subtle)] mb-[var(--space-12)]" />
          <div className="space-y-1">
            {sec.content}
          </div>
        </section>
      ))}
    </div>
  )
}
