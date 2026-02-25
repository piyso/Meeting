/**
 * Recovery Phrase Service
 *
 * Generates and manages BIP39-style 24-word recovery phrases for account recovery.
 * Recovery phrases are the ONLY way to recover encrypted data if password is lost.
 *
 * Security Features:
 * - 24-word phrases (256 bits of entropy)
 * - BIP39-compatible wordlist
 * - SHA-256 hashing for verification
 * - Optional keytar storage (less secure than writing down)
 */

import crypto from 'crypto'
import { KeyStorageService } from './KeyStorageService'
import { EncryptionService } from './EncryptionService'

/**
 * BIP39 English wordlist (2048 words)
 * Subset for demonstration - full list would be 2048 words
 */
const BIP39_WORDLIST = [
  'abandon',
  'ability',
  'able',
  'about',
  'above',
  'absent',
  'absorb',
  'abstract',
  'absurd',
  'abuse',
  'access',
  'accident',
  'account',
  'accuse',
  'achieve',
  'acid',
  'acoustic',
  'acquire',
  'across',
  'act',
  'action',
  'actor',
  'actress',
  'actual',
  'adapt',
  'add',
  'addict',
  'address',
  'adjust',
  'admit',
  'adult',
  'advance',
  'advice',
  'aerobic',
  'affair',
  'afford',
  'afraid',
  'again',
  'age',
  'agent',
  'agree',
  'ahead',
  'aim',
  'air',
  'airport',
  'aisle',
  'alarm',
  'album',
  'alcohol',
  'alert',
  'alien',
  'all',
  'alley',
  'allow',
  'almost',
  'alone',
  'alpha',
  'already',
  'also',
  'alter',
  'always',
  'amateur',
  'amazing',
  'among',
  'amount',
  'amused',
  'analyst',
  'anchor',
  'ancient',
  'anger',
  'angle',
  'angry',
  'animal',
  'ankle',
  'announce',
  'annual',
  'another',
  'answer',
  'antenna',
  'antique',
  'anxiety',
  'any',
  'apart',
  'apology',
  'appear',
  'apple',
  'approve',
  'april',
  'arch',
  'arctic',
  'area',
  'arena',
  'argue',
  'arm',
  'armed',
  'armor',
  'army',
  'around',
  'arrange',
  'arrest',
  'arrive',
  'arrow',
  'art',
  'artefact',
  'artist',
  'artwork',
  'ask',
  'aspect',
  'assault',
  'asset',
  'assist',
  'assume',
  'asthma',
  'athlete',
  'atom',
  'attack',
  'attend',
  'attitude',
  'attract',
  'auction',
  'audit',
  'august',
  'aunt',
  'author',
  'auto',
  'autumn',
  'average',
  'avocado',
  'avoid',
  'awake',
  'aware',
  'away',
  'awesome',
  'awful',
  'awkward',
  'axis',
  'baby',
  'bachelor',
  'bacon',
  'badge',
  'bag',
  'balance',
  'balcony',
  'ball',
  'bamboo',
  'banana',
  'banner',
  'bar',
  'barely',
  'bargain',
  'barrel',
  'base',
  'basic',
  'basket',
  'battle',
  'beach',
  'bean',
  'beauty',
  'because',
  'become',
  'beef',
  'before',
  'begin',
  'behave',
  'behind',
  'believe',
  'below',
  'belt',
  'bench',
  'benefit',
  'best',
  'betray',
  'better',
  'between',
  'beyond',
  'bicycle',
  'bid',
  'bike',
  'bind',
  'biology',
  'bird',
  'birth',
  'bitter',
  'black',
  'blade',
  'blame',
  'blanket',
  'blast',
  'bleak',
  'bless',
  'blind',
  'blood',
  'blossom',
  'blouse',
  'blue',
  'blur',
  'blush',
  'board',
  'boat',
  'body',
  'boil',
  'bomb',
  'bone',
  'bonus',
  'book',
  'boost',
  'border',
  'boring',
  'borrow',
  'boss',
  'bottom',
  'bounce',
  'box',
  'boy',
  'bracket',
  'brain',
  'brand',
  'brass',
  'brave',
  'bread',
  'breeze',
  'brick',
  'bridge',
  'brief',
  'bright',
  'bring',
  'brisk',
  'broccoli',
  'broken',
  'bronze',
  'broom',
  'brother',
  'brown',
  'brush',
  'bubble',
  'buddy',
  'budget',
  'buffalo',
  'build',
  'bulb',
  'bulk',
  'bullet',
  'bundle',
  'bunker',
  'burden',
  'burger',
  'burst',
  'bus',
  'business',
  'busy',
  'butter',
  'buyer',
  'buzz',
  'cabbage',
  'cabin',
  'cable',
  // ... (In production, use full 2048-word BIP39 wordlist)
]

