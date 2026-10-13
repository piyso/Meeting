/**
 * KeyringService — which data key a device ends up with, and who can get it back.
 *
 * "Device" here is a keychain: each scenario swaps in an empty one to stand
 * for a second computer or a reinstall. The cloud is a list of memories.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { IBackendProvider, Memory } from '../backend/IBackendProvider'

vi.mock('../../database/crud/encryption-keys', () => ({
  createEncryptionKey: vi.fn(),
  getEncryptionKeyByUserId: vi.fn(() => null),
  hasEncryptionKey: vi.fn(() => false),
}))

const keychain = vi.hoisted(() => ({ current: new Map<string, string>() }))
vi.mock('../KeyStorageService', () => {
  const KeyType = { SYNC_KEY: 'sync-key', RECOVERY_PHRASE: 'recovery-phrase' }
  const account = (type: string, userId: string) => `${userId}:${type}`
  return {
    KeyType,
    KeyStorageService: {
      getKey: async (type: string, userId: string) =>
        keychain.current.get(account(type, userId)) ?? null,
      setKey: async (type: string, userId: string, value: string) => {
        keychain.current.set(account(type, userId), value)
      },
      deleteKey: async (type: string, userId: string) =>
        keychain.current.delete(account(type, userId)),
      getRecoveryPhrase: async (userId: string) =>
        keychain.current.get(account(KeyType.RECOVERY_PHRASE, userId)) ?? null,
      storeRecoveryPhrase: async (userId: string, phrase: string) => {
        keychain.current.set(account(KeyType.RECOVERY_PHRASE, userId), phrase)
      },
    },
  }
})

const keychainState = vi.hoisted(() => ({ unavailable: false }))
vi.mock('../keytarSafe', () => ({
  isKeychainUnavailable: () => keychainState.unavailable,
}))

import { KeyringService, KEYRING_NAMESPACE, type KeyringDocument } from '../KeyringService'
import { EncryptionService } from '../EncryptionService'
import { RecoveryPhraseService } from '../RecoveryPhraseService'

// ── A cloud that stores what it is given ─────────────────────────

class FakeCloud {
  memories: Memory[] = []
  reachable = true
  /** What a plan without cloud storage looks like to the app: reads work, writes are refused. */
  writable = true
  private nextId = 1

  backend(): IBackendProvider {
    const guard = () => {
      if (!this.reachable) throw new TypeError('fetch failed')
    }
    return {
      getMemories: async (namespace: string, limit = 50, offset = 0) => {
        guard()
        return this.memories.filter(m => m.namespace === namespace).slice(offset, offset + limit)
      },
      createMemory: async (memory: Memory) => {
        guard()
        if (!this.writable) throw Object.assign(new Error('plan required'), { status: 403 })
        // Like the real service, it records when each memory arrived.
        const stored = { ...memory, id: `mem-${this.nextId}`, created_at: this.nextId++ }
        this.memories.push(stored)
        return stored
      },
      updateMemory: async (id: string, updates: Partial<Memory>) => {
        guard()
        const at = this.memories.findIndex(m => m.id === id)
        if (at < 0) throw Object.assign(new Error('not found'), { status: 404 })
        const merged = { ...this.memories[at], ...updates, id } as Memory
        this.memories[at] = merged
        return merged
      },
      deleteMemory: async (id: string) => {
        guard()
        this.memories = this.memories.filter(m => m.id !== id)
      },
    } as unknown as IBackendProvider
  }

  keyring(): KeyringDocument {
    const stored = this.memories.filter(m => m.namespace === KEYRING_NAMESPACE)
    expect(stored).toHaveLength(1)
    return JSON.parse(stored[0]?.content ?? '{}') as KeyringDocument
  }
}

const USER = 'user-1'
const PASSWORD = 'correct horse battery staple'

let cloud: FakeCloud
let keyring: KeyringService

/** A different computer (or a reinstall): nothing in the keychain. */
function newDevice(): void {
  keychain.current = new Map()
  EncryptionService.clearKeyCache()
}

/** What signing out does to the keychain: the key goes, the recovery phrase stays. */
function signOut(): void {
  keychain.current.delete(`${USER}:sync-key`)
  EncryptionService.clearKeyCache()
}

