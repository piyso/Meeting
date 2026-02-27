/**
 * IPC Setup
 *
 * Registers all IPC handlers for communication between main and renderer processes.
 * This file should be called once during app initialization.
 */

import { Logger } from '../services/Logger'
import { ipcMain } from 'electron'

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

/**
 * Register all IPC handlers
 *
 * Call this function once during app initialization (in main.ts)
 */
export function setupIPC(): void {
  log.info('Setting up IPC handlers...')

  // Register all 15 handler modules
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

  log.info('All 15 IPC handler groups registered successfully')
}

/**
 * Cleanup IPC handlers
 *
 * Call this function during app shutdown to remove all listeners
 */
export function cleanupIPC(): void {
  log.info('Cleaning up IPC handlers...')

  // Remove all registered IPC handle channels
  // Using removeHandler() instead of removeAllListeners() to avoid
  // removing Electron's own internal listeners
  const channels = [
    // Meeting
    'meeting:start',
    'meeting:stop',
    'meeting:get',
    'meeting:list',
    'meeting:update',
    'meeting:delete',
    'meeting:export',
    // Note
    'note:create',
    'note:update',
    'note:expand',
    'note:batchExpand',
    'note:get',
    'note:delete',
    // Transcript
    'transcript:get',
    'transcript:getContext',
    'transcript:updateSpeaker',
    // Entity
    'entity:get',
    'entity:getByType',
    'entity:extract',
    // Search
    'search:query',
    'search:semantic',
    // Sync
    'sync:getStatus',
    'sync:trigger',
    'sync:login',
    'sync:logout',
    'sync:googleAuth',
    // Audio
    'audio:listDevices',
    'audio:startCapture',
    'audio:stopCapture',
    'audio:getStatus',
    'audio:preFlightTest',
    'audio:openSoundSettings',
    'audio:getScreenRecordingPermission',
    'audio:openScreenRecordingSettings',
    'audio:startSystemAudioTest',
    'audio:stopSystemAudioTest',
    'audio:getSystemAudioTestStatus',
    'audio:startMicrophoneTest',
    'audio:stopMicrophoneTest',
    'audio:getMicrophoneTestStatus',
    'audio:exportDiagnostics',
    'audio:getDiagnosticsPath',
    'audio:getDiagnosticsStats',
    'audio:clearDiagnostics',
    'audio:openDiagnosticsFolder',
    'audio:startCaptureWithFallback',
    'audio:handleCaptureFallback',
    // Intelligence
    'intelligence:getHardwareTier',
    'intelligence:getEngineStatus',
    'intelligence:checkOllama',
    'intelligence:unloadModels',
    'intelligence:meetingSuggestion',
    // Model
    'model:detectHardwareTier',
    'model:isFirstLaunch',
    'model:areModelsDownloaded',
    'model:downloadModelsForTier',
    'model:verifyModel',
    'model:deleteModel',
    'model:getModelPaths',
    'model:downloadAll',
    // Settings
    'settings:get',
    'settings:getAll',
    'settings:update',
    'settings:reset',
    // Auth
    'auth:login',
    'auth:register',
    'auth:logout',
    'auth:getCurrentUser',
    'auth:isAuthenticated',
    'auth:googleAuth',
    'auth:refreshToken',
    'auth:generateRecoveryKey',
    // Graph
    'graph:get',
    'graph:getContradictions',
    // Digest
    'digest:generate',
    'digest:getLatest',
    // Power
    'power:getStatus',
    // Window
    'window:restoreMain',
    // Widget
    'widget:updateState',
    // Shell
    'shell:openExternal',
  ]

  for (const channel of channels) {
    try {
      ipcMain.removeHandler(channel)
    } catch {
      // Handler may not have been registered
    }
  }

  log.info('IPC handlers cleaned up')
}
