/**
 * SyncManager — what a failed upload does to the queue.
 *
 * The rule under test: a failure that is about the session or the service
 * (offline, signed out, plan without cloud sync, rate limit, outage) must never
 * count against a queued item. Only an item the server rejected as invalid is
 * parked. Before this, any 4xx parked the item for good and every other
 * failure spent one of its 100 retries — so a free-plan account, or an hour
 * without the server, silently marked the whole queue as failed.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { IBackendProvider, Memory } from '../backend/IBackendProvider'

// ── Fakes ────────────────────────────────────────────────────────

interface QueueRow {
  id: string
  operation_type: 'create' | 'update' | 'delete'
  table_name: string
  record_id: string
  payload: string | null
  retry_count: number
  created_at: number
  last_attempt: number | null
}

const queue = vi.hoisted(() => ({
  pending: [] as unknown[],
  increment: vi.fn(),
  park: vi.fn(),
  deleteMany: vi.fn(),
  resetFailed: vi.fn(() => 0),
}))

vi.mock('../../database/crud/sync-queue', () => ({
  createSyncQueueItem: vi.fn(),
  getPendingSyncItems: vi.fn(() => queue.pending),
  deleteSyncQueueItems: queue.deleteMany,
  incrementSyncRetry: queue.increment,
  parkSyncQueueItem: queue.park,
  markSyncItemsInFlight: vi.fn(),
  clearSyncItemsInFlight: vi.fn(),
  getSyncQueueCount: vi.fn(() => queue.pending.length),
  getPendingSyncCount: vi.fn(() => queue.pending.length),
  getFailedSyncCount: vi.fn(() => 0),
  resetFailedSyncItems: queue.resetFailed,
}))

/** Just enough of better-sqlite3 for the statements SyncManager runs. */
const db = vi.hoisted(() => {
  const settings = new Map<string, string>()
  const remoteIds: Array<{ table: string; record: string; remote: string }> = []
  /** How much of somebody's data the device holds. */
  const local = { meetings: 0, queued: 0 }
  const noop = { get: () => undefined, all: () => [], run: () => ({ changes: 0 }) }
  return {
    settings,
    remoteIds,
    local,
    handle: {
      prepare(sql: string) {
        if (/SELECT COUNT\(\*\) FROM meetings/.test(sql)) {
          return { ...noop, get: () => ({ ...local }) }
        }
        if (/FROM settings WHERE key = \?/.test(sql)) {
          return {
            ...noop,
            get: (key: string) => (settings.has(key) ? { value: settings.get(key) } : undefined),
          }
        }
        if (/INSERT OR REPLACE INTO settings/.test(sql)) {
          return {
            ...noop,
            run: (key: string, value: string) => {
              settings.set(key, value)
              return { changes: 1 }
            },
          }
        }
        if (/SELECT remote_id FROM sync_remote_ids/.test(sql)) {
          return {
            ...noop,
            all: (table: string, record: string) =>
              remoteIds
                .filter(r => r.table === table && r.record === record)
                .map(r => ({ remote_id: r.remote })),
          }
        }
        if (/INSERT OR IGNORE INTO sync_remote_ids/.test(sql)) {
          return {
            ...noop,
            run: (table: string, record: string, remote: string) => {
              if (
                !remoteIds.some(
                  r => r.table === table && r.record === record && r.remote === remote
                )
              )
                remoteIds.push({ table, record, remote })
              return { changes: 1 }
            },
          }
        }
        if (/DELETE FROM sync_remote_ids/.test(sql)) {
          return {
            ...noop,
            run: (table: string, record: string, remote: string) => {
              const at = remoteIds.findIndex(
                r => r.table === table && r.record === record && r.remote === remote
              )
              if (at >= 0) remoteIds.splice(at, 1)
              return { changes: at >= 0 ? 1 : 0 }
            },
          }
        }
        return noop
      },
      transaction: <T>(fn: () => T) => fn,
    },
  }
})

vi.mock('../../database/connection', () => ({ getDatabase: () => db.handle }))

