/**
 * Account keyring
 *
 * Synced content is encrypted with one 256-bit *data key* per account. This
 * service decides what that key is on a given device and keeps wrapped
 * (encrypted) copies of it in the cloud, so the key can be recovered on
 * another device — or on this one after a reinstall — by someone who knows the
 * account password or holds a recovery phrase.
 *
 * Why it exists. The data key used to *be* a hash of the login password:
 *   - an account that signs in with Google has no password, so it could never
 *     sync at all;
 *   - changing or resetting the password changed the key, and everything
 *     already uploaded became unreadable;
 *   - the 24-word recovery phrase shown at onboarding was not connected to
 *     anything and could not recover any data.
 * Now the data key never changes. The password and each recovery phrase only
 * unwrap it.
 *
 * The keyring document (namespace `meetings.keyring`) holds no secret in the
 * clear: wrapped copies of the data key and a check value.
 *
 * Which key an account gets:
 *   - a device that already holds one keeps it, and a keyring is made around it;
 *   - an account with uploads from before keyrings keeps the key its password
 *     produced then, so those uploads stay readable;
 *   - otherwise the key is random. A password-derived key can be guessed
 *     offline at the old, lower work factor, and it stays valid for whoever
 *     learns an old password — a random one has neither problem.
 *
 * What this does not change: the password still travels to the sign-in
 * provider at login. A copy wrapped with a recovery phrase is known to nobody
 * but the user; a copy wrapped with the password is only as private as that.
 */

import crypto from 'crypto'
import { promisify } from 'util'
import type { IBackendProvider, Memory } from './backend/IBackendProvider'
import { EncryptionService } from './EncryptionService'
import { KeyStorageService, KeyType } from './KeyStorageService'
import { isKeychainUnavailable } from './keytarSafe'
import { Logger } from './Logger'

const log = Logger.create('Keyring')
const pbkdf2 = promisify(crypto.pbkdf2)

export const KEYRING_NAMESPACE = 'meetings.keyring'

const KEY_BYTES = 32
/** OWASP 2023 guidance for PBKDF2-HMAC-SHA256 over a human-chosen password. */
const PASSWORD_ITERATIONS = 600_000
/** A recovery phrase carries 256 bits of entropy; stretching adds nothing. */
const RECOVERY_ITERATIONS = 10_000
/** How the data key was derived before keyrings existed. */
const LEGACY_ITERATIONS = 100_000
/** Most recovery phrases kept valid at once (each device may create one). */
const MAX_RECOVERY_WRAPS = 24
/** A wrap asking for more work than this is not one this app wrote. */
const MAX_UNWRAP_ITERATIONS = 2_000_000
const WRAP_AAD = Buffer.from('bluearkive-keyring-wrap-v1')
const CHECK_LABEL = 'bluearkive-keyring-check-v1'

interface WrappedKey {
  kdf: 'pbkdf2-sha256'
  iterations: number
  salt: string
  iv: string
  tag: string
  ct: string
}

export interface KeyringDocument {
  v: 1
  /** Lets a device confirm that a key it holds or has just unwrapped is the account's key. */
  check: string
  wraps: {
    password?: WrappedKey
    recovery?: WrappedKey[]
  }
  /** When the keyring was first written; the oldest one is the account's (see fetchKeyring). */
  createdAt: number
  updatedAt: number
}

/** Why this device cannot encrypt for the account yet. */
export type KeyringLock =
  /** The account's key can be unwrapped with its password; sign in with it here. */
  | 'password_required'
  /** Only a recovery phrase can unwrap the key on this device. */
  | 'recovery_phrase_required'
  /** The keyring could not be read or written (offline, service down); retried later. */
  | 'unavailable'
  /**
   * A password-less account would get a key that only this device's keychain
   * and a recovery phrase kept there can restore — and there is no keychain.
   */
  | 'no_secure_storage'

export type KeyringOutcome = { status: 'ready' } | { status: 'locked'; reason: KeyringLock }

const locked = (reason: KeyringLock): KeyringOutcome => ({ status: 'locked', reason })

// ── Primitives ───────────────────────────────────────────────────

