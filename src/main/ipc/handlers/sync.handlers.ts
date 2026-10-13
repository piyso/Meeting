import { ipcMain, net } from 'electron'
import { SyncManager } from '../../services/SyncManager'
import { getAuthService } from '../../services/AuthService'

// Set only by the legacy sync:login channel. Normal sign-in creates the
// manager inside AuthService; the status/trigger handlers below report on
// whichever one exists (they used to see only this one, so the UI showed
// "disconnected" while a sync was in fact running).
let syncManager: SyncManager | null = null

function activeSyncManager(): SyncManager | null {
  return syncManager ?? getAuthService().getSyncManager()
}

export function registerSyncHandlers(): void {
  // sync:getStatus — Get current sync status
  ipcMain.handle('sync:getStatus', async () => {
    try {
      const manager = activeSyncManager()
      // Fields the renderer's status indicator reads (SyncStatus in types/ipc.ts).
      // They were missing here, so the indicator never left "idle".
      const idle = {
        isOnline: net.isOnline(),
        isSyncing: false,
        queuedEvents: 0,
        lastSyncTime: null,
        lastSyncError: null,
      }
      if (!manager) {
        return {
          success: true,
          data: { ...idle, status: 'disconnected', pending: 0, total: 0 },
        }
      }
      const stats = manager.getSyncStats()
      if (!manager.isReady()) {
        // Signed in, but this device cannot unlock the account's data key by
        // itself. The reason says what will: the password, or the recovery
        // phrase (sync:unlockWithRecoveryPhrase).
        const lock = manager.getLock()
        return {
          success: true,
          data: {
            ...idle,
            queuedEvents: stats.pending,
            status: 'disconnected',
            reason: lock?.reason ?? 'password_required',
            message:
              lock?.message ??
              'Sign in with your password on this device to turn on encrypted sync.',
            ...stats,
          },
        }
      }
      // Signed in and able to encrypt, but nothing is uploading: say why
      // (offline, plan without cloud sync, service unreachable, …) instead of
      // showing "connected" over a queue that is not moving.
      const pause = manager.getPause()
      return {
        success: true,
        data: {
          ...idle,
          ...manager.getSyncState(),
          queuedEvents: stats.pending,
          status: pause ? 'disconnected' : 'connected',
          ...(pause ? { reason: pause.reason, message: pause.message } : {}),
          ...stats,
        },
      }
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
      const manager = activeSyncManager()
      if (!manager) {
        return {
          success: false,
          error: {
            code: 'SYNC_NOT_INITIALIZED',
            message: 'Not logged in',
            timestamp: Date.now(),
          },
        }
      }
      // An explicit "Sync now" skips the back-off that follows a failed pass.
      const result = await manager.syncPendingEvents({ force: true })
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

  // sync:unlockWithRecoveryPhrase — give this device the account's data key
  ipcMain.handle('sync:unlockWithRecoveryPhrase', async (_, params) => {
    try {
      const phrase = typeof params?.phrase === 'string' ? params.phrase : ''
      if (!phrase.trim() || phrase.length > 1000) {
        return {
          success: false,
          error: {
            code: 'INVALID_PARAMS',
            message: 'Enter your recovery phrase.',
            timestamp: Date.now(),
          },
        }
      }
      const unlocked = await getAuthService().unlockSyncWithRecoveryPhrase(phrase)
      return { success: true, data: { unlocked } }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'SYNC_UNLOCK_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // sync:restoreFromCloud — download what the account has and this device lacks
  ipcMain.handle('sync:restoreFromCloud', async () => {
    try {
      const result = await getAuthService().restoreFromCloud()
      if (result.restored > 0) {
        const { broadcastToWindows } = await import('../windows')
        broadcastToWindows('sync:restored', {
          meetings: result.tables.meetings.restored,
          records: result.restored,
          automatic: false,
        })
      }
      const unreadable = Object.values(result.tables).reduce((sum, t) => sum + t.unreadable, 0)
      return {
        success: true,
        data: {
          complete: result.complete,
          error: result.error,
          meetings: result.tables.meetings.restored,
          records: result.restored,
          alreadyPresent: result.tables.meetings.alreadyPresent,
          unreadable,
        },
      }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'SYNC_RESTORE_FAILED',
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

      // Stop old SyncManager to prevent orphaned auto-sync intervals. If
      // AuthService already runs one for this session, do not start a second:
      // two managers draining one queue upload everything twice.
      if (syncManager) {
        syncManager.stopAutoSync()
        syncManager = null
      }
      if (getAuthService().getSyncManager()?.isReady()) {
        return { success: true, data: { userId } }
      }
      syncManager = new SyncManager(getBackend())
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
