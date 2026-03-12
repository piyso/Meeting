import { ipcMain } from 'electron'
import { SyncManager } from '../../services/SyncManager'

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
      // S2: Use shared BackendSingleton instead of creating separate PiyAPIBackend
      const { getBackend, setBackendToken } =
        await import('../../services/backend/BackendSingleton')
      const { KeyStorageService } = await import('../../services/KeyStorageService')

      // Set token on shared singleton so all handlers share same authenticated backend
      const accessToken = await KeyStorageService.getAccessToken(userId)
      if (accessToken) {
        setBackendToken(accessToken, userId)
      }

      const backend = getBackend()
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
      // Clear stale tokens from shared BackendSingleton to prevent cross-session reuse
      const { resetBackend } = await import('../../services/backend/BackendSingleton')
      resetBackend()
      return { success: true, data: undefined }
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
  // Opens external browser for Google sign-in via Supabase Auth
  ipcMain.handle('sync:googleAuth', async () => {
    try {
      const { getAuthService } = await import('../../services/AuthService')
      const authService = getAuthService()
      await authService.startGoogleAuth()

      // The callback will be handled via deep link (bluearkive://auth/callback)
      // handleOAuthCallback() is called directly in main.ts: open-url (macOS) / second-instance (Windows)
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

  // sync:resolveConflict — Apply user's conflict resolution choice
  ipcMain.handle('sync:resolveConflict', async (_, params) => {
    try {
      if (!params?.noteId || !params?.strategy) {
        return {
          success: false,
          error: {
            code: 'INVALID_PARAMS',
            message: 'noteId and strategy are required',
            timestamp: Date.now(),
          },
        }
      }

      const os = await import('os')
      const { getConflictResolver } = await import('../../services/ConflictResolver')
      const resolver = getConflictResolver(os.hostname())

      // Build ConflictInfo for manualResolve
      const conflictInfo = {
        noteId: params.noteId as string,
        localVersion: (params.localVersion ?? '') as string,
        remoteVersion: (params.remoteVersion ?? '') as string,
        localClock: (params.localClock ?? {}) as Record<string, number>,
        remoteClock: (params.remoteClock ?? {}) as Record<string, number>,
        comparison: 'concurrent' as const,
        autoResolved: false,
      }

      const resolution = await resolver.manualResolve(
        conflictInfo,
        params.strategy,
        params.mergedContent
      )
      return { success: true, data: resolution }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'SYNC_RESOLVE_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })
}
