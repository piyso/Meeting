import { ipcMain } from 'electron'
import { SyncManager } from '../../services/SyncManager'
import { PiyAPIBackend } from '../../services/backend/PiyAPIBackend'

let syncManager: SyncManager | null = null

export function registerSyncHandlers(): void {
  // sync:getStatus — Get current sync status
  ipcMain.handle('sync:getStatus', async () => {
    try {
      if (!syncManager) {
        return {
          success: true,
          data: { status: 'disconnected', pending: 0, total: 0 },
        }
      }
      const stats = syncManager.getSyncStats()
      return { success: true, data: { status: 'connected', ...stats } }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'SYNC_STATUS_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // sync:trigger — Manually trigger sync
  ipcMain.handle('sync:trigger', async () => {
    try {
      if (!syncManager) {
        return {
          success: false,
          error: {
            code: 'SYNC_NOT_INITIALIZED',
            message: 'Not logged in',
            timestamp: Date.now(),
          },
        }
      }
      const result = await syncManager.syncPendingEvents()
      return { success: true, data: result }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'SYNC_TRIGGER_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // sync:login — Initialize sync with credentials
  ipcMain.handle('sync:login', async (_, params) => {
    try {
      const userId = params?.userId || params?.email
      if (!userId || !params?.password) {
        return {
          success: false,
          error: {
            code: 'INVALID_PARAMS',
            message: 'Email and password are required',
            timestamp: Date.now(),
          },
        }
      }
      const backend = new PiyAPIBackend()
      // Stop old SyncManager to prevent orphaned auto-sync intervals
      if (syncManager) {
        syncManager.stopAutoSync()
      }
      syncManager = new SyncManager(backend)
      await syncManager.initialize(userId, params.password)
      syncManager.startAutoSync()
      return { success: true, data: { userId } }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'SYNC_LOGIN_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // sync:logout — Stop sync and clear session
  ipcMain.handle('sync:logout', async () => {
    try {
      if (syncManager) {
        syncManager.stopAutoSync()
        syncManager = null
      }
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'SYNC_LOGOUT_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // sync:googleAuth — Google OAuth login flow (Blueprint §2.7, L1641)
  // Opens external browser for Google sign-in, exchanges code for tokens
  ipcMain.handle('sync:googleAuth', async () => {
    try {
      const { shell } = await import('electron')
      const backend = new PiyAPIBackend()

      // Open Google OAuth URL in default browser
      const oauthUrl = `${backend.getBaseUrl()}/auth/google`
      await shell.openExternal(oauthUrl)

      // The callback will be handled via deep link (bluearkive://oauth/callback)
      // For now, return pending status — the actual token exchange happens via
      // a deep link handler registered in main.ts
      return {
        success: true,
        data: {
          status: 'pending',
          message: 'Google sign-in opened in browser. Complete the flow there.',
        },
      }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'GOOGLE_AUTH_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })
}
