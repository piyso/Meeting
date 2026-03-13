/**
 * IPC Setup
 *
 * Registers all IPC handlers for communication between main and renderer processes.
 * This file should be called once during app initialization.
 */

import { Logger } from '../services/Logger'
import { ipcMain } from 'electron'
import { getAllChannels } from '../../types/ipcChannels'

const log = Logger.create('IPC')

import { registerMeetingHandlers } from './handlers/meeting.handlers'
import { registerAudioHandlers } from './handlers/audio.handlers'
import { registerModelHandlers } from './handlers/model.handlers'
import { registerTranscriptHandlers } from './handlers/transcript.handlers'
import { registerNoteHandlers } from './handlers/note.handlers'
import { registerEntityHandlers } from './handlers/entity.handlers'
import { registerSearchHandlers } from './handlers/search.handlers'
import { registerSyncHandlers } from './handlers/sync.handlers'
import { registerIntelligenceHandlers } from './handlers/intelligence.handlers'
import { registerSettingsHandlers } from './handlers/settings.handlers'
import { registerGraphHandlers } from './handlers/graph.handlers'
import { registerDigestHandlers } from './handlers/digest.handlers'
import { registerPowerHandlers } from './handlers/power.handlers'
import { registerAuthHandlers } from './handlers/auth.handlers'

import { registerWindowHandlers } from './handlers/window.handlers'
import { registerDeviceHandlers } from './handlers/device.handlers'
import { registerDiagnosticHandlers } from './handlers/diagnostic.handlers'
import { registerQuotaHandlers } from './handlers/quota.handlers'
import { registerAuditHandlers } from './handlers/audit.handlers'
import { registerExportHandlers } from './handlers/export.handlers'
import { registerBillingHandlers } from './handlers/billing.handler'
import { registerHighlightHandlers } from './handlers/highlight.handlers'
import { registerShellHandlers } from './handlers/shell.handlers'

/**
 * Register all IPC handlers
 *
 * Call this function once during app initialization (in main.ts)
 */
export function setupIPC(): void {
  log.info('Setting up IPC handlers...')

  // Register all 23 handler modules
  registerMeetingHandlers()
  registerAudioHandlers()
  registerModelHandlers()
  registerTranscriptHandlers()
  registerNoteHandlers()
  registerEntityHandlers()
  registerSearchHandlers()
  registerSyncHandlers()
  registerIntelligenceHandlers()
  registerSettingsHandlers()
  registerGraphHandlers()
  registerDigestHandlers()
  registerPowerHandlers()
  registerAuthHandlers()
  registerWindowHandlers()
  registerDeviceHandlers()
  registerDiagnosticHandlers()
  registerQuotaHandlers()
  registerAuditHandlers()
  registerExportHandlers()
  registerBillingHandlers()
  registerHighlightHandlers()
  registerShellHandlers()

  log.info('All 23 IPC handler groups registered successfully')
}

/**
 * Cleanup IPC handlers
 *
 * Call this function during app shutdown to remove all listeners
 */
export function cleanupIPC(): void {
  log.info('Cleaning up IPC handlers...')

  // Remove all registered IPC handle channels using the type-safe registry.
  // Using removeHandler() instead of removeAllListeners() to avoid
  // removing Electron's own internal listeners.
  // Note: getAllChannels() includes event channels (webContents.send) which
  // are not registered via ipcMain.handle — removeHandler() silently ignores them.
  const channels = getAllChannels()
  let removed = 0

  for (const channel of channels) {
    try {
      ipcMain.removeHandler(channel)
      removed++
    } catch {
      // Handler may not have been registered (e.g. event-only channels)
    }
  }

  log.info(`IPC handlers cleaned up (${removed} of ${channels.length} channels)`)
}
