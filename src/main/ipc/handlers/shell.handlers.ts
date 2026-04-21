/**
 * Shell IPC Handlers — General shell operations
 *
 * Moved from audio.handlers.ts (I8 fix) — shell operations
 * are unrelated to audio and belong in their own module.
 */

import { ipcMain } from 'electron'
import { Logger } from '../../services/Logger'
import type { IPCResponse } from '../../../types/ipc'

const log = Logger.create('ShellHandlers')

export function registerShellHandlers(): void {
  // shell:openExternal — Open a URL in the user's default browser
  ipcMain.handle('shell:openExternal', async (_event, url: string): Promise<IPCResponse<void>> => {
    try {
      const { shell } = await import('electron')

      // Validate URL to prevent security issues — HTTPS only
      if (!url.startsWith('https://')) {
        throw new Error('Invalid URL: Only HTTPS URLs are allowed')
      }

      await shell.openExternal(url)

      // Log only hostname — URL may contain sensitive tokens/email in query params
      log.info('Opened external URL:', new URL(url).hostname)

      return {
        success: true,
        data: undefined,
      }
    } catch (error) {
      log.error('Failed to open external URL:', error)
      return {
        success: false,
        error: {
          code: 'OPEN_EXTERNAL_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
          details: error instanceof Error ? error.stack : undefined,
          timestamp: Date.now(),
        },
      }
    }
  })

  log.info('Shell handlers registered')
}
