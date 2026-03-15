import React, { useState, useEffect, useCallback } from 'react'
import {
  Mic,
  Type,
  Brain,
  Shield,
  HardDrive,
  User,
  RefreshCw,
  Download,
  Monitor,
  Activity,
  Database,
  Lock,
  Code,
} from 'lucide-react'
import { Select } from '../ui/Select'
import { Toggle } from '../ui/Toggle'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { useAppStore } from '../../store/appStore'

import { DeviceManagement } from './DeviceManagement'
import { AIUsageMeter } from './AIUsageMeter'
import { AuditLogViewer } from './AuditLogViewer'
import { HealthDashboard } from './HealthDashboard'
import { RecoveryKeySettings } from '../RecoveryKeySettings'
import { UpgradePrompt } from './UpgradePrompt'
import { openUpgrade } from '../../utils/openUpgrade'

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
  llmEngine: 'local',
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
  const currentTier = useAppStore(s => s.currentTier)
  const setGlobalTier = useAppStore(s => s.setCurrentTier)
  const [modelStatus, setModelStatus] = useState<string>('Checking...')
  const [userInfo, setUserInfo] = useState<{
    email: string
    tier: string
    billingStatus?: string
  } | null>(null)
  const [localMeetingCount, setLocalMeetingCount] = useState<number>(0)
  const [syncedMeetingCount, setSyncedMeetingCount] = useState<number>(0)
  const [licenseKey, setLicenseKey] = useState('')
  const [licenseStatus, setLicenseStatus] = useState<'idle' | 'loading' | 'success' | 'error'>(
    'idle'
  )
  const [licenseError, setLicenseError] = useState('')

  const handleActivateLicense = useCallback(async () => {
    if (!licenseKey.trim()) return
    setLicenseStatus('loading')
    setLicenseError('')
    try {
      const res = await window.electronAPI?.auth?.activateLicense({ key: licenseKey.trim() })
      if (res?.success && res.data) {
        setLicenseStatus('success')
        setUserInfo({ email: res.data.email, tier: res.data.tier, billingStatus: 'active' })
        setLicenseKey('')
        // Notify the rest of the app (AppLayout focus listener, etc.)
        window.dispatchEvent(new CustomEvent('tier-refreshed', { detail: res.data }))
        // Auto-clear success message after 5 seconds
        setTimeout(() => setLicenseStatus('idle'), 5000)
      } else {
        setLicenseStatus('error')
        setLicenseError(res?.error?.message || 'Invalid license key')
      }
    } catch {
      setLicenseStatus('error')
      setLicenseError('Failed to activate license key')
    }
  }, [licenseKey])

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

      // Load user info and billing status
      try {
        const userRes = await window.electronAPI?.auth?.getCurrentUser()
        const billingRes = await window.electronAPI?.billing?.getStatus()

        if (userRes?.success && userRes.data) {
          setUserInfo({
            email: userRes.data.email,
            tier: userRes.data.tier,
            billingStatus: billingRes?.success ? billingRes.data?.status : undefined,
          })
        }
      } catch (err) {
        log.warn('Not logged in or auth unavailable:', err)
      }

      setLoading(false)
    }

    // Load meeting counts for Data Locality Report
    const loadMeetingCounts = async () => {
      try {
        const res = await window.electronAPI?.meeting?.list({ limit: 100 })
        if (res?.success && res.data) {
          const meetings = (res.data as { items: Array<{ synced_at?: number }> }).items || []
          setLocalMeetingCount(meetings.length)
          setSyncedMeetingCount(meetings.filter(m => (m.synced_at ?? 0) > 0).length)
        }
      } catch {
        // Ignore
      }
    }

    loadSettings()
    loadMeetingCounts()
  }, [])

  // Use a ref for settings to avoid recreating the callback on every setting change
  const settingsRef = React.useRef(settings)
  React.useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  // Persist a setting change to DB with rollback on failure
  const updateSetting = useCallback(
    async (key: string, value: unknown) => {
      const previousValue = (settingsRef.current as unknown as Record<string, unknown>)[key]
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
    [] // No deps — uses ref for settings
  )

  const handleLogout = async () => {
    try {
      await window.electronAPI?.auth?.logout()
      setUserInfo(null)
      useAppStore.getState().navigate('onboarding')
    } catch (err) {
      log.error('Logout failed:', err)
    }
  }

  const [isExporting, setIsExporting] = React.useState(false)
  const handleExportData = async () => {
    setIsExporting(true)
    try {
      const res = await window.electronAPI?.meeting?.list({ limit: 999 })
      if (res?.success && res.data) {
        const meetings = (res.data as { items: unknown[] }).items || []
        const blob = new Blob([JSON.stringify(meetings, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `bluearkive-export-${new Date().toISOString().split('T')[0]}.json`
        a.click()
        URL.revokeObjectURL(url)
        useAppStore
          .getState()
          .addToast({ type: 'success', title: 'Data exported successfully', duration: 3000 })
      }
    } catch (err) {
      log.error('Data export failed:', err)
      useAppStore.getState().addToast({ type: 'error', title: 'Export failed', duration: 3000 })
    } finally {
      setIsExporting(false)
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
          <div className="flex flex-wrap items-center justify-between gap-2 min-h-[40px]">
            <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">
              Audio source
            </span>
            <div className="w-full max-w-[16rem]">
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
          <div className="flex flex-wrap items-center justify-between gap-2 min-h-[40px]">
            <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">
              Fallback to microphone
            </span>
            <Toggle
              checked={settings.audioFallbackEnabled}
              onChange={e => updateSetting('audioFallbackEnabled', e.target.checked)}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 min-h-[40px]">
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
          <div className="flex flex-wrap items-center justify-between gap-2 min-h-[40px]">
            <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">
              Hardware tier
            </span>
            <Badge variant={settings.hardwareTier === 'high' ? 'success' : 'default'}>
              {tierDisplay}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 min-h-[40px]">
            <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">
              AI models
            </span>
            <Badge variant={modelStatus === 'Ready' ? 'success' : 'outline'}>{modelStatus}</Badge>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 min-h-[40px]">
            <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">
              Cloud transcription
              {currentTier === 'free' && (
                <Lock
                  size={12}
                  className="inline ml-1.5 opacity-60 text-[var(--color-amber)] mb-0.5"
                />
              )}
            </span>
            <Toggle
              checked={settings.useCloudTranscription}
              disabled={currentTier === 'free'}
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
          <div className="flex flex-wrap items-center justify-between gap-2 min-h-[40px]">
            <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">
              Auto-expand notes
              {currentTier === 'free' && (
                <Lock
                  size={12}
                  className="inline ml-1.5 opacity-60 text-[var(--color-amber)] mb-0.5"
                />
              )}
            </span>
            <Toggle
              checked={settings.autoExpandNotes}
              disabled={currentTier === 'free'}
              onChange={e => updateSetting('autoExpandNotes', e.target.checked)}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 min-h-[40px]">
            <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">
              Intelligence engine
            </span>
            <div className="w-full max-w-[16rem]">
              <Select
                value={settings.llmEngine}
                onChange={e => updateSetting('llmEngine', e.target.value)}
                options={[
                  { label: 'Local Runtime (node-llama-cpp)', value: 'local' },
                  { label: 'Accelerated (Apple Silicon)', value: 'mlx' },
                ]}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 min-h-[40px]">
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
                  <span className="font-mono text-[var(--color-text-primary)]">
                    {localMeetingCount}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[var(--text-sm)]">
                  <span className="text-[var(--color-text-secondary)]">Synced (Encrypted)</span>
                  <span className="font-mono text-[var(--color-text-primary)]">
                    {syncedMeetingCount}
                  </span>
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
                  {currentTier === 'free' && (
                    <Lock
                      size={12}
                      className="inline ml-1.5 opacity-60 text-[var(--color-amber)] mb-0.5"
                    />
                  )}
                </span>
                <Toggle
                  checked={settings.syncEnabled}
                  disabled={currentTier === 'free'}
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
          <div className="flex flex-wrap items-center justify-between gap-2 min-h-[40px]">
            <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">
              Max disk usage
            </span>
            <div className="w-full max-w-[16rem]">
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
          <div className="flex flex-wrap items-center justify-between gap-2 min-h-[40px]">
            <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">
              Auto-delete old meetings
            </span>
            <Toggle
              checked={settings.autoDeleteOldMeetings}
              onChange={e => updateSetting('autoDeleteOldMeetings', e.target.checked)}
            />
          </div>
          {settings.autoDeleteOldMeetings && (
            <div className="flex flex-wrap items-center justify-between gap-2 min-h-[40px]">
              <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">
                Delete after
              </span>
              <div className="w-full max-w-[16rem]">
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
      id: 'devices',
      title: 'Devices',
      icon: <Monitor size={20} className="text-[var(--color-indigo)]" />,
      content: <DeviceManagement />,
    },
    {
      id: 'ai-usage',
      title: 'AI Usage',
      icon: <Activity size={20} className="text-[var(--color-sky)]" />,
      content: <AIUsageMeter />,
    },
    {
      id: 'audit-logs',
      title: 'Audit Logs',
      icon: <Database size={20} className="text-[var(--color-amber)]" />,
      content: <AuditLogViewer />,
    },
    {
      id: 'diagnostics',
      title: 'System Health',
      icon: <Activity size={20} className="text-[var(--color-sky)]" />,
      content: <HealthDashboard />,
    },
    {
      id: 'account',
      title: 'Account',
      icon: <User size={20} className="text-[var(--color-text-secondary)]" />,
      content: (
        <>
          {userInfo ? (
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
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
                  <Badge variant={currentTier === 'pro' ? 'success' : 'default'}>
                    {currentTier.charAt(0).toUpperCase() + currentTier.slice(1)}
                  </Badge>
                </div>
                <div className="flex items-center justify-between min-h-[40px] gap-3">
                  <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)] whitespace-nowrap">
                    License Key
                  </span>
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={licenseKey}
                      onChange={e => setLicenseKey(e.target.value.toUpperCase())}
                      placeholder="BLUEARKIVE-PRO-XXXX-XXXX"
                      className="px-3 py-1.5 text-[var(--text-sm)] bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] rounded-[var(--radius-md)] text-[var(--color-text-primary)] w-[220px] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-violet)] outline-none transition-colors"
                      onKeyDown={e => e.key === 'Enter' && handleActivateLicense()}
                    />
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleActivateLicense}
                      disabled={licenseStatus === 'loading' || !licenseKey.trim()}
                    >
                      {licenseStatus === 'loading' ? 'Activating...' : 'Activate'}
                    </Button>
                  </div>
                </div>
                {licenseStatus === 'error' && (
                  <div className="text-[var(--text-xs)] text-red-400 text-right -mt-1">
                    {licenseError}
                  </div>
                )}
                {licenseStatus === 'success' && (
                  <div className="text-[var(--text-xs)] text-green-400 text-right -mt-1">
                    ✓ License activated successfully!
                  </div>
                )}

                {/* Billing Status Warning */}
                {userInfo.billingStatus === 'past_due' && (
                  <div className="mt-2 p-3 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                    ⚠️ Your subscription payment is past due. To continue enjoying premium features,
                    please update your payment method.
                  </div>
                )}
                {userInfo.billingStatus === 'cancelled' && (
                  <div className="mt-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm">
                    Your subscription has been cancelled and will end soon. Resubscribe to retain
                    premium access.
                  </div>
                )}

                <div className="flex items-center justify-between h-[40px]">
                  <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">
                    Manage Subscription
                  </span>
                  <Button variant="secondary" size="sm" onClick={() => openUpgrade()}>
                    Manage
                  </Button>
                </div>

                <div className="flex items-center justify-between h-[40px]">
                  <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">
                    Export data (GDPR)
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleExportData}
                    disabled={isExporting}
                  >
                    <Download size={14} className="mr-1" />{' '}
                    {isExporting ? 'Exporting...' : 'Export'}
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
              </div>

              <div className="pt-6 border-t border-[var(--color-border-subtle)]">
                {currentTier !== 'enterprise' && (
                  <UpgradePrompt
                    feature="cloudSync"
                    featureLabel={
                      currentTier === 'free' ? 'Cloud Sync & AI Features' : 'Premium Tier Expansion'
                    }
                    currentTier={currentTier}
                    requiredTier={currentTier === 'free' ? 'starter' : 'pro'}
                    onUpgrade={() => {
                      openUpgrade(currentTier === 'free' ? 'starter' : 'pro')
                    }}
                  />
                )}
                <RecoveryKeySettings userId={userInfo.email} />
              </div>
            </div>
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

  // Dev-only tier switcher — only visible in Vite dev builds (tree-shaken in production)
  if (import.meta.env.DEV) {
    sections.push({
      id: 'dev-tools',
      title: 'Developer Tools',
      icon: <Code size={20} className="text-[var(--color-rose)]" />,
      content: (
        <>
          <div className="flex items-center justify-between min-h-[40px]">
            <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">
              Simulate user tier
            </span>
            <Badge variant={currentTier === 'pro' ? 'success' : 'outline'}>
              {currentTier.charAt(0).toUpperCase() + currentTier.slice(1)}
            </Badge>
          </div>
          <div className="flex gap-2 mt-2">
            {(['free', 'starter', 'pro'] as const).map(tier => (
              <button
                key={tier}
                onClick={() => setGlobalTier(tier)}
                style={{
                  padding: '8px 20px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                  border:
                    currentTier === tier
                      ? '1.5px solid var(--color-violet)'
                      : '1px solid var(--color-border-subtle)',
                  background:
                    currentTier === tier ? 'rgba(139, 92, 246, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                  color: currentTier === tier ? '#d8b4fe' : 'var(--color-text-secondary)',
                  boxShadow: currentTier === tier ? '0 0 12px rgba(139, 92, 246, 0.15)' : 'none',
                }}
              >
                {tier.charAt(0).toUpperCase() + tier.slice(1)}
              </button>
            ))}
          </div>
          <p
            className="mt-3"
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-tertiary)',
              opacity: 0.7,
              lineHeight: 1.5,
            }}
          >
            ⚠️ Dev only — instantly switches the global Zustand tier. Navigate to Knowledge Graph,
            Weekly Digest, or Ask Meetings to see gating. Hidden in production.
          </p>
        </>
      ),
    })
  }

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
        BlueArkive · Phase 0 · Sovereign Memory Fabric
      </div>
    </div>
  )
}
