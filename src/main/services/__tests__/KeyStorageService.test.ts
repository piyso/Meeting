/**
 * Key Storage Service Tests
 *
 * Tests for secure key storage using OS keychain.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { KeyStorageService, KeyType } from '../KeyStorageService'

describe('KeyStorageService', () => {
  const testUserId = 'test-user-' + Date.now()
  const testKey = 'test-encryption-key-' + Math.random()

  afterEach(async () => {
    // Clean up test keys
    await KeyStorageService.deleteAllKeys(testUserId)
  })

  describe('Basic Key Operations', () => {
    it('should store and retrieve a key', async () => {
      await KeyStorageService.setKey(KeyType.ENCRYPTION_KEY, testUserId, testKey)
      const retrieved = await KeyStorageService.getKey(KeyType.ENCRYPTION_KEY, testUserId)
      expect(retrieved).toBe(testKey)
    })

    it('should return null for non-existent key', async () => {
      const retrieved = await KeyStorageService.getKey(KeyType.ENCRYPTION_KEY, 'non-existent-user')
      expect(retrieved).toBeNull()
    })

    it('should delete a key', async () => {
      await KeyStorageService.setKey(KeyType.ENCRYPTION_KEY, testUserId, testKey)
      const deleted = await KeyStorageService.deleteKey(KeyType.ENCRYPTION_KEY, testUserId)
      expect(deleted).toBe(true)

      const retrieved = await KeyStorageService.getKey(KeyType.ENCRYPTION_KEY, testUserId)
      expect(retrieved).toBeNull()
    })

    it('should check if key exists', async () => {
      expect(await KeyStorageService.hasKey(KeyType.ENCRYPTION_KEY, testUserId)).toBe(false)

      await KeyStorageService.setKey(KeyType.ENCRYPTION_KEY, testUserId, testKey)
      expect(await KeyStorageService.hasKey(KeyType.ENCRYPTION_KEY, testUserId)).toBe(true)
    })
  })

  describe('Encryption Key Storage', () => {
    it('should store and retrieve encryption key', async () => {
      const encryptionKey = 'base64-encoded-key-' + Math.random()
      await KeyStorageService.storeEncryptionKey(testUserId, encryptionKey)
      const retrieved = await KeyStorageService.getEncryptionKey(testUserId)
      expect(retrieved).toBe(encryptionKey)
    })
  })

  describe('Token Storage', () => {
    it('should store and retrieve access token', async () => {
      const accessToken = 'access-token-' + Math.random()
      await KeyStorageService.storeAccessToken(testUserId, accessToken)
      const retrieved = await KeyStorageService.getAccessToken(testUserId)
      expect(retrieved).toBe(accessToken)
    })

    it('should store and retrieve refresh token', async () => {
      const refreshToken = 'refresh-token-' + Math.random()
      await KeyStorageService.storeRefreshToken(testUserId, refreshToken)
      const retrieved = await KeyStorageService.getRefreshToken(testUserId)
      expect(retrieved).toBe(refreshToken)
    })
  })

  describe('Recovery Phrase Storage', () => {
    it('should store and retrieve recovery phrase', async () => {
      const recoveryPhrase =
        'word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12 word13 word14 word15 word16 word17 word18 word19 word20 word21 word22 word23 word24'
      await KeyStorageService.storeRecoveryPhrase(testUserId, recoveryPhrase)
      const retrieved = await KeyStorageService.getRecoveryPhrase(testUserId)
      expect(retrieved).toBe(recoveryPhrase)
    })
  })

  describe('Plan Tier Storage', () => {
    it('should store and retrieve plan tier', async () => {
      await KeyStorageService.storePlanTier(testUserId, 'pro')
      const retrieved = await KeyStorageService.getPlanTier(testUserId)
      expect(retrieved).toBe('pro')
    })

    it('should handle all plan tiers', async () => {
      const tiers: Array<'free' | 'starter' | 'pro' | 'team' | 'enterprise'> = [
        'free',
        'starter',
        'pro',
        'team',
        'enterprise',
      ]

      for (const tier of tiers) {
        await KeyStorageService.storePlanTier(testUserId, tier)
        const retrieved = await KeyStorageService.getPlanTier(testUserId)
        expect(retrieved).toBe(tier)
      }
    })
  })

  describe('Bulk Operations', () => {
    it('should delete all keys for a user', async () => {
      // Store multiple keys
      await KeyStorageService.storeEncryptionKey(testUserId, 'encryption-key')
      await KeyStorageService.storeAccessToken(testUserId, 'access-token')
      await KeyStorageService.storeRefreshToken(testUserId, 'refresh-token')
      await KeyStorageService.storeRecoveryPhrase(testUserId, 'recovery phrase')
      await KeyStorageService.storePlanTier(testUserId, 'pro')

      // Verify all keys exist
      expect(await KeyStorageService.hasKey(KeyType.ENCRYPTION_KEY, testUserId)).toBe(true)
      expect(await KeyStorageService.hasKey(KeyType.ACCESS_TOKEN, testUserId)).toBe(true)
      expect(await KeyStorageService.hasKey(KeyType.REFRESH_TOKEN, testUserId)).toBe(true)
      expect(await KeyStorageService.hasKey(KeyType.RECOVERY_PHRASE, testUserId)).toBe(true)
      expect(await KeyStorageService.hasKey(KeyType.PLAN_TIER, testUserId)).toBe(true)

      // Delete all keys
      await KeyStorageService.deleteAllKeys(testUserId)

      // Verify all keys are deleted
      expect(await KeyStorageService.hasKey(KeyType.ENCRYPTION_KEY, testUserId)).toBe(false)
      expect(await KeyStorageService.hasKey(KeyType.ACCESS_TOKEN, testUserId)).toBe(false)
      expect(await KeyStorageService.hasKey(KeyType.REFRESH_TOKEN, testUserId)).toBe(false)
      expect(await KeyStorageService.hasKey(KeyType.RECOVERY_PHRASE, testUserId)).toBe(false)
      expect(await KeyStorageService.hasKey(KeyType.PLAN_TIER, testUserId)).toBe(false)
    })
  })

  describe('Multiple Users', () => {
    it('should isolate keys between users', async () => {
      const user1 = 'user1-' + Date.now()
      const user2 = 'user2-' + Date.now()

      await KeyStorageService.storeEncryptionKey(user1, 'key1')
      await KeyStorageService.storeEncryptionKey(user2, 'key2')

      expect(await KeyStorageService.getEncryptionKey(user1)).toBe('key1')
      expect(await KeyStorageService.getEncryptionKey(user2)).toBe('key2')

      // Clean up
      await KeyStorageService.deleteAllKeys(user1)
      await KeyStorageService.deleteAllKeys(user2)
    })
  })
})
