/**
 * Environment Configuration
 *
 * Centralized config for all URLs, API endpoints, and runtime settings.
 * Reads from process.env first, falls back to sensible defaults.
 *
 * Usage:
 *   import { config } from '../config/environment'
 *   fetch(`${config.OLLAMA_BASE_URL}/api/generate`, ...)
 */

export const config = {
  // ─── AI / LLM ──────────────────────────────────────────────
  /** Ollama local server URL */
  OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',

  // ─── Cloud Backend ─────────────────────────────────────────
  /** PiyAPI cloud backend */
  PIYAPI_BASE_URL: process.env.PIYAPI_BASE_URL || 'https://api.piyapi.cloud',

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
} as const

/** Type for the config object */
export type AppConfig = typeof config