const keys = vi.hoisted(() => ({ tier: 'pro' as string }))
vi.mock('../KeyStorageService', () => ({
  KeyType: { SYNC_KEY: 'sync-key' },
  KeyStorageService: {
    setKey: vi.fn(async () => undefined),
    getKey: vi.fn(async () => null),
    getAccessToken: vi.fn(async () => 'token'),
    getPlanTier: vi.fn(async () => keys.tier),
  },
}))

vi.mock('../LocalEmbeddingService', () => ({
  getLocalEmbeddingService: () => ({ embed: async () => ({ embedding: [0.1, 0.2] }) }),
}))

const auth = vi.hoisted(() => ({
  refreshToken: vi.fn(async () => ({ accessToken: 'fresh' })),
  refreshProfile: vi.fn(async () => null),
}))
vi.mock('../AuthService', () => ({ getAuthService: () => auth }))

/**
 * Which key the account has is KeyringService's business (KeyringService.test.ts).
 * Here it answers what each test tells it to — "ready" unless told otherwise.
 */
const keyringStub = vi.hoisted(() => ({
  outcomes: [] as Array<{ status: 'ready' } | { status: 'locked'; reason: string }>,
  establishCalls: 0,
}))
vi.mock('../KeyringService', async () => {
  const { EncryptionService } = await import('../EncryptionService')
  const ready = (userId: string) => {
    EncryptionService.primeKeyCache(Buffer.alloc(32, 1), EncryptionService.syncSaltFor(userId))
    return { status: 'ready' as const }
  }
  return {
    KEYRING_NAMESPACE: 'meetings.keyring',
    KeyringService: class {
      async establish(userId: string) {
        keyringStub.establishCalls++
        const outcome = keyringStub.outcomes.shift() ?? { status: 'ready' as const }
        return outcome.status === 'ready' ? ready(userId) : outcome
      }
      async unlockWithRecoveryPhrase(userId: string, phrase: string) {
        if (phrase !== 'the right words') throw new Error('That recovery phrase does not match.')
        return ready(userId)
      }
      async addRecoveryPhrase() {
        return true
      }
    },
  }
})

import { SyncManager, classifySyncFailure } from '../SyncManager'

// ── Helpers ──────────────────────────────────────────────────────

function httpError(status: number, message = `HTTP ${status}`): Error {
  return Object.assign(new Error(message), { status })
}

function row(
  id: string,
  operation_type: QueueRow['operation_type'],
  record_id = `rec-${id}`
): QueueRow {
  return {
    id,
    operation_type,
    table_name: 'notes',
    record_id,
    payload: JSON.stringify({ id: record_id, original_text: `note ${id}` }),
    retry_count: 0,
    created_at: 1_700_000_000,
    last_attempt: null,
  }
}

function makeBackend(overrides: Partial<Record<keyof IBackendProvider, unknown>> = {}) {
  let nextId = 1
  const backend = {
    setAccessToken: vi.fn(),
    createMemory: vi.fn(async (m: Memory) => ({ ...m, id: `remote-${nextId++}` })),
    batchCreateMemories: vi.fn(async (ms: Memory[]) =>
      ms.map(m => ({ ...m, id: `remote-${nextId++}` }))
    ),
    updateMemory: vi.fn(async (id: string, m: Partial<Memory>) => ({ ...m, id })),
    deleteMemory: vi.fn(async () => undefined),
    getMemories: vi.fn(async () => [] as Memory[]),
    ...overrides,
  }
  return backend as typeof backend & IBackendProvider
}

async function makeManager(backend: IBackendProvider, userId = 'user-1'): Promise<SyncManager> {
  const manager = new SyncManager(backend)
  await manager.initialize(userId, 'correct horse battery staple')
  return manager
}

beforeEach(() => {
  queue.pending = []
  queue.increment.mockClear()
  queue.park.mockClear()
  queue.deleteMany.mockClear()
  queue.resetFailed.mockClear()
  auth.refreshToken.mockClear()
  auth.refreshProfile.mockClear()
  db.settings.clear()
  db.remoteIds.length = 0
  db.local.meetings = 0
  db.local.queued = 0
  keys.tier = 'pro'
  keyringStub.outcomes = []
  keyringStub.establishCalls = 0
})

// ── Tests ────────────────────────────────────────────────────────

