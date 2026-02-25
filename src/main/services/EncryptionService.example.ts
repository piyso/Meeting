/**
 * EncryptionService Usage Examples
 *
 * This file demonstrates how to use the EncryptionService for encrypting
 * meeting data before cloud sync.
 */

import { EncryptionService } from './EncryptionService'

/**
 * Example 1: Basic Encryption/Decryption
 */
function basicEncryptionExample() {
  const plaintext = 'This is a confidential meeting transcript.'
  const password = 'user-secure-password'

  // Encrypt data
  const encrypted = EncryptionService.encrypt(plaintext, password)
  console.log('Encrypted:', {
    ciphertext: encrypted.ciphertext.slice(0, 20) + '...',
    iv: encrypted.iv,
    salt: encrypted.salt,
    authTag: encrypted.authTag,
    algorithm: encrypted.algorithm,
  })

  // Decrypt data
  const decrypted = EncryptionService.decrypt(encrypted, password)
  console.log('Decrypted:', decrypted)
  console.log('Match:', decrypted === plaintext)
}

/**
 * Example 2: Encrypting Meeting Data
 */
function encryptMeetingData() {
  const meetingData = {
    id: 'meeting-123',
    title: 'Q1 Planning Meeting',
    transcript: 'Confidential discussion about company strategy...',
    notes: ['Budget allocation: $500K', 'New hire: Senior Engineer', 'Launch date: March 15'],
    participants: ['Alice', 'Bob', 'Charlie'],
  }

  const password = 'user-password'
  const plaintext = JSON.stringify(meetingData)

  // Encrypt before sending to cloud
  const encrypted = EncryptionService.encrypt(plaintext, password)

  // Later, decrypt after downloading from cloud
  const decrypted = EncryptionService.decrypt(encrypted, password)
  const recovered = JSON.parse(decrypted)

  console.log('Original meeting ID:', meetingData.id)
  console.log('Recovered meeting ID:', recovered.id)
  console.log('Data integrity:', JSON.stringify(meetingData) === JSON.stringify(recovered))
}

/**
 * Example 3: Using Stored Salt (Database Integration)
 */
async function usingSaltFromDatabase() {
  const userId = 'user-456'
  const password = 'user-password'

  // Initialize encryption for user (first time)
  const { keyId, salt } = await EncryptionService.initializeUserEncryption(userId, password)
  console.log('Encryption initialized:', { keyId, saltLength: salt.length })

  // Later, retrieve salt from database
  const storedSalt = EncryptionService.getUserSalt(userId)
  if (!storedSalt) {
    throw new Error('User salt not found')
  }

  // Encrypt using stored salt
  const plaintext = 'Meeting data to sync'
  const encrypted = EncryptionService.encrypt(plaintext, password, storedSalt)

  // Decrypt
  const decrypted = EncryptionService.decrypt(encrypted, password)
  console.log('Round-trip successful:', decrypted === plaintext)
}

/**
 * Example 4: Key Derivation
 */
function keyDerivationExample() {
  const password = 'user-password'
  const salt = EncryptionService.generateSalt()

  console.log('Deriving key with PBKDF2...')
  const startTime = Date.now()
  const { key } = EncryptionService.deriveKey(password, salt)
  const duration = Date.now() - startTime

  console.log('Key derived:', {
    keyLength: key.length,
    keyHex: key.toString('hex').slice(0, 32) + '...',
    iterations: 100000,
    algorithm: 'PBKDF2-SHA256',
    duration: `${duration}ms`,
  })
}

/**
 * Example 5: Testing Round-Trip
 */
function testRoundTrip() {
  const testData = 'Important meeting notes'
  const password = 'test-password'

  const success = EncryptionService.testRoundTrip(testData, password)
  console.log('Round-trip test:', success ? 'PASSED ✓' : 'FAILED ✗')
}

/**
 * Example 6: Handling Encryption Errors
 */
