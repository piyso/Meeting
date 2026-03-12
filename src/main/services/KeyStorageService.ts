/**
 * Key Storage Service
 *
 * Secure storage for encryption keys and sensitive data using OS keychain.
 * - Windows: Credential Manager
 * - macOS: Keychain
 * - Linux: Secret Service API (libsecret)
 *
 * Uses keytar library for cross-platform keychain access (lazy-loaded).
 * Falls back to in-memory storage if keytar is unavailable (dev/arch mismatch).
 */

import { Logger } from './Logger'
const log = Logger.create('KeyStorage')

// In-memory fallback when keytar native module is unavailable
const memoryStore = new Map<string, Map<string, string>>()

const memoryFallback = {
  async setPassword(service: string, account: string, password: string) {
    if (!memoryStore.has(service)) memoryStore.set(service, new Map())
    memoryStore.get(service)?.set(account, password)
  },
  async getPassword(service: string, account: string) {
    return memoryStore.get(service)?.get(account) ?? null
  },
  async deletePassword(service: string, account: string) {
    return memoryStore.get(service)?.delete(account) ?? false
  },
  async findCredentials(service: string) {
    const entries = memoryStore.get(service)
    if (!entries) return []
    return Array.from(entries.entries()).map(([account, password]) => ({ account, password }))
  },
}

let _keytar: typeof memoryFallback | null = null

async function getKeytar(): Promise<typeof memoryFallback> {
  if (_keytar) return _keytar
  try {
    const mod = await import('keytar')
    _keytar = mod.default || mod
    return _keytar as typeof memoryFallback
  } catch {
    // keytar native module not available — use in-memory fallback
    const isProduction = process.env.NODE_ENV === 'production' || !process.env.VITE_DEV_SERVER_URL
    if (isProduction) {
      log.error(
        'WARNING: keytar unavailable — falling back to INSECURE in-memory storage. ' +
          'Encryption keys will be lost on restart and are vulnerable to memory dumps.'
      )
    }
    _keytar = memoryFallback
    return _keytar
  }
}

/**
 * Service name for keychain entries
 */
const SERVICE_NAME = 'bluearkive'

/**
 * Key types stored in keychain
 */
export enum KeyType {
  ENCRYPTION_KEY = 'encryption-key',
  ACCESS_TOKEN = 'access-token',
  REFRESH_TOKEN = 'refresh-token',
  RECOVERY_PHRASE = 'recovery-phrase',
  PLAN_TIER = 'plan-tier',
  USER_ID = 'user-id',
  BILLING_STATUS = 'billing-status',
}

/**
 * Key Storage Service Class
 */
export class KeyStorageService {
  /**
   * Store a key in OS keychain
   *
   * @param keyType - Type of key to store
   * @param userId - User ID (used as account name)
   * @param value - Value to store
   * @returns Promise that resolves when key is stored
   */
  public static async setKey(keyType: KeyType, userId: string, value: string): Promise<void> {
    const account = `${userId}:${keyType}`
    const kt = await getKeytar()
    await kt.setPassword(SERVICE_NAME, account, value)
  }

  /**
   * Retrieve a key from OS keychain
   *
   * @param keyType - Type of key to retrieve
   * @param userId - User ID (used as account name)
   * @returns Promise that resolves to key value or null if not found
   */
  public static async getKey(keyType: KeyType, userId: string): Promise<string | null> {
    const account = `${userId}:${keyType}`
    const kt = await getKeytar()
    return await kt.getPassword(SERVICE_NAME, account)
  }

  /**
   * Delete a key from OS keychain
   *
   * @param keyType - Type of key to delete
   * @param userId - User ID (used as account name)
   * @returns Promise that resolves to true if key was deleted
   */
  public static async deleteKey(keyType: KeyType, userId: string): Promise<boolean> {
    const account = `${userId}:${keyType}`
    const kt = await getKeytar()
    return await kt.deletePassword(SERVICE_NAME, account)
  }