async function encryptProbe(): Promise<{
  ciphertext: string
  iv: string
  authTag: string
  salt: string
}> {
  return EncryptionService.encryptWithCachedKey('the launch moves to friday', USER)
}

function canRead(payload: Awaited<ReturnType<typeof encryptProbe>>): boolean {
  return EncryptionService.decryptWithCachedKey(payload) === 'the launch moves to friday'
}

const storedPhrase = (): string => keychain.current.get(`${USER}:recovery-phrase`) ?? ''

/** The same account on another computer: its own keychain, its own app. */
function anotherDevice(): { keyring: KeyringService; keychain: Map<string, string> } {
  return { keyring: new KeyringService(() => cloud.backend()), keychain: new Map() }
}

beforeEach(() => {
  cloud = new FakeCloud()
  keyring = new KeyringService(() => cloud.backend())
  keychainState.unavailable = false
  newDevice()
})

describe('account with a password', () => {
  it('gets a random key that the password only unwraps', async () => {
    expect(await keyring.establish(USER, PASSWORD)).toEqual({ status: 'ready' })
    const upload = await encryptProbe()

    const doc = cloud.keyring()
    expect(doc.wraps.password?.iterations).toBe(600_000)
    // No secret in the clear.
    expect(JSON.stringify(doc)).not.toContain(PASSWORD)

    // The key is not something the password alone leads to: what a build
    // without keyrings would have derived from it cannot read the upload.
    EncryptionService.clearKeyCache()
    await EncryptionService.deriveKey(PASSWORD, EncryptionService.syncSaltFor(USER))
    expect(canRead(upload)).toBe(false)
  }, 30_000)

  it('gives a second device the same key', async () => {
    await keyring.establish(USER, PASSWORD)
    const fromFirstDevice = await encryptProbe()

    newDevice()
    expect(await keyring.establish(USER, PASSWORD)).toEqual({ status: 'ready' })
    expect(canRead(fromFirstDevice)).toBe(true)
  }, 30_000)

  it('resumes after a restart without the password', async () => {
    await keyring.establish(USER, PASSWORD)
    const before = await encryptProbe()
    EncryptionService.clearKeyCache() // restart: memory gone, keychain kept

    expect(await keyring.establish(USER)).toEqual({ status: 'ready' })
    expect(canRead(before)).toBe(true)
  }, 30_000)

  it('survives a password change: same key, new password opens it, old one does not', async () => {
    await keyring.establish(USER, PASSWORD)
    const beforeChange = await encryptProbe()

    // Changed on the device that holds the key.
    expect(await keyring.establish(USER, 'a brand new passphrase')).toEqual({ status: 'ready' })
    expect(canRead(beforeChange)).toBe(true)

    newDevice()
    expect(await keyring.establish(USER, 'a brand new passphrase')).toEqual({ status: 'ready' })
    expect(canRead(beforeChange)).toBe(true)

    // The old password is of no further use.
    newDevice()
    expect(await anotherDevice().keyring.establish(USER, PASSWORD)).toEqual({
      status: 'locked',
      reason: 'recovery_phrase_required',
    })
  }, 60_000)

  it('asks for the password on a device that has neither key nor password', async () => {
    await keyring.establish(USER, PASSWORD)
    newDevice()
    expect(await keyring.establish(USER)).toEqual({ status: 'locked', reason: 'password_required' })
  }, 30_000)
})

