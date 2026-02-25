/**
 * CRUD Operations for Encryption Keys Table
 */

import { getDatabase } from '../connection'
import type { EncryptionKey, CreateEncryptionKeyInput } from '../../../types/database'

/**
 * Create a new encryption key
 */
export function createEncryptionKey(input: CreateEncryptionKeyInput): EncryptionKey {
  const db = getDatabase()

  const stmt = db.prepare(`
    INSERT INTO encryption_keys (
      id, user_id, salt, recovery_phrase_hash
    ) VALUES (?, ?, ?, ?)
  `)

  stmt.run(input.id, input.user_id, input.salt, input.recovery_phrase_hash || null)

  return getEncryptionKeyById(input.id)!
}

/**
 * Get encryption key by ID
 */
export function getEncryptionKeyById(id: string): EncryptionKey | null {
  const db = getDatabase()

  const stmt = db.prepare('SELECT * FROM encryption_keys WHERE id = ?')
  return stmt.get(id) as EncryptionKey | null
}

/**
 * Get encryption key by user ID
 */
export function getEncryptionKeyByUserId(userId: string): EncryptionKey | null {
  const db = getDatabase()

  const stmt = db.prepare(
    'SELECT * FROM encryption_keys WHERE user_id = ? ORDER BY created_at DESC LIMIT 1'
  )
  return stmt.get(userId) as EncryptionKey | null
}

/**
 * Get all encryption keys for a user
 */
export function getEncryptionKeysByUserId(userId: string): EncryptionKey[] {
  const db = getDatabase()

  const stmt = db.prepare(`
    SELECT * FROM encryption_keys 
    WHERE user_id = ?
    ORDER BY created_at DESC
  `)

  return stmt.all(userId) as EncryptionKey[]
}

/**
 * Update recovery phrase hash
 */
export function updateRecoveryPhraseHash(
  id: string,
  recoveryPhraseHash: string
): EncryptionKey | null {
  const db = getDatabase()

  const stmt = db.prepare(`
    UPDATE encryption_keys 
    SET recovery_phrase_hash = ?
    WHERE id = ?
  `)

  stmt.run(recoveryPhraseHash, id)

  return getEncryptionKeyById(id)
}

/**
 * Delete encryption key
 * WARNING: This will make encrypted data unrecoverable
 */
export function deleteEncryptionKey(id: string): boolean {
  const db = getDatabase()

  const stmt = db.prepare('DELETE FROM encryption_keys WHERE id = ?')
  const result = stmt.run(id)

  return result.changes > 0
}

/**
 * Delete all encryption keys for a user
 * WARNING: This will make all encrypted data for this user unrecoverable
 */
export function deleteEncryptionKeysByUserId(userId: string): number {
  const db = getDatabase()

  const stmt = db.prepare('DELETE FROM encryption_keys WHERE user_id = ?')
  const result = stmt.run(userId)

  return result.changes
}

/**
 * Check if user has encryption key
 */
export function hasEncryptionKey(userId: string): boolean {
  const db = getDatabase()

  const stmt = db.prepare('SELECT COUNT(*) as count FROM encryption_keys WHERE user_id = ?')
  const result = stmt.get(userId) as { count: number }

  return result.count > 0
}
