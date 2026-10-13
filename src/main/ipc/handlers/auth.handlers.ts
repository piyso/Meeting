/**
 * Auth Handlers — Authentication-related IPC handlers
 *
 * Handles:
 *  - auth:login — Login with email + password
 *  - auth:register — Register new account
 *  - auth:logout — Clear session
 *  - auth:getCurrentUser — Get stored user info
 *  - auth:isAuthenticated — Check auth status
 *  - auth:generateRecoveryKey — The account's 24-word recovery phrase (onboarding)
 *  - auth:revealRecoveryKey — The same phrase, after the owner has been confirmed (Settings)
 *  - auth:googleAuth — Start Google OAuth flow
 *  - auth:refreshToken — Manually refresh token
 */

import { BrowserWindow, ipcMain } from 'electron'
import { Logger } from '../../services/Logger'

const log = Logger.create('AuthHandlers')

export function registerAuthHandlers(): void {
  // auth:login — Login with email + password
  ipcMain.handle('auth:login', async (_, params) => {
    try {
      if (!params?.email || !params?.password) {
        return {
          success: false,
          error: {
            code: 'INVALID_PARAMS',
            message: 'email and password are required',
            timestamp: Date.now(),
          },
        }
      }

      const { getAuthService } = await import('../../services/AuthService')
      const authService = getAuthService()
      const result = await authService.login(params.email, params.password)

      return {
        success: true,
        data: {
          user: result.user,
          expiresIn: result.tokens.expiresIn,
        },
      }
    } catch (error) {
      log.warn('Login failed', error)
      return {
        success: false,
        error: {
          code: 'AUTH_LOGIN_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // auth:register — Register new account
  ipcMain.handle('auth:register', async (_, params) => {
    try {
      if (!params?.email || !params?.password) {
        return {
          success: false,
          error: {
            code: 'INVALID_PARAMS',
            message: 'email and password are required',
            timestamp: Date.now(),
          },
        }
      }

      const { getAuthService } = await import('../../services/AuthService')
      const authService = getAuthService()
      const result = await authService.register(params.email, params.password)

      return {
        success: true,
        data: {
          user: result.user,
          expiresIn: result.tokens.expiresIn,
        },
      }
    } catch (error) {
      log.warn('Registration failed', error)
      return {
        success: false,
        error: {
          code: 'AUTH_REGISTER_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // auth:logout — Clear session and tokens
  ipcMain.handle('auth:logout', async () => {
    try {
      const { getAuthService } = await import('../../services/AuthService')
      await getAuthService().logout()
      return { success: true, data: undefined }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'AUTH_LOGOUT_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // auth:getCurrentUser — Get stored user info
  ipcMain.handle('auth:getCurrentUser', async () => {
    try {
      const { getAuthService } = await import('../../services/AuthService')
      const user = await getAuthService().getCurrentUser()
      return { success: true, data: user }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'AUTH_GET_USER_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // auth:isAuthenticated — Check if user is logged in
  ipcMain.handle('auth:isAuthenticated', async () => {
    try {
      const { getAuthService } = await import('../../services/AuthService')
      const authenticated = await getAuthService().isAuthenticated()
      return { success: true, data: { authenticated } }
    } catch (error) {
      return { success: true, data: { authenticated: false } }
    }
  })

  // auth:googleAuth — Start Google OAuth flow in system browser
  ipcMain.handle('auth:googleAuth', async () => {
    try {
      const { getAuthService } = await import('../../services/AuthService')
      await getAuthService().startGoogleAuth()
      return { success: true, data: undefined }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'AUTH_GOOGLE_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // auth:refreshToken — Manually trigger token refresh
  ipcMain.handle('auth:refreshToken', async () => {
    try {
      const { getAuthService } = await import('../../services/AuthService')
      const tokens = await getAuthService().refreshToken()
      return { success: true, data: { refreshed: tokens !== null } }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'AUTH_REFRESH_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // auth:generateRecoveryKey — Generate a 24-word recovery phrase
  ipcMain.handle('auth:generateRecoveryKey', async () => {
    try {
      // The phrase for this account on this device — the same one each time
      // it is asked for — registered as a way to recover the sync data key.
      const { getAuthService } = await import('../../services/AuthService')
      const phrase = await getAuthService().getOrCreateRecoveryPhrase()

      return {
        success: true,
        data: { phrase },
      }
    } catch (error) {
      log.error('auth:generateRecoveryKey failed:', error)
      return {
        success: false,
        error: {
          code: 'AUTH_RECOVERY_KEY_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // auth:revealRecoveryKey — show the recovery phrase to the account's owner
  ipcMain.handle('auth:revealRecoveryKey', async (_, params) => {
    const { getAuthService, AuthCheckError } = await import('../../services/AuthService')
    try {
      const password = typeof params?.password === 'string' ? params.password : undefined
      const phrase = await getAuthService().revealRecoveryPhrase(password || undefined)
      return { success: true, data: { phrase } }
    } catch (error) {
      const expected = error instanceof AuthCheckError
      if (!expected) log.error('auth:revealRecoveryKey failed:', error)
      return {
        success: false,
        error: {
          code: expected ? error.code : 'AUTH_RECOVERY_KEY_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // auth:recordActivity — Reset session inactivity timer
  ipcMain.handle('auth:recordActivity', async () => {
    try {
      const { getAuthService } = await import('../../services/AuthService')
      getAuthService().recordActivity()
      return { success: true, data: undefined }
    } catch {
      return { success: true, data: undefined } // Non-critical — don't error on activity tracking
    }
  })

  // auth:refreshProfile — Fetch latest user info from PiyAPI (detects tier upgrades)
  ipcMain.handle('auth:refreshProfile', async () => {
    try {
      const { getAuthService } = await import('../../services/AuthService')
      const user = await getAuthService().refreshProfile()
      return { success: true, data: user }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'AUTH_REFRESH_PROFILE_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // auth:activateLicense — Validate and activate a license key to upgrade user tier
  ipcMain.handle('auth:activateLicense', async (_, params: unknown) => {
    try {
      const { key } = (params || {}) as { key?: string }
      if (!key || typeof key !== 'string' || key.trim().length === 0) {
        return {
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'License key is required',
            timestamp: Date.now(),
          },
        }
      }

      const { getAuthService } = await import('../../services/AuthService')
      const user = await getAuthService().activateLicense(key)
      return { success: true, data: user }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'LICENSE_ACTIVATION_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // auth:updatePassword — Set a new password after following a reset link
  ipcMain.handle('auth:updatePassword', async (_, params: unknown) => {
    try {
      const { password } = (params || {}) as { password?: string }
      if (!password || typeof password !== 'string') {
        return {
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'Password is required',
            timestamp: Date.now(),
          },
        }
      }

      const { getAuthService } = await import('../../services/AuthService')
      const user = await getAuthService().updatePassword(password)
      // Let the onboarding flow continue exactly as it does after a sign-in.
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send('auth:oauthSuccess', { user })
      }
      return { success: true, data: user }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'AUTH_UPDATE_PASSWORD_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // auth:forgotPassword — Send password reset email via Supabase
  ipcMain.handle('auth:forgotPassword', async (_, params: unknown) => {
    try {
      const { email } = (params || {}) as { email?: string }
      if (!email || typeof email !== 'string' || email.trim().length === 0) {
        return {
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'Email is required',
            timestamp: Date.now(),
          },
        }
      }

      const { getAuthService } = await import('../../services/AuthService')
      await getAuthService().forgotPassword(email)
      return { success: true, data: undefined }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'AUTH_RESET_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })
}
