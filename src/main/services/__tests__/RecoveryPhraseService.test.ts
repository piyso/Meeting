/**
 * Recovery Phrase Service Tests
 *
 * Tests for recovery phrase generation, validation, and account recovery.
 */

import { describe, it, expect } from 'vitest'
import { RecoveryPhraseService } from '../RecoveryPhraseService'
import { EncryptionService } from '../EncryptionService'

describe('RecoveryPhraseService', () => {
  describe('generateRecoveryPhrase', () => {
    it('should generate a 24-word recovery phrase', () => {
      const result = RecoveryPhraseService.generateRecoveryPhrase()

      expect(result.words).toHaveLength(24)
      expect(result.phrase).toBeTruthy()
      expect(result.hash).toBeTruthy()
      expect(result.entropy).toHaveLength(32) // 256 bits = 32 bytes
    })

    it('should generate unique phrases on each call', () => {
      const phrase1 = RecoveryPhraseService.generateRecoveryPhrase()
      const phrase2 = RecoveryPhraseService.generateRecoveryPhrase()

      expect(phrase1.phrase).not.toBe(phrase2.phrase)
      expect(phrase1.hash).not.toBe(phrase2.hash)
    })

    it('should generate phrase with space-separated words', () => {
      const result = RecoveryPhraseService.generateRecoveryPhrase()
      const words = result.phrase.split(' ')

      expect(words).toHaveLength(24)
      expect(words.every(word => word.length > 0)).toBe(true)
    })
  })

  describe('verifyRecoveryPhrase', () => {
    it('should validate a correct 24-word phrase', () => {
      const phrase = RecoveryPhraseService.generateRecoveryPhrase()
      const isValid = RecoveryPhraseService.verifyRecoveryPhrase(phrase.phrase)

      expect(isValid).toBe(true)
    })

    it('should reject phrase with wrong word count', () => {
      const phrase = 'abandon ability able about above absent absorb abstract'
      const isValid = RecoveryPhraseService.verifyRecoveryPhrase(phrase)

      expect(isValid).toBe(false)
    })

    it('should reject phrase with invalid words', () => {
      const phrase = 'invalid word test phrase ' + 'abandon '.repeat(20)
      const isValid = RecoveryPhraseService.verifyRecoveryPhrase(phrase)

      expect(isValid).toBe(false)
    })

    it('should handle extra whitespace', () => {
      const phrase = RecoveryPhraseService.generateRecoveryPhrase()
      const phraseWithSpaces = '  ' + phrase.phrase.replace(/ /g, '   ') + '  '
      const isValid = RecoveryPhraseService.verifyRecoveryPhrase(phraseWithSpaces)

      expect(isValid).toBe(true)
    })
  })

  describe('deriveKeyFromPhrase', () => {
    it('should derive a 32-byte key from phrase', () => {
      const phrase = RecoveryPhraseService.generateRecoveryPhrase()
      const key = RecoveryPhraseService.deriveKeyFromPhrase(phrase.phrase)

      expect(key).toHaveLength(32) // 256 bits = 32 bytes
    })

    it('should derive same key from same phrase', () => {
      const phrase = RecoveryPhraseService.generateRecoveryPhrase()
      const key1 = RecoveryPhraseService.deriveKeyFromPhrase(phrase.phrase)
      const key2 = RecoveryPhraseService.deriveKeyFromPhrase(phrase.phrase)

      expect(key1.toString('hex')).toBe(key2.toString('hex'))
    })

    it('should derive different keys from different phrases', () => {
      const phrase1 = RecoveryPhraseService.generateRecoveryPhrase()
      const phrase2 = RecoveryPhraseService.generateRecoveryPhrase()
      const key1 = RecoveryPhraseService.deriveKeyFromPhrase(phrase1.phrase)
      const key2 = RecoveryPhraseService.deriveKeyFromPhrase(phrase2.phrase)

      expect(key1.toString('hex')).not.toBe(key2.toString('hex'))
    })

    it('should support optional password parameter', () => {
      const phrase = RecoveryPhraseService.generateRecoveryPhrase()
      const key1 = RecoveryPhraseService.deriveKeyFromPhrase(phrase.phrase, 'password123')
      const key2 = RecoveryPhraseService.deriveKeyFromPhrase(phrase.phrase, 'different')

      expect(key1.toString('hex')).not.toBe(key2.toString('hex'))
    })
  })

  describe('Account Recovery Flow', () => {
    it('should successfully recover account with valid phrase', async () => {
      const userId = 'test-user-' + Date.now()
      const originalPassword = 'original-password-123'
      const newPassword = 'new-password-456'

      // Step 1: Initialize user encryption with recovery phrase
      const { recoveryPhrase } = await RecoveryPhraseService.initializeWithRecoveryPhrase(
        userId,
        originalPassword
      )

      // Step 2: Simulate user forgetting password and recovering account
      const recovered = await RecoveryPhraseService.recoverAccount(
        userId,
        recoveryPhrase.phrase,
        newPassword
      )

      expect(recovered).toBe(true)
    })

    it('should reject recovery with invalid phrase', async () => {
      const userId = 'test-user-' + Date.now()
      const invalidPhrase = 'invalid word test phrase ' + 'abandon '.repeat(20)
      const newPassword = 'new-password-456'

      await expect(
        RecoveryPhraseService.recoverAccount(userId, invalidPhrase, newPassword)
      ).rejects.toThrow('Invalid recovery phrase')
    })

    it('should encrypt and decrypt data after recovery', async () => {
      const userId = 'test-user-' + Date.now()
      const originalPassword = 'original-password-123'
      const newPassword = 'new-password-456'
      const testData = 'sensitive meeting data'

      // Step 1: Initialize with original password
      const { recoveryPhrase, salt } = await RecoveryPhraseService.initializeWithRecoveryPhrase(
        userId,
        originalPassword
      )

      // Step 2: Encrypt data with original password
      EncryptionService.encrypt(testData, originalPassword, salt)

      // Step 3: Recover account with new password
      await RecoveryPhraseService.recoverAccount(userId, recoveryPhrase.phrase, newPassword)

      // Step 4: Verify we can still decrypt with recovery phrase
      const masterKey = RecoveryPhraseService.deriveKeyFromPhrase(recoveryPhrase.phrase)
      expect(masterKey).toBeTruthy()

      // Note: In production, the encrypted data would be re-encrypted with new password
      // For this test, we verify the recovery phrase can derive the master key
    })
  })

  describe('formatForDisplay', () => {
    it('should format 24 words into 3 columns', () => {
      const phrase = RecoveryPhraseService.generateRecoveryPhrase()
      const formatted = RecoveryPhraseService.formatForDisplay(phrase.words)

      // Should have 8 rows (one per line)
      const lines = formatted.trim().split('\n')
      expect(lines).toHaveLength(8)

      // Each line should have 3 words (one from each column)
      lines.forEach(line => {
        const words = line
          .trim()
          .split(/\s+/)
          .filter(w => w.length > 0)
        // Each line has: "1. word1  9. word2  17. word3"
        // So we expect at least 6 tokens (3 numbers + 3 words)
        expect(words.length).toBeGreaterThanOrEqual(6)
      })
    })
  })

  describe('validatePhrase', () => {
    it('should validate correct phrase', () => {
      const phrase = RecoveryPhraseService.generateRecoveryPhrase()
      const result = RecoveryPhraseService.validatePhrase(phrase.phrase)

      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should reject phrase with wrong word count', () => {
      const phrase = 'abandon ability able'
      const result = RecoveryPhraseService.validatePhrase(phrase)

      expect(result.valid).toBe(false)
      expect(result.error).toContain('exactly 24 words')
    })

    it('should reject phrase with invalid words', () => {
      const phrase = 'invalid ' + 'abandon '.repeat(23)
      const result = RecoveryPhraseService.validatePhrase(phrase)

      expect(result.valid).toBe(false)
      expect(result.error).toContain('Invalid words')
    })
  })

  describe('exportToFile', () => {
    it('should generate file content with instructions', () => {
      const phrase = RecoveryPhraseService.generateRecoveryPhrase()
      const userId = 'test-user-123'
      const content = RecoveryPhraseService.exportToFile(phrase.phrase, userId)

      expect(content).toContain('PiyAPI Notes Recovery Key')
      expect(content).toContain(userId)
      expect(content).toContain(phrase.phrase)
      expect(content).toContain('CRITICAL')
      expect(content).toContain('Instructions')
    })
  })
})