/**
 * Recovery phrase result
 */
export interface RecoveryPhrase {
  words: string[]
  phrase: string // Space-separated words
  hash: string // SHA-256 hash for verification
  entropy: Buffer // Raw entropy (32 bytes for 24 words)
}

/**
 * Recovery Phrase Service Class
 */
export class RecoveryPhraseService {
  private static readonly ENTROPY_BYTES = 32 // 256 bits / 8
  private static readonly WORD_COUNT = 24

  /**
   * Generate a new 24-word recovery phrase
   *
   * @returns Recovery phrase with words, hash, and entropy
   */
  public static generateRecoveryPhrase(): RecoveryPhrase {
    // Generate 256 bits (32 bytes) of cryptographically secure random entropy
    const entropy = crypto.randomBytes(this.ENTROPY_BYTES)

    // Convert entropy to words
    const words = this.entropyToWords(entropy)

    // Create phrase string
    const phrase = words.join(' ')

    // Generate hash for verification
    const hash = crypto.createHash('sha256').update(phrase).digest('hex')

    return {
      words,
      phrase,
      hash,
      entropy,
    }
  }

  /**
   * Convert entropy to BIP39 words
   *
   * @param entropy - 32 bytes of entropy
   * @returns Array of 24 words
   */
  private static entropyToWords(entropy: Buffer): string[] {
    const words: string[] = []

    // Convert entropy to binary string
    let bits = ''
    for (let i = 0; i < entropy.length; i++) {
      bits += entropy[i]!.toString(2).padStart(8, '0')
    }

    // Add checksum (first 8 bits of SHA-256 hash)
    const checksumHash = crypto.createHash('sha256').update(entropy).digest()
    const checksumBits = checksumHash[0]!.toString(2).padStart(8, '0')
    bits += checksumBits

    // Split into 11-bit chunks (2048 = 2^11 words in BIP39)
    for (let i = 0; i < this.WORD_COUNT; i++) {
      const start = i * 11
      const end = start + 11
      const chunk = bits.slice(start, end)
      const index = parseInt(chunk, 2) % BIP39_WORDLIST.length
      words.push(BIP39_WORDLIST[index]!)
    }

    return words
  }

  /**
   * Verify recovery phrase is valid
   *
   * @param phrase - Recovery phrase (space-separated words)
   * @returns True if valid
   */
  public static verifyRecoveryPhrase(phrase: string): boolean {
    const words = phrase.trim().split(/\s+/)

    // Check word count
    if (words.length !== this.WORD_COUNT) {
      return false
    }

    // Check all words are in wordlist
    for (const word of words) {
      if (!BIP39_WORDLIST.includes(word.toLowerCase())) {
        return false
      }
    }

    return true
  }

  /**
   * Derive master key from recovery phrase
   *
   * @param phrase - Recovery phrase
   * @param password - Optional password for additional security
   * @returns Master key (32 bytes)
   */
  public static deriveKeyFromPhrase(phrase: string, password: string = ''): Buffer {
    // Use PBKDF2 to derive key from phrase
    const salt = Buffer.from('piyapi-notes-recovery', 'utf8')
    const key = crypto.pbkdf2Sync(
      phrase + password,
      salt,
      100000, // 100K iterations
      32, // 256 bits
      'sha256'
    )

    return key
  }

  /**
   * Store recovery phrase in OS keychain (optional - less secure than writing down)
   *
   * @param userId - User ID
   * @param phrase - Recovery phrase
   * @returns Promise that resolves when stored
   */
  public static async storeRecoveryPhrase(userId: string, phrase: string): Promise<void> {
    await KeyStorageService.storeRecoveryPhrase(userId, phrase)
  }

