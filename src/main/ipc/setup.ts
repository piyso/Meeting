/**
 * IPC Setup
 *
 * Registers all IPC handlers for communication between main and renderer processes.
 * This file should be called once during app initialization.
 */

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

/**
 * Register all IPC handlers
 *
 * Call this function once during app initialization (in main.ts)
 */
export function setupIPC(): void {
  console.log('Setting up IPC handlers...')

  // Register all 14 handler modules
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

  console.log('All 14 IPC handler groups registered successfully')
}

/**
 * Cleanup IPC handlers
 *
 * Call this function during app shutdown to remove all listeners
 */
export function cleanupIPC(): void {
  console.log('Cleaning up IPC handlers...')

  // Remove all IPC listeners
  const { ipcMain } = require('electron')
  ipcMain.removeAllListeners()

  console.log('IPC handlers cleaned up')
}
