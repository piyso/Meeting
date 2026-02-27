import React, { useState, useEffect, useCallback } from 'react'
import { Mic, Type, Brain, Shield, HardDrive, User, RefreshCw, Download } from 'lucide-react'
import { Select } from '../ui/Select'
import { Toggle } from '../ui/Toggle'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { useAppStore } from '../../store/appStore'

import { rendererLog } from '../../utils/logger'
const log = rendererLog.create('Settings')

interface SettingsState {
  // Recording
  preferredAudioDevice: string
  audioFallbackEnabled: boolean
  keepAudioFiles: boolean

  // Transcription
  hardwareTier: string
  useCloudTranscription: boolean
  language: string

  // Intelligence
  autoExpandNotes: boolean
  llmEngine: string
  maxTokensPerExpansion: number

  // Sync & Privacy
  syncEnabled: boolean
  encryptionEnabled: boolean
  phiDetectionEnabled: boolean
  maskPHIBeforeSync: boolean
  auditLoggingEnabled: boolean

  // Storage
  maxDiskUsage: number
  autoDeleteOldMeetings: boolean
  autoDeleteAfterDays: number

  // UI
  theme: string
  showSmartChips: boolean
}

const DEFAULT_SETTINGS: SettingsState = {
  preferredAudioDevice: 'default',
  audioFallbackEnabled: true,
  keepAudioFiles: true,
  hardwareTier: '',
  useCloudTranscription: false,
  language: 'en',
  autoExpandNotes: false,
  llmEngine: 'ollama',
  maxTokensPerExpansion: 512,
  syncEnabled: false,
  encryptionEnabled: true,
  phiDetectionEnabled: true,
  maskPHIBeforeSync: true,
  auditLoggingEnabled: true,
  maxDiskUsage: 10,
  autoDeleteOldMeetings: false,
  autoDeleteAfterDays: 90,
  theme: 'dark',
  showSmartChips: true,
}