describe('recovery phrase', () => {
  it('recovers the key after a password reset on a device that never had it', async () => {
    await keyring.establish(USER, PASSWORD)
    const phrase = RecoveryPhraseService.generateRecoveryPhrase().phrase
    expect(await keyring.addRecoveryPhrase(USER, phrase)).toBe(true)
    const beforeReset = await encryptProbe()

    // Forgot the password; reset it from a fresh install.
    newDevice()
    expect(await keyring.establish(USER, 'reset-password-2026')).toEqual({
      status: 'locked',
      reason: 'recovery_phrase_required',
    })
    expect(await keyring.unlockWithRecoveryPhrase(USER, phrase)).toEqual({ status: 'ready' })
    expect(canRead(beforeReset)).toBe(true)

    // Unlocking re-wrapped the key with the password this session signed in
    // with, so every further device needs nothing but the new password.
    newDevice()
    expect(await anotherDevice().keyring.establish(USER, 'reset-password-2026')).toEqual({
      status: 'ready',
    })
    expect(canRead(beforeReset)).toBe(true)
  }, 60_000)

  it('accepts the phrase however it was typed, and rejects a wrong one', async () => {
    await keyring.establish(USER, PASSWORD)
    const phrase = RecoveryPhraseService.generateRecoveryPhrase().phrase
    await keyring.addRecoveryPhrase(USER, phrase)

    newDevice()
    const shouted = `  ${phrase.toUpperCase().split(' ').join('   ')}\n`
    expect(await keyring.unlockWithRecoveryPhrase(USER, shouted)).toEqual({ status: 'ready' })

    newDevice()
    const other = RecoveryPhraseService.generateRecoveryPhrase().phrase
    await expect(keyring.unlockWithRecoveryPhrase(USER, other)).rejects.toThrow(/does not match/)
  }, 30_000)

  it('keeps an earlier phrase valid when another device adds its own', async () => {
    await keyring.establish(USER, PASSWORD)
    const first = RecoveryPhraseService.generateRecoveryPhrase().phrase
    const second = RecoveryPhraseService.generateRecoveryPhrase().phrase
    await keyring.addRecoveryPhrase(USER, first)
    await keyring.addRecoveryPhrase(USER, second)
    await keyring.addRecoveryPhrase(USER, second) // adding twice does not duplicate
    expect(cloud.keyring().wraps.recovery).toHaveLength(2)

    for (const phrase of [first, second]) {
      newDevice()
      expect(await keyring.unlockWithRecoveryPhrase(USER, phrase)).toEqual({ status: 'ready' })
    }
  }, 30_000)

  it('says so when no phrase was ever set up', async () => {
    await keyring.establish(USER, PASSWORD)
    newDevice()
    const phrase = RecoveryPhraseService.generateRecoveryPhrase().phrase
    await expect(keyring.unlockWithRecoveryPhrase(USER, phrase)).rejects.toThrow(
      /No recovery phrase/
    )
  }, 30_000)

  it('picks up a phrase that was created before the keyring could be written', async () => {
    cloud.reachable = false
    expect(await keyring.establish(USER, PASSWORD)).toEqual({
      status: 'locked',
      reason: 'unavailable',
    })
    const phrase = RecoveryPhraseService.generateRecoveryPhrase().phrase
    keychain.current.set(`${USER}:recovery-phrase`, phrase) // shown to the user at onboarding
    expect(await keyring.addRecoveryPhrase(USER, phrase)).toBe(false) // no key yet

    cloud.reachable = true
    // The retry a minute later: no password is passed again, yet the keyring
    // gets a password wrap as well as the phrase.
    expect(await keyring.establish(USER)).toEqual({ status: 'ready' })
    expect(cloud.keyring().wraps.password).toBeDefined()
    const upload = await encryptProbe()

    newDevice()
    expect(await anotherDevice().keyring.unlockWithRecoveryPhrase(USER, phrase)).toEqual({
      status: 'ready',
    })
    expect(canRead(upload)).toBe(true)

    newDevice()
    expect(await anotherDevice().keyring.establish(USER, PASSWORD)).toEqual({ status: 'ready' })
    expect(canRead(upload)).toBe(true)
  }, 60_000)

  it('keeps one phrase per account once a device has been unlocked with it', async () => {
    await keyring.establish(USER, PASSWORD)
    const phrase = RecoveryPhraseService.generateRecoveryPhrase().phrase
    keychain.current.set(`${USER}:recovery-phrase`, phrase)
    await keyring.addRecoveryPhrase(USER, phrase)

    newDevice()
    const second = anotherDevice().keyring
    await second.unlockWithRecoveryPhrase(USER, phrase)
    keychain.current.set(`${USER}:recovery-phrase`, phrase) // what AuthService does after unlocking
    await second.establish(USER) // next launch
    expect(cloud.keyring().wraps.recovery).toHaveLength(1)
  }, 30_000)
})

