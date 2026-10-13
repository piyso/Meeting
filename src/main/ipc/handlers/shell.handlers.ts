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

      // Validate URL to prevent security issues: web pages over HTTPS, and
      // mailto: (the "Email Support" / "Contact Sales" buttons). Nothing else —
      // no file:, smb:, or custom schemes that could launch local handlers.
      if (typeof url !== 'string' || url.length > 8192) {
        throw new Error('Invalid URL')
      }
      let parsed: URL
      try {
        parsed = new URL(url)
      } catch {
        throw new Error('Invalid URL')
      }
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'mailto:') {
        throw new Error('Invalid URL: Only HTTPS and mailto links are allowed')
      }

      await shell.openExternal(parsed.href)

      // Log only the scheme/hostname — URLs and mail links can carry tokens or addresses
      log.info(
        'Opened external URL:',
        parsed.protocol === 'mailto:' ? 'mailto link' : parsed.hostname
      )

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
          timestamp: Date.now(),
        },
      }
    }
  })

  // shell:showItemInFolder — Show file in system file manager
  ipcMain.handle(
    'shell:showItemInFolder',
    async (_event, path: string): Promise<IPCResponse<void>> => {
      try {
        if (typeof path !== 'string' || !path || path.length > 4096) {
          throw new Error('Invalid path')
        }
        const { shell } = await import('electron')
        shell.showItemInFolder(path)
        return { success: true, data: undefined }
      } catch (error) {
        log.error('Failed to show item in folder:', error)
        return {
          success: false,
          error: {
            code: 'SHOW_ITEM_FAILED',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: Date.now(),
          },
        }
      }
    }
  )

  log.info('Shell handlers registered')
}
