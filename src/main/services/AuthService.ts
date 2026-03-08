/**
 * Auth Service
 *
 * Handles authentication against Supabase backend.
 * - Email/password login + registration (via Supabase Auth)
 * - Session management (Supabase handles JWTs)
 * - Secure token storage via keytar
 * - Google OAuth via system browser + bluearkive:// deeplink
 * - Automatic session refresh
 * - Profile refresh (tier detection from Supabase profiles table)
 * - License key activation via Edge Function
 */

import { createClient, SupabaseClient, Session } from '@supabase/supabase-js'
import { Logger } from './Logger'
import { config } from '../config/environment'

const log = Logger.create('AuthService')

// Token storage keys (keytar)
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
  tier: 'free' | 'starter' | 'pro' | 'team' | 'enterprise'
}

interface AuthResult {
  tokens: AuthTokens
  user: UserInfo
}

export class AuthService {
  private refreshTimer: ReturnType<typeof setTimeout> | null = null
  private sessionTimer: ReturnType<typeof setInterval> | null = null
  private lastActivityTime: number = Date.now()
  private supabase: SupabaseClient
  private functionsUrl: string

  constructor() {
    const supabaseUrl = config.SUPABASE_URL
    const supabaseKey = config.SUPABASE_ANON_KEY
    if (supabaseUrl && supabaseKey && !supabaseUrl.includes('placeholder')) {
      this.supabase = createClient(supabaseUrl, supabaseKey)
    } else {
      // Create a client that will fail gracefully — no real network requests
      this.supabase = null as unknown as SupabaseClient
    }
    this.functionsUrl = config.BLUEARKIVE_FUNCTIONS_URL || ''
  }

  /** Check if Supabase is actually configured */
  private isConfigured(): boolean {
    return (
      this.supabase !== null &&
      !!config.SUPABASE_URL &&
      !config.SUPABASE_URL.includes('placeholder')
    )
  }

  /**
   * Login with email + password
   */
  async login(email: string, password: string): Promise<AuthResult> {
    if (!this.isConfigured()) {
      throw new Error('Authentication service not configured (no Supabase URL)')
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Invalid email format')
    }
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters')
    }

