/**
 * Environment Configuration
 *
 * Centralized config for all URLs, API endpoints, and runtime settings.
 * Reads from process.env first, falls back to sensible defaults.
 *
 * Usage:
 *   import { config } from '../config/environment'
 *   fetch(`${config.BLUEARKIVE_API_URL}/...`, ...)
 */

export const config = {
  // ─── Cloud Backend (Supabase + PiyAPI proxy) ────────────────
  /** Supabase project URL */
  SUPABASE_URL: process.env.SUPABASE_URL || '',

  /** Supabase anon key (safe for client — RLS enforced) */
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',

  /** BlueArkive Edge Functions URL (PiyAPI proxy) */
  BLUEARKIVE_FUNCTIONS_URL: process.env.BLUEARKIVE_FUNCTIONS_URL || '',

  /** BlueArkive cloud API backend */
  BLUEARKIVE_API_URL:
    process.env.BLUEARKIVE_API_URL || process.env.PIYAPI_BASE_URL || 'https://api.piyapi.cloud',

  /** Deepgram cloud transcription API */
  DEEPGRAM_API_URL: process.env.DEEPGRAM_API_URL || 'https://api.deepgram.com/v1',

  // ─── Monitoring ────────────────────────────────────────────
  /** Sentry DSN for crash reporting (empty = disabled) */
  SENTRY_DSN: process.env.SENTRY_DSN || '',

  // ─── Logging ───────────────────────────────────────────────
  /** Log level: debug | info | warn | error */
  LOG_LEVEL: (process.env.LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error',

  // ─── Development ───────────────────────────────────────────
  /** Whether running in development mode (electron-builder doesn't set NODE_ENV) */
  IS_DEV: !!process.env.VITE_DEV_SERVER_URL,

  // ─── Recording ─────────────────────────────────────────────
  /** Maximum recording duration in ms (0 = unlimited) */
  MAX_RECORDING_DURATION_MS: parseInt(process.env.MAX_RECORDING_DURATION_MS || '0', 10) || 0,

  /** Auto-save interval for notes in ms */
  AUTO_SAVE_INTERVAL_MS: parseInt(process.env.AUTO_SAVE_INTERVAL_MS || '30000', 10) || 30000,

  // ─── Database ──────────────────────────────────────────────
  /** WAL checkpoint interval in ms */
  WAL_CHECKPOINT_INTERVAL_MS:
    parseInt(process.env.WAL_CHECKPOINT_INTERVAL_MS || '300000', 10) || 300000,

  // ─── BlueArkive Billing ────────────────────────────────────
  /** BlueArkive billing page URL (user-facing, NOT PiyAPI) */
  BLUEARKIVE_BILLING_URL:
    process.env.BLUEARKIVE_BILLING_URL ||
    (process.env.VITE_DEV_SERVER_URL
      ? `${process.env.VITE_DEV_SERVER_URL}billing-web/index.html`
      : 'https://bluearkive.com/billing'),

  /** App display name (for user-facing strings) */
  APP_NAME: process.env.APP_NAME || 'BlueArkive',

  // ─── Security ──────────────────────────────────────────────
  /** Session timeout in ms (0 = disabled) */
  SESSION_TIMEOUT_MS: parseInt(process.env.SESSION_TIMEOUT_MS || '0', 10) || 0,
} as const

/** Type for the config object */
export type AppConfig = typeof config

/**
 * Feature Flags
 *
 * Runtime-configurable flags stored in the `settings` table.
 * These have sensible defaults and can be toggled per-user via Settings UI.
 * The settings table stores them as `feature:<name>` keys.
 *
 * Usage:
 *   import { getFeatureFlag } from '../config/environment'
 *   if (await getFeatureFlag('knowledge_graph')) { ... }
 */
export const FEATURE_FLAG_DEFAULTS: Record<string, boolean> = {
  /** Enable Knowledge Graph view */
  knowledge_graph: true,
  /** Enable Weekly Digest generation */
  weekly_digest: true,
  /** Enable Entity Extraction sidebar */
  entity_extraction: true,
  /** Enable Silent Prompter during meetings */
  silent_prompter: true,
  /** Enable Semantic Search in Command Palette */
  semantic_search: true,
  /**
   * Enable local PHI auto-detection and masking before upload.
   * NOTE: PiyAPI performs server-side PHI detection automatically on store_memory
   * (detects MRN, NAME, DATE, INSURANCE, EMAIL, PHONE). This flag only controls
   * whether the app also runs local PHI scanning before data leaves the device.
   * Default: false (rely on PiyAPI server-side detection). Enable for healthcare
   * or regulated environments where client-side pre-screening is required.
   */
  phi_detection: false,
  /** Enable telemetry (anonymized usage data) */
  telemetry: false,
}

/**
 * Get a feature flag value from the settings database.
 * Falls back to FEATURE_FLAG_DEFAULTS if not set.
 */
export async function getFeatureFlag(flag: keyof typeof FEATURE_FLAG_DEFAULTS): Promise<boolean> {
  try {
    // Dynamic import to avoid circular dependency with database
    const { getDatabase } = await import('../database/connection')
    const db = getDatabase()
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(`feature:${flag}`) as
      | { value: string }
      | undefined
    if (!row) return FEATURE_FLAG_DEFAULTS[flag] ?? false
    return JSON.parse(row.value) === true
  } catch {
    return FEATURE_FLAG_DEFAULTS[flag] ?? false
  }
}

/**
 * Set a feature flag value in the settings database.
 */
export async function setFeatureFlag(
  flag: keyof typeof FEATURE_FLAG_DEFAULTS,
  value: boolean
): Promise<void> {
  const { getDatabase } = await import('../database/connection')
  const db = getDatabase()
  const now = Math.floor(Date.now() / 1000)
  db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run(
    `feature:${flag}`,
    JSON.stringify(value),
    now
  )
}

/**
 * Get all feature flags with their current values.
 */
export async function getAllFeatureFlags(): Promise<Record<string, boolean>> {
  const flags = { ...FEATURE_FLAG_DEFAULTS }
  try {
    const { getDatabase } = await import('../database/connection')
    const db = getDatabase()
    const rows = db
      .prepare("SELECT key, value FROM settings WHERE key LIKE 'feature:%'")
      .all() as Array<{ key: string; value: string }>
    for (const row of rows) {
      const flagName = row.key.replace('feature:', '')
      try {
        flags[flagName] = JSON.parse(row.value) === true
      } catch {
        // Invalid JSON, keep default
      }
    }
  } catch {
    // Database not initialized, return defaults
  }
  return flags
}