function checkValue(dataKey: Buffer): string {
  return crypto
    .createHmac('sha256', dataKey)
    .update(CHECK_LABEL)
    .digest()
    .subarray(0, 16)
    .toString('base64')
}

function sameCheck(dataKey: Buffer, expected: string): boolean {
  const actual = Buffer.from(checkValue(dataKey))
  const wanted = Buffer.from(expected)
  return actual.length === wanted.length && crypto.timingSafeEqual(actual, wanted)
}

async function wrapKey(dataKey: Buffer, secret: string, iterations: number): Promise<WrappedKey> {
  const salt = crypto.randomBytes(16)
  const kek = await pbkdf2(secret, salt, iterations, KEY_BYTES, 'sha256')
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', kek, iv)
  cipher.setAAD(WRAP_AAD)
  const ct = Buffer.concat([cipher.update(dataKey), cipher.final()])
  kek.fill(0)
  return {
    kdf: 'pbkdf2-sha256',
    iterations,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ct: ct.toString('base64'),
  }
}

/** The data key inside a wrap, or null when the secret is not the one that made it. */
async function unwrapKey(wrapped: WrappedKey, secret: string): Promise<Buffer | null> {
  try {
    if (wrapped.kdf !== 'pbkdf2-sha256') return null
    // A hostile document must not be able to stall the app with a huge work factor.
    if (!Number.isInteger(wrapped.iterations) || wrapped.iterations < 1) return null
    if (wrapped.iterations > MAX_UNWRAP_ITERATIONS) return null
    const kek = await pbkdf2(
      secret,
      Buffer.from(wrapped.salt, 'base64'),
      wrapped.iterations,
      KEY_BYTES,
      'sha256'
    )
    const decipher = crypto.createDecipheriv('aes-256-gcm', kek, Buffer.from(wrapped.iv, 'base64'))
    decipher.setAAD(WRAP_AAD)
    decipher.setAuthTag(Buffer.from(wrapped.tag, 'base64'))
    const key = Buffer.concat([
      decipher.update(Buffer.from(wrapped.ct, 'base64')),
      decipher.final(),
    ])
    kek.fill(0)
    return key.length === KEY_BYTES ? key : null
  } catch {
    return null
  }
}

/** The key a password produced before keyrings existed (see SyncManager history). */
async function legacyKey(userId: string, password: string): Promise<Buffer> {
  return pbkdf2(
    password,
    EncryptionService.syncSaltFor(userId),
    LEGACY_ITERATIONS,
    KEY_BYTES,
    'sha256'
  )
}

/** Recovery phrases are compared as lower-case words separated by single spaces. */
export function normalizeRecoveryPhrase(phrase: string): string {
  return phrase.trim().toLowerCase().split(/\s+/).filter(Boolean).join(' ')
}

function isWrappedKey(value: unknown): value is WrappedKey {
  const wrap = value as Partial<WrappedKey> | null
  return (
    !!wrap &&
    typeof wrap === 'object' &&
    typeof wrap.salt === 'string' &&
    typeof wrap.iv === 'string' &&
    typeof wrap.tag === 'string' &&
    typeof wrap.ct === 'string'
  )
}

function parseKeyring(memory: Memory): KeyringDocument | null {
  try {
    if (typeof memory.content !== 'string') return null
    const doc = JSON.parse(memory.content) as Partial<KeyringDocument>
    if (doc?.v !== 1 || typeof doc.check !== 'string' || !doc.wraps) return null
    const updatedAt = typeof doc.updatedAt === 'number' ? doc.updatedAt : 0
    return {
      v: 1,
      check: doc.check,
      wraps: {
        password: isWrappedKey(doc.wraps.password) ? doc.wraps.password : undefined,
        recovery: Array.isArray(doc.wraps.recovery)
          ? doc.wraps.recovery.filter(isWrappedKey).slice(-MAX_RECOVERY_WRAPS)
          : [],
      },
      createdAt: typeof doc.createdAt === 'number' ? doc.createdAt : updatedAt,
      updatedAt,
    }
  } catch {
    return null
  }
}

