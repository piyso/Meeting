/**
 * Unit Tests for EncryptionService
 *
 * Tests PBKDF2 key derivation, AES-256-GCM encryption/decryption,
 * and database integration.
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import crypto from 'crypto'
import { EncryptionService } from '../EncryptionService'
import { initializeDatabase, closeDatabase } from '../../database/connection'
import { hasEncryptionKey, /* getEncryptionKeyByUserId */ } from '../../database/crud/encryption-keys'

describe('EncryptionService', () => {
  before(() => {
    // Initialize in-memory database for testing
    initializeDatabase(':memory:' as any)
  })

  after(() => {
    closeDatabase()
  })

  describe('PBKDF2 Key Derivation', () => {
    it('should derive 256-bit key from password', () => {
      const password = 'test-password-123'
      const salt = EncryptionService.generateSalt()

      const { key } = EncryptionService.deriveKey(password, salt)

      assert.strictEqual(key.length, 32, 'Key should be 32 bytes (256 bits)')
      assert.ok(Buffer.isBuffer(key), 'Key should be a Buffer')
    })

    it('should use 100,000 iterations', () => {
      // This test verifies the iteration count by checking timing
      // 100K iterations should take measurable time (>10ms)
      const password = 'test-password'
      const salt = EncryptionService.generateSalt()

      const startTime = Date.now()
      EncryptionService.deriveKey(password, salt)
      const duration = Date.now() - startTime

      assert.ok(duration > 5, 'PBKDF2 with 100K iterations should take >5ms')
    })

    it('should generate different keys for different passwords', () => {
      const salt = EncryptionService.generateSalt()
      const { key: key1 } = EncryptionService.deriveKey('password1', salt)
      const { key: key2 } = EncryptionService.deriveKey('password2', salt)

      assert.notDeepStrictEqual(key1, key2, 'Different passwords should produce different keys')
    })

    it('should generate different keys for different salts', () => {
      const password = 'same-password'
      const salt1 = EncryptionService.generateSalt()
      const salt2 = EncryptionService.generateSalt()

      const { key: key1 } = EncryptionService.deriveKey(password, salt1)
      const { key: key2 } = EncryptionService.deriveKey(password, salt2)

      assert.notDeepStrictEqual(key1, key2, 'Different salts should produce different keys')
    })

    it('should generate same key for same password and salt', () => {
      const password = 'consistent-password'
      const salt = EncryptionService.generateSalt()

      const { key: key1 } = EncryptionService.deriveKey(password, salt)
      const { key: key2 } = EncryptionService.deriveKey(password, salt)

      assert.deepStrictEqual(key1, key2, 'Same password and salt should produce same key')
    })

    it('should use SHA-256 hash algorithm', () => {
      // Verify by comparing with manual PBKDF2 call
      const password = 'test-password'
      const salt = EncryptionService.generateSalt()

      const { key: serviceKey } = EncryptionService.deriveKey(password, salt)
      const manualKey = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256')

      assert.deepStrictEqual(serviceKey, manualKey, 'Service should use SHA-256 for PBKDF2')
    })
  })

  describe('Salt Generation', () => {
    it('should generate 32-byte salt', () => {
      const salt = EncryptionService.generateSalt()

      assert.strictEqual(salt.length, 32, 'Salt should be 32 bytes')
      assert.ok(Buffer.isBuffer(salt), 'Salt should be a Buffer')
    })

    it('should generate unique salts', () => {
      const salt1 = EncryptionService.generateSalt()
      const salt2 = EncryptionService.generateSalt()

      assert.notDeepStrictEqual(salt1, salt2, 'Each salt should be unique')
    })

    it('should generate cryptographically random salts', () => {
      // Generate multiple salts and verify they are different
      const salts = Array.from({ length: 10 }, () => EncryptionService.generateSalt())
      const uniqueSalts = new Set(salts.map(s => s.toString('hex')))

      assert.strictEqual(uniqueSalts.size, 10, 'All salts should be unique')
    })
  })

  describe('IV Generation', () => {
    it('should generate 12-byte IV', () => {
      const iv = EncryptionService.generateIV()

      assert.strictEqual(iv.length, 12, 'IV should be 12 bytes (96 bits)')
      assert.ok(Buffer.isBuffer(iv), 'IV should be a Buffer')
    })

    it('should generate unique IVs', () => {
      const iv1 = EncryptionService.generateIV()
      const iv2 = EncryptionService.generateIV()

      assert.notDeepStrictEqual(iv1, iv2, 'Each IV should be unique')
    })
  })

  describe('AES-256-GCM Encryption', () => {
    it('should encrypt plaintext successfully', () => {
      const plaintext = 'Hello, World!'
      const password = 'secure-password'

      const encrypted = EncryptionService.encrypt(plaintext, password)

      assert.ok(encrypted.ciphertext, 'Should have ciphertext')
      assert.ok(encrypted.iv, 'Should have IV')
      assert.ok(encrypted.salt, 'Should have salt')
      assert.ok(encrypted.authTag, 'Should have auth tag')
      assert.strictEqual(encrypted.algorithm, 'aes-256-gcm', 'Should use AES-256-GCM')
    })

    it('should produce different ciphertext for same plaintext (unique IV)', () => {
      const plaintext = 'Same message'
      const password = 'same-password'
      const salt = EncryptionService.generateSalt()

      const encrypted1 = EncryptionService.encrypt(plaintext, password, salt)
      const encrypted2 = EncryptionService.encrypt(plaintext, password, salt)

      assert.notStrictEqual(
        encrypted1.ciphertext,
        encrypted2.ciphertext,
        'Different IVs should produce different ciphertext'
      )
      assert.notStrictEqual(encrypted1.iv, encrypted2.iv, 'IVs should be different')
    })

    it('should encrypt various data sizes', () => {
      const password = 'test-password'
      const testCases = [
        'Short',
        'Medium length message with some content',
        'A'.repeat(1000), // 1KB
        'B'.repeat(10000), // 10KB
        JSON.stringify({
          complex: 'object',
          with: ['nested', 'arrays'],
          and: { deep: 'properties' },
        }),
      ]

      for (const plaintext of testCases) {
        const encrypted = EncryptionService.encrypt(plaintext, password)
        assert.ok(encrypted.ciphertext, `Should encrypt ${plaintext.length} bytes`)
      }
    })

    it('should handle special characters and unicode', () => {
      const password = 'test-password'
      const testCases = [
        'Hello 世界',
        'Emoji: 🔐🔑🛡️',
        'Special chars: !@#$%^&*()',
        'Newlines\nand\ttabs',
        'Quotes: "double" and \'single\'',
      ]

      for (const plaintext of testCases) {
        const encrypted = EncryptionService.encrypt(plaintext, password)
        assert.ok(encrypted.ciphertext, `Should encrypt: ${plaintext}`)
      }
    })
  })

  describe('AES-256-GCM Decryption', () => {
    it('should decrypt ciphertext successfully', () => {
      const plaintext = 'Secret message'
      const password = 'secure-password'

      const encrypted = EncryptionService.encrypt(plaintext, password)
      const decrypted = EncryptionService.decrypt(encrypted, password)

      assert.strictEqual(decrypted, plaintext, 'Decrypted text should match original')
    })

    it('should fail with wrong password', () => {
      const plaintext = 'Secret message'
      const correctPassword = 'correct-password'
      const wrongPassword = 'wrong-password'

      const encrypted = EncryptionService.encrypt(plaintext, correctPassword)

      assert.throws(
        () => EncryptionService.decrypt(encrypted, wrongPassword),
        /Unsupported state or unable to authenticate data/,
        'Should throw error with wrong password'
      )
    })

    it('should fail with corrupted ciphertext', () => {
      const plaintext = 'Secret message'
      const password = 'secure-password'

      const encrypted = EncryptionService.encrypt(plaintext, password)
      // Corrupt the ciphertext
      encrypted.ciphertext = encrypted.ciphertext.slice(0, -5) + 'XXXXX'

      assert.throws(
        () => EncryptionService.decrypt(encrypted, password),
        'Should throw error with corrupted ciphertext'
      )
    })

    it('should fail with corrupted auth tag', () => {
      const plaintext = 'Secret message'
      const password = 'secure-password'

      const encrypted = EncryptionService.encrypt(plaintext, password)
      // Corrupt the auth tag
      encrypted.authTag = Buffer.from('0'.repeat(24)).toString('base64')

      assert.throws(
        () => EncryptionService.decrypt(encrypted, password),
        'Should throw error with corrupted auth tag'
      )
    })
  })

  describe('Encryption Round-Trip', () => {
    it('should pass round-trip test with various data', () => {
      const password = 'test-password'
      const testCases = [
        'Simple text',
        'Multi\nline\ntext',
        JSON.stringify({ meeting: 'data', transcript: 'content' }),
        'Unicode: 你好世界 🌍',
        'A'.repeat(10000), // Large data
      ]

      for (const testData of testCases) {
        const result = EncryptionService.testRoundTrip(testData, password)
        assert.ok(result, `Round-trip should succeed for: ${testData.slice(0, 50)}...`)
      }
    })

    it('should verify decrypt(encrypt(data)) === data', () => {
      const plaintext = 'Test data for round-trip verification'
      const password = 'secure-password'

      const encrypted = EncryptionService.encrypt(plaintext, password)
      const decrypted = EncryptionService.decrypt(encrypted, password)

      assert.strictEqual(decrypted, plaintext, 'Decrypted data should exactly match original')
    })
  })

  describe('Database Integration', () => {
    it('should initialize user encryption', async () => {
      const userId = 'test-user-1'
      const password = 'user-password'

      const { keyId, salt } = await EncryptionService.initializeUserEncryption(userId, password)

      assert.ok(keyId, 'Should return key ID')
      assert.ok(salt, 'Should return salt')
      assert.strictEqual(salt.length, 32, 'Salt should be 32 bytes')
    })

    it('should store encryption key in database', async () => {
      const userId = 'test-user-2'
      const password = 'user-password'

      await EncryptionService.initializeUserEncryption(userId, password)

      assert.ok(hasEncryptionKey(userId), 'User should have encryption key in database')
    })

    it('should retrieve user salt from database', async () => {
      const userId = 'test-user-3'
      const password = 'user-password'

      const { salt: originalSalt } = await EncryptionService.initializeUserEncryption(
        userId,
        password
      )

      const retrievedSalt = EncryptionService.getUserSalt(userId)

      assert.ok(retrievedSalt, 'Should retrieve salt')
      assert.deepStrictEqual(retrievedSalt, originalSalt, 'Retrieved salt should match original')
    })

    it('should reuse existing encryption key', async () => {
      const userId = 'test-user-4'
      const password = 'user-password'

      const { keyId: keyId1 } = await EncryptionService.initializeUserEncryption(userId, password)
      const { keyId: keyId2 } = await EncryptionService.initializeUserEncryption(userId, password)

      assert.strictEqual(keyId1, keyId2, 'Should reuse existing key ID')
    })

    it('should encrypt/decrypt using stored salt', async () => {
      const userId = 'test-user-5'
      const password = 'user-password'
      const plaintext = 'Meeting transcript data'

      // Initialize encryption
      await EncryptionService.initializeUserEncryption(userId, password)

      // Get salt from database
      const salt = EncryptionService.getUserSalt(userId)
      assert.ok(salt, 'Should have salt in database')

      // Encrypt using stored salt
      const encrypted = EncryptionService.encrypt(plaintext, password, salt)

      // Decrypt
      const decrypted = EncryptionService.decrypt(encrypted, password)

      assert.strictEqual(decrypted, plaintext, 'Should decrypt correctly using stored salt')
    })
  })

  describe('Security Properties', () => {
    it('should use authenticated encryption (GCM)', () => {
      const plaintext = 'Authenticated data'
      const password = 'secure-password'

      const encrypted = EncryptionService.encrypt(plaintext, password)

      assert.ok(encrypted.authTag, 'Should have authentication tag')
      assert.strictEqual(
        Buffer.from(encrypted.authTag, 'base64').length,
        16,
        'Auth tag should be 16 bytes'
      )
    })

    it('should never reuse IV', () => {
      const plaintext = 'Same message'
      const password = 'same-password'
      const salt = EncryptionService.generateSalt()

      const ivs = new Set<string>()
      for (let i = 0; i < 100; i++) {
        const encrypted = EncryptionService.encrypt(plaintext, password, salt)
        ivs.add(encrypted.iv)
      }

      assert.strictEqual(ivs.size, 100, 'All IVs should be unique')
    })

    it('should produce different ciphertext for same plaintext', () => {
      const plaintext = 'Repeated message'
      const password = 'same-password'

      const ciphertexts = new Set<string>()
      for (let i = 0; i < 10; i++) {
        const encrypted = EncryptionService.encrypt(plaintext, password)
        ciphertexts.add(encrypted.ciphertext)
      }

      assert.strictEqual(
        ciphertexts.size,
        10,
        'Same plaintext should produce different ciphertext (semantic security)'
      )
    })

    it('should handle empty string', () => {
      const plaintext = ''
      const password = 'test-password'

      const encrypted = EncryptionService.encrypt(plaintext, password)
      const decrypted = EncryptionService.decrypt(encrypted, password)

      assert.strictEqual(decrypted, plaintext, 'Should handle empty string')
    })

    it('should handle very long passwords', () => {
      const plaintext = 'Test data'
      const longPassword = 'A'.repeat(1000)

      const encrypted = EncryptionService.encrypt(plaintext, longPassword)
      const decrypted = EncryptionService.decrypt(encrypted, longPassword)

      assert.strictEqual(decrypted, plaintext, 'Should handle long passwords')
    })
  })

  describe('Error Handling', () => {
    it('should throw error for invalid Base64 in decrypt', () => {
      const invalidPayload = {
        ciphertext: 'invalid-base64!!!',
        iv: 'invalid-base64!!!',
        salt: 'invalid-base64!!!',
        authTag: 'invalid-base64!!!',
        algorithm: 'aes-256-gcm' as const,
      }

      assert.throws(
        () => EncryptionService.decrypt(invalidPayload, 'password'),
        'Should throw error for invalid Base64'
      )
    })

    it('should return null for non-existent user salt', () => {
      const salt = EncryptionService.getUserSalt('non-existent-user')
      assert.strictEqual(salt, null, 'Should return null for non-existent user')
    })
  })

  describe('Performance', () => {
    it('should derive key in reasonable time', () => {
      const password = 'test-password'
      const salt = EncryptionService.generateSalt()

      const startTime = Date.now()
      EncryptionService.deriveKey(password, salt)
      const duration = Date.now() - startTime

      // 100K iterations should take 10-100ms on modern hardware
      assert.ok(duration < 500, `Key derivation should be <500ms (was ${duration}ms)`)
    })

    it('should encrypt/decrypt quickly', () => {
      const plaintext = 'A'.repeat(10000) // 10KB
      const password = 'test-password'

      const startEncrypt = Date.now()
      const encrypted = EncryptionService.encrypt(plaintext, password)
      const encryptDuration = Date.now() - startEncrypt

      const startDecrypt = Date.now()
      EncryptionService.decrypt(encrypted, password)
      const decryptDuration = Date.now() - startDecrypt

      assert.ok(encryptDuration < 100, `Encryption should be <100ms (was ${encryptDuration}ms)`)
      assert.ok(decryptDuration < 100, `Decryption should be <100ms (was ${decryptDuration}ms)`)
    })
  })
})
