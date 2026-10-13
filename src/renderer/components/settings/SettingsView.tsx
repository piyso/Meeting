import { useAppStore } from '../../store/appStore'
import { useNavigationStore } from '../../store/navigationStore'
import { useRecordingStore } from '../../store/recordingStore'

import React, { useState, useEffect, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Mic,
  Type,
  Shield,
  User,
  RefreshCw,
  Download,
  Monitor,
  Activity,
  Database,
  Code,
  Webhook,
  Volume2,
} from 'lucide-react'
import { Select } from '../ui/Select'
import { Toggle } from '../ui/Toggle'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'

import { DeviceManagement } from './DeviceManagement'
import { AIUsageMeter } from './AIUsageMeter'
import { AuditLogViewer } from './AuditLogViewer'
import { HealthDashboard } from './HealthDashboard'
import { RecoveryKeySettings } from '../RecoveryKeySettings'
import { UpgradePrompt } from './UpgradePrompt'
import { openUpgrade } from '../../utils/openUpgrade'
import { WebhookSettingsView } from '../webhooks/WebhookSettingsView'
import { AudioStudioDiagnostics } from '../audio/AudioStudioDiagnostics'

import { rendererLog } from '../../utils/logger'
const log = rendererLog.create('Settings')

interface SettingsState {
  // Recording
  preferredAudioDevice: 'system' | 'microphone'
  audioFallbackEnabled: boolean

  // Transcription
  hardwareTier: string
  language: string

  // Privacy
  phiDetectionEnabled: boolean
  maskPHIBeforeSync: boolean
  cloudEnrichmentEnabled: boolean
  crashReportsEnabled: boolean
}

const DEFAULT_SETTINGS: SettingsState = {
  preferredAudioDevice: 'system',
  audioFallbackEnabled: true,
  hardwareTier: '',
  language: 'auto',
  phiDetectionEnabled: true,
  maskPHIBeforeSync: true,
  cloudEnrichmentEnabled: false,
  crashReportsEnabled: false,
}

/** Which stored key backs each editable setting on this screen */
const STORAGE_KEYS = {
  preferredAudioDevice: 'preferredAudioDevice',
  audioFallbackEnabled: 'audioFallbackEnabled',
  language: 'transcription_language',
  phiDetectionEnabled: 'phiDetectionEnabled',
  maskPHIBeforeSync: 'maskPHIBeforeSync',
  cloudEnrichmentEnabled: 'cloudEnrichmentEnabled',
  crashReportsEnabled: 'crashReportsEnabled',
} as const satisfies Partial<Record<keyof SettingsState, string>>

type EditableSetting = keyof typeof STORAGE_KEYS

/** Build screen state from the stored key/value map, ignoring anything malformed */
function settingsFromStore(stored: Record<string, unknown>): Partial<SettingsState> {
  const next: Partial<SettingsState> = {}
  const source = stored[STORAGE_KEYS.preferredAudioDevice]
  if (source === 'system' || source === 'microphone') next.preferredAudioDevice = source
  const fallback = stored[STORAGE_KEYS.audioFallbackEnabled]
  if (typeof fallback === 'boolean') next.audioFallbackEnabled = fallback
  const language = stored[STORAGE_KEYS.language]
  if (typeof language === 'string' && language) next.language = language
  const phi = stored[STORAGE_KEYS.phiDetectionEnabled]
  if (typeof phi === 'boolean') next.phiDetectionEnabled = phi
  const mask = stored[STORAGE_KEYS.maskPHIBeforeSync]
  if (typeof mask === 'boolean') next.maskPHIBeforeSync = mask
  const enrichment = stored[STORAGE_KEYS.cloudEnrichmentEnabled]
  if (typeof enrichment === 'boolean') next.cloudEnrichmentEnabled = enrichment
  const crashReports = stored[STORAGE_KEYS.crashReportsEnabled]
  if (typeof crashReports === 'boolean') next.crashReportsEnabled = crashReports
  return next
}