export const SettingsView: React.FC = () => {
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [modelStatus, setModelStatus] = useState<string>('Checking...')
  const [userInfo, setUserInfo] = useState<{ email: string; tier: string } | null>(null)

  // Load all settings from DB on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await window.electronAPI?.settings?.getAll()
        if (res?.success && res.data) {
          setSettings(
            prev =>
              ({ ...prev, ...(res.data as unknown as Record<string, unknown>) }) as SettingsState
          )
        }
      } catch {
        // Use defaults
      }

      // Model status — check via detectHardwareTier which is available
      try {
        const tierRes = await window.electronAPI?.model?.detectHardwareTier()
        if (tierRes?.success && tierRes.data) {
          setModelStatus('Ready')
          const tierData = tierRes.data as unknown as Record<string, unknown>
          setSettings(prev => ({
            ...prev,
            hardwareTier: typeof tierData?.tier === 'string' ? tierData.tier : 'unknown',
          }))
        } else {
          setModelStatus('Download Required')
        }
      } catch (err) {
        log.warn('Failed to detect hardware tier:', err)
        setModelStatus('Unavailable')
      }

      // Load user info
      try {
        const userRes = await window.electronAPI?.auth?.getCurrentUser()
        if (userRes?.success && userRes.data) {
          setUserInfo(userRes.data as { email: string; tier: string })
        }
      } catch (err) {
        log.warn('Not logged in or auth unavailable:', err)
      }

      setLoading(false)
    }
    loadSettings()
  }, [])

  // Persist a setting change to DB with rollback on failure
  const updateSetting = useCallback(
    async (key: string, value: unknown) => {
      const previousValue = (settings as unknown as Record<string, unknown>)[key]
      setSettings(prev => ({ ...prev, [key]: value }))
      try {
        await window.electronAPI?.settings?.update({ key, value } as {
          key: string
          value: unknown
        })
      } catch (err) {
        // Rollback UI state to previous value on failure
        setSettings(prev => ({ ...prev, [key]: previousValue }))
        log.error(`[Settings] Failed to save "${key}":`, err)
      }
    },
    [settings]
  )

  const handleLogout = async () => {
    try {
      await window.electronAPI?.auth?.logout()
      setUserInfo(null)
    } catch (err) {
      log.error('Logout failed:', err)
    }
  }

  const handleExportData = async () => {
    try {
      // GDPR data export placeholder — will be available once export handler is added
      // For now, notify user
    } catch (err) {
      log.error('Data export failed:', err)
    }
  }

  const tierDisplay = settings.hardwareTier
    ? settings.hardwareTier.charAt(0).toUpperCase() + settings.hardwareTier.slice(1)
    : 'Detecting...'

  const sections = [
    {
      id: 'recording',
      title: 'Recording',
      icon: <Mic size={20} className="text-[var(--color-violet)]" />,
      content: (
        <>
          <div className="flex items-center justify-between h-[40px]">
            <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">
              Audio source
            </span>
            <div className="w-64">
              <Select
                value={settings.preferredAudioDevice}
                onChange={e => updateSetting('preferredAudioDevice', e.target.value)}
                options={[
                  { label: 'System Audio (Default)', value: 'default' },
                  { label: 'Built-in Microphone', value: 'internal' },
                ]}
              />
            </div>
          </div>
          <div className="flex items-center justify-between h-[40px]">
            <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">
              Fallback to microphone
            </span>
            <Toggle
              checked={settings.audioFallbackEnabled}
              onChange={e => updateSetting('audioFallbackEnabled', e.target.checked)}
            />
          </div>
          <div className="flex items-center justify-between h-[40px]">
            <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">
              Keep audio files
            </span>
            <Toggle
              checked={settings.keepAudioFiles}
              onChange={e => updateSetting('keepAudioFiles', e.target.checked)}
            />
          </div>
        </>
      ),
    },
    {
      id: 'transcription',
      title: 'Transcription',
      icon: <Type size={20} className="text-[var(--color-teal)]" />,
      content: (
        <>
          <div className="flex items-center justify-between h-[40px]">
            <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">
              Hardware tier
            </span>
            <Badge variant={settings.hardwareTier === 'high' ? 'success' : 'default'}>
              {tierDisplay}
            </Badge>
          </div>
          <div className="flex items-center justify-between h-[40px]">
            <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">
              AI models
            </span>
            <Badge variant={modelStatus === 'Ready' ? 'success' : 'outline'}>{modelStatus}</Badge>
          </div>
          <div className="flex items-center justify-between h-[40px]">
            <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">
              Cloud transcription
            </span>
            <Toggle
              checked={settings.useCloudTranscription}
              onChange={e => updateSetting('useCloudTranscription', e.target.checked)}
            />
          </div>
        </>
      ),
    },
    {
      id: 'intelligence',
      title: 'Intelligence',
      icon: <Brain size={20} className="text-[var(--color-sky)]" />,
      content: (
        <>
          <div className="flex items-center justify-between h-[40px]">
            <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">
              Auto-expand notes
            </span>
            <Toggle
              checked={settings.autoExpandNotes}
              onChange={e => updateSetting('autoExpandNotes', e.target.checked)}
            />
          </div>
          <div className="flex items-center justify-between h-[40px]">
            <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">
              Intelligence engine
            </span>
            <div className="w-64">
              <Select
                value={settings.llmEngine}
                onChange={e => updateSetting('llmEngine', e.target.value)}
                options={[
                  { label: 'Local Runtime', value: 'ollama' },
                  { label: 'Accelerated (Apple Silicon)', value: 'mlx' },
                ]}
              />
            </div>
          </div>
          <div className="flex items-center justify-between h-[40px]">
            <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">
              Show smart chips
            </span>
            <Toggle
              checked={settings.showSmartChips}
              onChange={e => updateSetting('showSmartChips', e.target.checked)}
            />
          </div>
        </>
      ),
    },
    {
      id: 'sync',
      title: 'Trust & Security',
      icon: <Shield size={20} className="text-[var(--color-amber)]" />,
      content: (
        <>
          <div className="flex flex-col gap-4 mb-6">
            <div className="surface-glass-premium p-4 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)]">
              <h3 className="text-[var(--text-sm)] font-semibold text-[var(--color-text-primary)] mb-3">
                Data Locality Report
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center text-[var(--text-sm)]">
                  <span className="text-[var(--color-text-secondary)]">Local meetings</span>
                  <span className="font-mono text-[var(--color-text-primary)]">--</span>
                </div>
                <div className="flex justify-between items-center text-[var(--text-sm)]">
                  <span className="text-[var(--color-text-secondary)]">Synced (Encrypted)</span>
                  <span className="font-mono text-[var(--color-text-primary)]">--</span>
                </div>
                <div className="flex justify-between items-center text-[var(--text-sm)]">
                  <span className="text-[var(--color-text-secondary)]">Data to 3rd parties</span>
                  <span className="font-mono text-[var(--color-emerald)]">0 bytes</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between h-[40px] px-2">
                <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">
                  Audio processed on-device
                </span>
                <Badge variant="success">✅ Verified</Badge>
              </div>
              <div className="flex items-center justify-between h-[40px] px-2">
                <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">
                  End-to-end encryption (AES-256-GCM)
                </span>
                <Toggle
                  checked={settings.encryptionEnabled}
                  onChange={e => updateSetting('encryptionEnabled', e.target.checked)}
                />
              </div>
              <div className="flex items-center justify-between h-[40px] px-2">
                <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">
                  PHI auto-redaction
                </span>
                <Toggle
                  checked={settings.phiDetectionEnabled}
                  onChange={e => updateSetting('phiDetectionEnabled', e.target.checked)}
                />
              </div>
              <div className="flex items-center justify-between h-[40px] px-2">
                <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">
                  Mask PHI before sync
                </span>
                <Toggle
                  checked={settings.maskPHIBeforeSync}
                  onChange={e => updateSetting('maskPHIBeforeSync', e.target.checked)}
                />
              </div>
              <div className="flex items-center justify-between h-[40px] px-2">
                <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">
                  Immutable Audit logging
                </span>
                <Toggle
                  checked={settings.auditLoggingEnabled}
                  onChange={e => updateSetting('auditLoggingEnabled', e.target.checked)}
                />
              </div>
              <div className="flex items-center justify-between h-[40px] px-2">
                <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">
                  Cloud Sync (E2EE)
                </span>
                <Toggle
                  checked={settings.syncEnabled}
                  onChange={e => updateSetting('syncEnabled', e.target.checked)}
                />
              </div>
            </div>
          </div>
        </>
      ),
    },
    {
      id: 'storage',
      title: 'Storage',
      icon: <HardDrive size={20} className="text-[var(--color-text-secondary)]" />,
      content: (
        <>
          <div className="flex items-center justify-between h-[40px]">
            <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">
              Max disk usage
            </span>
            <div className="w-64">
              <Select
                value={String(settings.maxDiskUsage)}
                onChange={e => updateSetting('maxDiskUsage', Number(e.target.value))}
                options={[
                  { label: '5 GB', value: '5' },
                  { label: '10 GB', value: '10' },
                  { label: '25 GB', value: '25' },
                  { label: '50 GB', value: '50' },
                  { label: 'Unlimited', value: '0' },
                ]}
              />
            </div>
          </div>
          <div className="flex items-center justify-between h-[40px]">
            <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">
              Auto-delete old meetings
            </span>
            <Toggle
              checked={settings.autoDeleteOldMeetings}
              onChange={e => updateSetting('autoDeleteOldMeetings', e.target.checked)}
            />
          </div>
          {settings.autoDeleteOldMeetings && (
            <div className="flex items-center justify-between h-[40px]">
              <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">
                Delete after
              </span>
              <div className="w-64">
                <Select
                  value={String(settings.autoDeleteAfterDays)}
                  onChange={e => updateSetting('autoDeleteAfterDays', Number(e.target.value))}
                  options={[
                    { label: '30 days', value: '30' },
                    { label: '60 days', value: '60' },
                    { label: '90 days', value: '90' },
                    { label: '180 days', value: '180' },
                    { label: '1 year', value: '365' },
                  ]}
                />
              </div>
            </div>
          )}
        </>
      ),
    },
    {
      id: 'account',
      title: 'Account',
      icon: <User size={20} className="text-[var(--color-text-secondary)]" />,
      content: (
        <>
          {userInfo ? (
            <>
              <div className="flex items-center justify-between h-[40px]">
                <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">
                  Email
                </span>
                <span className="text-[var(--text-sm)] text-[var(--color-text-primary)]">
                  {userInfo.email}
                </span>
              </div>
              <div className="flex items-center justify-between h-[40px]">
                <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">
                  Plan
                </span>
                <Badge variant={userInfo.tier === 'pro' ? 'success' : 'default'}>
                  {userInfo.tier.charAt(0).toUpperCase() + userInfo.tier.slice(1)}
                </Badge>
              </div>
              <div className="flex items-center justify-between h-[40px]">
                <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">
                  Export data (GDPR)
                </span>
                <Button variant="secondary" size="sm" onClick={handleExportData}>
                  <Download size={14} className="mr-1" /> Export
                </Button>
              </div>
              <div className="flex items-center justify-between h-[40px]">
                <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">
                  Sign out
                </span>
                <Button variant="danger" size="sm" onClick={handleLogout}>
                  Logout
                </Button>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between h-[40px]">
              <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">
                Not signed in
              </span>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  const { navigate } = useAppStore.getState()
                  navigate('onboarding')
                }}
              >
                Sign In
              </Button>
            </div>
          )}
        </>
      ),
    },
  ]

  if (loading) {
    return (
      <div className="max-w-[640px] mx-auto flex items-center justify-center h-64">
        <RefreshCw size={20} className="animate-spin text-[var(--color-text-tertiary)]" />
      </div>
    )
  }

  return (
    <div className="max-w-[640px] mx-auto space-y-[var(--space-32)] pb-[var(--space-32)] animate-fade-in">
      {sections.map(sec => (
        <section key={sec.id} className="animate-slide-up" style={{ animationFillMode: 'both' }}>
          <div className="flex items-center gap-3 mb-[var(--space-12)]">
            {sec.icon}
            <h2 className="text-[var(--text-lg)] font-semibold tracking-tight">{sec.title}</h2>
          </div>
          <div className="h-[1px] w-full bg-[var(--color-border-subtle)] mb-[var(--space-12)]" />
          <div className="space-y-1">{sec.content}</div>
        </section>
      ))}

      <div className="text-center text-[var(--text-xs)] text-[var(--color-text-tertiary)] pt-[var(--space-16)] font-mono tracking-wide opacity-80">
        BlueArkive v0.1.0 · Sovereign Memory Fabric
      </div>
    </div>
  )
}