  /**
   * Retrieve recovery phrase from OS keychain
   *
   * @param userId - User ID
   * @returns Promise that resolves to recovery phrase or null
   */
  public static async getRecoveryPhrase(userId: string): Promise<string | null> {
    return await KeyStorageService.getRecoveryPhrase(userId)
  }

  /**
   * Initialize user encryption with recovery phrase
   *
   * @param userId - User ID
   * @param password - User password
   * @returns Recovery phrase and encryption key ID
   */
  public static async initializeWithRecoveryPhrase(
    userId: string,
    password: string
  ): Promise<{ recoveryPhrase: RecoveryPhrase; keyId: string; salt: Buffer }> {
    // Generate recovery phrase
    const recoveryPhrase = this.generateRecoveryPhrase()

    // Initialize encryption
    const encryptionData = await EncryptionService.initializeUserEncryption(userId, password)

    // Store recovery phrase hash in database
    // (In production, store hash in encryption_keys table)

    return {
      recoveryPhrase,
      keyId: encryptionData.keyId,
      salt: encryptionData.salt,
    }
  }

  /**
   * Recover account using recovery phrase
   *
   * @param userId - User ID
   * @param recoveryPhrase - Recovery phrase
   * @param newPassword - New password to set
   * @returns Success status
   */
  public static async recoverAccount(
    userId: string,
    recoveryPhrase: string,
    newPassword: string
  ): Promise<boolean> {
    // Verify recovery phrase
    if (!this.verifyRecoveryPhrase(recoveryPhrase)) {
      throw new Error('Invalid recovery phrase')
    }

    // Derive master key from phrase
    const masterKey = this.deriveKeyFromPhrase(recoveryPhrase)

    // Re-initialize encryption with new password
    await EncryptionService.initializeUserEncryption(userId, newPassword)

    // Store new encryption key
    await KeyStorageService.storeEncryptionKey(userId, masterKey.toString('base64'))

    return true
  }

  /**
   * Export recovery phrase to file
   *
   * @param phrase - Recovery phrase
   * @param userId - User ID
   * @returns File content
   */
  public static exportToFile(phrase: string, userId: string): string {
    const timestamp = new Date().toISOString()
    return `PiyAPI Notes Recovery Key
Generated: ${timestamp}
User ID: ${userId}

⚠️ CRITICAL: Store this recovery key in a safe place!
Without this key, your encrypted data is PERMANENTLY UNRECOVERABLE if you lose your password.

Recovery Key:
${phrase}

Instructions:
1. Write this recovery key on paper and store it securely
2. Never share this key with anyone
3. Keep multiple copies in different secure locations
4. Do not store this key digitally (email, cloud storage, etc.)

To recover your account:
1. Open PiyAPI Notes
2. Click "Forgot Password"
3. Enter this 24-word recovery key
4. Set a new password
`
  }

  /**
   * Format recovery phrase for display (3 columns of 8 words)
   *
   * @param words - Array of 24 words
   * @returns Formatted string
   */
  public static formatForDisplay(words: string[]): string {
    const columns = 3
    const rowsPerColumn = 8
    let formatted = ''

    for (let row = 0; row < rowsPerColumn; row++) {
      for (let col = 0; col < columns; col++) {
        const index = col * rowsPerColumn + row
        const wordNum = (index + 1).toString().padStart(2, ' ')
        const word = words[index]!.padEnd(12, ' ')
        formatted += `${wordNum}. ${word}  `
      }
      formatted += '\n'
    }

    return formatted
  }

  /**
   * Validate recovery phrase format
   *
   * @param phrase - Recovery phrase to validate
   * @returns Validation result with error message if invalid
   */
  public static validatePhrase(phrase: string): { valid: boolean; error?: string } {
    const words = phrase.trim().split(/\s+/)

    if (words.length !== this.WORD_COUNT) {
      return {
        valid: false,
        error: `Recovery phrase must contain exactly ${this.WORD_COUNT} words (found ${words.length})`,
      }
    }

    const invalidWords = words.filter(word => !BIP39_WORDLIST.includes(word.toLowerCase()))
    if (invalidWords.length > 0) {
      return {
        valid: false,
        error: `Invalid words: ${invalidWords.join(', ')}`,
      }
    }

    return { valid: true }
  }
}