describe('account without a password (Google sign-in)', () => {
  it('can sync: gets a key of its own, and a recovery phrase to go with it', async () => {
    expect(await keyring.establish(USER)).toEqual({ status: 'ready' })
    const upload = await encryptProbe()

    const phrase = storedPhrase()
    expect(RecoveryPhraseService.verifyRecoveryPhrase(phrase)).toBe(true)
    const doc = cloud.keyring()
    expect(doc.wraps.password).toBeUndefined()
    expect(doc.wraps.recovery).toHaveLength(1)

    // Another device: the phrase is the only way in.
    newDevice()
    expect(await keyring.establish(USER)).toEqual({
      status: 'locked',
      reason: 'recovery_phrase_required',
    })
    expect(await keyring.unlockWithRecoveryPhrase(USER, phrase)).toEqual({ status: 'ready' })
    expect(canRead(upload)).toBe(true)
  })

  it('signs back in on the same device without typing anything', async () => {
    await keyring.establish(USER)
    const upload = await encryptProbe()

    signOut()
    expect(await keyring.establish(USER)).toEqual({ status: 'ready' })
    expect(canRead(upload)).toBe(true)
  })

  it('does not mint a second key for an account that already has encrypted data', async () => {
    cloud.memories.push({
      id: 'old-1',
      namespace: 'meetings.transcripts',
      content: 'ciphertext-from-another-device',
      metadata: { encrypted: true },
    })
    // Those uploads came from a build without keyrings, which could only
    // encrypt with a password-derived key: the password is the way back in.
    expect(await keyring.establish(USER)).toEqual({ status: 'locked', reason: 'password_required' })
    expect(cloud.memories.filter(m => m.namespace === KEYRING_NAMESPACE)).toHaveLength(0)
  })

  it('does not invent a key that nothing on this device could keep', async () => {
    keychainState.unavailable = true
    expect(await keyring.establish(USER)).toEqual({ status: 'locked', reason: 'no_secure_storage' })
    expect(cloud.memories).toHaveLength(0)
  })
})

describe('account with uploads from before keyrings', () => {
  it('keeps the key the password produced then, so those uploads stay readable', async () => {
    // What a build without keyrings did, and what its uploads are encrypted with.
    await EncryptionService.deriveKey(PASSWORD, EncryptionService.syncSaltFor(USER))
    const legacyUpload = await encryptProbe()
    EncryptionService.clearKeyCache()
    cloud.memories.push({
      id: 'old-1',
      namespace: 'meetings.transcripts',
      content: legacyUpload.ciphertext,
      metadata: { encrypted: true },
    })

    // A fresh install of the new build, signing in with the password.
    expect(await keyring.establish(USER, PASSWORD)).toEqual({ status: 'ready' })
    expect(canRead(legacyUpload)).toBe(true)
    expect(cloud.keyring().wraps.password).toBeDefined()
  }, 30_000)
})

describe('two devices signing in to a new account at the same moment', () => {
  it('end up with one key between them', async () => {
    // Device B wrote its keyring between A's "is there one?" and A's own write.
    const b = anotherDevice()
    const backend = cloud.backend()
    let interleaved = false
    const racing = {
      ...backend,
      createMemory: async (memory: Memory) => {
        if (!interleaved && memory.namespace === KEYRING_NAMESPACE) {
          interleaved = true
          const mine = keychain.current
          keychain.current = b.keychain
          await b.keyring.establish(USER, PASSWORD)
          keychain.current = mine
        }
        return backend.createMemory(memory)
      },
    } as IBackendProvider
    const a = new KeyringService(() => racing)

    expect(await a.establish(USER, PASSWORD)).toEqual({ status: 'ready' })
    const fromA = await encryptProbe()

    // B's keyring was first, so it is the account's; A adopted it and
    // removed its own.
    expect(cloud.memories.filter(m => m.namespace === KEYRING_NAMESPACE)).toHaveLength(1)
    keychain.current = b.keychain
    EncryptionService.clearKeyCache()
    expect(await b.keyring.establish(USER)).toEqual({ status: 'ready' })
    expect(canRead(fromA)).toBe(true)
  }, 60_000)
})