type SyncSummary =
  | { state: 'loading' }
  | { state: 'signed-out' }
  | { state: 'connected'; pending: number }
  | { state: 'unavailable'; message: string; reason?: string }

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
  const [localMeetingCount, setLocalMeetingCount] = useState<number | null>(null)
  const [syncedMeetingCount, setSyncedMeetingCount] = useState<number | null>(null)
  const [syncSummary, setSyncSummary] = useState<SyncSummary>({ state: 'loading' })
  // Recovery-phrase entry, shown when this device cannot unlock sync by itself
  const [recoveryPhraseInput, setRecoveryPhraseInput] = useState('')
  const [isUnlockingSync, setIsUnlockingSync] = useState(false)
  const handleUnlockSync = useCallback(async () => {
    setIsUnlockingSync(true)
    try {
      const res = await window.electronAPI?.sync?.unlockWithRecoveryPhrase?.({
        phrase: recoveryPhraseInput,
      })
      if (!res?.success) throw new Error(res?.error?.message || 'Sync could not be unlocked')
      setRecoveryPhraseInput('')
      setSyncSummary({ state: 'connected', pending: 0 })
      useAppStore.getState().addToast({
        type: 'success',
        title: 'Encrypted sync unlocked',
        message: 'This device can now read and upload your synced meetings.',
        duration: 5000,
      })
    } catch (err) {
      useAppStore.getState().addToast({
        type: 'error',
        title: 'Sync not unlocked',
        message: err instanceof Error ? err.message : undefined,
        duration: 6000,
      })
    } finally {
      setIsUnlockingSync(false)
    }
  }, [recoveryPhraseInput])
  const queryClient = useQueryClient()
  const [isImportingMeeting, setIsImportingMeeting] = useState(false)
  const handleImportMeeting = useCallback(async () => {
    setIsImportingMeeting(true)
    try {
      const res = await window.electronAPI?.meeting?.importFile?.()
      if (!res?.success) throw new Error(res?.error?.message || 'The file could not be imported')
      if (!res.data) return // picker cancelled
      void queryClient.invalidateQueries({ queryKey: ['meetings'] })
      useAppStore.getState().addToast({
        type: res.data.status === 'imported' ? 'success' : 'info',
        title: res.data.status === 'imported' ? 'Meeting imported' : 'Already in your library',
        message: res.data.title || undefined,
        duration: 4000,
      })
      useNavigationStore.getState().navigate('meeting-detail', res.data.meetingId)
    } catch (err) {
      useAppStore.getState().addToast({
        type: 'error',
        title: 'Meeting not imported',
        message: err instanceof Error ? err.message : undefined,
        duration: 6000,
      })
    } finally {
      setIsImportingMeeting(false)
    }
  }, [queryClient])
  const [isRestoring, setIsRestoring] = useState(false)
  const handleRestoreFromCloud = useCallback(async () => {
    setIsRestoring(true)
    try {
      const res = await window.electronAPI?.sync?.restoreFromCloud?.()
      if (!res?.success || !res.data) {
        throw new Error(res?.error?.message || 'Your account could not be read')
      }
      const { meetings, records, complete, unreadable } = res.data
      const restored =
        records === 0
          ? 'Everything in your account is already on this device.'
          : `Restored ${meetings} meeting${meetings === 1 ? '' : 's'} (${records} records in all).`
      const notes = [
        complete ? '' : 'The download stopped early — run it again to fetch the rest.',
        unreadable > 0
          ? `${unreadable} record${unreadable === 1 ? '' : 's'} could not be read with this device's key.`
          : '',
      ].filter(Boolean)
      useAppStore.getState().addToast({
        type: complete ? 'success' : 'warning',
        title: complete ? 'Restore finished' : 'Restore incomplete',
        message: [restored, ...notes].join(' '),
        duration: 8000,
      })
    } catch (err) {
      useAppStore.getState().addToast({
        type: 'error',
        title: 'Restore failed',
        message: err instanceof Error ? err.message : undefined,
        duration: 6000,
      })
    } finally {
      setIsRestoring(false)
    }
  }, [])
  const [appVersion, setAppVersion] = useState<string>('')
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
    let isMounted = true

    const loadSettings = async () => {
      try {
        const res = await window.electronAPI?.settings?.getAll()
        if (!isMounted) return
        if (res?.success && res.data) {
          const stored = res.data as unknown as Record<string, unknown>
          setSettings(prev => ({ ...prev, ...settingsFromStore(stored) }))
        }
      } catch {
        // Use defaults
      }

      // Model status — check via detectHardwareTier which is available
      try {
        const tierRes = await window.electronAPI?.model?.detectHardwareTier()
        if (!isMounted) return
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
        if (isMounted) setModelStatus('Unavailable')
      }

      // Load user info and billing status
      let signedIn = false
      try {
        const userRes = await window.electronAPI?.auth?.getCurrentUser()
        const billingRes = await window.electronAPI?.billing?.getStatus()
        if (!isMounted) return

        if (userRes?.success && userRes.data) {
          signedIn = true
          setUserInfo({
            email: userRes.data.email,
            tier: userRes.data.tier,
            billingStatus: billingRes?.success ? billingRes.data?.status : undefined,
          })
        }
      } catch (err) {
        log.warn('Not logged in or auth unavailable:', err)
      }

      // Cloud sync state (read-only here: sync follows sign-in and plan)
      try {
        const syncRes = signedIn ? await window.electronAPI?.sync?.getStatus() : null
        if (!isMounted) return
        if (!signedIn) {
          setSyncSummary({ state: 'signed-out' })
        } else if (syncRes?.success && syncRes.data) {
          const data = syncRes.data
          // Builds that predate the explicit `status` field report only the queue
          setSyncSummary(
            data.status === 'disconnected'
              ? {
                  state: 'unavailable',
                  message: data.message || 'Not available on this device or plan.',
                  reason: data.reason,
                }
              : { state: 'connected', pending: data.pending ?? data.queuedEvents ?? 0 }
          )
        } else {
          setSyncSummary({
            state: 'unavailable',
            message: syncRes?.error?.message || 'Sync status is unavailable.',
          })
        }
      } catch {
        if (isMounted)
          setSyncSummary({ state: 'unavailable', message: 'Sync status is unavailable.' })
      }

      try {
        const deviceRes = await window.electronAPI?.device?.getCurrent?.()
        const version = deviceRes?.success ? deviceRes.data?.appVersion : undefined
        if (isMounted && typeof version === 'string') setAppVersion(version)
      } catch {
        // version label is optional
      }

      if (isMounted) setLoading(false)
    }

    // Load meeting counts for the data location report
    const loadMeetingCounts = async () => {
      try {
        const PAGE = 200
        let offset = 0
        let total = 0
        let synced = 0
        // Page through everything — a single capped page under-reported the totals
        for (let page = 0; page < 500; page++) {
          const res = await window.electronAPI?.meeting?.list({ limit: PAGE, offset })
          if (!isMounted || !res?.success || !res.data) break
          const items = (res.data as { items?: Array<{ synced_at?: number | null }> }).items || []
          total += items.length
          synced += items.filter(m => (m.synced_at ?? 0) > 0).length
          if (items.length < PAGE) break
          offset += PAGE
        }
        if (!isMounted) return
        setLocalMeetingCount(total)
        setSyncedMeetingCount(synced)
      } catch {
        // Counts stay unknown ("—")
      }
    }

    loadSettings()
    loadMeetingCounts()

    return () => {
      isMounted = false
    }
  }, [])

  // Use a ref for settings to avoid recreating the callback on every setting change
  const settingsRef = React.useRef(settings)
  React.useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  // Persist a setting change to DB with rollback on failure
  const updateSetting = useCallback(
    async <K extends EditableSetting>(key: K, value: SettingsState[K]) => {
      const previousValue = settingsRef.current[key]
      setSettings(prev => ({ ...prev, [key]: value }))
      try {
        const res = await window.electronAPI?.settings?.update({
          key: STORAGE_KEYS[key],
          value,
        } as { key: string; value: unknown })
        // The handler reports failures in the response — it does not throw
        if (!res?.success) throw new Error(res?.error?.message || 'The setting was not saved')
      } catch (err) {
        // Rollback UI state to previous value on failure
        setSettings(prev => ({ ...prev, [key]: previousValue }))
        log.error(`[Settings] Failed to save "${key}":`, err)
        useAppStore.getState().addToast({
          type: 'error',
          title: 'Setting not saved',
          message: err instanceof Error ? err.message : undefined,
          duration: 4000,
        })
      }
    },
    [] // No deps — uses ref for settings
  )

  const handleLogout = React.useCallback(async () => {
    const recordingState = useRecordingStore.getState().recordingState
    if (recordingState !== 'idle') {
      useAppStore.getState().addToast({
        type: 'warning',
        title: 'Recording in progress',
        message: 'Stop the recording before signing out.',
        duration: 4000,
      })
      return
    }
    try {
      const res = await window.electronAPI?.auth?.logout()
      if (res && !res.success) throw new Error(res.error?.message || 'Sign out failed')
      setUserInfo(null)
      useNavigationStore.getState().navigate('onboarding')
    } catch (err) {
      log.error('Logout failed:', err)
      useAppStore.getState().addToast({
        type: 'error',
        title: 'Could not sign out',
        message: err instanceof Error ? err.message : undefined,
        duration: 4000,
      })
    }
  }, [])

  const [isExporting, setIsExporting] = React.useState(false)
  const handleExportData = React.useCallback(async () => {
    setIsExporting(true)
    try {
      // The main process writes the file itself (after asking where): the
      // whole library is too much to pass through here as one string.
      const res = await window.electronAPI?.export?.userData({ format: 'json' })
      if (!res?.success || !res.data) {
        throw new Error(res?.error?.message || 'Export failed')
      }
      // No path = the save dialog was cancelled; nothing was written.
      if (!res.data.filePath) return
      const meetings = res.data.stats?.meetings
      useAppStore.getState().addToast({
        type: 'success',
        title: 'Data exported',
        message: `${typeof meetings === 'number' ? `${meetings} meeting${meetings === 1 ? '' : 's'} saved` : 'Saved'} as ${res.data.filePath.split(/[\\/]/).pop()}`,
        duration: 5000,
      })
      window.electronAPI?.shell?.showItemInFolder?.(res.data.filePath)
    } catch (err) {
      log.error('Data export failed:', err)
      useAppStore.getState().addToast({
        type: 'error',
        title: 'Export failed',
        message: err instanceof Error ? err.message : undefined,
        duration: 4000,
      })
    } finally {
      setIsExporting(false)
    }
  }, [])

  // Erase everything (GDPR Art. 17). Requires typing DELETE — there is no undo.
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = React.useState('')
  const [isDeleting, setIsDeleting] = React.useState(false)
  const handleDeleteAllData = React.useCallback(async () => {
    setIsDeleting(true)
    try {
      const res = await window.electronAPI?.export?.deleteAllData()
      if (!res?.success) throw new Error(res?.error?.message || 'Deletion failed')
      try {
        // Renderer-side caches of the deleted content
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i)
          if (key?.startsWith('bluearkive:')) localStorage.removeItem(key)
        }
      } catch {
        // storage unavailable
      }
      useAppStore.getState().addToast({
        type: 'success',
        title: 'All data deleted',
        message: res.data?.message,
        duration: 6000,
      })
      setDeleteConfirmOpen(false)
      setDeleteConfirmText('')
      setUserInfo(null)
      // Start from a clean app state
      window.location.reload()
    } catch (err) {
      log.error('Delete all data failed:', err)
      useAppStore.getState().addToast({
        type: 'error',
        title: 'Could not delete data',
        message: err instanceof Error ? err.message : undefined,
        duration: 6000,
      })
    } finally {
      setIsDeleting(false)
    }
  }, [])

  // System (loopback) audio: Windows always; macOS 13+ once Screen Recording
  // permission is granted. Linux has no loopback source in this build.
  const systemAudioSupported = window.electronAPI?.platform !== 'linux'

  const tierDisplay = settings.hardwareTier
    ? settings.hardwareTier.charAt(0).toUpperCase() + settings.hardwareTier.slice(1)
    : 'Detecting...'

  const sections = [
    {
      id: 'recording',
      title: 'Recording',
      icon: <Mic size={20} className="text-[var(--color-violet)]" />,
      content: (
        <div className="flex flex-col gap-8">
          <div>
            <h4 className="pl-4 mb-3 text-[11px] uppercase tracking-widest text-[var(--color-text-tertiary)] font-bold">
              Audio Inputs
            </h4>
            <div className="surface-glass-premium border border-[var(--color-border-subtle)] rounded-3xl p-2 shadow-sm">
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center justify-between gap-6 px-5 py-4 rounded-2xl hover:bg-[rgba(255,255,255,0.03)] transition-colors">
                  <span className="text-[15px] font-medium text-[var(--color-text-primary)]">
                    Audio source
                    <span className="block text-[12px] font-normal text-[var(--color-text-tertiary)] mt-0.5">
                      {!systemAudioSupported
                        ? 'Recording the computer\u2019s own audio is not available on Linux in this version. On this computer BlueArkive records your microphone.'
                        : settings.preferredAudioDevice === 'system'
                          ? 'Records what your computer plays — everyone in the call.'
                          : 'Records only your microphone.'}
                    </span>
                  </span>
                  <div className="w-full max-w-[16rem]">
                    <Select
                      aria-label="Audio source"
                      value={systemAudioSupported ? settings.preferredAudioDevice : 'microphone'}
                      disabled={!systemAudioSupported}
                      onChange={e =>
                        updateSetting(
                          'preferredAudioDevice',
                          e.target.value === 'microphone' ? 'microphone' : 'system'
                        )
                      }
                      options={
                        systemAudioSupported
                          ? [
                              { label: 'System audio (meeting participants)', value: 'system' },
                              { label: 'Microphone only', value: 'microphone' },
                            ]
                          : [{ label: 'Microphone', value: 'microphone' }]
                      }
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-6 px-5 py-4 rounded-2xl hover:bg-[rgba(255,255,255,0.03)] transition-colors">
                  <span className="text-[15px] font-medium text-[var(--color-text-primary)]">
                    Fallback to microphone
                    <span className="block text-[12px] font-normal text-[var(--color-text-tertiary)] mt-0.5">
                      If system audio can&apos;t be captured, record the microphone instead of
                      failing.
                    </span>
                  </span>
                  <Toggle
                    aria-label="Fallback to microphone"
                    checked={
                      systemAudioSupported &&
                      settings.preferredAudioDevice === 'system' &&
                      settings.audioFallbackEnabled
                    }
                    disabled={!systemAudioSupported || settings.preferredAudioDevice !== 'system'}
                    onChange={e => updateSetting('audioFallbackEnabled', e.target.checked)}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'audio-studio',
      title: 'Audio Studio',
      icon: <Volume2 size={20} className="text-[var(--color-emerald)]" />,
      content: <AudioStudioDiagnostics />,
      isCustomLayout: true,
    },
    {
      id: 'transcription',
      title: 'Transcription',
      icon: <Type size={20} className="text-[var(--color-teal)]" />,
      content: (
        <div className="flex flex-col gap-8">
          <div>
            <h4 className="pl-4 mb-3 text-[11px] uppercase tracking-widest text-[var(--color-text-tertiary)] font-bold">
              Hardware & Models
            </h4>
            <div className="surface-glass-premium border border-[var(--color-border-subtle)] rounded-3xl p-2 shadow-sm">
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center justify-between gap-6 px-5 py-4 rounded-2xl hover:bg-[rgba(255,255,255,0.03)] transition-colors">
                  <span className="text-[15px] font-medium text-[var(--color-text-primary)]">
                    Hardware tier
                  </span>
                  <Badge variant={settings.hardwareTier === 'high' ? 'success' : 'default'}>
                    {tierDisplay}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-6 px-5 py-4 rounded-2xl hover:bg-[rgba(255,255,255,0.03)] transition-colors">
                  <span className="text-[15px] font-medium text-[var(--color-text-primary)]">
                    AI models
                  </span>
                  <Badge variant={modelStatus === 'Ready' ? 'success' : 'outline'}>
                    {modelStatus}
                  </Badge>
                </div>
              </div>
            </div>
          </div>
          <div>
            <h4 className="pl-4 mb-3 text-[11px] uppercase tracking-widest text-[var(--color-text-tertiary)] font-bold">
              Language
            </h4>
            <div className="surface-glass-premium border border-[var(--color-border-subtle)] rounded-3xl p-2 shadow-sm">
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center justify-between gap-6 px-5 py-4 rounded-2xl hover:bg-[rgba(255,255,255,0.03)] transition-colors">
                  <span className="text-[15px] font-medium text-[var(--color-text-primary)]">
                    Transcription language
                    <span className="block text-[12px] font-normal text-[var(--color-text-tertiary)] mt-0.5">
                      Applies to the next recording.
                    </span>
                  </span>
                  <div className="w-full max-w-[16rem]">
                    <Select
                      aria-label="Transcription language"
                      value={settings.language}
                      onChange={e => updateSetting('language', e.target.value)}
                      options={[
                        { label: '🌐 Auto-detect', value: 'auto' },
                        { label: '🇬🇧 English', value: 'en' },
                        { label: '🇮🇳 हिन्दी (Hindi)', value: 'hi' },
                        { label: '🇯🇵 日本語 (Japanese)', value: 'ja' },
                        { label: '🇫🇷 Français (French)', value: 'fr' },
                        { label: '🇪🇸 Español (Spanish)', value: 'es' },
                        { label: '🇩🇪 Deutsch (German)', value: 'de' },
                        { label: '🇧🇷 Português (Portuguese)', value: 'pt' },
                        { label: '🇰🇷 한국어 (Korean)', value: 'ko' },
                        { label: '🇸🇦 العربية (Arabic)', value: 'ar' },
                        { label: '🇮🇹 Italiano (Italian)', value: 'it' },
                        { label: '🇳🇱 Nederlands (Dutch)', value: 'nl' },
                        { label: '🇨🇳 中文 (Chinese)', value: 'zh' },
                      ]}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'sync',
      title: 'Trust & Security',
      icon: <Shield size={20} className="text-[var(--color-amber)]" />,
      content: (
        <div className="flex flex-col gap-8">
          <div>
            <h4 className="pl-4 mb-3 text-[11px] uppercase tracking-widest text-[var(--color-text-tertiary)] font-bold">
              Where your data lives
            </h4>
            <div className="surface-glass-premium border border-[var(--color-border-subtle)] rounded-3xl p-2 shadow-sm">
              <div className="flex flex-col gap-1 p-3">
                <div className="flex justify-between items-center text-[14px]">
                  <span className="text-[var(--color-text-secondary)]">
                    Meetings on this device
                  </span>
                  <span className="font-mono font-medium text-[var(--color-text-primary)]">
                    {localMeetingCount ?? '—'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[14px] mt-3">
                  <span className="text-[var(--color-text-secondary)]">
                    Also synced to your account (encrypted)
                  </span>
                  <span className="font-mono font-medium text-[var(--color-text-primary)]">
                    {syncedMeetingCount ?? '—'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h4 className="pl-4 mb-3 text-[11px] uppercase tracking-widest text-[var(--color-text-tertiary)] font-bold">
              Processing
            </h4>
            <div className="surface-glass-premium border border-[var(--color-border-subtle)] rounded-3xl p-2 shadow-sm">
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-6 px-5 py-4 rounded-2xl hover:bg-[rgba(255,255,255,0.03)] transition-colors">
                  <span className="text-[15px] font-medium text-[var(--color-text-primary)]">
                    Audio & transcription
                    <span className="block text-[12px] font-normal text-[var(--color-text-tertiary)] mt-0.5">
                      Speech is transcribed by the model on this computer. Audio is not uploaded.
                    </span>
                  </span>
                  <Badge variant="success">On this device</Badge>
                </div>
                <div className="flex items-center justify-between gap-6 px-5 py-4 rounded-2xl hover:bg-[rgba(255,255,255,0.03)] transition-colors">
                  <span className="text-[15px] font-medium text-[var(--color-text-primary)]">
                    Sync encryption (AES-256-GCM)
                    <span className="block text-[12px] font-normal text-[var(--color-text-tertiary)] mt-0.5">
                      Synced content is encrypted on this device before upload. Always on.
                    </span>
                  </span>
                  <Badge variant="success">Always on</Badge>
                </div>
                <div className="flex items-center justify-between gap-6 px-5 py-4 rounded-2xl hover:bg-[rgba(255,255,255,0.03)] transition-colors">
                  <span className="text-[15px] font-medium text-[var(--color-text-primary)]">
                    Audit logging
                    <span className="block text-[12px] font-normal text-[var(--color-text-tertiary)] mt-0.5">
                      Changes to your data are recorded in the audit log below.
                    </span>
                  </span>
                  <Badge variant="success">Always on</Badge>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h4 className="pl-4 mb-3 text-[11px] uppercase tracking-widest text-[var(--color-text-tertiary)] font-bold">
              Privacy
            </h4>
            <div className="surface-glass-premium border border-[var(--color-border-subtle)] rounded-3xl p-2 shadow-sm">
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-6 px-5 py-4 rounded-2xl hover:bg-[rgba(255,255,255,0.03)] transition-colors">
                  <span className="text-[15px] font-medium text-[var(--color-text-primary)]">
                    Detect health information (PHI)
                    <span className="block text-[12px] font-normal text-[var(--color-text-tertiary)] mt-0.5">
                      Checks content for protected health information before it is synced.
                    </span>
                  </span>
                  <Toggle
                    aria-label="Detect health information (PHI)"
                    checked={settings.phiDetectionEnabled}
                    onChange={e => updateSetting('phiDetectionEnabled', e.target.checked)}
                  />
                </div>
                <div className="flex items-center justify-between gap-6 px-5 py-4 rounded-2xl hover:bg-[rgba(255,255,255,0.03)] transition-colors">
                  <span className="text-[15px] font-medium text-[var(--color-text-primary)]">
                    Mask PHI before sync
                    <span className="block text-[12px] font-normal text-[var(--color-text-tertiary)] mt-0.5">
                      Replaces detected health information before content leaves this device.
                    </span>
                  </span>
                  <Toggle
                    aria-label="Mask PHI before sync"
                    checked={settings.phiDetectionEnabled && settings.maskPHIBeforeSync}
                    disabled={!settings.phiDetectionEnabled}
                    onChange={e => updateSetting('maskPHIBeforeSync', e.target.checked)}
                  />
                </div>
                <div className="flex items-center justify-between gap-6 px-5 py-4 rounded-2xl hover:bg-[rgba(255,255,255,0.03)] transition-colors">
                  <span className="text-[15px] font-medium text-[var(--color-text-primary)]">
                    Cloud analysis of meeting text
                    <span className="block text-[12px] font-normal text-[var(--color-text-tertiary)] mt-0.5">
                      Lets cloud entity extraction and the knowledge graph read meeting text. That
                      text is sent without end-to-end encryption. Off: these run on this device
                      only.
                    </span>
                  </span>
                  <Toggle
                    aria-label="Cloud analysis of meeting text"
                    checked={settings.cloudEnrichmentEnabled}
                    onChange={e => updateSetting('cloudEnrichmentEnabled', e.target.checked)}
                  />
                </div>
                <div className="flex items-center justify-between gap-6 px-5 py-4 rounded-2xl hover:bg-[rgba(255,255,255,0.03)] transition-colors">
                  <span className="text-[15px] font-medium text-[var(--color-text-primary)]">
                    Send crash reports
                    <span className="block text-[12px] font-normal text-[var(--color-text-tertiary)] mt-0.5">
                      When the app hits an error, sends the error and where in the code it happened,
                      with the app version and your operating system. Never meeting content, file
                      names or your account details.
                    </span>
                  </span>
                  <Toggle
                    aria-label="Send crash reports"
                    checked={settings.crashReportsEnabled}
                    onChange={e => updateSetting('crashReportsEnabled', e.target.checked)}
                  />
                </div>
              </div>
            </div>
          </div>

          <div>
            <h4 className="pl-4 mb-3 text-[11px] uppercase tracking-widest text-[var(--color-text-tertiary)] font-bold">
              Cloud Sync
            </h4>
            <div className="surface-glass-premium border border-[var(--color-border-subtle)] rounded-3xl p-2 shadow-sm">
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-6 px-5 py-4 rounded-2xl hover:bg-[rgba(255,255,255,0.03)] transition-colors">
                  <span className="text-[15px] font-medium text-[var(--color-text-primary)]">
                    Encrypted sync
                    <span className="block text-[12px] font-normal text-[var(--color-text-tertiary)] mt-0.5">
                      {syncSummary.state === 'connected'
                        ? syncSummary.pending > 0
                          ? `${syncSummary.pending} change${syncSummary.pending === 1 ? '' : 's'} waiting to upload.`
                          : 'Everything is up to date.'
                        : syncSummary.state === 'signed-out'
                          ? 'Sign in to sync your meetings across devices.'
                          : syncSummary.state === 'unavailable'
                            ? syncSummary.message
                            : 'Checking…'}
                    </span>
                  </span>
                  <Badge variant={syncSummary.state === 'connected' ? 'success' : 'outline'}>
                    {syncSummary.state === 'connected'
                      ? 'On'
                      : syncSummary.state === 'loading'
                        ? '…'
                        : 'Off'}
                  </Badge>
                </div>
                {syncSummary.state === 'unavailable' &&
                  syncSummary.reason === 'recovery_phrase_required' && (
                    <div className="flex flex-col gap-3 px-5 py-4 rounded-2xl">
                      <label
                        htmlFor="sync-recovery-phrase"
                        className="text-[13px] font-medium text-[var(--color-text-primary)]"
                      >
                        Recovery phrase
                        <span className="block text-[12px] font-normal text-[var(--color-text-tertiary)] mt-0.5">
                          The 24 words you saved when you set up BlueArkive. They unlock your synced
                          meetings on this device and are not sent anywhere.
                        </span>
                      </label>
                      <textarea
                        id="sync-recovery-phrase"
                        rows={3}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        value={recoveryPhraseInput}
                        onChange={e => setRecoveryPhraseInput(e.target.value)}
                        placeholder="word1 word2 word3 …"
                        className="w-full rounded-xl border border-[var(--color-border-subtle)] bg-transparent px-3 py-2 text-[13px] font-mono text-[var(--color-text-primary)] outline-none focus:border-[var(--color-violet)]"
                      />
                      <div>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={isUnlockingSync || recoveryPhraseInput.trim().length === 0}
                          onClick={handleUnlockSync}
                        >
                          {isUnlockingSync ? 'Unlocking…' : 'Unlock sync'}
                        </Button>
                      </div>
                    </div>
                  )}
                {(syncSummary.state === 'connected' ||
                  (syncSummary.state === 'unavailable' &&
                    syncSummary.reason !== 'recovery_phrase_required' &&
                    syncSummary.reason !== 'password_required')) && (
                  <div className="flex items-center justify-between gap-6 px-5 py-4 rounded-2xl hover:bg-[rgba(255,255,255,0.03)] transition-colors">
                    <span className="text-[15px] font-medium text-[var(--color-text-primary)]">
                      Restore from cloud
                      <span className="block text-[12px] font-normal text-[var(--color-text-tertiary)] mt-0.5">
                        Downloads meetings stored in your account that are missing on this device.
                        Nothing already here is changed or removed.
                      </span>
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={isRestoring}
                      onClick={handleRestoreFromCloud}
                    >
                      {isRestoring ? 'Restoring…' : 'Restore'}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'automations',
      title: 'Automations',
      icon: <Webhook size={20} className="text-[var(--color-violet)]" />,
      content: <WebhookSettingsView />,
      isCustomLayout: true,
    },
    {
      id: 'devices',
      title: 'Devices',
      icon: <Monitor size={20} className="text-[var(--color-indigo)]" />,
      content: <DeviceManagement />,
      isCustomLayout: true,
    },
    {
      id: 'ai-usage',
      title: 'AI Usage',
      icon: <Activity size={20} className="text-[var(--color-rose)]" />,
      content: <AIUsageMeter />,
      isCustomLayout: true,
    },
    {
      id: 'audit-logs',
      title: 'Audit Logs',
      icon: <Database size={20} className="text-[var(--color-slate)]" />,
      content: <AuditLogViewer />,
      isCustomLayout: true,
    },
    {
      id: 'system-health',
      title: 'System Health',
      icon: <Activity size={20} className="text-[var(--color-emerald)]" />,
      content: <HealthDashboard />,
      isCustomLayout: true,
    },
    {
      id: 'account',
      title: 'Account',
      icon: <User size={20} className="text-[var(--color-text-secondary)]" />,
      content: (
        <div className="flex flex-col gap-8">
          {userInfo ? (
            <>
              <div>
                <h4 className="pl-4 mb-3 text-[11px] uppercase tracking-widest text-[var(--color-text-tertiary)] font-bold">
                  Profile
                </h4>
                <div className="surface-glass-premium border border-[var(--color-border-subtle)] rounded-3xl p-2 shadow-sm">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between px-5 py-4 rounded-2xl hover:bg-[rgba(255,255,255,0.03)] transition-colors">
                      <span className="text-[15px] font-medium text-[var(--color-text-primary)]">
                        Email
                      </span>
                      <span className="text-[14px] text-[var(--color-text-secondary)]">
                        {userInfo.email}
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-5 py-4 rounded-2xl hover:bg-[rgba(255,255,255,0.03)] transition-colors">
                      <span className="text-[15px] font-medium text-[var(--color-text-primary)]">
                        Plan
                      </span>
                      <Badge variant={currentTier === 'free' ? 'default' : 'success'}>
                        {currentTier.charAt(0).toUpperCase() + currentTier.slice(1)}
                      </Badge>
                    </div>
                    <div className="flex flex-col px-5 py-4 rounded-2xl hover:bg-[rgba(255,255,255,0.03)] transition-colors justify-center gap-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[15px] font-medium text-[var(--color-text-primary)] whitespace-nowrap">
                          License Key
                        </span>
                        <div className="flex gap-2 items-center">
                          <input
                            type="text"
                            value={licenseKey}
                            onChange={e => {
                              setLicenseKey(e.target.value.toUpperCase())
                              if (licenseStatus === 'error') setLicenseStatus('idle')
                            }}
                            aria-label="License key"
                            maxLength={64}
                            spellCheck={false}
                            autoComplete="off"
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
                        <div className="mt-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                          ⚠️ Your subscription payment is past due. To continue enjoying premium
                          features, please update your payment method.
                        </div>
                      )}
                      {userInfo.billingStatus === 'cancelled' && (
                        <div className="mt-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm">
                          Your subscription has been cancelled and will end soon. Resubscribe to
                          retain premium access.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="pl-4 mb-3 text-[11px] uppercase tracking-widest text-[var(--color-text-tertiary)] font-bold">
                  Actions
                </h4>
                <div className="surface-glass-premium border border-[var(--color-border-subtle)] rounded-3xl p-2 shadow-sm">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between px-5 py-4 rounded-2xl hover:bg-[rgba(255,255,255,0.03)] transition-colors">
                      <span className="text-[15px] font-medium text-[var(--color-text-primary)]">
                        Manage Subscription
                      </span>
                      <Button variant="secondary" size="sm" onClick={() => openUpgrade()}>
                        Manage
                      </Button>
                    </div>

                    <div className="flex items-center justify-between px-5 py-4 rounded-2xl hover:bg-[rgba(255,255,255,0.03)] transition-colors">
                      <span className="text-[15px] font-medium text-[var(--color-text-primary)]">
                        Export my data
                        <span className="block text-[12px] font-normal text-[var(--color-text-tertiary)] mt-0.5">
                          Meetings, transcripts, notes and action items as a JSON file.
                        </span>
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
                    <div className="flex items-center justify-between px-5 py-4 rounded-2xl hover:bg-[rgba(255,255,255,0.03)] transition-colors">
                      <span className="text-[15px] font-medium text-[var(--color-text-primary)]">
                        Import a meeting file
                        <span className="block text-[12px] font-normal text-[var(--color-text-tertiary)] mt-0.5">
                          Adds a meeting exported from BlueArkive as a .pnotes file.
                        </span>
                      </span>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleImportMeeting}
                        disabled={isImportingMeeting}
                      >
                        {isImportingMeeting ? 'Importing...' : 'Import…'}
                      </Button>
                    </div>
                    <div className="flex items-center justify-between px-5 py-4 rounded-2xl hover:bg-[rgba(255,255,255,0.03)] transition-colors">
                      <span className="text-[15px] font-medium text-[var(--color-text-primary)]">
                        Sign out
                      </span>
                      <Button variant="danger" size="sm" onClick={handleLogout}>
                        Logout
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="surface-glass-premium border border-[var(--color-border-subtle)] rounded-3xl p-2 shadow-sm">
              <div className="flex items-center justify-between px-5 py-4 rounded-2xl hover:bg-[rgba(255,255,255,0.03)] transition-colors">
                <span className="text-[15px] font-medium text-[var(--color-text-primary)]">
                  Not signed in
                </span>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    const navigate = useNavigationStore.getState().navigate
                    navigate('onboarding')
                  }}
                >
                  Sign In
                </Button>
              </div>
              <div className="flex items-center justify-between px-5 py-4 rounded-2xl hover:bg-[rgba(255,255,255,0.03)] transition-colors">
                <span className="text-[15px] font-medium text-[var(--color-text-primary)]">
                  Export my data
                  <span className="block text-[12px] font-normal text-[var(--color-text-tertiary)] mt-0.5">
                    Meetings, transcripts, notes and action items as a JSON file.
                  </span>
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleExportData}
                  disabled={isExporting}
                >
                  <Download size={14} className="mr-1" /> {isExporting ? 'Exporting...' : 'Export'}
                </Button>
              </div>
              <div className="flex items-center justify-between px-5 py-4 rounded-2xl hover:bg-[rgba(255,255,255,0.03)] transition-colors">
                <span className="text-[15px] font-medium text-[var(--color-text-primary)]">
                  Import a meeting file
                  <span className="block text-[12px] font-normal text-[var(--color-text-tertiary)] mt-0.5">
                    Adds a meeting exported from BlueArkive as a .pnotes file.
                  </span>
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleImportMeeting}
                  disabled={isImportingMeeting}
                >
                  {isImportingMeeting ? 'Importing...' : 'Import…'}
                </Button>
              </div>
            </div>
          )}

          {/* Erase everything — available with or without an account */}
          <div>
            <h4 className="pl-4 mb-3 text-[11px] uppercase tracking-widest text-[var(--color-rose)] font-bold">
              Danger Zone
            </h4>
            <div className="surface-glass-premium border border-[rgba(244,63,94,0.25)] rounded-3xl p-2 shadow-sm">
              <div className="flex flex-col gap-3 px-5 py-4">
                <div className="flex items-center justify-between gap-6">
                  <span className="text-[15px] font-medium text-[var(--color-text-primary)]">
                    Delete all my data
                    <span className="block text-[12px] font-normal text-[var(--color-text-tertiary)] mt-0.5">
                      Permanently removes every meeting, transcript and note from this device
                      {userInfo ? ' and requests deletion of your synced data' : ''}. This cannot be
                      undone.
                    </span>
                  </span>
                  {!deleteConfirmOpen && (
                    <Button variant="danger" size="sm" onClick={() => setDeleteConfirmOpen(true)}>
                      Delete…
                    </Button>
                  )}
                </div>
                {deleteConfirmOpen && (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={deleteConfirmText}
                      onChange={e => setDeleteConfirmText(e.target.value)}
                      placeholder="Type DELETE to confirm"
                      aria-label="Type DELETE to confirm"
                      autoFocus
                      spellCheck={false}
                      autoComplete="off"
                      className="px-3 py-1.5 text-[var(--text-sm)] bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] rounded-[var(--radius-md)] text-[var(--color-text-primary)] w-[220px] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-rose)] outline-none transition-colors"
                    />
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={handleDeleteAllData}
                      disabled={deleteConfirmText.trim() !== 'DELETE' || isDeleting}
                    >
                      {isDeleting ? 'Deleting…' : 'Delete everything'}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={isDeleting}
                      onClick={() => {
                        setDeleteConfirmOpen(false)
                        setDeleteConfirmText('')
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
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
          <div className="flex items-center gap-3 mb-[var(--space-16)] px-2">
            {sec.icon}
            <h2 className="text-[var(--text-lg)] font-semibold tracking-tight">{sec.title}</h2>
          </div>
          {sec.content}
        </section>
      ))}

      {userInfo && (
        <section className="animate-slide-up space-y-4" style={{ animationFillMode: 'both' }}>
          {(currentTier === 'free' || currentTier === 'starter') && (
            <UpgradePrompt
              feature="cloudSync"
              featureLabel={
                currentTier === 'free'
                  ? 'Cloud Sync & AI Features'
                  : 'Knowledge Graph & Ask Meetings'
              }
              currentTier={currentTier}
              requiredTier={currentTier === 'free' ? 'starter' : 'pro'}
              onUpgrade={() => {
                openUpgrade(currentTier === 'free' ? 'starter' : 'pro')
              }}
            />
          )}
          <RecoveryKeySettings userId={userInfo.email} />
        </section>
      )}

      <div className="text-center text-[var(--text-xs)] text-[var(--color-text-tertiary)] pt-[var(--space-16)] font-mono tracking-wide opacity-80">
        BlueArkive{appVersion ? ` v${appVersion}` : ''}
      </div>
    </div>
  )
}