describe('classifySyncFailure', () => {
  it('separates item faults from session and service faults', () => {
    expect(classifySyncFailure(httpError(400))).toBe('permanent')
    expect(classifySyncFailure(httpError(413))).toBe('permanent')
    expect(classifySyncFailure(httpError(422))).toBe('permanent')
    expect(classifySyncFailure(httpError(401))).toBe('auth')
    expect(classifySyncFailure(httpError(403))).toBe('plan')
    expect(classifySyncFailure(httpError(402))).toBe('plan')
    expect(classifySyncFailure(httpError(429))).toBe('rate')
    expect(classifySyncFailure(httpError(408))).toBe('server')
    expect(classifySyncFailure(httpError(500))).toBe('server')
    expect(classifySyncFailure(httpError(503))).toBe('server')
    expect(classifySyncFailure(new TypeError('fetch failed'))).toBe('network')
    expect(classifySyncFailure(new Error('Not authenticated. Please login first.'))).toBe('auth')
    // A gateway's HTML error page served with a 200
    expect(classifySyncFailure(new SyntaxError('Unexpected token < in JSON'))).toBe('server')
  })
})

describe('SyncManager failure handling', () => {
  it('does not contact the server or touch the queue on a plan without cloud sync', async () => {
    keys.tier = 'free'
    const backend = makeBackend()
    const manager = await makeManager(backend)
    queue.pending = [row('a', 'create'), row('b', 'update')]

    const result = await manager.syncPendingEvents()

    expect(result.success).toBe(false)
    expect(backend.batchCreateMemories).not.toHaveBeenCalled()
    expect(backend.updateMemory).not.toHaveBeenCalled()
    expect(backend.getMemories).not.toHaveBeenCalled()
    expect(queue.park).not.toHaveBeenCalled()
    expect(queue.increment).not.toHaveBeenCalled()
    expect(manager.getPause()?.reason).toBe('plan_required')
  })

  it('pauses, and parks nothing, when the server refuses the plan (403)', async () => {
    const backend = makeBackend({
      batchCreateMemories: vi.fn(async () => {
        throw httpError(403, 'Cloud features require a Starter plan or above.')
      }),
    })
    const manager = await makeManager(backend)
    queue.pending = [row('a', 'create'), row('b', 'create')]

    const result = await manager.syncPendingEvents()

    expect(result.success).toBe(false)
    expect(queue.park).not.toHaveBeenCalled()
    expect(queue.increment).not.toHaveBeenCalled()
    // No one-by-one fallback either: each of those would be refused the same way.
    expect(backend.createMemory).not.toHaveBeenCalled()
    expect(manager.getPause()?.reason).toBe('plan_required')
    // The plan on file is evidently stale — it is re-read in the background.
    await vi.waitFor(() => expect(auth.refreshProfile).toHaveBeenCalled())
  })

  it('stops the pass at the first network failure without charging any item', async () => {
    const backend = makeBackend({
      getMemories: vi.fn(async () => {
        throw new TypeError('fetch failed')
      }),
    })
    const manager = await makeManager(backend)
    queue.pending = [row('a', 'update'), row('b', 'update'), row('c', 'update')]

    await manager.syncPendingEvents()

    expect(backend.getMemories).toHaveBeenCalledTimes(1)
    expect(queue.increment).not.toHaveBeenCalled()
    expect(queue.park).not.toHaveBeenCalled()
    expect(manager.getPause()?.reason).toBe('unreachable')
  })

  it('treats a run of 5xx as an outage: stops, and charges nothing', async () => {
    const backend = makeBackend({
      getMemories: vi.fn(async () => {
        throw httpError(503)
      }),
    })
    const manager = await makeManager(backend)
    queue.pending = ['a', 'b', 'c', 'd', 'e'].map(id => row(id, 'update'))

    await manager.syncPendingEvents()

    expect(backend.getMemories).toHaveBeenCalledTimes(3)
    expect(queue.increment).not.toHaveBeenCalled()
    expect(queue.park).not.toHaveBeenCalled()
    expect(manager.getPause()?.reason).toBe('unreachable')
  })

  it('counts a 5xx against an item only when the rest of the pass went through', async () => {
    const backend = makeBackend({
      createMemory: vi.fn(async (m: Memory) => {
        if (m.metadata?.record_id === 'rec-b') throw httpError(500)
        return { ...m, id: `remote-${String(m.metadata?.record_id)}` }
      }),
    })
    const manager = await makeManager(backend)
    queue.pending = [row('a', 'update'), row('b', 'update'), row('c', 'update')]

    const result = await manager.syncPendingEvents()

    expect(result.syncedCount).toBe(2)
    expect(queue.increment).toHaveBeenCalledTimes(1)
    expect(queue.increment).toHaveBeenCalledWith('b')
    expect(queue.park).not.toHaveBeenCalled()
  })

  it('parks an item the server rejects as invalid and carries on with the rest', async () => {
    const backend = makeBackend({
      batchCreateMemories: vi.fn(async () => {
        throw httpError(400, 'validation failed')
      }),
      createMemory: vi.fn(async (m: Memory) => {
        if (m.metadata?.record_id === 'rec-a') throw httpError(422, 'content too large')
        return { ...m, id: 'remote-b' }
      }),
    })
    const manager = await makeManager(backend)
    queue.pending = [row('a', 'create'), row('b', 'create')]

    const result = await manager.syncPendingEvents()

    expect(queue.park).toHaveBeenCalledTimes(1)
    expect(queue.park).toHaveBeenCalledWith('a')
    expect(queue.increment).not.toHaveBeenCalled()
    expect(result.syncedCount).toBe(1)
    // An invalid item is not a reason to slow the queue down.
    expect(manager.getPause()).toBeNull()
  })

  it('asks for a fresh token on 401 and leaves the item uncharged', async () => {
    const backend = makeBackend({
      getMemories: vi.fn(async () => {
        throw httpError(401)
      }),
    })
    const manager = await makeManager(backend)
    queue.pending = [row('a', 'update'), row('b', 'update')]

    await manager.syncPendingEvents()

    expect(auth.refreshToken).toHaveBeenCalledTimes(1)
    expect(backend.getMemories).toHaveBeenCalledTimes(1)
    expect(queue.increment).not.toHaveBeenCalled()
    expect(queue.park).not.toHaveBeenCalled()
    expect(manager.getPause()?.reason).toBe('auth')
  })

  it('backs off after a failed pass unless the sync is forced', async () => {
    const getMemories = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    const backend = makeBackend({ getMemories })
    const manager = await makeManager(backend)
    queue.pending = [row('a', 'update')]

    await manager.syncPendingEvents()
    await manager.syncPendingEvents() // inside the back-off window: skipped
    expect(getMemories).toHaveBeenCalledTimes(1)

    await manager.syncPendingEvents({ force: true })
    expect(getMemories).toHaveBeenCalledTimes(2)
  })

  it('clears the pause once a pass succeeds', async () => {
    let online = false
    const backend = makeBackend({
      getMemories: vi.fn(async () => {
        if (!online) throw new TypeError('fetch failed')
        return []
      }),
    })
    const manager = await makeManager(backend)
    queue.pending = [row('a', 'update')]

    await manager.syncPendingEvents()
    expect(manager.getPause()?.reason).toBe('unreachable')

    online = true
    const result = await manager.syncPendingEvents({ force: true })
    expect(result.success).toBe(true)
    expect(manager.getPause()).toBeNull()
  })

  it("never uploads one account's local data to another account", async () => {
    const backend = makeBackend()
    await makeManager(backend, 'user-1') // user-1 becomes the owner of this device's data
    db.local.meetings = 3
    db.local.queued = 1
    const second = await makeManager(backend, 'user-2')
    queue.pending = [row('a', 'create')]

    const result = await second.syncPendingEvents({ force: true })

    expect(result.success).toBe(false)
    expect(backend.batchCreateMemories).not.toHaveBeenCalled()
    expect(second.getPause()?.reason).toBe('different_account')
  })

  it("lets a new account take over a device that holds nobody's data", async () => {
    const backend = makeBackend()
    await makeManager(backend, 'user-1')
    // user-1 signed out without ever recording (or erased everything).
    const second = await makeManager(backend, 'user-2')
    queue.pending = [row('a', 'create')]

    const result = await second.syncPendingEvents({ force: true })

    expect(second.getPause()).toBeNull()
    expect(result.syncedCount).toBe(1)
    // And it is user-2's device from here on.
    db.local.meetings = 1
    const back = await makeManager(backend, 'user-1')
    await back.syncPendingEvents({ force: true })
    expect(back.getPause()?.reason).toBe('different_account')
  })

  it('gives parked items another chance at the start of a session', async () => {
    await makeManager(makeBackend())
    expect(queue.resetFailed).toHaveBeenCalledTimes(1)
  })
})