describe('a plan without cloud storage', () => {
  it('does not start using a key it could not put in the keyring', async () => {
    cloud.writable = false
    expect(await keyring.establish(USER, PASSWORD)).toEqual({
      status: 'locked',
      reason: 'unavailable',
    })
    expect(keychain.current.has(`${USER}:sync-key`)).toBe(false)

    // Upgraded: the retry completes with the password from this session.
    cloud.writable = true
    expect(await keyring.establish(USER)).toEqual({ status: 'ready' })
    expect(cloud.keyring().wraps.password).toBeDefined()
  }, 30_000)
})

describe('when the keyring cannot be read', () => {
  it('keeps working with the key this device already holds', async () => {
    await keyring.establish(USER, PASSWORD)
    const upload = await encryptProbe()
    EncryptionService.clearKeyCache()

    cloud.reachable = false
    expect(await keyring.establish(USER)).toEqual({ status: 'ready' })
    expect(canRead(upload)).toBe(true)
  }, 30_000)

  it('waits, rather than guessing, when it has nothing to go on', async () => {
    cloud.reachable = false
    expect(await keyring.establish(USER)).toEqual({ status: 'locked', reason: 'unavailable' })
    expect(await keyring.establish(USER, PASSWORD)).toEqual({
      status: 'locked',
      reason: 'unavailable',
    })
    expect(keychain.current.size).toBe(0)
  })

  it('stops a device whose key is not the account key from uploading with it', async () => {
    await keyring.establish(USER, PASSWORD)

    // Another computer, still holding a key from before this account's
    // keyring existed (an old build, a password changed since).
    newDevice()
    const stale = anotherDevice().keyring
    keychain.current.set(
      `${USER}:sync-key`,
      JSON.stringify({ key: Buffer.alloc(32, 7).toString('base64'), salt: '' })
    )
    expect(await stale.establish(USER)).toEqual({ status: 'locked', reason: 'password_required' })
    // Signing in with the password replaces it with the account key.
    expect(await stale.establish(USER, PASSWORD)).toEqual({ status: 'ready' })
  }, 30_000)
})

describe('upgrading a device from before keyrings', () => {
  it('wraps the key it already has, and a later password sign-in elsewhere still fits', async () => {
    // Old build: key derived from the password, kept in the keychain; a
    // recovery phrase was shown at onboarding and stored, but did nothing.
    await EncryptionService.deriveKey(PASSWORD, EncryptionService.syncSaltFor(USER))
    const exported = EncryptionService.exportCachedKey()
    keychain.current.set(`${USER}:sync-key`, JSON.stringify(exported))
    const oldPhrase = RecoveryPhraseService.generateRecoveryPhrase().phrase
    keychain.current.set(`${USER}:recovery-phrase`, oldPhrase)
    const oldUpload = await encryptProbe()
    EncryptionService.clearKeyCache()

    // First launch of the new build: no password typed.
    expect(await keyring.establish(USER)).toEqual({ status: 'ready' })
    expect(cloud.keyring().wraps.recovery).toHaveLength(1)
    expect(cloud.keyring().wraps.password).toBeUndefined()

    // The phrase the user wrote down back then now really recovers the data.
    newDevice()
    expect(await keyring.unlockWithRecoveryPhrase(USER, oldPhrase)).toEqual({ status: 'ready' })
    expect(canRead(oldUpload)).toBe(true)

    // And a password sign-in on yet another device fits the same keyring.
    newDevice()
    expect(await keyring.establish(USER, PASSWORD)).toEqual({ status: 'ready' })
    expect(canRead(oldUpload)).toBe(true)
    expect(cloud.keyring().wraps.password).toBeDefined()
  }, 60_000)
})

describe('a hostile keyring document', () => {
  it('cannot stall the app with an absurd work factor', async () => {
    await keyring.establish(USER, PASSWORD)
    const stored = cloud.memories.find(m => m.namespace === KEYRING_NAMESPACE)
    if (!stored) throw new Error('no keyring')
    const doc = JSON.parse(stored.content) as KeyringDocument
    if (doc.wraps.password) doc.wraps.password.iterations = 2_000_000_000
    stored.content = JSON.stringify(doc)

    newDevice()
    const started = Date.now()
    const outcome = await keyring.establish(USER, 'some other password')
    expect(outcome.status).toBe('locked')
    expect(Date.now() - started).toBeLessThan(5_000)
  }, 30_000)
})
