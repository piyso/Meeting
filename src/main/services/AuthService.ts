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

import { keytarSafe } from './keytarSafe'

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

    // #6 fix: Mask email in logs to prevent PII leakage in log files
    const maskedEmail = email.replace(/^(.{2})(.*)(@.*)$/, '$1***$3')
    log.info('Attempting login', { email: maskedEmail })

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

    log.info('Login successful', { email: maskedEmail, tier: result.user.tier })

    // SYNC FIX: Initialize SyncManager after successful login.
    // This was the #1 pipeline blocker — login() previously returned without
    // ever triggering sync, so zero meeting data ever reached PiyAPI cloud.
    this.initializeSyncManager(result.user.id, password).catch(err => {
      log.warn('SyncManager initialization failed (non-blocking):', err)
    })

    return result
  }

  /**
   * Send a password reset email via Supabase
   */
  async forgotPassword(email: string): Promise<void> {
    if (!this.isConfigured()) {
      throw new Error('Authentication service not configured (no Supabase URL)')
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Invalid email format')
    }

    // #7 fix: Mask email in logs to prevent PII leakage (matches login/register pattern)
    const maskedEmail = email.replace(/^(.{2})(.*)(@.*)$/, '$1***$3')
    log.info('Sending password reset email', { email: maskedEmail })

    const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'bluearkive://auth/reset-password',
    })

    if (error) {
      throw new Error(error.message || 'Failed to send reset email')
    }

    log.info('Password reset email sent', { email: maskedEmail })
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

    const maskedEmail = email.replace(/^(.{2})(.*)(@.*)$/, '$1***$3')
    log.info('Attempting registration', { email: maskedEmail })

    const { data, error } = await this.supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      throw new Error(error.message || 'Registration failed')
    }

    if (!data.session || !data.user) {
      throw new Error('Account created — please check your email to confirm before signing in')
    }

    const result = await this.buildAuthResult(data.session)
    await this.storeTokens(result)
    this.scheduleRefresh(result.tokens.expiresIn)
    this.startSessionTimer()

    log.info('Registration successful', { email: maskedEmail, tier: result.user.tier })

    // SYNC: Initialize SyncManager after registration (same as login)
    this.initializeSyncManager(result.user.id, password).catch(err => {
      log.warn('SyncManager initialization after register failed (non-blocking):', err)
    })

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
      const keytar = await keytarSafe()
      if (keytar) {
        await keytar.deletePassword(TOKEN_SERVICE, ACCESS_TOKEN_KEY)
        await keytar.deletePassword(TOKEN_SERVICE, REFRESH_TOKEN_KEY)
        await keytar.deletePassword(TOKEN_SERVICE, USER_ID_KEY)
        await keytar.deletePassword(TOKEN_SERVICE, USER_EMAIL_KEY)
        await keytar.deletePassword(TOKEN_SERVICE, USER_TIER_KEY)
      }
    } catch (err) {
      log.warn('Failed to clear keytar tokens', err)
    }

    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = null
    }

    this.stopSessionTimer()

    // SYNC: Stop SyncManager on logout to prevent orphaned auto-sync
    this.stopSyncManager()

    // S1: Reset the shared BackendSingleton to clear stale access token.
    // Without this, 7 handler files continue using the old user's token.
    try {
      const { resetBackend } = await import('./backend/BackendSingleton')
      resetBackend()
    } catch (resetErr) {
      log.debug('resetBackend on logout failed (non-critical):', resetErr)
    }

    log.info('Logout complete')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _syncManager: any = null

  /**
   * Initialize SyncManager with user credentials for encrypted cloud sync.
   * Called after successful login/register to start auto-syncing meeting data to PiyAPI.
   */
  private async initializeSyncManager(userId: string, password: string): Promise<void> {
    try {
      // S2: Use the shared BackendSingleton instead of creating a new PiyAPIBackend.
      // This ensures SyncManager and all 7 handler files share the same authenticated backend.
      const { getBackend, setBackendToken } = await import('./backend/BackendSingleton')
      const { SyncManager } = await import('./SyncManager')
      const { KeyStorageService } = await import('./KeyStorageService')

      // Set the access token on the shared singleton so all handlers are authenticated
      const accessToken = await KeyStorageService.getAccessToken(userId)
      if (accessToken) {
        setBackendToken(accessToken, userId)
      }

      // Stop existing SyncManager if any (e.g., re-login)
      if (this._syncManager) {
        this._syncManager.stopAutoSync()
      }

      const backend = getBackend()
      this._syncManager = new SyncManager(backend)
      await this._syncManager.initialize(userId, password)
      this._syncManager.startAutoSync()
      log.info('SyncManager initialized and auto-sync started')
    } catch (syncErr) {
      log.error('Failed to initialize SyncManager:', syncErr)
    }
  }

  /**
   * Stop SyncManager on logout.
   */
  private stopSyncManager(): void {
    if (this._syncManager) {
      this._syncManager.stopAutoSync()
      this._syncManager = null
      log.info('SyncManager stopped')
    }
  }

  /**
   * Refresh the access token using the refresh token
   */
  async refreshToken(): Promise<AuthTokens | null> {
    if (!this.isConfigured()) {
      log.debug('refreshToken: Supabase not configured, skipping')
      return null
    }
    try {
      const keytar = await keytarSafe()
      if (!keytar) return null
      const refreshToken = await keytar.getPassword(TOKEN_SERVICE, REFRESH_TOKEN_KEY)

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

      await keytar.setPassword(TOKEN_SERVICE, ACCESS_TOKEN_KEY, tokens.accessToken)
      if (tokens.refreshToken !== refreshToken) {
        await keytar.setPassword(TOKEN_SERVICE, REFRESH_TOKEN_KEY, tokens.refreshToken)
      }

      // R1: Update BackendSingleton with fresh token so PiyAPI calls use it
      try {
        const { setBackendToken } = await import('./backend/BackendSingleton')
        const userId = data.session.user?.id
        if (userId) {
          setBackendToken(tokens.accessToken, userId)
        }
      } catch {
        // BackendSingleton may not be initialized yet — safe to skip
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
      const keytar = await keytarSafe()
      if (!keytar) return null
      const token = await keytar.getPassword(TOKEN_SERVICE, ACCESS_TOKEN_KEY)
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
    } catch (err) {
      log.warn('getAccessToken: keytar access failed — user appears logged out:', err)
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
      const keytar = await keytarSafe()
      if (!keytar) return null
      const id = await keytar.getPassword(TOKEN_SERVICE, USER_ID_KEY)
      const email = await keytar.getPassword(TOKEN_SERVICE, USER_EMAIL_KEY)
      const tier = (await keytar.getPassword(TOKEN_SERVICE, USER_TIER_KEY)) as UserInfo['tier']

      if (!id || !email) return null
      return { id, email, tier: tier || 'free' }
    } catch (err) {
      log.warn('getCurrentUser: keytar access failed:', err)
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
    const { shell } = await import('electron')

    // Protocol already registered in main.ts at startup (Issue 28: removed duplicate)

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
    if (!this.isConfigured()) {
      throw new Error('Authentication service not configured (no Supabase URL)')
    }
    if (!url.startsWith('bluearkive://auth/callback')) {
      throw new Error('Invalid callback URL scheme')
    }
    // #8 fix: Defensively parse URL — malformed deeplinks should not crash
    let code: string | null
    try {
      const urlObj = new URL(url)
      code = urlObj.searchParams.get('code')
    } catch {
      throw new Error('Malformed OAuth callback URL')
    }

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
      const keytar = await keytarSafe()
      if (keytar) {
        await keytar.setPassword(TOKEN_SERVICE, ACCESS_TOKEN_KEY, result.tokens.accessToken)
        await keytar.setPassword(TOKEN_SERVICE, REFRESH_TOKEN_KEY, result.tokens.refreshToken)
        await keytar.setPassword(TOKEN_SERVICE, USER_ID_KEY, result.user.id)
        await keytar.setPassword(TOKEN_SERVICE, USER_EMAIL_KEY, result.user.email)
        await keytar.setPassword(TOKEN_SERVICE, USER_TIER_KEY, result.user.tier)
      }
    } catch (err) {
      log.error('Failed to store tokens in keytar', err)
    }
  }

  /**
   * Fetch latest user profile from Supabase and update local keytar.
   * Called on window focus to detect tier changes after payment.
   */
  async refreshProfile(): Promise<UserInfo | null> {
    if (!this.isConfigured()) return this.getCurrentUser()
    try {
      const token = await this.getAccessToken()
      if (!token) return null

      // Set the Supabase session so authenticated queries work
      await this.supabase.auth.setSession({
        access_token: token,
        refresh_token: '', // Not needed for reads — Supabase auto-refreshes
      })
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
      const keytar = await keytarSafe()
      if (keytar) {
        await keytar.setPassword(TOKEN_SERVICE, USER_TIER_KEY, tier)
        await keytar.setPassword(TOKEN_SERVICE, 'billing_status', billingStatus)
      }

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
    if (!this.functionsUrl) {
      throw new Error('License activation service not configured')
    }
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
    const keytar = await keytarSafe()
    if (keytar) {
      await keytar.setPassword(TOKEN_SERVICE, USER_TIER_KEY, tier)
    }

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
        // #4 fix: Stop timer BEFORE async logout to prevent race condition
        // where next interval tick fires while logout() is still in progress
        this.stopSessionTimer()
        log.info(`Session timed out after ${Math.round(elapsed / 1000)}s of inactivity`)
        this.logout().catch(err => log.warn('Session timeout logout failed', err))

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
