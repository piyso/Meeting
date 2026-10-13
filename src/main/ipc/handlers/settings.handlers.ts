import { ipcMain } from 'electron'
import { getDatabase } from '../../database/connection'
import { getASRService } from '../../services/ASRService'
import { CrashReporter } from '../../services/CrashReporter'
import { CRASH_REPORTS_SETTING, isCrashReportingAllowed } from '../../services/privacySettings'

const isBoolean = (v: unknown): boolean => typeof v === 'boolean'

/** Value checks for settings whose readers expect a specific shape */
const SETTING_VALIDATORS: Record<string, (value: unknown) => boolean> = {
  preferredAudioDevice: v => v === 'system' || v === 'microphone',
  audioFallbackEnabled: isBoolean,
  onboarding_completed: isBoolean,
  local_only_mode: isBoolean,
  phiDetectionEnabled: isBoolean,
  maskPHIBeforeSync: isBoolean,
  cloudEnrichmentEnabled: isBoolean,
  crashReportsEnabled: isBoolean,
  // 'auto' or a short language tag such as 'en' / 'pt-BR'
  transcription_language: v =>
    typeof v === 'string' && /^[A-Za-z]{2,8}(-[A-Za-z0-9]{2,8})?$/.test(v),
}

export function registerSettingsHandlers(): void {
  // settings:getAll — Get all settings as key-value map
  ipcMain.handle('settings:getAll', async () => {
    try {
      const db = getDatabase()
      const settings = db.prepare('SELECT key, value FROM settings').all() as Array<{
        key: string
        value: string
      }>
      const result: Record<string, unknown> = {}
      for (const row of settings) {
        try {
          result[row.key] = JSON.parse(row.value)
        } catch {
          result[row.key] = row.value
        }
      }
      return { success: true, data: result }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'SETTINGS_GET_ALL_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // settings:get — Get a single setting by key
  ipcMain.handle('settings:get', async (_, params) => {
    try {
      if (!params?.key) {
        return {
          success: false,
          error: { code: 'INVALID_PARAMS', message: 'key is required', timestamp: Date.now() },
        }
      }
      const db = getDatabase()
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(params.key) as
        | { value: string }
        | undefined
      if (!row) return { success: true, data: null }
      try {
        return { success: true, data: JSON.parse(row.value) }
      } catch {
        return { success: true, data: row.value }
      }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'SETTINGS_GET_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // settings:update — Set a single key-value pair
  // C-5 AUDIT: Key allowlist prevents XSS/extension abuse of internal settings
  const ALLOWED_SETTINGS_KEYS = new Set([
    // User preferences
    'transcription_language',
    'theme',
    'autoSaveInterval',
    'sidebarCollapsed',
    'defaultNamespace',
    'showTimestamps',
    'showSpeakerLabels',
    'notify_action_items',
    'notify_sentiment_alerts',
    'auto_generate_digest',
    // Feature flags (prefixed)
    'feature:phi_detection',
    'feature:sentiment_analysis',
    'feature:knowledge_graph',
    'feature:webhooks',
    'feature:ai_expansion',
    'feature:calendar_sync',
    // Security/privacy
    'phiDetectionEnabled',
    'maskPHIBeforeSync',
    // Consent to send meeting text to cloud analysis unencrypted (default off)
    'cloudEnrichmentEnabled',
    // Consent to send crash reports (default off)
    'crashReportsEnabled',
    // Recording (read by the renderer when a recording starts)
    'preferredAudioDevice',
    'audioFallbackEnabled',
    // Cloud transcription
    'cloud_transcription_enabled',
    'deepgram_language',
    // Webhook/integration
    'webhook_enabled',
    // Calendar
    'calendar_sync_enabled',
    'calendar_sync_interval',
    // System state (written by onboarding flow)
    'onboarding_completed',
    // The user chose to use the app without an account (local-only)
    'local_only_mode',
  ])

  ipcMain.handle('settings:update', async (_, params) => {
    try {
      if (!params?.key || params?.value === undefined) {
        return {
          success: false,
          error: {
            code: 'INVALID_PARAMS',
            message: 'key and value are required',
            timestamp: Date.now(),
          },
        }
      }

      // C-5 AUDIT FIX: Reject unknown keys to prevent config manipulation
      if (!ALLOWED_SETTINGS_KEYS.has(params.key)) {
        return {
          success: false,
          error: {
            code: 'INVALID_KEY',
            message: `Setting key '${params.key}' is not in the allowed keys list.`,
            timestamp: Date.now(),
          },
        }
      }

      // Typed settings: reject values the code reading them would not understand
      const validator = SETTING_VALIDATORS[params.key as string]
      if (validator && !validator(params.value)) {
        return {
          success: false,
          error: {
            code: 'INVALID_VALUE',
            message: `Invalid value for setting '${params.key}'.`,
            timestamp: Date.now(),
          },
        }
      }

      const db = getDatabase()
      const now = Math.floor(Date.now() / 1000)
      db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run(
        params.key,
        JSON.stringify(params.value),
        now
      )

      if (params.key === CRASH_REPORTS_SETTING) {
        CrashReporter.setConsent(params.value === true)
      }

      // Propagate language changes to ASR and Cloud Transcription services
      if (params.key === 'transcription_language' && typeof params.value === 'string') {
        try {
          getASRService().setLanguage(params.value)
        } catch (e) {
          // ASR service may not be initialized yet — language will be picked up on next init
          void e // Logged at debug level intentionally — non-critical
        }
        // Also propagate to cloud transcription (Deepgram language parameter)
        try {
          const { getCloudTranscriptionService } =
            await import('../../services/CloudTranscriptionService')
          getCloudTranscriptionService().setLanguage(params.value)
        } catch {
          // Cloud service may not be initialized — language will be picked up on next session
        }
      }

      return { success: true, data: undefined }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'SETTINGS_UPDATE_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // settings:reset — Clear user-configurable settings (preserves critical system keys)
  ipcMain.handle('settings:reset', async () => {
    try {
      const db = getDatabase()
      // Preserve keys that would trigger re-onboarding or re-download if deleted
      const PRESERVED_KEYS = [
        'hardware_tier',
        'total_ram',
        'ram_budget',
        'asr_model',
        'llm_model',
        'onboarding_completed',
        'local_only_mode',
      ]
      const placeholders = PRESERVED_KEYS.map(() => '?').join(', ')
      db.prepare(`DELETE FROM settings WHERE key NOT IN (${placeholders})`).run(...PRESERVED_KEYS)
      // The consent went with the rest; back to the default (off).
      CrashReporter.setConsent(isCrashReportingAllowed())
      return { success: true, data: undefined }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'SETTINGS_RESET_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })
}
