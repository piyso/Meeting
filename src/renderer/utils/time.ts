/**
 * Timestamp helpers for values that cross the IPC boundary.
 *
 * The local database stores Unix **seconds**; cloud and AI responses use
 * **milliseconds**; a few tables store ISO strings. Rendering a seconds value
 * as milliseconds shows "21 Jan 1970", so every date that comes from the
 * backend goes through here before it is formatted.
 */

/** Anything below this is seconds (as ms it would be before 26 Apr 1970) */
const SECONDS_THRESHOLD = 10_000_000_000

/** Epoch milliseconds from seconds, milliseconds or an ISO string — null if unusable */
export function toEpochMs(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'string') {
    const numeric = Number(value)
    if (value.trim() !== '' && Number.isFinite(numeric)) return toEpochMs(numeric)
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : parsed
  }
  if (!Number.isFinite(value) || value <= 0) return null
  return value < SECONDS_THRESHOLD ? value * 1000 : value
}

/** Locale date ("12 Oct 2026"), or `fallback` when the value is not a date */
export function formatDate(
  value: number | string | null | undefined,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' },
  fallback = '—'
): string {
  const ms = toEpochMs(value)
  return ms === null ? fallback : new Date(ms).toLocaleDateString(undefined, options)
}

/** Locale date + time, or `fallback` when the value is not a date */
export function formatDateTime(
  value: number | string | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  },
  fallback = '—'
): string {
  const ms = toEpochMs(value)
  return ms === null ? fallback : new Date(ms).toLocaleString(undefined, options)
}

/** "just now", "5m ago", "3h ago", "2d ago" — empty string when the value is not a date */
export function formatRelativeTime(value: number | string | null | undefined): string {
  const ms = toEpochMs(value)
  if (ms === null) return ''
  const diff = Date.now() - ms
  if (diff < 60_000) return 'just now'
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}
