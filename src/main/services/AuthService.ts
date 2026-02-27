/**
 * Auth Service
 *
 * Handles authentication against PiyAPI backend.
 * - Email/password login + registration
 * - JWT token management (access + refresh)
 * - Secure token storage via keytar
 * - Google OAuth via system browser
 * - Automatic token refresh
 */

import { Logger } from './Logger'
import { config } from '../config/environment'

const log = Logger.create('AuthService')

// Token storage keys
const TOKEN_SERVICE = 'bluearkive'
const ACCESS_TOKEN_KEY = 'access-token'
const REFRESH_TOKEN_KEY = 'refresh-token'
const USER_ID_KEY = 'user-id'
const USER_EMAIL_KEY = 'user-email'
const USER_TIER_KEY = 'user-tier'

interface AuthTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number // seconds
}

interface UserInfo {
  id: string
  email: string
  tier: 'free' | 'starter' | 'pro' | 'enterprise'
}

interface AuthResult {
  tokens: AuthTokens
  user: UserInfo
}

export class AuthService {
  private refreshTimer: ReturnType<typeof setTimeout> | null = null
  private apiBase: string

  constructor() {
    this.apiBase = config.PIYAPI_BASE_URL || 'https://api.piyapi.cloud'
  }

  /**
   * Login with email + password
   */
  async login(email: string, password: string): Promise<AuthResult> {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Invalid email format')
    }
    if (!password || password.length < 1) {
      throw new Error('Password is required')
    }

    log.info('Attempting login', { email })