  /**
   * Check if a key exists in OS keychain
   *
   * @param keyType - Type of key to check
   * @param userId - User ID (used as account name)
   * @returns Promise that resolves to true if key exists
   */
  public static async hasKey(keyType: KeyType, userId: string): Promise<boolean> {
    const value = await this.getKey(keyType, userId)
    return value !== null
  }

  /**
   * Store encryption key in keychain
   *
   * @param userId - User ID
   * @param encryptionKey - Encryption key (Base64 encoded)
   * @returns Promise that resolves when key is stored
   */
  public static async storeEncryptionKey(userId: string, encryptionKey: string): Promise<void> {
    await this.setKey(KeyType.ENCRYPTION_KEY, userId, encryptionKey)
  }

  /**
   * Retrieve encryption key from keychain
   *
   * @param userId - User ID
   * @returns Promise that resolves to encryption key or null if not found
   */
  public static async getEncryptionKey(userId: string): Promise<string | null> {
    return await this.getKey(KeyType.ENCRYPTION_KEY, userId)
  }

  /**
   * Store access token in keychain
   *
   * @param userId - User ID
   * @param accessToken - Access token
   * @returns Promise that resolves when token is stored
   */
  public static async storeAccessToken(userId: string, accessToken: string): Promise<void> {
    await this.setKey(KeyType.ACCESS_TOKEN, userId, accessToken)
  }

  /**
   * Retrieve access token from keychain
   *
   * @param userId - User ID
   * @returns Promise that resolves to access token or null if not found
   */
  public static async getAccessToken(userId: string): Promise<string | null> {
    return await this.getKey(KeyType.ACCESS_TOKEN, userId)
  }

  /**
   * Store refresh token in keychain
   *
   * @param userId - User ID
   * @param refreshToken - Refresh token
   * @returns Promise that resolves when token is stored
   */
  public static async storeRefreshToken(userId: string, refreshToken: string): Promise<void> {
    await this.setKey(KeyType.REFRESH_TOKEN, userId, refreshToken)
  }

  /**
   * Retrieve refresh token from keychain
   *
   * @param userId - User ID
   * @returns Promise that resolves to refresh token or null if not found
   */
  public static async getRefreshToken(userId: string): Promise<string | null> {
    return await this.getKey(KeyType.REFRESH_TOKEN, userId)
  }

  /**
   * Store recovery phrase in keychain (optional - user should write it down)
   *
   * @param userId - User ID
   * @param recoveryPhrase - Recovery phrase (24 words)
   * @returns Promise that resolves when phrase is stored
   */
  public static async storeRecoveryPhrase(userId: string, recoveryPhrase: string): Promise<void> {
    await this.setKey(KeyType.RECOVERY_PHRASE, userId, recoveryPhrase)
  }

  /**
   * Retrieve recovery phrase from keychain
   *
   * @param userId - User ID
   * @returns Promise that resolves to recovery phrase or null if not found
   */
  public static async getRecoveryPhrase(userId: string): Promise<string | null> {
    return await this.getKey(KeyType.RECOVERY_PHRASE, userId)
  }

  /**
   * Store plan tier in keychain
   *
   * @param userId - User ID
   * @param planTier - Plan tier (free, starter, pro, team, enterprise)
   * @returns Promise that resolves when tier is stored
   */
  public static async storePlanTier(
    userId: string,
    planTier: 'free' | 'starter' | 'pro' | 'team' | 'enterprise'
  ): Promise<void> {
    await this.setKey(KeyType.PLAN_TIER, userId, planTier)
  }

  /**
   * Retrieve plan tier from keychain
   *
   * @param userId - User ID
   * @returns Promise that resolves to plan tier or null if not found
   */
  public static async getPlanTier(userId: string): Promise<string | null> {
    return await this.getKey(KeyType.PLAN_TIER, userId)
  }