/**
 * When the service stored a memory, if it says. Preferred over the time the
 * writing device put in the document: a device whose write arrived second may
 * well have started first.
 */
function storedAt(memory: Memory): number | undefined {
  const record = memory as unknown as Record<string, unknown>
  for (const field of ['created_at', 'createdAt']) {
    const value = record[field]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string') {
      const parsed = Date.parse(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return undefined
}

function isOlder(a: RemoteKeyring, b: RemoteKeyring): boolean {
  if (a.storedAt !== undefined && b.storedAt !== undefined && a.storedAt !== b.storedAt) {
    return a.storedAt < b.storedAt
  }
  if (a.doc.createdAt !== b.doc.createdAt) return a.doc.createdAt < b.doc.createdAt
  return (a.id ?? '') < (b.id ?? '')
}

// ── Service ──────────────────────────────────────────────────────

interface RemoteKeyring {
  id: string | undefined
  doc: KeyringDocument
  storedAt?: number
}

export class KeyringService {
  /**
   * The password from this session's sign-in, kept only while the device is
   * still locked: to try again once the keyring can be read, and to re-wrap
   * the key after a recovery phrase has opened it. Dropped the moment the
   * device is ready. Never written anywhere.
   */
  private remembered: { userId: string; password: string } | null = null
  private tail: Promise<unknown> = Promise.resolve()

  /** @param getBackend resolved on every use — the shared backend is replaced on sign-out. */
  constructor(private readonly getBackend: () => IBackendProvider) {}

  /**
   * Work out the account's data key on this device and load it for use.
   *
   * @param password the account password when the user has just typed it
   *   (password sign-in, registration, password change); omit otherwise
   *   (app restart, Google sign-in).
   */
  establish(userId: string, password?: string): Promise<KeyringOutcome> {
    return this.exclusive(async () => {
      const outcome = await this.resolveKey(userId, password ?? this.rememberedPassword(userId))
      if (outcome.status === 'ready') this.remembered = null
      else if (password) this.remembered = { userId, password }
      return outcome
    })
  }

  /**
   * Unlock this device with a recovery phrase.
   * @throws when the phrase does not open the account's keyring.
   */
  unlockWithRecoveryPhrase(userId: string, phrase: string): Promise<KeyringOutcome> {
    return this.exclusive(async () => {
      const normalized = normalizeRecoveryPhrase(phrase)
      if (!normalized) throw new Error('Enter your recovery phrase.')

      const remote = await this.fetchKeyring()
      if (remote === undefined) {
        throw new Error('The sync service could not be reached. Try again when you are online.')
      }
      if (remote === null || !remote.doc.wraps.recovery?.length) {
        throw new Error('No recovery phrase has been set up for this account.')
      }

      for (const wrapped of remote.doc.wraps.recovery) {
        const key = await unwrapKey(wrapped, normalized)
        if (key && sameCheck(key, remote.doc.check)) {
          await this.storeLocalKey(userId, key)
          // Signed in with a password the keyring did not know (it was reset):
          // now that the key is open, that password can open it from here on.
          const password = this.rememberedPassword(userId)
          this.remembered = null
          if (password) await this.refreshWraps(userId, key, remote, password)
          return this.activate(userId, key)
        }
      }
      throw new Error('That recovery phrase does not match this account.')
    })
  }

  /**
   * Make `phrase` able to recover the account's key. Earlier phrases stay
   * valid: a second device creating its own must not silently invalidate the
   * one the user wrote down on the first.
   *
   * @returns false when this device does not hold the key yet, or the keyring
   *   could not be updated — establish() retries it from the stored phrase.
   */
  addRecoveryPhrase(userId: string, phrase: string): Promise<boolean> {
    return this.exclusive(async () => {
      const normalized = normalizeRecoveryPhrase(phrase)
      const key = await this.loadLocalKey(userId)
      if (!normalized || !key) return false

      const remote = await this.fetchKeyring()
      if (remote === undefined) return false
      if (remote && !sameCheck(key, remote.doc.check)) return false

      return this.appendRecoveryWrap(key, remote, normalized)
    })
  }

  // ── Deciding the key ───────────────────────────────────────────

  private async resolveKey(userId: string, password?: string): Promise<KeyringOutcome> {
    const local = await this.loadLocalKey(userId)
    const remote = await this.fetchKeyring()

    if (remote === undefined) {
      // Cannot tell what the account's key is. A key this device already
      // holds is the best answer there is; anything else has to wait —
      // deriving or inventing one now could differ from the account's.
      return local ? this.activate(userId, local) : locked('unavailable')
    }
    if (remote === null) return this.createKeyring(userId, local, password)
    return this.openKeyring(userId, remote, local, password)
  }

  /** The account has no keyring yet: settle on its key and write one. */
  private async createKeyring(
    userId: string,
    local: Buffer | null,
    password?: string
  ): Promise<KeyringOutcome> {
    let key = local
    let minted = false

    if (!key) {
      const hasData = await this.cloudHasEncryptedData()
      if (hasData === undefined) return locked('unavailable')
      if (hasData) {
        // Uploaded by a build without keyrings, so encrypted with the key the
        // password produced. Only the password leads back to it.
        if (!password) return locked('password_required')
        key = await legacyKey(userId, password)
      } else {
        if (!password) {
          // Nothing but a recovery phrase will be able to restore this key.
          if (isKeychainUnavailable()) return locked('no_secure_storage')
          await this.ensureStoredRecoveryPhrase(userId)
        }
        key = crypto.randomBytes(KEY_BYTES)
        minted = true
      }
    }

    const now = Date.now()
    const doc: KeyringDocument = {
      v: 1,
      check: checkValue(key),
      wraps: { recovery: [] },
      createdAt: now,
      updatedAt: now,
    }
    if (password) doc.wraps.password = await wrapKey(key, password, PASSWORD_ITERATIONS)
    const phrase = await this.storedRecoveryPhrase(userId)
    if (phrase) doc.wraps.recovery = [await wrapKey(key, phrase, RECOVERY_ITERATIONS)]

    // Nothing to upload until there is at least one way to unwrap it.
    let savedId: string | undefined
    let saved = false
    if (doc.wraps.password || doc.wraps.recovery?.length) {
      try {
        savedId = await this.saveKeyring(undefined, doc)
        saved = true
      } catch (err) {
        log.warn('Could not write the account keyring:', err instanceof Error ? err.message : err)
      }
    }

    if (minted) {
      // A key invented a moment ago exists nowhere else. Until the cloud has a
      // wrapped copy, a second device would invent its own and signing out
      // here would lose this one — so it is not used yet.
      if (!saved) return locked('unavailable')

      // Two devices signing in to a new account at the same moment both get
      // here. The oldest keyring is the account's; the other device adopts it.
      const current = await this.fetchKeyring()
      if (current === undefined) return locked('unavailable')
      if (current && !sameCheck(key, current.doc.check)) {
        log.info('Another device created the account keyring first; adopting it')
        if (savedId) await this.discardKeyring(savedId)
        return this.openKeyring(userId, current, null, password)
      }
    }

    await this.storeLocalKey(userId, key)
    return this.activate(userId, key)
  }

  /** The account has a keyring: get its key onto this device. */
  private async openKeyring(
    userId: string,
    remote: RemoteKeyring,
    local: Buffer | null,
    password?: string
  ): Promise<KeyringOutcome> {
    const { doc } = remote

    if (local && sameCheck(local, doc.check)) {
      await this.refreshWraps(userId, local, remote, password)
      return this.activate(userId, local)
    }

    if (password) {
      let key = doc.wraps.password ? await unwrapKey(doc.wraps.password, password) : null
      if (key && !sameCheck(key, doc.check)) key = null
      if (!key) {
        // A keyring made by a device that only had a recovery phrase to wrap
        // with, around the key this password produced before keyrings.
        const derived = await legacyKey(userId, password)
        if (sameCheck(derived, doc.check)) key = derived
      }
      if (key) {
        if (local) log.warn('Replacing a local sync key that is not the account key')
        await this.storeLocalKey(userId, key)
        await this.refreshWraps(userId, key, remote, password)
        return this.activate(userId, key)
      }
    }

    // The recovery phrase this device was shown (kept in the OS keychain, and
    // left there on sign-out): signing in again on the same device, with or
    // without a password, needs nothing typed.
    const viaPhrase = await this.unwrapWithStoredPhrase(userId, doc)
    if (viaPhrase) {
      await this.storeLocalKey(userId, viaPhrase)
      await this.refreshWraps(userId, viaPhrase, remote, password)
      return this.activate(userId, viaPhrase)
    }

    // The password does not open the keyring (it was reset elsewhere).
    if (password) return locked('recovery_phrase_required')

    if (local) {
      // What this device has been encrypting with is not the account's key.
      // Uploading more with it would be unreadable everywhere else.
      log.warn('Local sync key does not match the account keyring')
    }
    return locked(doc.wraps.password ? 'password_required' : 'recovery_phrase_required')
  }

  // ── Internals ──────────────────────────────────────────────────

  /** Bring the password and recovery wraps up to date with what this device knows. */
  private async refreshWraps(
    userId: string,
    key: Buffer,
    remote: RemoteKeyring,
    password?: string
  ): Promise<void> {
    try {
      let doc = remote.doc
      let changed = false

      if (password) {
        const opens = doc.wraps.password
          ? (await unwrapKey(doc.wraps.password, password)) !== null
          : false
        // First password sign-in for this keyring, or the password has changed.
        if (!opens) {
          doc = {
            ...doc,
            wraps: {
              ...doc.wraps,
              password: await wrapKey(key, password, PASSWORD_ITERATIONS),
            },
          }
          changed = true
        }
      }

      if (changed) {
        doc = { ...doc, updatedAt: Date.now() }
        await this.saveKeyring(remote.id, doc)
        remote = { ...remote, doc }
      }

      // A phrase created while the keyring could not be written.
      const phrase = await this.storedRecoveryPhrase(userId)
      if (phrase) await this.appendRecoveryWrap(key, remote, phrase)
    } catch (err) {
      // The key itself is fine; only the cloud copy of a wrap is behind.
      log.warn('Could not update the account keyring:', err)
    }
  }

  private async appendRecoveryWrap(
    key: Buffer,
    remote: RemoteKeyring | null,
    normalizedPhrase: string
  ): Promise<boolean> {
    const existing = remote?.doc.wraps.recovery ?? []
    for (const wrapped of existing) {
      if ((await unwrapKey(wrapped, normalizedPhrase)) !== null) return true // already there
    }

    const recovery = [...existing, await wrapKey(key, normalizedPhrase, RECOVERY_ITERATIONS)].slice(
      -MAX_RECOVERY_WRAPS
    )
    const now = Date.now()
    const doc: KeyringDocument = {
      v: 1,
      check: checkValue(key),
      wraps: { password: remote?.doc.wraps.password, recovery },
      createdAt: remote?.doc.createdAt ?? now,
      updatedAt: now,
    }
    try {
      await this.saveKeyring(remote?.id, doc)
      return true
    } catch (err) {
      log.warn('Could not store the recovery phrase wrap:', err)
      return false
    }
  }

  /**
   * The account's keyring: the document, `null` when there is none, or
   * `undefined` when that could not be determined.
   *
   * Should there ever be two (two devices creating one at the same moment),
   * every device has to pick the same one: the oldest, then the lowest id.
   */
  private async fetchKeyring(): Promise<RemoteKeyring | null | undefined> {
    try {
      const memories = await this.getBackend().getMemories(KEYRING_NAMESPACE, 20, 0)
      let chosen: RemoteKeyring | null = null
      for (const memory of memories) {
        const doc = parseKeyring(memory)
        if (!doc) continue
        const candidate: RemoteKeyring = { id: memory.id, doc, storedAt: storedAt(memory) }
        if (!chosen || isOlder(candidate, chosen)) chosen = candidate
      }
      return chosen
    } catch (err) {
      log.debug('Keyring could not be read:', err instanceof Error ? err.message : err)
      return undefined
    }
  }

  /** @returns the id the keyring is stored under, when the service reports one. */
  private async saveKeyring(
    existingId: string | undefined,
    doc: KeyringDocument
  ): Promise<string | undefined> {
    const memory: Memory = {
      content: JSON.stringify(doc),
      namespace: KEYRING_NAMESPACE,
      tags: ['keyring'],
      metadata: { kind: 'keyring', v: 1, skip_server_embedding: true },
      sourceType: 'keyring',
    }
    const backend = this.getBackend()
    if (existingId) {
      await backend.updateMemory(existingId, memory)
      return existingId
    }
    return (await backend.createMemory(memory)).id
  }

  private async discardKeyring(id: string): Promise<void> {
    try {
      await this.getBackend().deleteMemory(id)
    } catch (err) {
      // Harmless if it stays: every device ignores all but the oldest.
      log.debug('Superseded keyring not removed:', err instanceof Error ? err.message : err)
    }
  }

  /** Whether the account already has synced (encrypted) content, or undefined if unknown. */
  private async cloudHasEncryptedData(): Promise<boolean | undefined> {
    try {
      const backend = this.getBackend()
      for (const namespace of ['meetings.meetings', 'meetings.transcripts', 'meetings.notes']) {
        if ((await backend.getMemories(namespace, 1, 0)).length > 0) return true
      }
      return false
    } catch {
      return undefined
    }
  }

  private async loadLocalKey(userId: string): Promise<Buffer | null> {
    try {
      const stored = await KeyStorageService.getKey(KeyType.SYNC_KEY, userId)
      if (!stored) return null
      const parsed = JSON.parse(stored) as { key?: string }
      if (!parsed.key) return null
      const key = Buffer.from(parsed.key, 'base64')
      return key.length === KEY_BYTES ? key : null
    } catch (err) {
      log.warn('Stored sync key could not be loaded', err)
      return null
    }
  }

  private async storeLocalKey(userId: string, key: Buffer): Promise<void> {
    try {
      await KeyStorageService.setKey(
        KeyType.SYNC_KEY,
        userId,
        JSON.stringify({
          key: key.toString('base64'),
          salt: EncryptionService.syncSaltFor(userId).toString('base64'),
        })
      )
    } catch (err) {
      log.warn('Could not store sync key in keychain — sync will pause on restart', err)
    }
  }

  private async unwrapWithStoredPhrase(
    userId: string,
    doc: KeyringDocument
  ): Promise<Buffer | null> {
    const phrase = await this.storedRecoveryPhrase(userId)
    if (!phrase) return null
    for (const wrapped of doc.wraps.recovery ?? []) {
      const key = await unwrapKey(wrapped, phrase)
      if (key && sameCheck(key, doc.check)) return key
    }
    return null
  }

  private async ensureStoredRecoveryPhrase(userId: string): Promise<void> {
    if (await this.storedRecoveryPhrase(userId)) return
    try {
      const { RecoveryPhraseService } = await import('./RecoveryPhraseService')
      await KeyStorageService.storeRecoveryPhrase(
        userId,
        RecoveryPhraseService.generateRecoveryPhrase().phrase
      )
    } catch (err) {
      log.warn('Could not create a recovery phrase for this account:', err)
    }
  }

  private async storedRecoveryPhrase(userId: string): Promise<string | null> {
    try {
      const phrase = await KeyStorageService.getRecoveryPhrase(userId)
      const normalized = phrase ? normalizeRecoveryPhrase(phrase) : ''
      return normalized || null
    } catch {
      return null
    }
  }

  private rememberedPassword(userId: string): string | undefined {
    return this.remembered?.userId === userId ? this.remembered.password : undefined
  }

  /**
   * One keyring operation at a time. Two of them reading the same document
   * and each writing back their own change would lose one of the changes —
   * or, with no document yet, create two.
   */
  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.tail.then(task, task)
    this.tail = run.catch(() => undefined)
    return run
  }

  /** Load the key into the encryption service. */
  private activate(userId: string, key: Buffer): KeyringOutcome {
    // The "salt" travels with every encrypted payload and identifies the
    // account's key; it stays what it has always been so that payloads written
    // before keyrings existed still pass the decrypt check.
    EncryptionService.primeKeyCache(key, EncryptionService.syncSaltFor(userId))
    return { status: 'ready' }
  }
}