    const response = await fetch(`${this.apiBase}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.message || `Login failed: ${response.status}`)
    }

    const data = await response.json()
    const result = this.parseAuthResponse(data)
    await this.storeTokens(result)
    this.scheduleRefresh(result.tokens.expiresIn)

    log.info('Login successful', { email, tier: result.user.tier })
    return result
  }

  /**
   * Register a new account
   */
  async register(email: string, password: string): Promise<AuthResult> {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Invalid email format')
    }
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters')
    }

    log.info('Attempting registration', { email })

    const response = await fetch(`${this.apiBase}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.message || `Registration failed: ${response.status}`)
    }

    const data = await response.json()
    const result = this.parseAuthResponse(data)
    await this.storeTokens(result)
    this.scheduleRefresh(result.tokens.expiresIn)

    log.info('Registration successful', { email, tier: result.user.tier })
    return result
  }

  /**
   * Logout — clear all stored tokens
   */
  async logout(): Promise<void> {
    log.info('Logging out')

    try {
      const keytar = await import('keytar')
      await keytar.default.deletePassword(TOKEN_SERVICE, ACCESS_TOKEN_KEY)
      await keytar.default.deletePassword(TOKEN_SERVICE, REFRESH_TOKEN_KEY)
      await keytar.default.deletePassword(TOKEN_SERVICE, USER_ID_KEY)
      await keytar.default.deletePassword(TOKEN_SERVICE, USER_EMAIL_KEY)
      await keytar.default.deletePassword(TOKEN_SERVICE, USER_TIER_KEY)
    } catch (err) {
      log.warn('Failed to clear keytar tokens', err)
    }

    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = null
    }

    log.info('Logout complete')
  }

  /**
   * Refresh the access token using the refresh token
   */
  async refreshToken(): Promise<AuthTokens | null> {
    try {
      const keytar = await import('keytar')
      const refreshToken = await keytar.default.getPassword(TOKEN_SERVICE, REFRESH_TOKEN_KEY)

      if (!refreshToken) {
        log.debug('No refresh token available')
        return null
      }

      const response = await fetch(`${this.apiBase}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${refreshToken}`,
        },
      })

      if (!response.ok) {
        log.warn('Token refresh failed', { status: response.status })
        return null
      }

      const data = await response.json()
      const tokens: AuthTokens = {
        accessToken: data.access_token || data.accessToken,
        refreshToken: data.refresh_token || data.refreshToken || refreshToken,
        expiresIn: data.expires_in || data.expiresIn || 900,
      }

      await keytar.default.setPassword(TOKEN_SERVICE, ACCESS_TOKEN_KEY, tokens.accessToken)
      if (tokens.refreshToken !== refreshToken) {
        await keytar.default.setPassword(TOKEN_SERVICE, REFRESH_TOKEN_KEY, tokens.refreshToken)
      }

      this.scheduleRefresh(tokens.expiresIn)

      log.debug('Token refreshed successfully')
      return tokens
    } catch (err) {
      log.warn('Token refresh error', err)
      return null
    }
  }

  /**
   * Get the current access token (refreshing if needed)
   */
  async getAccessToken(): Promise<string | null> {
    try {
      const keytar = await import('keytar')
      const token = await keytar.default.getPassword(TOKEN_SERVICE, ACCESS_TOKEN_KEY)
      if (!token) return null

      // Decode JWT and check expiry
      try {
        const payloadBase64 = token.split('.')[1]
        if (payloadBase64) {
          const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf-8'))
          const now = Math.floor(Date.now() / 1000)
          if (payload.exp && payload.exp < now) {
            log.debug('Access token expired, attempting refresh')
            const refreshed = await this.refreshToken()
            return refreshed?.accessToken || null
          }
        }
      } catch {
        // If JWT decode fails, return token as-is (non-JWT tokens)
      }

      return token
    } catch {
      return null
    }
  }

  /**
   * Check if the user is currently authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    const token = await this.getAccessToken()
    return token !== null
  }

  /**
   * Get current user info from stored credentials
   */
  async getCurrentUser(): Promise<UserInfo | null> {
    try {
      const keytar = await import('keytar')
      const id = await keytar.default.getPassword(TOKEN_SERVICE, USER_ID_KEY)
      const email = await keytar.default.getPassword(TOKEN_SERVICE, USER_EMAIL_KEY)
      const tier = (await keytar.default.getPassword(
        TOKEN_SERVICE,
        USER_TIER_KEY
      )) as UserInfo['tier']

      if (!id || !email) return null
      return { id, email, tier: tier || 'free' }
    } catch {
      return null
    }
  }

  /**
   * Initialize Google OAuth flow via system browser
   */
  async startGoogleAuth(): Promise<void> {
    const { shell } = await import('electron')
    const callbackUrl = `${this.apiBase}/api/v1/auth/google/callback`
    const authUrl = `${this.apiBase}/api/v1/auth/google?redirect_uri=${encodeURIComponent(callbackUrl)}`
    await shell.openExternal(authUrl)
    log.info('Google OAuth flow started in system browser')
  }

  // ── Private helpers ──

  private parseAuthResponse(data: unknown): AuthResult {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid auth response: expected object')
    }

    const d = data as Record<string, unknown>
    const user = (d.user || {}) as Record<string, unknown>

    const accessToken = (d.access_token || d.accessToken) as string | undefined
    const refreshToken = (d.refresh_token || d.refreshToken) as string | undefined
    const userId = (user.id || d.userId) as string | undefined
    const email = (user.email || d.email) as string | undefined

    if (!accessToken || typeof accessToken !== 'string') {
      throw new Error('Invalid auth response: missing access_token')
    }
    if (!refreshToken || typeof refreshToken !== 'string') {
      throw new Error('Invalid auth response: missing refresh_token')
    }
    if (!userId || typeof userId !== 'string') {
      throw new Error('Invalid auth response: missing user id')
    }
    if (!email || typeof email !== 'string') {
      throw new Error('Invalid auth response: missing email')
    }

    const rawExpiresIn = (d.expires_in ?? d.expiresIn ?? 900) as number
    const tier = (user.tier || d.tier || 'free') as string

    return {
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: typeof rawExpiresIn === 'number' ? rawExpiresIn : 900,
      },
      user: {
        id: userId,
        email,
        tier: tier as UserInfo['tier'],
      },
    }
  }

  private async storeTokens(result: AuthResult): Promise<void> {
    try {
      const keytar = await import('keytar')
      await keytar.default.setPassword(TOKEN_SERVICE, ACCESS_TOKEN_KEY, result.tokens.accessToken)
      await keytar.default.setPassword(TOKEN_SERVICE, REFRESH_TOKEN_KEY, result.tokens.refreshToken)
      await keytar.default.setPassword(TOKEN_SERVICE, USER_ID_KEY, result.user.id)
      await keytar.default.setPassword(TOKEN_SERVICE, USER_EMAIL_KEY, result.user.email)
      await keytar.default.setPassword(TOKEN_SERVICE, USER_TIER_KEY, result.user.tier)
    } catch (err) {
      log.error('Failed to store tokens in keytar', err)
    }
  }

  private scheduleRefresh(expiresInSeconds: number): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer)

    // Refresh 60 seconds before expiry
    const refreshMs = Math.max((expiresInSeconds - 60) * 1000, 30000)
    this.refreshTimer = setTimeout(() => {
      this.refreshToken().catch(err => log.warn('Scheduled refresh failed', err))
    }, refreshMs)

    log.debug(`Token refresh scheduled in ${Math.round(refreshMs / 1000)}s`)
  }
}

// Singleton
let authServiceInstance: AuthService | null = null

export function getAuthService(): AuthService {
  if (!authServiceInstance) {
    authServiceInstance = new AuthService()
  }
  return authServiceInstance
}