describe('SyncManager remote ids', () => {
  it('remembers where a record was stored and addresses it directly afterwards', async () => {
    const backend = makeBackend()
    const manager = await makeManager(backend)

    queue.pending = [row('a', 'create', 'note-1')]
    await manager.syncPendingEvents()
    expect(db.remoteIds).toEqual([{ table: 'notes', record: 'note-1', remote: 'remote-1' }])

    queue.pending = [row('b', 'update', 'note-1')]
    await manager.syncPendingEvents()
    expect(backend.updateMemory).toHaveBeenCalledWith('remote-1', expect.anything())
    // No paging through the namespace to find it.
    expect(backend.getMemories).not.toHaveBeenCalled()

    queue.pending = [row('c', 'delete', 'note-1')]
    await manager.syncPendingEvents()
    expect(backend.deleteMemory).toHaveBeenCalledWith('remote-1')
    expect(db.remoteIds).toEqual([])
  })

  it('stores a fresh copy when the remembered one no longer exists upstream', async () => {
    const backend = makeBackend({
      updateMemory: vi.fn(async () => {
        throw httpError(404)
      }),
    })
    const manager = await makeManager(backend)
    db.remoteIds.push({ table: 'notes', record: 'note-1', remote: 'gone' })

    queue.pending = [row('a', 'update', 'note-1')]
    const result = await manager.syncPendingEvents()

    expect(result.success).toBe(true)
    expect(backend.createMemory).toHaveBeenCalledTimes(1)
    expect(queue.park).not.toHaveBeenCalled()
    expect(db.remoteIds).toEqual([{ table: 'notes', record: 'note-1', remote: 'remote-1' }])
  })
})

