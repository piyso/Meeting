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
import WebSocket from 'ws'
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
const BILLING_STATUS_KEY = 'billing_status'

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

/** A check the user has to pass (or could not be given) before something sensitive is shown. */
export class AuthCheckError extends Error {
  constructor(
    public readonly code:
      | 'NOT_SIGNED_IN'
      | 'PASSWORD_REQUIRED'
      | 'INCORRECT_PASSWORD'
      | 'VERIFICATION_UNAVAILABLE'
      | 'CANCELLED',
    message: string
  ) {
    super(message)
    this.name = 'AuthCheckError'
  }
}

/** Grace after the paid period ends (late renewals) — same as the server's. */
const PERIOD_GRACE_MS = 3 * 24 * 60 * 60 * 1000

/**
 * The tier a profile is entitled to right now: the granted tier, unless the
 * period it was paid for ended more than a few days ago. Mirrors
 * effectiveTier() in supabase/functions/_shared/piyapi.ts, which is the
 * authority; this keeps the app's own display and local gating in step with
 * it. A profile with no period on file (licence key) does not expire.
 */
export function entitledTier(profile: {
  tier?: string | null
  current_period_end?: string | null
}): UserInfo['tier'] {
  const tier = (profile.tier || 'free') as UserInfo['tier']
  if (tier === 'free') return tier
  const end = profile.current_period_end ? Date.parse(profile.current_period_end) : NaN
  if (Number.isNaN(end)) return tier
  return Date.now() > end + PERIOD_GRACE_MS ? 'free' : tier
}

export class AuthService {
  private refreshTimer: ReturnType<typeof setTimeout> | null = null
  private sessionTimer: ReturnType<typeof setInterval> | null = null
  private lastActivityTime: number = Date.now()
  /** Set when the server rejects the refresh token (as opposed to being unreachable). */
  private sessionInvalid = false
  private supabase: SupabaseClient
  private functionsUrl: string

