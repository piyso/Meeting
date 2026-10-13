/**
 * Privacy switches read by the main process.
 *
 * Synced data is encrypted on this device before upload. A few cloud features
 * cannot work on ciphertext — entity extraction, knowledge-graph building and
 * cloud-side PHI checks need the words themselves — so using them means sending
 * meeting text to the server unencrypted. That is the user's decision to make,
 * and it is off until they turn it on in Settings › Privacy.
 *
 * The same goes for crash reports: they leave the device, so they are sent
 * only once the user has said so.
 */

import { getDatabase } from '../database/connection'

/** settings key (stored as JSON `true` / `false`). */
export const CLOUD_ENRICHMENT_SETTING = 'cloudEnrichmentEnabled'

function readBooleanSetting(key: string, fallback: boolean): boolean {
  try {
    const row = getDatabase().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined
    if (!row) return fallback
    return row.value === 'true' || row.value === '1'
  } catch {
    // Database not ready: fall back to the safe default.
    return fallback
  }
}

/**
 * May meeting text be sent to cloud analysis without end-to-end encryption?
 * Default: no.
 */
export function isCloudEnrichmentAllowed(): boolean {
  return readBooleanSetting(CLOUD_ENRICHMENT_SETTING, false)
}

/** settings key (stored as JSON `true` / `false`). */
export const CRASH_REPORTS_SETTING = 'crashReportsEnabled'

/**
 * May crash reports be sent to the developer? Default: no — see CrashReporter
 * for what a report contains.
 */
export function isCrashReportingAllowed(): boolean {
  return readBooleanSetting(CRASH_REPORTS_SETTING, false)
}