describe('SyncManager and the account key', () => {
  it('uploads nothing until the key is there, and picks up as soon as it is', async () => {
    keyringStub.outcomes = [{ status: 'locked', reason: 'unavailable' }]
    const backend = makeBackend()
    const manager = await makeManager(backend)
    queue.pending = [row('a', 'create')]

    expect(manager.isReady()).toBe(false)
    expect(manager.getLock()?.reason).toBe('unavailable')

    // The timer's next pass is too soon after the failed attempt to ask again.
    const early = await manager.syncPendingEvents()
    expect(early.success).toBe(false)
    expect(keyringStub.establishCalls).toBe(1)
    expect(backend.batchCreateMemories).not.toHaveBeenCalled()
    expect(queue.increment).not.toHaveBeenCalled()

    // "Sync now" asks straight away; this time the keyring answers.
    const result = await manager.syncPendingEvents({ force: true })
    expect(keyringStub.establishCalls).toBe(2)
    expect(manager.getLock()).toBeNull()
    expect(result.syncedCount).toBe(1)
  })

  it('does not keep asking when only the user can unlock it', async () => {
    keyringStub.outcomes = [{ status: 'locked', reason: 'recovery_phrase_required' }]
    const backend = makeBackend()
    const manager = await makeManager(backend)
    queue.pending = [row('a', 'create')]

    await manager.syncPendingEvents({ force: true })
    await manager.syncPendingEvents({ force: true })
    expect(keyringStub.establishCalls).toBe(1)
    expect(backend.batchCreateMemories).not.toHaveBeenCalled()
    expect(manager.getLock()?.message).toMatch(/recovery phrase/i)

    await expect(manager.unlockWithRecoveryPhrase('not the words')).rejects.toThrow(
      /does not match/
    )
    expect(manager.isReady()).toBe(false)

    expect(await manager.unlockWithRecoveryPhrase('the right words')).toBe(true)
    expect(manager.getLock()).toBeNull()
    expect((await manager.syncPendingEvents({ force: true })).syncedCount).toBe(1)
  })
})