  /**
   * Delete all keys for a user (used during account deletion)
   *
   * @param userId - User ID
   * @returns Promise that resolves when all keys are deleted
   */
  public static async deleteAllKeys(userId: string): Promise<void> {
    await Promise.all([
      this.deleteKey(KeyType.ENCRYPTION_KEY, userId),
      this.deleteKey(KeyType.ACCESS_TOKEN, userId),
      this.deleteKey(KeyType.REFRESH_TOKEN, userId),
      this.deleteKey(KeyType.RECOVERY_PHRASE, userId),
      this.deleteKey(KeyType.PLAN_TIER, userId),
      this.deleteKey(KeyType.BILLING_STATUS, userId),
    ])
    // I14 fix: Clear current user ID to prevent phantom auth state
    // Without this, getCurrentUserId() still returns the deleted user's ID
    await this.clearCurrentUserId()
  }

  /**
   * List all accounts stored in keychain for this service
   *
   * @returns Promise that resolves to array of account names
   */
  public static async listAccounts(): Promise<string[]> {
    const kt = await getKeytar()
    const credentials = await kt.findCredentials(SERVICE_NAME)
    return credentials.map((cred: { account: string; password: string }) => cred.account)
  }

  /**
   * Get all users with stored credentials
   * Extracts unique user IDs from account names
   *
   * @returns Promise that resolves to array of user IDs
   */
  public static async getAllUsers(): Promise<string[]> {
    const accounts = await this.listAccounts()
    const userIds = new Set<string>()

    for (const account of accounts) {
      // Account format: "userId:keyType"
      const parts = account.split(':')
      if (parts.length >= 2 && parts[0]) {
        userIds.add(parts[0])
      }
    }

    return Array.from(userIds)
  }

  /**
   * Validate access token by checking if it exists and is not expired
   * Note: This only checks existence, not actual validity with backend
   *
   * @param userId - User ID
   * @param token - Access token to validate
   * @returns Promise that resolves to true if token exists and matches
   */
  public static async validateAccessToken(userId: string, token: string): Promise<boolean> {
    const storedToken = await this.getAccessToken(userId)
    if (!storedToken || !token) return false
    // I15 fix: Use timing-safe comparison to prevent timing attacks.
    // === leaks token length via response timing differences.
    try {
      const crypto = await import('crypto')
      const a = Buffer.from(storedToken, 'utf-8')
      const b = Buffer.from(token, 'utf-8')
      if (a.length !== b.length) return false
      return crypto.timingSafeEqual(a, b)
    } catch {
      // Fallback if crypto is unavailable (should never happen in Node)
      return storedToken === token
    }
  }

  /**
   * Store user ID in keychain
   * Used to track the current logged-in user
   *
   * @param userId - User ID to store
   * @returns Promise that resolves when user ID is stored
   */
  public static async storeUserId(userId: string): Promise<void> {
    await this.setKey(KeyType.USER_ID, 'current', userId)
  }

  /**
   * Get current user ID from keychain
   *
   * @returns Promise that resolves to user ID or null if not found
   */
  public static async getCurrentUserId(): Promise<string | null> {
    return await this.getKey(KeyType.USER_ID, 'current')
  }

  /**
   * Clear current user ID from keychain
   *
   * @returns Promise that resolves when user ID is cleared
   */
  public static async clearCurrentUserId(): Promise<boolean> {
    return await this.deleteKey(KeyType.USER_ID, 'current')
  }

  /**
   * Store billing status in keychain
   *
   * @param userId - User ID
   * @param status - Billing status (active, past_due, cancelled, trial, unknown)
   */
  public static async storeBillingStatus(userId: string, status: string): Promise<void> {
    await this.setKey(KeyType.BILLING_STATUS, userId, status)
  }

  /**
   * Retrieve billing status from keychain
   *
   * @param userId - User ID
   * @returns Billing status or null
   */
  public static async getBillingStatus(userId: string): Promise<string | null> {
    return await this.getKey(KeyType.BILLING_STATUS, userId)
  }
}
