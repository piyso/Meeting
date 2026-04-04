/**
 * Audio Cache Cleanup — TTL-based temp file cleanup
 *
 * G8: Deletes orphaned .raw/.wav files from userData/cache/audio/
 * that are older than 48 hours. Run once on app startup.
 */

import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { Logger } from './Logger'

const log = Logger.create('AudioCacheCleanup')

/** Maximum age of temp audio files before deletion (48 hours) */
const MAX_AGE_MS = 48 * 60 * 60 * 1000

/** File extensions considered temporary audio files */
const TEMP_EXTENSIONS = new Set(['.raw', '.wav', '.pcm', '.tmp'])

/**
 * Run audio cache cleanup on startup.
 * Scans userData/cache/audio/ and deletes files older than 48 hours.
 * Safe to call multiple times — idempotent.
 */
export async function runAudioCacheCleanup(): Promise<void> {
  const cacheDir = path.join(app.getPath('userData'), 'cache', 'audio')

  if (!fs.existsSync(cacheDir)) {
    log.debug('Audio cache directory does not exist, skipping cleanup')
    return
  }

  const now = Date.now()
  let deleted = 0
  let bytesFreed = 0

  try {
    const entries = fs.readdirSync(cacheDir)

    for (const entry of entries) {
      const ext = path.extname(entry).toLowerCase()
      if (!TEMP_EXTENSIONS.has(ext)) continue

      const filePath = path.join(cacheDir, entry)
      try {
        const stat = fs.statSync(filePath)
        if (!stat.isFile()) continue

        const age = now - stat.mtimeMs
        if (age > MAX_AGE_MS) {
          fs.unlinkSync(filePath)
          deleted++
          bytesFreed += stat.size
          log.debug(`Deleted orphaned audio file: ${entry} (age: ${Math.round(age / 3600000)}h)`)
        }
      } catch (fileErr) {
        // File may have been deleted between readdir and stat — safe to skip
        log.debug(`Skipped file during cleanup: ${entry}`, fileErr)
      }
    }

    if (deleted > 0) {
      log.info(
        `Audio cache cleanup: deleted ${deleted} orphaned file(s), ` +
          `freed ${(bytesFreed / 1024 / 1024).toFixed(1)} MB`
      )
    } else {
      log.debug('Audio cache cleanup: no orphaned files found')
    }
  } catch (error) {
    log.warn('Audio cache cleanup failed (non-critical):', error)
  }
}