function errorHandlingExample() {
  const plaintext = 'Secret data'
  const correctPassword = 'correct-password'
  const wrongPassword = 'wrong-password'

  // Encrypt with correct password
  const encrypted = EncryptionService.encrypt(plaintext, correctPassword)

  // Try to decrypt with wrong password
  try {
    EncryptionService.decrypt(encrypted, wrongPassword)
    console.log('ERROR: Should have thrown!')
  } catch (error) {
    console.log('Correctly rejected wrong password:', (error as Error).message)
  }

  // Decrypt with correct password
  try {
    const decrypted = EncryptionService.decrypt(encrypted, correctPassword)
    console.log('Successfully decrypted with correct password:', decrypted.substring(0, 10))
  } catch (error) {
    console.log('ERROR: Should not have thrown!', error)
  }
}

/**
 * Example 7: Sync Workflow
 */
async function syncWorkflowExample() {
  const userId = 'user-789'
  const password = 'user-password'

  // Step 1: Initialize encryption (on first sync)
  await EncryptionService.initializeUserEncryption(userId, password)

  // Step 2: Prepare data for sync
  const meetingData = {
    id: 'meeting-456',
    transcript: 'Confidential meeting content...',
    notes: ['Action item 1', 'Action item 2'],
  }

  // Step 3: Get user's salt
  const salt = EncryptionService.getUserSalt(userId)
  if (!salt) {
    throw new Error('User not initialized for encryption')
  }

  // Step 4: Encrypt before upload
  const plaintext = JSON.stringify(meetingData)
  const encrypted = EncryptionService.encrypt(plaintext, password, salt)

  // Step 5: Upload to cloud (simulated)
  console.log('Uploading encrypted data to cloud...')
  const uploadPayload = {
    userId,
    encryptedData: encrypted,
    timestamp: Date.now(),
  }

  // Step 6: Download from cloud (simulated)
  console.log('Downloading encrypted data from cloud...')
  const downloadedPayload = uploadPayload

  // Step 7: Decrypt after download
  const decrypted = EncryptionService.decrypt(downloadedPayload.encryptedData, password)
  const recoveredData = JSON.parse(decrypted)

  console.log('Sync workflow complete:', {
    originalId: meetingData.id,
    recoveredId: recoveredData.id,
    match: JSON.stringify(meetingData) === JSON.stringify(recoveredData),
  })
}

/**
 * Example 8: Performance Benchmarking
 */
function performanceBenchmark() {
  const password = 'test-password'
  const testSizes = [
    { name: '1KB', size: 1024 },
    { name: '10KB', size: 10240 },
    { name: '100KB', size: 102400 },
    { name: '1MB', size: 1048576 },
  ]

  console.log('Performance Benchmark:')
  console.log('='.repeat(60))

  for (const test of testSizes) {
    const plaintext = 'A'.repeat(test.size)

    // Measure encryption
    const encryptStart = Date.now()
    const encrypted = EncryptionService.encrypt(plaintext, password)
    const encryptDuration = Date.now() - encryptStart

    // Measure decryption
    const decryptStart = Date.now()
    EncryptionService.decrypt(encrypted, password)
    const decryptDuration = Date.now() - decryptStart

    console.log(`${test.name}:`)
    console.log(`  Encryption: ${encryptDuration}ms`)
    console.log(`  Decryption: ${decryptDuration}ms`)
    console.log(`  Total: ${encryptDuration + decryptDuration}ms`)
  }
}

// Run examples (uncomment to test)
// basicEncryptionExample()
// encryptMeetingData()
// usingSaltFromDatabase()
// keyDerivationExample()
// testRoundTrip()
// errorHandlingExample()
// syncWorkflowExample()
// performanceBenchmark()

export {
  basicEncryptionExample,
  encryptMeetingData,
  usingSaltFromDatabase,
  keyDerivationExample,
  testRoundTrip,
  errorHandlingExample,
  syncWorkflowExample,
  performanceBenchmark,
}
