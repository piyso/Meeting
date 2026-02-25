/**
 * Encryption Service
 *
 * Implements AES-256-GCM encryption with PBKDF2 key derivation.
 * Used for encrypting meeting data before cloud sync.
 *
 * Security Features:
 * - PBKDF2 key derivation with 100,000 iterations
 * - AES-256-GCM authenticated encryption
 * - Unique IV per encryption operation
 * - Random salt generation (32 bytes)
 * - Client-side encryption (keys never leave device)
 */

import crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import {
  createEncryptionKey,
  getEncryptionKeyByUserId,
  hasEncryptionKey,
} from '../database/crud/encryption-keys'

/**
 * Encrypted payload structure
 */
export interface EncryptedPayload {
  ciphertext: string // Base64-encoded encrypted data
  iv: string // Base64-encoded initialization vector (12 bytes)
  salt: string // Base64-encoded salt (32 bytes)
  authTag: string // Base64-encoded authentication tag (16 bytes)
  algorithm: 'aes-256-gcm'
}

/**
 * Key derivation result
 */
export interface DerivedKey {
  key: Buffer // 256-bit encryption key
  salt: Buffer // 32-byte salt
}

/**
 * Encryption Service Class
 */
export class EncryptionService {
  private static readonly PBKDF2_ITERATIONS = 100000
  private static readonly KEY_LENGTH = 32 // 256 bits
  private static readonly SALT_LENGTH = 32 // 256 bits
  private static readonly IV_LENGTH = 12 // 96 bits (recommended for GCM)
  private static readonly HASH_ALGORITHM = 'sha256'
  private static readonly CIPHER_ALGORITHM = 'aes-256-gcm'

  /**
   * Derive encryption key from password using PBKDF2
   *
   * @param password - User password
   * @param salt - Salt (32 bytes). If not provided, generates new random salt
   * @returns Derived key and salt
   */
  public static deriveKey(password: string, salt?: Buffer): DerivedKey {
    // Generate random salt if not provided
    const actualSalt = salt || crypto.randomBytes(this.SALT_LENGTH)

    // Derive key using PBKDF2 with 100,000 iterations
    const key = crypto.pbkdf2Sync(
      password,
      actualSalt,
      this.PBKDF2_ITERATIONS,
      this.KEY_LENGTH,
      this.HASH_ALGORITHM
    )

    return {
      key,
      salt: actualSalt,
    }
  }

  /**
   * Generate random salt (32 bytes)
   *
   * @returns Random salt buffer
   */
  public static generateSalt(): Buffer {
    return crypto.randomBytes(this.SALT_LENGTH)
  }

  /**
   * Generate random IV (12 bytes)
   *
   * @returns Random IV buffer
   */
  public static generateIV(): Buffer {
    return crypto.randomBytes(this.IV_LENGTH)
  }

  /**
   * Encrypt data using AES-256-GCM
   *
   * @param plaintext - Data to encrypt
   * @param password - User password
   * @param salt - Optional salt (if not provided, generates new salt)
   * @returns Encrypted payload with ciphertext, IV, salt, and auth tag
   */
  public static encrypt(plaintext: string, password: string, salt?: Buffer): EncryptedPayload {
    // Derive encryption key
    const { key, salt: actualSalt } = this.deriveKey(password, salt)

    // Generate unique IV for this encryption
    const iv = this.generateIV()

    // Create cipher
    const cipher = crypto.createCipheriv(this.CIPHER_ALGORITHM, key, iv)

    // Encrypt data
    let ciphertext = cipher.update(plaintext, 'utf8', 'base64')
    ciphertext += cipher.final('base64')

    // Get authentication tag (GCM provides authenticated encryption)
    const authTag = cipher.getAuthTag()

    return {
      ciphertext,
      iv: iv.toString('base64'),
      salt: actualSalt.toString('base64'),
      authTag: authTag.toString('base64'),
      algorithm: 'aes-256-gcm',
    }
  }

  /**
   * Decrypt data using AES-256-GCM
   *
   * @param payload - Encrypted payload
   * @param password - User password
   * @returns Decrypted plaintext
   * @throws Error if decryption fails (wrong password or corrupted data)
   */
  public static decrypt(payload: EncryptedPayload, password: string): string {
    // Decode Base64 values
    const salt = Buffer.from(payload.salt, 'base64')
    const iv = Buffer.from(payload.iv, 'base64')
    const authTag = Buffer.from(payload.authTag, 'base64')

    // Derive encryption key using same salt
    const { key } = this.deriveKey(password, salt)

    // Create decipher
    const decipher = crypto.createDecipheriv(this.CIPHER_ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)

    // Decrypt data
    let plaintext = decipher.update(payload.ciphertext, 'base64', 'utf8')
    plaintext += decipher.final('utf8')

    return plaintext
  }

  /**
   * Initialize encryption for a user
   * Creates encryption key record in database with random salt
   *
   * @param userId - User ID
   * @param password - User password
   * @returns Encryption key ID and salt
   */
  public static async initializeUserEncryption(
    userId: string,
    password: string
  ): Promise<{ keyId: string; salt: Buffer }> {
    // Check if user already has encryption key
    if (hasEncryptionKey(userId)) {
      const existingKey = getEncryptionKeyByUserId(userId)
      if (existingKey) {
        return {
          keyId: existingKey.id,
          salt: existingKey.salt,
        }
      }
    }

    // Generate new salt
    const salt = this.generateSalt()

    // Verify key derivation works
    const { key } = this.deriveKey(password, salt)
    if (key.length !== this.KEY_LENGTH) {
      throw new Error('Key derivation failed: invalid key length')
    }

    // Create encryption key record
    const keyId = uuidv4()
    createEncryptionKey({
      id: keyId,
      user_id: userId,
      salt,
    })

    return { keyId, salt }
  }

  /**
   * Get user's encryption salt from database
   *
   * @param userId - User ID
   * @returns Salt buffer or null if not found
   */
  public static getUserSalt(userId: string): Buffer | null {
    const encryptionKey = getEncryptionKeyByUserId(userId)
    return encryptionKey ? encryptionKey.salt : null
  }

  /**
   * Test encryption/decryption round-trip
   * Verifies that decrypt(encrypt(data)) === data
   *
   * @param testData - Data to test with
   * @param password - Password to use
   * @returns True if round-trip successful
   */
  public static testRoundTrip(testData: string, password: string): boolean {
    try {
      const encrypted = this.encrypt(testData, password)
      const decrypted = this.decrypt(encrypted, password)
      return decrypted === testData
    } catch (error) {
      console.error('Encryption round-trip test failed:', error)
      return false
    }
  }
}