  constructor() {
    const supabaseUrl = config.SUPABASE_URL
    const supabaseKey = config.SUPABASE_ANON_KEY
    if (supabaseUrl && supabaseKey && !supabaseUrl.includes('placeholder')) {
      this.supabase = createClient(supabaseUrl, supabaseKey, {
        auth: {
          storage: createAuthStorage(),
          // The OAuth callback handler exchanges a `?code=`; supabase-js
          // defaults to the implicit flow, which returns tokens in the URL
          // fragment instead and made every Google sign-in fail.
          flowType: 'pkce',
          // Refresh is driven by scheduleRefresh(), which persists the rotated
          // refresh token to the keychain. Letting supabase-js also refresh in
          // the background rotates the token without persisting it, so the
          // stored one eventually gets rejected and the user is signed out.
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        realtime: {
          transport: WebSocket as unknown as typeof globalThis.WebSocket,
        },
      })
    } else {
      // Use Proxy to prevent null dereference crashes when unconfigured
      this.supabase = new Proxy(
        {},
        {
          get: (_, prop) => {
            throw new Error(`AuthService not configured: Cannot access supabase.${String(prop)}`)
          },
        }
      ) as SupabaseClient
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
    // Length rules belong to registration; an existing account's password is
    // whatever the server accepted when it was created.
    if (!password) {
      throw new Error('Password is required')
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
   * Finish the "forgot password" round trip: the emailed link lands on
   * bluearkive://auth/reset-password?code=…, which signs the user in with a
   * recovery session. The UI then asks for a new password (updatePassword).
   */
  async beginPasswordRecovery(url: string): Promise<{ email: string }> {
    if (!this.isConfigured()) {
      throw new Error('Authentication service not configured (no Supabase URL)')
    }
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      throw new Error('Malformed password reset link')
    }
    const linkError = parsed.searchParams.get('error_description')
    if (linkError) {
      // e.g. "Email link is invalid or has expired"
      throw new Error(linkError)
    }
    const code = parsed.searchParams.get('code')
    if (!code) {
      throw new Error('This password reset link is not valid. Request a new one.')
    }

    const { data, error } = await this.supabase.auth.exchangeCodeForSession(code)
    if (error || !data.session) {
      throw new Error(
        error?.message ||
          'This password reset link has expired or was requested from another device. Request a new one.'
      )
    }

    const result = await this.buildAuthResult(data.session)
    await this.storeTokens(result)
    this.scheduleRefresh(result.tokens.expiresIn)
    this.startSessionTimer()
    return { email: result.user.email }
  }

  /**
   * Set a new password for the signed-in user (used after beginPasswordRecovery).
   */
  async updatePassword(newPassword: string): Promise<UserInfo> {
    if (!this.isConfigured()) {
      throw new Error('Authentication service not configured (no Supabase URL)')
    }
    if (!newPassword || newPassword.length < 8) {
      throw new Error('Password must be at least 8 characters')
    }
    const user = await this.getCurrentUser()
    const token = await this.getAccessToken()
    if (!user || !token) {
      throw new Error('Your reset session has expired. Request a new password reset link.')
    }

    // The client only has the session in memory; after a restart re-attach it.
    const keytar = await keytarSafe()
    const storedRefreshToken = (await keytar?.getPassword(TOKEN_SERVICE, REFRESH_TOKEN_KEY)) || ''
    const { error: sessionError } = await this.supabase.auth.setSession({
      access_token: token,
      refresh_token: storedRefreshToken,
    })
    if (sessionError) {
      throw new Error('Your reset session has expired. Request a new password reset link.')
    }

    const { error } = await this.supabase.auth.updateUser({ password: newPassword })
    if (error) {
      throw new Error(error.message || 'Could not update password')
    }

    log.info('Password updated')
    // The data key does not change with the password; this re-wraps it with
    // the new one so other devices can unlock with it. (On a device that does
    // not hold the key — a reset done from a fresh install — sync stays
    // locked until the recovery phrase is entered.)
    this.initializeSyncManager(user.id, newPassword).catch(err => {
      log.warn('SyncManager initialization after password change failed (non-blocking):', err)
    })
    return user
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
      // This device only. The default scope ends every session the account
      // has — signing out here would sign the user out on their other
      // computers too.
      await this.supabase.auth.signOut({ scope: 'local' })
    } catch (err) {
      log.debug('Supabase signOut error (non-critical)', err)
    }

    try {
      const keytar = await keytarSafe()
      if (keytar) {
        const userId = await keytar.getPassword(TOKEN_SERVICE, USER_ID_KEY)
        await keytar.deletePassword(TOKEN_SERVICE, ACCESS_TOKEN_KEY)
        await keytar.deletePassword(TOKEN_SERVICE, REFRESH_TOKEN_KEY)
        await keytar.deletePassword(TOKEN_SERVICE, USER_ID_KEY)
        await keytar.deletePassword(TOKEN_SERVICE, USER_EMAIL_KEY)
        await keytar.deletePassword(TOKEN_SERVICE, USER_TIER_KEY)
        await keytar.deletePassword(TOKEN_SERVICE, BILLING_STATUS_KEY)
        await this.clearDerivedStores(userId)
      }
    } catch (err) {
      log.warn('Failed to clear keytar tokens', err)
    }

    // Zero the derived encryption key so it does not outlive the session.
    try {
      const { EncryptionService } = await import('./EncryptionService')
      EncryptionService.clearKeyCache()
    } catch {
      // Non-critical
    }
    this.sessionInvalid = false

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

    // P2-9 FIX: Clear CloudAccessManager cache so re-login gets fresh tier gates.
    // Without this, stale cached status persists for up to 60s after logout.
    try {
      const { getCloudAccessManager } = await import('./CloudAccessManager')
      getCloudAccessManager().clearCache()
    } catch {
      // Non-critical
    }

    // P4-8 FIX: Reset ConflictResolver singleton to prevent wrong device ID
    // tagging if a different user logs in on the same app session.
    try {
      const { resetConflictResolver } = await import('./ConflictResolver')
      resetConflictResolver()
    } catch {
      // ConflictResolver may not have been initialized — safe to skip
    }

    log.info('Logout complete')
  }

  private _syncManager: import('./SyncManager').SyncManager | null = null

  /** The active sync manager, if a signed-in session has one (for status/trigger IPC). */
  getSyncManager(): import('./SyncManager').SyncManager | null {
    return this._syncManager
  }

  /**
   * Initialize SyncManager with user credentials for encrypted cloud sync.
   * Called after successful login/register to start auto-syncing meeting data to PiyAPI.
   */
  private async initializeSyncManager(userId: string, password: string): Promise<void> {
    await this.startSyncManager(async manager => {
      await manager.initialize(userId, password)
      return manager.isReady()
    })
  }

  /**
   * Resume sync without a password (app restart, Google sign-in). The data
   * key comes from this device's keychain, or — for a new account that has no
   * password to wrap one with — is created now. If the device cannot obtain
   * the key by itself the manager is kept but locked, so the UI can say what
   * the user has to do (enter the recovery phrase, or sign in with the
   * password) instead of showing "disconnected".
   */
  private async resumeSyncManager(userId: string): Promise<void> {
    await this.startSyncManager(manager => manager.initializeFromStoredKey(userId))
  }

  /**
   * Unlock encrypted sync on this device with the account's recovery phrase.
   * @throws with a user-facing message when the phrase does not fit.
   */
  async unlockSyncWithRecoveryPhrase(phrase: string): Promise<boolean> {
    const user = await this.getCurrentUser()
    if (!user) throw new Error('Sign in before entering a recovery phrase.')
    if (!this._syncManager) await this.resumeSyncManager(user.id)
    const manager = this._syncManager
    if (!manager) throw new Error('Sync is not available right now. Try again in a moment.')

    const unlocked = await manager.unlockWithRecoveryPhrase(phrase)
    if (unlocked) {
      // Keep the phrase with this device, as onboarding does for a new one.
      try {
        const { KeyStorageService } = await import('./KeyStorageService')
        await KeyStorageService.storeRecoveryPhrase(user.id, phrase.trim())
      } catch (err) {
        log.debug('Recovery phrase not stored in keychain:', err)
      }
      manager.startAutoSync()
      void this.restoreIntoEmptyDevice(manager)
    }
    return unlocked
  }

  /**
   * Download what the account holds and this device is missing.
   * @throws with a user-facing message when it cannot be started.
   */
  async restoreFromCloud(): Promise<import('./CloudRestoreService').RestoreResult> {
    const user = await this.getCurrentUser()
    if (!user) throw new Error('Sign in to restore from your account.')
    if (!this._syncManager) await this.resumeSyncManager(user.id)
    const manager = this._syncManager
    if (!manager) throw new Error('Sync is not available right now. Try again in a moment.')
    return manager.restoreFromCloud()
  }

  /**
   * A device with no meetings at all that has just obtained the account's key
   * is a new computer or a fresh install: bring the account's meetings down
   * without being asked. A device that already has meetings is left alone —
   * there the user decides (Settings → Restore from cloud).
   */
  private async restoreIntoEmptyDevice(
    manager: import('./SyncManager').SyncManager
  ): Promise<void> {
    try {
      const { getDatabase } = await import('../database/connection')
      const row = getDatabase().prepare('SELECT COUNT(*) AS count FROM meetings').get() as {
        count: number
      }
      if (row.count > 0) return

      const result = await manager.restoreFromCloud()
      if (result.restored > 0) {
        log.info(`Restored ${result.restored} record(s) from the account onto this device`)
        const { broadcastToWindows } = await import('../ipc/windows')
        broadcastToWindows('sync:restored', {
          meetings: result.tables.meetings.restored,
          records: result.restored,
          automatic: true,
        })
      }
    } catch (err) {
      log.debug('Automatic restore skipped:', err instanceof Error ? err.message : err)
    }
  }

  /**
   * The recovery phrase for the signed-in account on this device: the one it
   * already has, or a new one. Either way the phrase is made able to recover
   * the account's data key (KeyringService) — it used to be 24 words that
   * recovered nothing.
   *
   * Asking again returns the same phrase. Generating a fresh one on every
   * call would silently invalidate what the user wrote down the first time.
   */
  async getOrCreateRecoveryPhrase(): Promise<string[]> {
    const { RecoveryPhraseService } = await import('./RecoveryPhraseService')
    const { KeyStorageService } = await import('./KeyStorageService')

    let userId: string | null = null
    try {
      userId = (await this.getCurrentUser())?.id ?? (await KeyStorageService.getCurrentUserId())
    } catch (err) {
      log.debug('No signed-in user for recovery phrase:', err)
    }
    // Not signed in: nothing to protect yet, but onboarding still shows one.
    if (!userId) return RecoveryPhraseService.generateRecoveryPhrase().words

    let phrase: string | null = null
    try {
      phrase = await KeyStorageService.getRecoveryPhrase(userId)
    } catch (err) {
      log.debug('Stored recovery phrase could not be read:', err)
    }
    if (!phrase || !RecoveryPhraseService.verifyRecoveryPhrase(phrase)) {
      phrase = RecoveryPhraseService.generateRecoveryPhrase().phrase
      try {
        await KeyStorageService.storeRecoveryPhrase(userId, phrase)
      } catch (err) {
        log.debug('Recovery phrase keychain store skipped:', err)
      }
    }

    // Wrap the data key with it now if this device holds the key; otherwise
    // the keyring picks the stored phrase up the next time it is written.
    try {
      await this._syncManager?.addRecoveryPhrase(phrase)
    } catch (err) {
      log.debug('Recovery phrase not added to keyring yet:', err)
    }
    return phrase.trim().split(/\s+/)
  }

  /**
   * The recovery phrase, for someone who has shown they own the account. It is
   * the one secret that opens the account's synced data without the password,
   * so asking for it is checked for real: Settings used to ask for "your
   * password" and accept any eight characters.
   *
   * @throws AuthCheckError — `PASSWORD_REQUIRED` tells the UI to ask for one.
   */
  async revealRecoveryPhrase(password?: string): Promise<string[]> {
    const user = await this.getCurrentUser()
    if (!user) throw new AuthCheckError('NOT_SIGNED_IN', 'Sign in to view your recovery key.')

    if (await this.hasPasswordLogin()) {
      if (!password) {
        throw new AuthCheckError(
          'PASSWORD_REQUIRED',
          'Enter your password to view your recovery key.'
        )
      }
      await this.verifyPassword(user, password)
    } else {
      await this.confirmDeviceOwner('show your recovery key')
    }
    return this.getOrCreateRecoveryPhrase()
  }

  /**
   * Whether the account signs in with a password (rather than Google only).
   * The access token lists the account's sign-in providers.
   */
  private async hasPasswordLogin(): Promise<boolean> {
    try {
      const keytar = await keytarSafe()
      const token = await keytar?.getPassword(TOKEN_SERVICE, ACCESS_TOKEN_KEY)
      const payloadPart = token?.split('.')[1]
      if (!payloadPart) return true
      const payload = JSON.parse(Buffer.from(payloadPart, 'base64').toString('utf-8')) as {
        app_metadata?: { provider?: string; providers?: unknown }
      }
      const providers = Array.isArray(payload.app_metadata?.providers)
        ? payload.app_metadata.providers
        : [payload.app_metadata?.provider]
      return providers.includes('email')
    } catch (err) {
      log.debug('Could not read sign-in providers from the session:', err)
      // Unknown: ask for the password rather than show the phrase unchecked.
      return true
    }
  }

  /** Check a password against the sign-in service without disturbing this session. */
  private async verifyPassword(user: UserInfo, password: string): Promise<void> {
    if (!this.isConfigured()) {
      throw new AuthCheckError('VERIFICATION_UNAVAILABLE', 'Sign-in is not configured.')
    }
    // A separate client: signing in on the app's own would replace its session.
    let outcome: Awaited<ReturnType<SupabaseClient['auth']['signInWithPassword']>>
    let verifier: SupabaseClient
    try {
      verifier = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        // supabase-js refuses to construct a client on Node 20 without one.
        realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
      })
      outcome = await verifier.auth.signInWithPassword({ email: user.email, password })
    } catch (err) {
      log.warn('Password check could not be made:', err instanceof Error ? err.message : err)
      throw new AuthCheckError(
        'VERIFICATION_UNAVAILABLE',
        'Your password could not be checked right now. Check your connection and try again.'
      )
    }
    const { data, error } = outcome
    if (error) {
      const status = (error as { status?: number }).status
      if (status === 400 || /invalid login credentials/i.test(error.message)) {
        throw new AuthCheckError('INCORRECT_PASSWORD', 'That password is not correct.')
      }
      throw new AuthCheckError(
        'VERIFICATION_UNAVAILABLE',
        'Your password could not be checked right now. Check your connection and try again.'
      )
    }
    // End the session this check opened — that one only.
    await verifier.auth.signOut({ scope: 'local' }).catch(() => undefined)
    if (data.user?.id !== user.id) {
      throw new AuthCheckError('INCORRECT_PASSWORD', 'That password is not correct.')
    }
  }