    log.info('Attempting login', { email })

    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      throw new Error(error.message || 'Login failed')
    }

    if (!data.session || !data.user) {
      throw new Error('Login failed: no session returned')
    }

    const result = await this.buildAuthResult(data.session)
    await this.storeTokens(result)
    this.scheduleRefresh(result.tokens.expiresIn)
    this.startSessionTimer()

    log.info('Login successful', { email, tier: result.user.tier })
    return result
  }

  /**
   * Send a password reset email via Supabase
   */
  async forgotPassword(email: string): Promise<void> {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Invalid email format')
    }

    log.info('Sending password reset email', { email })

    const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'bluearkive://auth/reset-password',
    })

    if (error) {
      throw new Error(error.message || 'Failed to send reset email')
    }

    log.info('Password reset email sent', { email })
  }

  /**
   * Register a new account
   * Note: on-signup Edge Function auto-creates PiyAPI account
   */
  async register(email: string, password: string): Promise<AuthResult> {
    if (!this.isConfigured()) {
      throw new Error('Authentication service not configured (no Supabase URL)')
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Invalid email format')
    }
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters')
    }

    log.info('Attempting registration', { email })

    const { data, error } = await this.supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      throw new Error(error.message || 'Registration failed')
    }

    if (!data.session || !data.user) {
      throw new Error('Registration successful but email confirmation may be required')
    }

    const result = await this.buildAuthResult(data.session)
    await this.storeTokens(result)
    this.scheduleRefresh(result.tokens.expiresIn)

    log.info('Registration successful', { email, tier: result.user.tier })
    return result
  }

  /**
   * Logout — clear Supabase session and all stored tokens
   */
  async logout(): Promise<void> {
    log.info('Logging out')

    try {
      await this.supabase.auth.signOut()
    } catch (err) {
      log.debug('Supabase signOut error (non-critical)', err)
    }

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

    this.stopSessionTimer()

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

      const { data, error } = await this.supabase.auth.refreshSession({
        refresh_token: refreshToken,
      })

      if (error || !data.session) {
        log.warn('Token refresh failed', { error: error?.message })
        return null
      }

      const tokens: AuthTokens = {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresIn: data.session.expires_in || 3600,
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
        const parts = token.split('.')
        const payloadBase64 = parts.length >= 3 ? parts[1] : undefined
        if (payloadBase64 && typeof payloadBase64 === 'string' && payloadBase64.length > 0) {
          const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf-8'))
          const now = Math.floor(Date.now() / 1000)
          if (typeof payload.exp === 'number' && payload.exp < now) {
            log.debug('Access token expired, attempting refresh')
            const refreshed = await this.refreshToken()
            return refreshed?.accessToken || null
          }
        }
      } catch {
        // If JWT decode fails, return token as-is
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
   * Initialize Google OAuth flow via system browser + deeplink
   */
  async startGoogleAuth(): Promise<void> {
    if (!this.isConfigured()) {
      throw new Error('Authentication service not configured (no Supabase URL)')
    }
    const { shell, app } = await import('electron')

    // Register bluearkive:// protocol (idempotent)
    app.setAsDefaultProtocolClient('bluearkive')

    const { data, error } = await this.supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: 'bluearkive://auth/callback',
        skipBrowserRedirect: true,
      },
    })

    if (error || !data.url) {
      throw new Error(error?.message || 'Failed to start Google OAuth')
    }

    await shell.openExternal(data.url)
    log.info('Google OAuth flow started in system browser')
  }

  /**
   * Handle the OAuth callback from bluearkive://auth/callback?code=xxx
   * Called from app.on('open-url') in main process
   */
  async handleOAuthCallback(url: string): Promise<AuthResult> {
    const urlObj = new URL(url)
    const code = urlObj.searchParams.get('code')

    if (!code) {
      throw new Error('No auth code in callback URL')
    }

    const { data, error } = await this.supabase.auth.exchangeCodeForSession(code)

    if (error || !data.session) {
      throw new Error(error?.message || 'Failed to exchange code for session')
    }

    const result = await this.buildAuthResult(data.session)
    await this.storeTokens(result)
    this.scheduleRefresh(result.tokens.expiresIn)
    this.startSessionTimer()

    log.info('Google OAuth login successful', { email: result.user.email })
    return result
  }

  // ── Private helpers ──

  /**
   * Build AuthResult from Supabase session, fetching tier from profiles table
   */
  private async buildAuthResult(session: Session): Promise<AuthResult> {
    const user = session.user
    if (!user.email) {
      throw new Error('User has no email')
    }

    // Fetch tier from profiles table
    let tier: UserInfo['tier'] = 'free'
    try {
      const { data: profile } = await this.supabase
        .from('profiles')
        .select('tier')
        .eq('id', user.id)
        .single()

      if (profile?.tier) {
        tier = profile.tier as UserInfo['tier']
      }
    } catch {
      log.debug('Could not fetch profile tier, defaulting to free')
    }

    return {
      tokens: {
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        expiresIn: session.expires_in || 3600,
      },
      user: {
        id: user.id,
        email: user.email,
        tier,
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

  /**
   * Fetch latest user profile from Supabase and update local keytar.
   * Called on window focus to detect tier changes after payment.
   */
  async refreshProfile(): Promise<UserInfo | null> {
    try {
      const token = await this.getAccessToken()
      if (!token) return null

      // Set the session so Supabase client can make authenticated requests
      const { data: profile } = await this.supabase
        .from('profiles')
        .select('tier, billing_status')
        .single()

      if (!profile) return this.getCurrentUser()

      const currentUser = await this.getCurrentUser()
      if (!currentUser) return null

      const tier = (profile.tier || 'free') as UserInfo['tier']
      const billingStatus = profile.billing_status || 'active'

      // Update local keytar with latest tier from server
      const keytar = await import('keytar')
      await keytar.default.setPassword(TOKEN_SERVICE, USER_TIER_KEY, tier)
      await keytar.default.setPassword(TOKEN_SERVICE, 'billing_status', billingStatus)

      if (billingStatus === 'past_due') {
        log.warn('Billing issue: payment past due', { tier, billingStatus })
      } else if (billingStatus === 'cancelled') {
        log.warn('Billing issue: subscription cancelled', { tier, billingStatus })
      }

      log.info('Profile refreshed', { tier, billingStatus })
      return { ...currentUser, tier }
    } catch (err) {
      log.debug('Profile refresh error', err)
      return this.getCurrentUser()
    }
  }

  /**
   * Activate a license key to upgrade the user's tier.
   * Calls the license-activate Edge Function.
   */
  async activateLicense(licenseKey: string): Promise<UserInfo> {
    if (!licenseKey || typeof licenseKey !== 'string') {
      throw new Error('License key is required')
    }

    const trimmed = licenseKey.trim().toUpperCase()
    if (trimmed.length < 10) {
      throw new Error('Invalid license key format')
    }

    const token = await this.getAccessToken()
    if (!token) {
      throw new Error('Not authenticated. Please sign in first.')
    }

    const response = await fetch(`${this.functionsUrl}/license-activate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ key: trimmed }),
    })

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}) as Record<string, unknown>)
      const message =
        (errBody as Record<string, unknown>).error ||
        (response.status === 404
          ? 'License activation service not available'
          : response.status === 400
            ? 'Invalid or expired license key'
            : 'License activation failed')
      throw new Error(message as string)
    }

    const data = (await response.json()) as Record<string, unknown>
    const tier = ((data.tier as string) || 'free') as UserInfo['tier']

    const currentUser = await this.getCurrentUser()
    if (!currentUser) throw new Error('Not authenticated')

    // Update local keytar with the new tier
    const keytar = await import('keytar')
    await keytar.default.setPassword(TOKEN_SERVICE, USER_TIER_KEY, tier)

    log.info('License activated', { tier, key: trimmed.slice(0, 12) + '...' })
    return { ...currentUser, tier }
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

  // ── Session Timeout ────────────────────────────────────────

  /**
   * Start session inactivity timeout.
   * If SESSION_TIMEOUT_MS > 0, the session auto-expires after inactivity.
   */
  startSessionTimer(): void {
    const timeoutMs = config.SESSION_TIMEOUT_MS
    if (timeoutMs <= 0) return // Disabled

    this.stopSessionTimer()
    this.lastActivityTime = Date.now()
    let warningSent = false

    this.sessionTimer = setInterval(async () => {
      const elapsed = Date.now() - this.lastActivityTime
      const remaining = timeoutMs - elapsed
      const WARNING_MS = 5 * 60_000 // 5 minutes before expiry

      // Reset warning flag if user was active recently
      if (remaining > WARNING_MS) {
        warningSent = false
      }

      // Send warning 5 minutes before expiry (only once)
      if (!warningSent && remaining > 0 && remaining <= WARNING_MS) {
        warningSent = true
        try {
          const { BrowserWindow } = await import('electron')
          const win = BrowserWindow.getAllWindows()[0]
          if (win) {
            win.webContents.send('session:expiring', {
              remainingMs: remaining,
              timeoutMs,
            })
          }
        } catch {
          // BrowserWindow not available
        }
      }

      if (elapsed >= timeoutMs) {
        log.info(`Session timed out after ${Math.round(elapsed / 1000)}s of inactivity`)
        this.logout().catch(err => log.warn('Session timeout logout failed', err))
        this.stopSessionTimer()

        // Notify renderer to show re-login prompt
        try {
          const { BrowserWindow } = await import('electron')
          const win = BrowserWindow.getAllWindows()[0]
          if (win) {
            win.webContents.send('session:expired', {
              reason: 'inactivity',
              timeoutMs,
            })
          }
        } catch {
          // BrowserWindow not available
        }
      }
    }, 60_000) // Check every 60 seconds

    log.info(`Session timeout enabled: ${Math.round(timeoutMs / 60000)} min`)
  }

  /**
   * Record user activity to reset inactivity timer.
   * Call from keyDown/mouseMove/IPC handlers.
   */
  recordActivity(): void {
    this.lastActivityTime = Date.now()
  }

  /**
   * Stop session inactivity timer.
   */
  private stopSessionTimer(): void {
    if (this.sessionTimer) {
      clearInterval(this.sessionTimer)
      this.sessionTimer = null
    }
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