  /**
   * For an account with no password to ask for: have the operating system
   * confirm who is at the keyboard, where it can (Touch ID on macOS).
   */
  private async confirmDeviceOwner(reason: string): Promise<void> {
    if (process.platform !== 'darwin') return
    const { systemPreferences } = await import('electron')
    if (!systemPreferences.canPromptTouchID?.()) return
    try {
      await systemPreferences.promptTouchID(reason)
    } catch {
      throw new AuthCheckError('CANCELLED', 'Touch ID was not confirmed.')
    }
  }

  private async startSyncManager(
    init: (manager: import('./SyncManager').SyncManager) => Promise<boolean>
  ): Promise<void> {
    try {
      const { SyncManager } = await import('./SyncManager')

      // Stop existing SyncManager if any (e.g., re-login)
      if (this._syncManager) {
        this._syncManager.stopAutoSync()
      }

      // No backend override: the manager resolves the shared backend lazily,
      // so it never holds a reference that resetBackend() has discarded.
      const manager = new SyncManager()
      this._syncManager = manager
      const ready = await init(manager)
      // A newer sign-in may have replaced this manager while the key was
      // being worked out.
      if (this._syncManager !== manager) return
      // Started even when locked: a pass does nothing without a key, but it
      // is what retries a keyring that could not be read at startup.
      manager.startAutoSync()
      log.info(
        ready
          ? 'SyncManager initialized and auto-sync started'
          : `Cloud sync is locked on this device (${manager.getLock()?.reason ?? 'no key'})`
      )
      if (ready) void this.restoreIntoEmptyDevice(manager)
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
    // One refresh at a time. Several callers notice an expired token in the
    // same tick (session restore, auth check, billing status, sync); each used
    // to start its own request with the same single-use refresh token.
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.doRefreshToken().finally(() => {
        this.refreshInFlight = null
      })
    }
    return this.refreshInFlight
  }

  private refreshInFlight: Promise<AuthTokens | null> | null = null

  private async doRefreshToken(): Promise<AuthTokens | null> {
    if (!this.isConfigured()) {
      log.debug('refreshToken: Supabase not configured, skipping')
      return null
    }
    // Offline: the stored session stays valid; don't spend a request (and a
    // stack trace in the log) finding out the network is down.
    try {
      const { net } = await import('electron')
      if (!net.isOnline()) {
        log.debug('refreshToken: offline, keeping stored session')
        this.scheduleRefreshRetry()
        return null
      }
    } catch {
      // Not running under Electron (tests) — carry on
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
        // A 4xx means the server rejected the refresh token (revoked, reused,
        // expired) — the session is over. Anything else (no status, 5xx) is a
        // connectivity problem and the stored session is still good.
        const status = (error as { status?: number } | null)?.status
        // 408 (timeout) and 429 (rate limit) say nothing about the token.
        const rejected =
          typeof status === 'number' &&
          status >= 400 &&
          status < 500 &&
          status !== 408 &&
          status !== 429
        if (rejected) {
          this.sessionInvalid = true
        } else {
          this.scheduleRefreshRetry()
        }
        log.warn('Token refresh failed', { error: error?.message, status })
        return null
      }
      this.sessionInvalid = false

      const tokens: AuthTokens = {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresIn: data.session.expires_in || 3600,
      }

      await keytar.setPassword(TOKEN_SERVICE, ACCESS_TOKEN_KEY, tokens.accessToken)
      if (tokens.refreshToken !== refreshToken) {
        await keytar.setPassword(TOKEN_SERVICE, REFRESH_TOKEN_KEY, tokens.refreshToken)
      }

      // R1: Propagate the fresh token to the backend and the feature-gating store
      const userId = data.session.user?.id
      if (userId) {
        await this.syncDerivedStores(userId, tokens.accessToken)
      }

      this.scheduleRefresh(tokens.expiresIn)

      log.debug('Token refreshed successfully')
      return tokens
    } catch (err) {
      log.warn('Token refresh error', err)
      this.scheduleRefreshRetry()
      return null
    }
  }

  /**
   * Try the refresh again in a minute. A refresh that fails for lack of a
   * network used to end the cycle: the timer was only re-armed on success, so
   * an app started offline stayed signed out of the cloud until it was
   * restarted, even after the connection came back.
   */
  private scheduleRefreshRetry(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    this.refreshTimer = setTimeout(() => {
      this.refreshToken().catch(err => log.warn('Scheduled refresh retry failed', err))
    }, 60_000)
    if (this.refreshTimer.unref) this.refreshTimer.unref()
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
    if (token !== null) return true

    // Local-first: an expired access token that could not be refreshed because
    // the machine is offline is still a signed-in session. Only a refresh the
    // server rejected ends it.
    if (this.sessionInvalid) return false
    try {
      const keytar = await keytarSafe()
      if (!keytar) return false
      const [userId, refreshToken] = await Promise.all([
        keytar.getPassword(TOKEN_SERVICE, USER_ID_KEY),
        keytar.getPassword(TOKEN_SERVICE, REFRESH_TOKEN_KEY),
      ])
      return !!userId && !!refreshToken
    } catch {
      return false
    }
  }

  /**
   * Re-establish in-memory state from the keychain after an app start: push
   * the access token to the shared backend, publish the user/tier to the
   * feature-gating store, and arm the refresh timer. Safe to call when signed out.
   */
  async restoreSession(): Promise<void> {
    if (!this.isConfigured()) return
    try {
      const user = await this.getCurrentUser()
      if (!user) return

      const token = await this.getAccessToken() // refreshes if expired
      if (!token) {
        // The server rejected the stored session: signed out.
        if (this.sessionInvalid) return
        // Otherwise the token is merely expired and could not be refreshed
        // yet (offline at launch). The user is still signed in: keep the
        // session timer and the sync manager going. getAccessToken() has
        // already scheduled a refresh retry, and the sync manager asks for a
        // fresh token itself when the server answers 401.
        this.startSessionTimer()
        await this.resumeSyncManager(user.id)
        log.info('Session restored offline; the access token will be renewed when online')
        return
      }

      await this.syncDerivedStores(user.id, token, user.tier)

      const secondsLeft = this.secondsUntilExpiry(token)
      if (secondsLeft !== null) this.scheduleRefresh(secondsLeft)
      this.startSessionTimer()
      await this.resumeSyncManager(user.id)
      log.info('Session restored from keychain')
    } catch (err) {
      log.warn('Session restore failed (continuing signed-out/offline):', err)
    }
  }

  /** Seconds until a JWT expires, or null if it cannot be decoded. */
  private secondsUntilExpiry(token: string): number | null {
    try {
      const payloadPart = token.split('.')[1]
      if (!payloadPart) return null
      const payload = JSON.parse(Buffer.from(payloadPart, 'base64').toString('utf-8'))
      if (typeof payload.exp !== 'number') return null
      return Math.max(0, payload.exp - Math.floor(Date.now() / 1000))
    } catch {
      return null
    }
  }

  /**
   * Mirror the signed-in user into the stores the rest of the app reads.
   *
   * AuthService keeps tokens under flat keychain accounts ("access-token",
   * "user-tier", …) while CloudAccessManager, SyncManager, the billing handler
   * and PiyAPIBackend read KeyStorageService's per-user accounts
   * ("<userId>:access-token", "current:user-id", …). Nothing wrote the latter
   * after a Supabase login, so feature gating always saw "not logged in / free"
   * and the shared backend never received a token.
   */
  private async syncDerivedStores(
    userId: string,
    accessToken: string,
    tier?: UserInfo['tier'],
    billingStatus?: string
  ): Promise<void> {
    try {
      const { KeyStorageService } = await import('./KeyStorageService')
      await KeyStorageService.storeUserId(userId)
      await KeyStorageService.storeAccessToken(userId, accessToken)
      if (tier) await KeyStorageService.storePlanTier(userId, tier)
      if (billingStatus) await KeyStorageService.storeBillingStatus(userId, billingStatus)
    } catch (err) {
      log.warn('Failed to mirror session into KeyStorageService:', err)
    }

    try {
      const { setBackendToken } = await import('./backend/BackendSingleton')
      setBackendToken(accessToken, userId)
    } catch (err) {
      log.debug('setBackendToken failed (non-critical):', err)
    }

    try {
      const { getCloudAccessManager } = await import('./CloudAccessManager')
      getCloudAccessManager().clearCache()
    } catch {
      // Non-critical
    }
  }

  /** Remove everything syncDerivedStores() wrote. Leaves encryption keys and recovery phrases alone. */
  private async clearDerivedStores(userId: string | null): Promise<void> {
    try {
      const { KeyStorageService, KeyType } = await import('./KeyStorageService')
      if (userId) {
        await KeyStorageService.deleteKey(KeyType.ACCESS_TOKEN, userId)
        await KeyStorageService.deleteKey(KeyType.REFRESH_TOKEN, userId)
        await KeyStorageService.deleteKey(KeyType.PLAN_TIER, userId)
        await KeyStorageService.deleteKey(KeyType.BILLING_STATUS, userId)
        await KeyStorageService.deleteKey(KeyType.SYNC_KEY, userId)
      }
      await KeyStorageService.clearCurrentUserId()
    } catch (err) {
      log.debug('clearDerivedStores failed (non-critical):', err)
    }
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

    const maskedEmail = result.user.email.replace(/^(.{2})(.*)(@.*)$/, '$1***$3')
    log.info('Google OAuth login successful', { email: maskedEmail })

    // An OAuth sign-in has no password to derive the sync key from. Sync
    // resumes if this device already holds the key; otherwise it stays paused.
    this.resumeSyncManager(result.user.id).catch(err => {
      log.warn('SyncManager resume after OAuth failed (non-blocking):', err)
    })
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
        .select('*')
        .eq('id', user.id)
        .single()

      if (profile?.tier) {
        tier = entitledTier(profile)
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
    this.sessionInvalid = false
    await this.syncDerivedStores(result.user.id, result.tokens.accessToken, result.user.tier)
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

      // Set the Supabase session so authenticated queries work. supabase-js
      // rejects a session without a refresh token, which silently turned this
      // into an anonymous query after every app restart.
      const keytarForSession = await keytarSafe()
      const storedRefreshToken =
        (await keytarForSession?.getPassword(TOKEN_SERVICE, REFRESH_TOKEN_KEY)) || ''
      const { error: sessionError } = await this.supabase.auth.setSession({
        access_token: token,
        refresh_token: storedRefreshToken,
      })
      if (sessionError) {
        log.debug('refreshProfile: could not establish session', sessionError.message)
        return this.getCurrentUser()
      }
      // select('*'): current_period_end only exists once the server-side
      // billing migration has run, and naming a missing column fails the query.
      const { data: profile } = await this.supabase.from('profiles').select('*').single()

      if (!profile) return this.getCurrentUser()

      const currentUser = await this.getCurrentUser()
      if (!currentUser) return null

      const tier = entitledTier(profile)
      const billingStatus = profile.billing_status || 'active'

      // Update local keytar with latest tier from server
      const keytar = await keytarSafe()
      if (keytar) {
        await keytar.setPassword(TOKEN_SERVICE, USER_TIER_KEY, tier)
        await keytar.setPassword(TOKEN_SERVICE, BILLING_STATUS_KEY, billingStatus)
      }
      await this.syncDerivedStores(currentUser.id, token, tier, billingStatus)

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
    await this.syncDerivedStores(currentUser.id, token, tier, 'active')

    log.info('License activated', { tier, key: trimmed.slice(0, 4) + '...' })
    return { ...currentUser, tier }
  }

  private scheduleRefresh(expiresInSeconds: number): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer)

    // Refresh 60 seconds before expiry
    const refreshMs = Math.max((expiresInSeconds - 60) * 1000, 30000)
    this.refreshTimer = setTimeout(() => {
      this.refreshToken().catch(err => log.warn('Scheduled refresh failed', err))
    }, refreshMs)
    // P3-7 FIX: .unref() prevents this timer from blocking clean process exit
    // if stopSessionTimer()/logout() is not called before shutdown (e.g., force-kill)
    if (this.refreshTimer.unref) this.refreshTimer.unref()

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
          // Broadcast: getAllWindows()[0] can be the recording widget, which
          // does not listen for session events.
          for (const win of BrowserWindow.getAllWindows()) {
            if (win.isDestroyed()) continue
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
          for (const win of BrowserWindow.getAllWindows()) {
            if (win.isDestroyed()) continue
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
    // P3-7 FIX: .unref() prevents session timer from blocking clean process exit
    if (this.sessionTimer.unref) this.sessionTimer.unref()

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

/**
 * Storage for supabase-js. Everything stays in memory except PKCE code
 * verifiers, which go to the OS keychain: an OAuth or password-reset link is
 * often opened minutes later, and the exchange must still work if the app
 * was restarted in between. (Sessions are deliberately not persisted here —
 * AuthService stores tokens itself.)
 */
function createAuthStorage(): {
  getItem: (key: string) => Promise<string | null>
  setItem: (key: string, value: string) => Promise<void>
  removeItem: (key: string) => Promise<void>
} {
  const memory = new Map<string, string>()
  const isVerifier = (key: string) => key.endsWith('-code-verifier')
  const account = (key: string) => `supabase:${key}`
  return {
    async getItem(key) {
      const cached = memory.get(key)
      if (cached !== undefined) return cached
      if (!isVerifier(key)) return null
      try {
        const keytar = await keytarSafe()
        return (await keytar?.getPassword(TOKEN_SERVICE, account(key))) ?? null
      } catch {
        return null
      }
    },
    async setItem(key, value) {
      memory.set(key, value)
      if (!isVerifier(key)) return
      try {
        const keytar = await keytarSafe()
        await keytar?.setPassword(TOKEN_SERVICE, account(key), value)
      } catch {
        // In-memory copy still covers the common case (no restart)
      }
    },
    async removeItem(key) {
      memory.delete(key)
      if (!isVerifier(key)) return
      try {
        const keytar = await keytarSafe()
        await keytar?.deletePassword(TOKEN_SERVICE, account(key))
      } catch {
        // Nothing to remove
      }
    },
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
