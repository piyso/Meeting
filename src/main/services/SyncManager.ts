/**
 * Sync Manager
 *
 * Handles encrypted sync with PiyAPI backend.
 * Implements event-sourced sync queue with exponential backoff and infinite retries.
 *
 * Features:
 * - Event-sourced sync queue (persists across app restarts)
 * - Batch up to 50 events per sync
 * - Encrypt events before upload using EncryptionService
 * - POST to /api/v1/memories
 * - Mark synced_at on success
 * - Exponential backoff with infinite retries (5s, 10s, 20s, 30s max)
 * - ALLOWED_TABLES whitelist for SQL injection protection
 * - Content size limits and chunking (GAP-N15)
 * - Embedding status polling (GAP-16)
 */

import { v4 as uuidv4 } from 'uuid'
import { EncryptionService } from './EncryptionService'
import type { IBackendProvider } from './backend/IBackendProvider'
// Static import: a bare require('./backend/BackendSingleton') is left untouched
// by the bundler and resolves to a path that does not exist in dist-electron.
import { getBackend } from './backend/BackendSingleton'
import { KeyStorageService } from './KeyStorageService'
import { KeyringService, type KeyringLock, type KeyringOutcome } from './KeyringService'
import type { RestoreResult } from './CloudRestoreService'
import { buildSyncMemory, chunkSyncPayload } from './syncPayload'
import { Logger } from './Logger'
import type { Memory } from './backend/IBackendProvider'
import {
  createSyncQueueItem,
  getPendingSyncItems,
  deleteSyncQueueItems,
  incrementSyncRetry,
  parkSyncQueueItem,
  markSyncItemsInFlight,
  clearSyncItemsInFlight,
  getSyncQueueCount,
  getPendingSyncCount,
  getFailedSyncCount,
  resetFailedSyncItems,
} from '../database/crud/sync-queue'
import type { OperationType, CreateSyncQueueInput } from '../../types/database'
import { getDatabase } from '../database/connection'
import { PHIDetectionService } from './PHIDetectionService'
import { coalesceSyncEvents } from '../utils/coalesceSyncEvents'
import { broadcastToWindows } from '../ipc/windows'

/**
 * Allowed table names for sync operations (SQL injection protection)
 * Task 30.10: ALLOWED_TABLES whitelist
 */
const ALLOWED_TABLES = [
  'meetings',
  'transcripts',
  'notes',
  'entities',
  'audio_highlights',
  'action_items',
  'sentiment_scores',
  'calendar_events',
  'webhooks',
] as const
type AllowedTable = (typeof ALLOWED_TABLES)[number]

/**
 * Content size limits imported from TierMappingService (single source of truth)
 * Task 30.11: Content size limits and chunking
 */
import { getContentSizeLimit, getTierLimits, type BlueArkiveTier } from './TierMappingService'

/**
 * Wait after a failed pass before the next attempt (milliseconds), by number
 * of consecutive failed passes. Retries never stop; they only get further apart.
 * Task 30.7: Exponential backoff with infinite retries
 */
const BACKOFF_DELAYS = [5000, 10000, 20000, 30000, 60000, 120000, 300000]

/** This many 5xx/timeouts in a row within one pass means the service is down. */
const MAX_CONSECUTIVE_SERVER_ERRORS = 3

/** settings key: the account whose data this device's database (and queue) holds. */
const SYNC_OWNER_SETTING = 'sync_owner_user_id'

/**
 * Why uploads are not happening right now. Everything here is a condition of
 * the session or the service, not of any one queued item — so none of them
 * may ever count against an item's retry budget.
 */
export type PauseReason =
  | 'offline'
  | 'unreachable'
  | 'auth'
  | 'plan_required'
  | 'rate_limited'
  | 'different_account'

const PAUSE_MESSAGES: Record<PauseReason, string> = {
  offline: 'Offline — changes will upload when the connection is back.',
  unreachable: 'The sync service could not be reached. Retrying automatically.',
  auth: 'Your session needs to be renewed. Retrying automatically.',
  plan_required: 'Cloud sync is not included in your current plan.',
  rate_limited: 'The sync service is busy. Retrying shortly.',
  different_account:
    'The data on this device belongs to a different account, so it is not uploaded to this one.',
}

const LOCK_MESSAGES: Record<KeyringLock, string> = {
  password_required:
    'Sign out and sign in with your password on this device to turn on encrypted sync.',
  recovery_phrase_required:
    'Enter your recovery phrase to unlock encrypted sync on this device. It is shown in Settings on a device that already syncs.',
  unavailable: 'Encrypted sync is waiting for the sync service.',
  no_secure_storage:
    'This device has no secure key storage, so encrypted sync cannot be set up here. Sign in with a password, or set it up on another device first.',
}

/** How soon a keyring that could not be read is asked for again; doubles up to the cap. */
const KEY_RETRY_INTERVAL_MS = 60_000
const KEY_RETRY_MAX_INTERVAL_MS = 30 * 60_000

type SyncFailureKind = 'permanent' | 'server' | 'auth' | 'plan' | 'rate' | 'network'

function statusOf(error: unknown): number {
  const candidate = error as { status?: unknown; statusCode?: unknown } | null
  return Number(candidate?.status) || Number(candidate?.statusCode) || 0
}

/**
 * Decide what a failed request says about the item that was being sent.
 *
 *  - permanent: the server understood the request and rejected this item
 *    (400/404/409/413/422…). Sending it again cannot work.
 *  - server:    5xx, timeout, or a reply that was not JSON (a gateway's HTML
 *    error page). Usually the service; occasionally the item.
 *  - auth / plan / rate / network: nothing wrong with the item at all.
 */
export function classifySyncFailure(error: unknown): SyncFailureKind {
  const status = statusOf(error)
  if (status === 401) return 'auth'
  if (status === 402 || status === 403) return 'plan'
  if (status === 429) return 'rate'
  if (status === 408 || status === 425 || status >= 500) return 'server'
  if (status >= 400) return 'permanent'

  const message = error instanceof Error ? error.message : String(error)
  if (/not authenticated/i.test(message)) return 'auth'
  // A 2xx/3xx body that failed to parse.
  if (error instanceof SyntaxError) return 'server'
  // No HTTP status: DNS failure, refused/reset connection, request timeout.
  return 'network'
}

/**
 * Maximum events per batch
 * Task 30.3: Batch up to 50 events per sync
 */
const MAX_BATCH_SIZE = 50

/**
 * Sync event structure
 */
export interface SyncEvent {
  id: string
  operation_type: OperationType
  table_name: AllowedTable
  record_id: string
  payload: Record<string, unknown>
  timestamp: number
}

/**
 * Sync result
 */
export interface SyncResult {
  success: boolean
  syncedCount: number
  failedCount: number
  errors: string[]
}

/**
 * Embedding status
 * Task 30.12: Embedding status polling (GAP-16)
 */
export type EmbeddingStatus = 'pending' | 'processing' | 'ready' | 'failed'

/**
 * Sync Manager Class
 */
export class SyncManager {
  // P1-2 FIX: Use lazy getter via BackendSingleton instead of storing a direct
  // reference. When resetBackend() is called on logout, a stored reference goes
  // stale (token cleared) while the 30-second retry timer may still fire.
  private _backendOverride: IBackendProvider | null = null
  private get backend(): IBackendProvider {
    if (this._backendOverride) return this._backendOverride
    return getBackend()
  }
  private userId: string | null = null
  // C-1 AUDIT: Raw password is NOT stored as a class field.
  // It's received in initialize(), used for PBKDF2 key derivation, then discarded.
  // Flag to track that encryption was successfully initialized
  private encryptionReady: boolean = false
  private readonly keyring = new KeyringService(() => this.backend)
  /** Why this device cannot encrypt for the account (null once it can). */
  private lockReason: KeyringLock | null = null
  private lastKeyAttemptAt = 0
  private keyAttemptsUnavailable = 0
  private syncInterval: NodeJS.Timeout | null = null
  private isSyncing: boolean = false
  // Outcome of the most recent sync run, for the status indicator in the UI
  private lastSyncTime: number | null = null
  private lastSyncError: string | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null // #16: track for cleanup
  private cachedPlanTier: string | null = null
  /** Why the last pass uploaded nothing (null while sync is working). */
  private pausedReason: PauseReason | null = null
  /** A reason that no retry can clear — see loadSessionState(). */
  private blockedReason: PauseReason | null = null
  private consecutiveFailedPasses = 0
  /** Earliest time (ms) of the next automatic pass after a failure. */
  private nextAttemptAt = 0
  private log = Logger.create('SyncManager')

  constructor(backend?: IBackendProvider) {
    this._backendOverride = backend || null
  }

  /**
   * Initialize sync manager with user credentials
   *
   * @param userId - User ID
   * @param password - User password (for encryption)
   */
  public async initialize(userId: string, password: string): Promise<void> {
    this.userId = userId
    // The access token has to be in place first: the keyring lives in the cloud.
    await this.loadSessionState(userId)

    // Work out the account's data key. The password only unwraps it (see
    // KeyringService) — it is used here and never stored on `this`.
    this.applyKeyOutcome(await this.keyring.establish(userId, password))
  }

  /**
   * Initialize without a password (app restart, Google sign-in): from the key
   * this device already holds, or — for a new password-less account — a fresh
   * one. Returns false when the device cannot obtain the key by itself; sync
   * then stays paused and getLock() says what the user has to do.
   */
  public async initializeFromStoredKey(userId: string): Promise<boolean> {
    this.userId = userId
    this.encryptionReady = false
    await this.loadSessionState(userId)
    this.applyKeyOutcome(await this.keyring.establish(userId))
    return this.encryptionReady
  }

  /**
   * Unlock encrypted sync on this device with a recovery phrase.
   * @throws with a user-facing message when the phrase does not fit.
   */
  public async unlockWithRecoveryPhrase(phrase: string): Promise<boolean> {
    if (!this.userId) throw new Error('Sign in before entering a recovery phrase.')
    this.applyKeyOutcome(await this.keyring.unlockWithRecoveryPhrase(this.userId, phrase))
    return this.encryptionReady
  }

  /** Make a recovery phrase able to recover this account's key (earlier ones stay valid). */
  public async addRecoveryPhrase(phrase: string): Promise<boolean> {
    if (!this.userId || !this.encryptionReady) return false
    return this.keyring.addRecoveryPhrase(this.userId, phrase)
  }

  private applyKeyOutcome(outcome: KeyringOutcome): void {
    this.encryptionReady = outcome.status === 'ready'
    this.lockReason = outcome.status === 'locked' ? outcome.reason : null
    this.lastKeyAttemptAt = Date.now()
    this.keyAttemptsUnavailable =
      this.lockReason === 'unavailable' ? this.keyAttemptsUnavailable + 1 : 0
    if (outcome.status === 'locked') {
      this.log.info(`Encrypted sync is locked on this device: ${outcome.reason}`)
    }
  }

  private keyRetryDelay(): number {
    const doublings = Math.min(Math.max(this.keyAttemptsUnavailable - 1, 0), 10)
    return Math.min(KEY_RETRY_INTERVAL_MS * 2 ** doublings, KEY_RETRY_MAX_INTERVAL_MS)
  }

  /** Why this device cannot encrypt for the account yet, or null when it can. */
  public getLock(): { reason: KeyringLock; message: string } | null {
    return this.lockReason
      ? { reason: this.lockReason, message: LOCK_MESSAGES[this.lockReason] }
      : null
  }

  /** Whether this manager can encrypt (has a key) — false means sync is paused. */
  public isReady(): boolean {
    return !!this.userId && this.encryptionReady
  }

  /** Access token and plan tier for the signed-in user. */
  private async loadSessionState(userId: string): Promise<void> {
    // Load access token from keychain
    const accessToken = await KeyStorageService.getAccessToken(userId)
    if (accessToken) {
      this.backend.setAccessToken(accessToken, userId)
    }

    // Cache plan tier for synchronous access in chunking
    try {
      const tier = await KeyStorageService.getPlanTier(userId)
      this.cachedPlanTier = tier || 'free'
    } catch (err) {
      this.log.debug('Plan tier lookup failed, defaulting to free', err)
      this.cachedPlanTier = 'free'
    }

    // The local database and its sync queue are not partitioned by account.
    // The first account to sync from this device owns them; signing in as a
    // different account must not upload the previous user's meetings there.
    this.blockedReason = null
    try {
      const db = getDatabase()
      const owner = db
        .prepare('SELECT value FROM settings WHERE key = ?')
        .get(SYNC_OWNER_SETTING) as { value: string } | undefined
      let ownerId: string | null = null
      if (owner) {
        try {
          ownerId = JSON.parse(owner.value)
        } catch {
          ownerId = owner.value
        }
      }
      if (!ownerId) {
        db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run(
          SYNC_OWNER_SETTING,
          JSON.stringify(userId),
          Math.floor(Date.now() / 1000)
        )
      } else if (ownerId !== userId) {
        // Only data makes a device "someone else's". With no meetings and
        // nothing waiting to upload there is nothing of the previous account
        // left to protect, and the new one takes the device over — otherwise
        // signing in on a wiped or never-used install stayed blocked for good.
        const left = db
          .prepare(
            'SELECT (SELECT COUNT(*) FROM meetings) AS meetings, (SELECT COUNT(*) FROM sync_queue) AS queued'
          )
          .get() as { meetings: number; queued: number } | undefined
        if (left && left.meetings === 0 && left.queued === 0) {
          db.prepare(
            'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)'
          ).run(SYNC_OWNER_SETTING, JSON.stringify(userId), Math.floor(Date.now() / 1000))
          db.prepare('DELETE FROM sync_remote_ids').run()
        } else {
          this.blockedReason = 'different_account'
          this.log.warn('Sync paused: this device holds data from a different account')
        }
      }
    } catch (err) {
      this.log.debug('Sync owner check skipped:', err)
    }

    // Items parked as failed get another chance with each new session.
    // Earlier versions parked them for outages and plan limits that had
    // nothing to do with the item; without this they would never upload.
    try {
      const revived = resetFailedSyncItems()
      if (revived > 0) this.log.info(`Re-queued ${revived} previously failed sync item(s)`)
    } catch (err) {
      this.log.debug('Could not re-queue failed sync items:', err)
    }

    this.pausedReason = null
    this.consecutiveFailedPasses = 0
    this.nextAttemptAt = 0

    // C-2 AUDIT FIX: Truncate userId in logs to prevent PII in crash logs/Sentry
    this.log.info(`Initialized for user: ${userId.substring(0, 8)}…`)
  }

  /**
   * Start automatic sync (every 30 seconds)
   * Task 30.8: Queue persists across app restarts
   */
  public startAutoSync(): void {
    if (this.syncInterval) {
      this.log.debug('Auto-sync already running')
      return
    }

    this.log.info('Starting auto-sync (every 30 seconds)')

    // Sync immediately on start
    this.syncPendingEvents().catch(error => {
      this.log.error('Initial sync failed:', error)
    })

    // Then sync every 30 seconds
    // C-6 FIX: .unref() prevents this timer from blocking clean process exit
    // if stopAutoSync() is not called before shutdown (e.g., force-kill)
    this.syncInterval = setInterval(() => {
      this.syncPendingEvents().catch(error => {
        this.log.error('Auto-sync failed:', error)
      })
    }, 30000)
    this.syncInterval.unref()
  }

  /**
   * Stop automatic sync
   */
  public stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
      this.syncInterval = null
      this.log.info('Auto-sync stopped')
    }
    // #16 fix: Cancel any pending retry timer to prevent orphaned sync after logout
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
  }

  /**
   * Queue a sync event
   * Task 30.2: Queue events on create/update/delete
   *
   * @param operation - Operation type (create, update, delete)
   * @param table - Table name (must be in ALLOWED_TABLES)
   * @param recordId - Record ID
   * @param payload - Event payload
   */
  public queueEvent(
    operation: OperationType,
    table: string,
    recordId: string,
    payload: Record<string, unknown>
  ): void {
    // Task 30.10: Validate table name against whitelist
    if (!this.isAllowedTable(table)) {
      throw new Error(`Invalid table name: ${table}. Allowed tables: ${ALLOWED_TABLES.join(', ')}`)
    }

    const event: CreateSyncQueueInput = {
      id: uuidv4(),
      operation_type: operation,
      table_name: table as AllowedTable,
      record_id: recordId,
      payload,
    }

    createSyncQueueItem(event)
    this.log.debug(`Queued ${operation} event for ${table}:${recordId}`)
  }

  /**
   * Sync pending events to backend
   * Task 30.1: Implement event-sourced sync queue
   * Task 30.3: Batch up to 50 events per sync
   * Task 30.4: Encrypt events before upload
   * Task 30.5: POST to /api/v1/memories
   * Task 30.6: Mark synced_at on success
   * Task 30.7: Implement exponential backoff with infinite retries
   *
   * @returns Sync result
   */
  public async syncPendingEvents(options: { force?: boolean } = {}): Promise<SyncResult> {
    const skipped: SyncResult = { success: true, syncedCount: 0, failedCount: 0, errors: [] }

    if (this.isSyncing) {
      this.log.debug('Sync already in progress, skipping')
      return skipped
    }

    // The keyring could not be read when this session started (offline, or
    // the service was down): ask again now and then.
    if (
      this.userId &&
      !this.encryptionReady &&
      this.lockReason === 'unavailable' &&
      (options.force || Date.now() - this.lastKeyAttemptAt >= this.keyRetryDelay()) &&
      (await this.isOnline())
    ) {
      this.applyKeyOutcome(await this.keyring.establish(this.userId))
    }

    if (!this.userId || !this.encryptionReady) {
      this.log.debug('Not initialized, skipping sync')
      return { success: false, syncedCount: 0, failedCount: 0, errors: ['Not initialized'] }
    }

    // This device's data belongs to another account — never upload it here.
    if (this.blockedReason) {
      return {
        success: false,
        syncedCount: 0,
        failedCount: 0,
        errors: [PAUSE_MESSAGES[this.blockedReason]],
      }
    }

    // Backing off after a failed pass. "Sync now" (force) overrides it.
    if (!options.force && Date.now() < this.nextAttemptAt) {
      this.log.debug('Backing off after a failed pass, skipping')
      return skipped
    }

    this.isSyncing = true
    this.remoteIndex.clear()

    try {
      // Offline: don't burn CPU embedding and encrypting 50 events every 30s
      // only to have each upload fail.
      if (!(await this.isOnline())) {
        this.log.debug('Offline, skipping sync')
        this.pausedReason = 'offline'
        return { success: false, syncedCount: 0, failedCount: 0, errors: ['Offline'] }
      }

      // Plans without cloud storage: the server answers every upload with 403.
      // Leave the queue untouched — it uploads as soon as the plan allows it.
      const planTier = await this.refreshPlanTier()
      if (!getTierLimits(planTier).cloudSync) {
        this.pausedReason = 'plan_required'
        return {
          success: false,
          syncedCount: 0,
          failedCount: 0,
          errors: [PAUSE_MESSAGES.plan_required],
        }
      }

      // Get pending events (batch up to 50), then reduce them to what really
      // needs sending: a create that is followed by a delete or update for the
      // same record must not be uploaded as it stands (see coalesceSyncEvents).
      const queuedEvents = getPendingSyncItems(MAX_BATCH_SIZE)
      const coalesced = coalesceSyncEvents(queuedEvents)
      if (coalesced.supersededIds.length > 0 || coalesced.payloadUpdates.length > 0) {
        const db = getDatabase()
        db.transaction(() => {
          const setPayload = db.prepare('UPDATE sync_queue SET payload = ? WHERE id = ?')
          for (const change of coalesced.payloadUpdates) setPayload.run(change.payload, change.id)
          const drop = db.prepare('DELETE FROM sync_queue WHERE id = ?')
          for (const id of coalesced.supersededIds) drop.run(id)
        })()
        this.log.debug(
          `Coalesced ${coalesced.supersededIds.length} superseded event(s) before upload`
        )
      }
      const pendingEvents = coalesced.events

      if (pendingEvents.length === 0) {
        this.log.debug('No pending events to sync')
        this.recordPassOutcome(null, [])
        return skipped
      }

      this.log.info(`Syncing ${pendingEvents.length} pending events`)
      this.announce({ type: 'started' })
      // Rows being uploaded must not be rewritten by queue coalescing.
      markSyncItemsInFlight(pendingEvents.map(event => event.id))

      const syncedIds: string[] = []
      const errors: string[] = []
      // E2: Collect create events for batch processing instead of one-by-one
      const pendingCreates: Array<{
        memory: Memory
        event: { table_name: string; record_id: string; id: string; operation_type: string }
        queueItemId: string
      }> = []
      let processedCount = 0
      // Why the pass was cut short (the server refused or could not be reached).
      let aborted: PauseReason | null = null
      // Items the server answered with a 5xx/timeout in this pass. Whether
      // that counts against the item is decided once the pass is over.
      const serverFailed = new Set<string>()
      let consecutiveServerErrors = 0

      // #9 fix: Read PHI settings ONCE per sync batch (moved outside per-event loop)
      // Both default to on, as the Settings screen shows them. They used to
      // default to off here whenever the user had never touched the toggles —
      // the screen said "masking before sync" while nothing was masked.
      let phiEnabled = true
      let maskBeforeSync = true
      try {
        const dbForPhi = getDatabase()
        const phiRow = dbForPhi
          .prepare('SELECT value FROM settings WHERE key = ?')
          .get('phiDetectionEnabled') as { value: string } | undefined
        const maskRow = dbForPhi
          .prepare('SELECT value FROM settings WHERE key = ?')
          .get('maskPHIBeforeSync') as { value: string } | undefined
        if (phiRow) phiEnabled = phiRow.value === 'true' || phiRow.value === '1'
        if (maskRow) maskBeforeSync = maskRow.value === 'true' || maskRow.value === '1'
      } catch (phiSettingsError) {
        this.log.warn('PHI settings read failed:', phiSettingsError)
      }

      // Process each event
      for (const event of pendingEvents) {
        // A queue row whose payload is not JSON can never be uploaded.
        let payload: Record<string, unknown>
        try {
          payload = event.payload ? JSON.parse(event.payload) : {}
        } catch {
          this.log.error(`Unreadable payload in sync queue item ${event.id} — parked`)
          this.parkQuietly(event.id)
          errors.push(`${event.table_name}:${event.record_id} - unreadable payload`)
          continue
        }

        try {
          // Task 30.11: Check content size and chunk if necessary
          const chunkedPayloads = this.chunkContentIfNeeded(payload)

          // Process each chunk
          for (const chunkPayload of chunkedPayloads) {
            // Generate local embeddings BEFORE encryption (Encrypted Search Paradox fix)
            let plaintextContent =
              (typeof chunkPayload.text === 'string' ? chunkPayload.text : '') ||
              (typeof chunkPayload.content === 'string' ? chunkPayload.content : '') ||
              (typeof chunkPayload.original_text === 'string' ? chunkPayload.original_text : '') ||
              ''

            // PHI Detection: Check content before cloud upload (HIPAA compliance)
            if (phiEnabled && typeof plaintextContent === 'string' && plaintextContent.length > 0) {
              try {
                const phiResult = PHIDetectionService.detectPHI(plaintextContent)
                if (phiResult.hasPHI) {
                  this.log.warn(
                    `PHI detected in ${event.table_name}:${event.record_id} — ` +
                      `${phiResult.detectedIdentifiers.length} entities (risk: ${phiResult.riskLevel})`
                  )
                  // Mask PHI if setting enabled
                  if (maskBeforeSync && phiResult.maskedText) {
                    // Mask only the fields this payload actually has.
                    for (const field of ['text', 'content', 'original_text'] as const) {
                      if (typeof chunkPayload[field] === 'string') {
                        chunkPayload[field] = phiResult.maskedText
                      }
                    }
                    // The embedding is uploaded unencrypted — it must be
                    // computed from the masked text, not the original.
                    plaintextContent = phiResult.maskedText
                    this.log.info('PHI masked before sync')
                  }
                }
              } catch (phiError) {
                this.log.warn('PHI detection failed, continuing without:', phiError)
              }
            }

            let embeddingData: number[] | undefined
            if (typeof plaintextContent === 'string' && plaintextContent.length > 0) {
              try {
                const { getLocalEmbeddingService } = await import('./LocalEmbeddingService')
                const embeddingResult = await getLocalEmbeddingService().embed(plaintextContent)
                embeddingData = embeddingResult.embedding
              } catch (error) {
                this.log.warn('Local embedding failed, continuing without:', error)
              }
            }

            // Task 30.4: Encrypt payload before upload
            // C-1 AUDIT: Use encryptWithCachedKey — password was zeroed after init.
            // EncryptionService.keyCache was pre-warmed during initialize().
            const encryptedPayload = await EncryptionService.encryptWithCachedKey(
              JSON.stringify(chunkPayload),
              this.userId ?? ''
            )

            // Convert to Memory format for PiyAPI
            const memory = buildSyncMemory(event, encryptedPayload, embeddingData)

            // Route to correct PiyAPI operation based on event type
            switch (event.operation_type) {
              case 'create': {
                // E2: Collect creates for batch processing (handled after loop)
                pendingCreates.push({ memory, event, queueItemId: event.id })
                break
              }

              case 'update': {
                if (chunkedPayloads.length > 1) {
                  // Chunked content: patching one remote memory with each chunk
                  // in turn would leave only the last chunk. Replace the whole
                  // set — drop the old memories once, then create every chunk.
                  if (chunkPayload === chunkedPayloads[0]) {
                    await this.deleteRemoteCopies(event.table_name, event.record_id)
                  }
                  const created = await this.backend.createMemory(memory)
                  this.rememberRemoteMemoryId(event.table_name, event.record_id, created?.id)
                  break
                }

                const existingId = await this.findRemoteMemoryId(event.table_name, event.record_id)
                let updated = false
                if (existingId) {
                  try {
                    await this.backend.updateMemory(existingId, memory)
                    updated = true
                  } catch (updateErr) {
                    // The remembered copy is gone (deleted from another
                    // device): forget it and store a fresh one below.
                    if (statusOf(updateErr) !== 404) throw updateErr
                    this.forgetRemoteMemoryId(event.table_name, event.record_id, existingId)
                  }
                }
                if (!updated) {
                  if (!existingId) {
                    this.log.warn(
                      `Update target not found in cloud for ${event.record_id}, creating new`
                    )
                  }
                  const created = await this.backend.createMemory(memory)
                  this.rememberRemoteMemoryId(event.table_name, event.record_id, created?.id)
                }
                break
              }

              case 'delete': {
                // A chunked record has several memories — remove every one.
                const deleted = await this.deleteRemoteCopies(event.table_name, event.record_id)
                if (deleted === 0) {
                  // Already deleted or never synced — safe to skip
                  this.log.debug(
                    `Delete target not found in cloud for ${event.record_id}, skipping`
                  )
                }
                break
              }

              default: {
                this.log.warn(
                  `Unknown operation type: ${event.operation_type}, defaulting to create`
                )
                const created = await this.backend.createMemory(memory)
                this.rememberRemoteMemoryId(event.table_name, event.record_id, created?.id)
              }
            }
          }

          // Task 30.6: Mark synced_at on success (skip creates — handled by batch below)
          if (event.operation_type !== 'create') {
            this.markSyncedAtomic(event.table_name, event.record_id, event.id)
            syncedIds.push(event.id)
          }
          consecutiveServerErrors = 0

          this.log.info(`Synced ${event.operation_type} ${event.table_name}:${event.record_id}`)
        } catch (error: unknown) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          const kind = classifySyncFailure(error)
          errors.push(`${event.table_name}:${event.record_id} - ${errorMsg}`)

          if (kind === 'permanent') {
            // The server rejected this item as invalid; sending it again
            // cannot succeed. Park it: it leaves the pending set but stays
            // listed as failed (and is offered again after the next sign-in).
            this.log.error(
              `Permanent sync failure for event ${event.id} (HTTP ${statusOf(error)}) — parked:`,
              errorMsg
            )
            this.parkQuietly(event.id)
            continue
          }

          if (kind === 'server') {
            this.log.warn(`Server error for event ${event.id}:`, errorMsg)
            serverFailed.add(event.id)
            // Several in a row: the service is down, not these items.
            if (++consecutiveServerErrors >= MAX_CONSECUTIVE_SERVER_ERRORS) {
              aborted = 'unreachable'
              break
            }
            continue
          }

          // Not signed in, plan does not allow it, rate limited, or no route
          // to the server: nothing else in the queue can succeed either. Stop
          // here without charging any item for it.
          aborted = await this.pauseFor(kind, errorMsg)
          break
        }
      }

      // Delete successfully synced events from queue
      if (syncedIds.length > 0) {
        deleteSyncQueueItems(syncedIds)
        this.log.debug(`Deleted ${syncedIds.length} synced events from queue`)
      }

      // E2: Batch-create all pending create events in one API call (up to 50)
      if (!aborted && pendingCreates.length > 0) {
        const createQueueIds = [...new Set(pendingCreates.map(pc => pc.queueItemId))]
        try {
          const batchMemories = pendingCreates.map(pc => pc.memory)
          const batchResults = await this.backend.batchCreateMemories(batchMemories)
          // A queue item (possibly several chunks) is done only when every
          // one of its memories came back with an id.
          const incomplete = new Set<string>()
          for (let i = 0; i < pendingCreates.length; i++) {
            const pc = pendingCreates[i]
            if (!pc) continue
            const remoteId = batchResults[i]?.id
            if (remoteId) {
              this.rememberRemoteMemoryId(pc.event.table_name, pc.event.record_id, remoteId)
            } else {
              incomplete.add(pc.queueItemId)
            }
          }
          const handled = new Set<string>()
          for (const pc of pendingCreates) {
            if (handled.has(pc.queueItemId)) continue
            handled.add(pc.queueItemId)
            if (incomplete.has(pc.queueItemId)) {
              serverFailed.add(pc.queueItemId)
              errors.push(`Create not confirmed for ${pc.event.record_id}`)
            } else {
              this.markSyncedAtomic(pc.event.table_name, pc.event.record_id, pc.queueItemId)
              processedCount++
            }
          }
          this.log.info(`Batch-created ${pendingCreates.length} memories in one API call`)
        } catch (batchErr) {
          const batchMsg = batchErr instanceof Error ? batchErr.message : String(batchErr)
          const batchKind = classifySyncFailure(batchErr)

          if (batchKind === 'server') {
            // After a timeout or 5xx the batch may have been stored, and
            // re-sending each item now would duplicate it — leave them queued.
            this.log.warn('Batch create failed, will retry next cycle:', batchErr)
            for (const id of createQueueIds) serverFailed.add(id)
            errors.push(`Batch create failed: ${batchMsg}`)
          } else if (batchKind !== 'permanent') {
            aborted = await this.pauseFor(batchKind, batchMsg)
            errors.push(`Batch create failed: ${batchMsg}`)
          } else {
            // Rejected as a whole (one bad item fails the request): send them
            // one by one so the good ones go through.
            this.log.warn('Batch create rejected, falling back to individual creates:', batchErr)
            const failedItems = new Set<string>()
            for (const pc of pendingCreates) {
              if (failedItems.has(pc.queueItemId)) continue
              try {
                const created = await this.backend.createMemory(pc.memory)
                this.rememberRemoteMemoryId(pc.event.table_name, pc.event.record_id, created?.id)
              } catch (individualErr) {
                failedItems.add(pc.queueItemId)
                const individualMsg =
                  individualErr instanceof Error ? individualErr.message : String(individualErr)
                errors.push(`Create failed for ${pc.event.record_id}: ${individualMsg}`)
                const kind = classifySyncFailure(individualErr)
                if (kind === 'permanent') {
                  this.parkQuietly(pc.queueItemId)
                } else if (kind === 'server') {
                  serverFailed.add(pc.queueItemId)
                } else {
                  aborted = await this.pauseFor(kind, individualMsg)
                  break
                }
              }
            }
            // A queue item is done only when every one of its chunks was
            // stored. After an abort, items not reached yet stay queued.
            const attempted = new Set<string>()
            for (const pc of pendingCreates) {
              attempted.add(pc.queueItemId)
              if (aborted && failedItems.has(pc.queueItemId)) break
            }
            const seen = new Set<string>()
            for (const pc of pendingCreates) {
              if (seen.has(pc.queueItemId) || failedItems.has(pc.queueItemId)) continue
              if (aborted && !attempted.has(pc.queueItemId)) continue
              seen.add(pc.queueItemId)
              this.markSyncedAtomic(pc.event.table_name, pc.event.record_id, pc.queueItemId)
              processedCount++
            }
          }
        }
      }

      const syncedCount = syncedIds.length + processedCount

      // A 5xx on some items while others went through is those items' own
      // problem, so it counts against them. A pass in which nothing went
      // through is an outage: charging every queued item for it is how an
      // hour without the server used to mark the whole queue as failed.
      if (serverFailed.size > 0 && syncedCount > 0 && !aborted) {
        for (const id of serverFailed) incrementSyncRetry(id)
      }

      // Items the server rejected outright are parked above; they are not a
      // reason to slow down the rest of the queue.
      this.recordPassOutcome(aborted ?? (serverFailed.size > 0 ? 'unreachable' : null), errors)

      this.announce(
        errors.length === 0
          ? { type: 'completed' }
          : {
              type: 'failed',
              error: {
                code: 'SYNC_FAILED',
                message: errors[0] ?? 'Sync failed',
                timestamp: Date.now(),
              },
            }
      )

      return {
        success: errors.length === 0,
        syncedCount,
        failedCount: errors.length,
        errors,
      }
    } catch (error) {
      this.lastSyncError = error instanceof Error ? error.message : String(error)
      throw error
    } finally {
      clearSyncItemsInFlight()
      this.isSyncing = false
    }
  }

  /**
   * Download what is in the account and missing on this device (see
   * CloudRestoreService). Reading one's own data is not a plan feature, so
   * this works on any plan — it needs only the account's key.
   *
   * @throws with a user-facing message when this device cannot do it.
   */
  public async restoreFromCloud(): Promise<RestoreResult> {
    if (!this.userId || !this.encryptionReady) {
      throw new Error(this.getLock()?.message ?? 'Sign in to restore from your account.')
    }
    if (this.blockedReason === 'different_account') {
      throw new Error(
        'This device holds meetings from a different account, so this account is not restored into it.'
      )
    }
    if (this.restoreInFlight) return this.restoreInFlight

    this.restoreInFlight = (async () => {
      const { restoreFromCloud } = await import('./CloudRestoreService')
      return restoreFromCloud({
        db: getDatabase(),
        backend: this.backend,
        decrypt: payload => EncryptionService.decryptWithCachedKey(payload),
      })
    })().finally(() => {
      this.restoreInFlight = null
    })
    return this.restoreInFlight
  }

  private restoreInFlight: Promise<RestoreResult> | null = null

  /** Live sync state for the renderer's status indicator */
  public getSyncState(): {
    isSyncing: boolean
    lastSyncTime: number | null
    lastSyncError: string | null
  } {
    return {
      isSyncing: this.isSyncing,
      lastSyncTime: this.lastSyncTime,
      lastSyncError: this.lastSyncError,
    }
  }

  /** Why nothing is being uploaded right now, or null while sync is working. */
  public getPause(): { reason: PauseReason; message: string } | null {
    const reason = this.blockedReason ?? this.pausedReason
    return reason ? { reason, message: PAUSE_MESSAGES[reason] } : null
  }

  /**
   * Poll embedding status for a memory.
   * E4 optimization: Single delayed check instead of 10×1s polling loop.
   * PiyAPI embeddings are typically ready in <2s; one check at 3s suffices.
   *
   * @param memoryId - Memory ID to poll
   * @returns Final embedding status
   */
  public async pollEmbeddingStatus(
    memoryId: string,
    _maxAttempts: number = 1,
    _intervalMs: number = 3000
  ): Promise<EmbeddingStatus> {
    this.log.debug(`Checking embedding status for memory: ${memoryId}`)

    // Wait 3 seconds for PiyAPI to generate embeddings
    await new Promise(resolve => setTimeout(resolve, 3000))

    try {
      // P3: Use backend.getMemories instead of raw fetch to go through
      // proper auth, proxy mode, and error handling
      const memories = await this.backend.getMemories(`memory:${memoryId}`, 1, 0)
      const memory = memories?.[0]
      if (!memory) return 'pending'

      return (memory.metadata?.embedding_status as EmbeddingStatus) || 'pending'
    } catch (error) {
      this.log.debug('Embedding check failed (non-critical):', (error as Error).message)
      return 'pending'
    }
  }

  /**
   * Get sync queue statistics
   *
   * @returns Queue statistics
   */
  public getSyncStats(): { total: number; pending: number; failed: number } {
    return {
      total: getSyncQueueCount(),
      pending: getPendingSyncCount(),
      failed: getFailedSyncCount(),
    }
  }

  /**
   * Check if table name is in ALLOWED_TABLES whitelist
   * Task 30.10: ALLOWED_TABLES whitelist for SQL injection protection
   *
   * @param table - Table name to validate
   * @returns True if table is allowed
   */
  private isAllowedTable(table: string): table is AllowedTable {
    return ALLOWED_TABLES.includes(table as AllowedTable)
  }

  /**
   * Get exponential backoff delay based on retry count
   * Task 30.7: Exponential backoff with infinite retries
   *
   * @param retryCount - Number of retries
   * @returns Delay in milliseconds
   */
  private getBackoffDelay(retryCount: number): number {
    const index = Math.min(Math.max(retryCount, 0), BACKOFF_DELAYS.length - 1)
    return BACKOFF_DELAYS[index] ?? BACKOFF_DELAYS[BACKOFF_DELAYS.length - 1] ?? 30000
  }

  /**
   * Book-keeping at the end of a pass: remember why it failed (for the status
   * indicator) and when to try again.
   */
  /**
   * Tell the windows an upload pass started or ended (`event:syncEvent`). The
   * sync badge listened for this but nothing sent it, so it only ever changed
   * on its 15-second status poll.
   */
  private announce(event: {
    type: 'started' | 'completed' | 'failed'
    error?: { code: string; message: string; timestamp: number }
  }): void {
    try {
      broadcastToWindows('event:syncEvent', event)
    } catch {
      // No windows (tests, shutdown) — the status poll still reports the outcome.
    }
  }

  private recordPassOutcome(reason: PauseReason | null, errors: string[]): void {
    this.lastSyncError = errors[0] ?? null
    if (!reason) {
      this.pausedReason = null
      this.consecutiveFailedPasses = 0
      this.nextAttemptAt = 0
      this.lastSyncTime = Date.now()
      return
    }

    this.pausedReason = reason
    const delay = this.getBackoffDelay(this.consecutiveFailedPasses)
    this.consecutiveFailedPasses++
    this.nextAttemptAt = Date.now() + delay
    this.log.info(`Sync paused (${reason}); next attempt in ${Math.round(delay / 1000)}s`)

    // The 30s auto-sync tick covers long waits; short ones get their own timer.
    if (this.syncInterval && delay < 30000) {
      if (this.retryTimer) clearTimeout(this.retryTimer)
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null
        this.syncPendingEvents().catch(err => this.log.error('Retry sync failed:', err))
      }, delay)
      this.retryTimer.unref?.()
    }
  }

  /** React to a failure that is about the session or the service, not an item. */
  private async pauseFor(
    kind: Exclude<SyncFailureKind, 'permanent' | 'server'>,
    message: string
  ): Promise<PauseReason> {
    switch (kind) {
      case 'auth':
        // AuthService refreshes the session and hands the new token to the backend.
        await this.refreshAccessToken()
        return 'auth'
      case 'plan':
        this.log.warn('Sync refused for this plan:', message)
        // The plan on file here is out of date (a downgrade, or an expired
        // subscription): fetch it so the next pass does not ask again.
        void this.refreshProfile()
        return 'plan_required'
      case 'rate':
        return 'rate_limited'
      default:
        this.log.warn('Sync service unreachable:', message)
        return 'unreachable'
    }
  }

  private async refreshProfile(): Promise<void> {
    try {
      const { getAuthService } = await import('./AuthService')
      await getAuthService().refreshProfile()
    } catch (err) {
      this.log.debug('Profile refresh after plan refusal failed:', err)
    }
  }

  /** The plan currently on file for this account (kept fresh by AuthService). */
  private async refreshPlanTier(): Promise<string> {
    if (this.userId) {
      try {
        const tier = await KeyStorageService.getPlanTier(this.userId)
        if (tier) this.cachedPlanTier = tier
      } catch (err) {
        this.log.debug('Plan tier lookup failed, keeping cached value', err)
      }
    }
    return this.cachedPlanTier || 'free'
  }

  private parkQuietly(queueItemId: string): void {
    try {
      parkSyncQueueItem(queueItemId)
    } catch (parkErr) {
      this.log.warn('Failed to park sync queue item:', (parkErr as Error).message)
    }
  }

  /**
   * Mark record as synced in database AND delete queue item atomically
   * Task 30.6: Mark synced_at on success
   *
   * Runs both operations in a single SQLite transaction to prevent
   * duplicate uploads if the app crashes between them.
   *
   * @param table - Table name (re-validated against ALLOWED_TABLES)
   * @param recordId - Record ID
   * @param queueItemId - Sync queue item ID to delete
   */
  private markSyncedAtomic(table: string, recordId: string, queueItemId: string): void {
    const db = getDatabase()
    const now = Math.floor(Date.now() / 1000)

    // #5 fix: Defense-in-depth — use a map of prepared statements
    // instead of string interpolation, even though ALLOWED_TABLES guards the input
    // P1-1 FIX: Added action_items, sentiment_scores, calendar_events, webhooks
    // which were missing — records from these tables were re-synced every 30s cycle
    const tableUpdateSQL: Record<string, string> = {
      meetings: 'UPDATE meetings SET synced_at = ? WHERE id = ?',
      transcripts: 'UPDATE transcripts SET synced_at = ? WHERE id = ?',
      notes: 'UPDATE notes SET synced_at = ? WHERE id = ?',
      entities: 'UPDATE entities SET synced_at = ? WHERE id = ?',
      audio_highlights: 'UPDATE audio_highlights SET synced_at = ? WHERE id = ?',
      action_items: 'UPDATE action_items SET synced_at = ? WHERE id = ?',
      sentiment_scores: 'UPDATE sentiment_scores SET synced_at = ? WHERE id = ?',
      calendar_events: 'UPDATE calendar_events SET synced_at = ? WHERE id = ?',
      webhooks: 'UPDATE webhooks SET synced_at = ? WHERE id = ?',
    }

    const sql = tableUpdateSQL[table]
    if (!sql) {
      this.log.error(`markSyncedAtomic: Blocked invalid table "${table}"`)
      return
    }

    try {
      const txn = db.transaction(() => {
        // 1. Mark the source record as synced
        db.prepare(sql).run(now, recordId)

        // 2. Remove from sync queue
        db.prepare('DELETE FROM sync_queue WHERE id = ?').run(queueItemId)
      })
      txn()
    } catch (error) {
      this.log.error(`Failed atomic markSynced for ${table}:${recordId}:`, (error as Error).message)
      // The upload already succeeded. If the bookkeeping UPDATE cannot run
      // (e.g. a table from an older schema without synced_at), the queue item
      // must still go — otherwise the same record is re-uploaded every cycle.
      try {
        db.prepare('DELETE FROM sync_queue WHERE id = ?').run(queueItemId)
      } catch (deleteErr) {
        this.log.error('Failed to remove synced queue item:', (deleteErr as Error).message)
      }
    }
  }

  // ── Helpers ─────────────────────────────────────────────────

  /**
   * record_id → remote memory ids, per table, for the current sync pass.
   * Filled lazily one page at a time so a lookup stops as soon as it hits.
   */
  private remoteIndex = new Map<
    string,
    { ids: Map<string, string[]>; nextOffset: number; exhausted: boolean }
  >()
  private static readonly REMOTE_PAGE_SIZE = 50
  private static readonly REMOTE_MAX_PAGES = 200

  /**
   * Find the cloud memory holding a local record. The previous lookup only
   * read the first 50 memories of a namespace, so once a table had more than
   * that, updates created duplicates and deletes were silently skipped.
   */
  private async findRemoteMemoryId(table: string, recordId: string): Promise<string | null> {
    // Ids of memories this device created are kept locally; only records
    // synced before that table existed (or from another device) need the scan.
    const local = this.localRemoteIds(table, recordId)
    if (local.length > 0) return local[0] ?? null

    let index = this.remoteIndex.get(table)
    if (!index) {
      index = { ids: new Map(), nextOffset: 0, exhausted: false }
      this.remoteIndex.set(table, index)
    }

    for (;;) {
      const known = index.ids.get(recordId)
      if (known && known.length > 0) {
        for (const id of known) this.rememberRemoteMemoryId(table, recordId, id)
        return known[0] ?? null
      }
      if (index.exhausted) return null

      const page = await this.backend.getMemories(
        `meetings.${table}`,
        SyncManager.REMOTE_PAGE_SIZE,
        index.nextOffset
      )
      for (const memory of page) {
        const rid = memory.metadata?.record_id
        if (typeof rid !== 'string' || !memory.id) continue
        const list = index.ids.get(rid)
        if (list) {
          if (!list.includes(memory.id)) list.push(memory.id)
        } else {
          index.ids.set(rid, [memory.id])
        }
      }
      index.nextOffset += page.length
      if (
        page.length < SyncManager.REMOTE_PAGE_SIZE ||
        index.nextOffset >= SyncManager.REMOTE_PAGE_SIZE * SyncManager.REMOTE_MAX_PAGES
      ) {
        index.exhausted = true
      }
    }
  }

  /** Drop a remote id (pass-local index and local map) after deleting it upstream. */
  private forgetRemoteMemoryId(table: string, recordId: string, remoteId: string): void {
    try {
      getDatabase()
        .prepare(
          'DELETE FROM sync_remote_ids WHERE table_name = ? AND record_id = ? AND remote_id = ?'
        )
        .run(table, recordId, remoteId)
    } catch (err) {
      this.log.debug('Could not forget remote id:', err)
    }
    const list = this.remoteIndex.get(table)?.ids.get(recordId)
    if (!list) return
    const at = list.indexOf(remoteId)
    if (at >= 0) list.splice(at, 1)
  }

  /** Remote memory ids recorded for a local record (several when it was chunked). */
  private localRemoteIds(table: string, recordId: string): string[] {
    try {
      const rows = getDatabase()
        .prepare('SELECT remote_id FROM sync_remote_ids WHERE table_name = ? AND record_id = ?')
        .all(table, recordId) as Array<{ remote_id: string }>
      return rows.map(row => row.remote_id)
    } catch (err) {
      this.log.debug('Remote id lookup skipped:', err)
      return []
    }
  }

  /**
   * Record which cloud memory holds a local record, so later updates and
   * deletes address it directly instead of paging through the whole namespace
   * (which stopped finding anything past the first 10,000 memories).
   */
  private rememberRemoteMemoryId(table: string, recordId: string, remoteId?: string): void {
    if (!remoteId) return
    try {
      getDatabase()
        .prepare(
          'INSERT OR IGNORE INTO sync_remote_ids (table_name, record_id, remote_id) VALUES (?, ?, ?)'
        )
        .run(table, recordId, remoteId)
    } catch (err) {
      this.log.debug('Could not record remote id:', err)
    }
  }

  /** Delete every cloud copy of a record. Returns how many were removed. */
  private async deleteRemoteCopies(table: string, recordId: string): Promise<number> {
    let deleted = 0
    for (;;) {
      const remoteId = await this.findRemoteMemoryId(table, recordId)
      if (!remoteId) return deleted
      try {
        await this.backend.deleteMemory(remoteId)
        deleted++
      } catch (deleteErr) {
        // Already gone upstream — exactly the state we want.
        if (statusOf(deleteErr) !== 404) throw deleteErr
      }
      this.forgetRemoteMemoryId(table, recordId, remoteId)
    }
  }

  /** Ask AuthService for a fresh access token; it updates the shared backend. */
  private async refreshAccessToken(): Promise<void> {
    try {
      const { getAuthService } = await import('./AuthService')
      const tokens = await getAuthService().refreshToken()
      if (tokens && this.userId) {
        this.backend.setAccessToken(tokens.accessToken, this.userId)
        this.log.info('401 received — refreshed token, will retry on next sync')
      } else {
        this.log.warn('401 received — token refresh did not succeed')
      }
    } catch (refreshErr) {
      this.log.warn('Token refresh on 401 failed:', refreshErr)
    }
  }

  private async isOnline(): Promise<boolean> {
    try {
      const { net } = await import('electron')
      return net.isOnline()
    } catch {
      return true // not running under Electron (tests)
    }
  }

  /**
   * Chunk content if it exceeds plan limits
   * Task 30.11: Implement content size limits and chunking (GAP-N15)
   *
   * Uses plan-based size limits to automatically chunk large transcripts.
   * TranscriptChunker service provides the chunking logic.
   *
   * @param payload - Event payload
   * @returns Array of chunked payloads
   */
  private chunkContentIfNeeded(payload: Record<string, unknown>): Record<string, unknown>[] {
    // Get user's plan tier
    const planTier = this.getUserPlanTier()
    const sizeLimit = getContentSizeLimit(planTier)

    const chunks = chunkSyncPayload(payload, sizeLimit)
    if (chunks.length > 1) {
      this.log.info(
        `Content exceeds the ${planTier} plan limit of ${sizeLimit} characters — split into ${chunks.length} chunks`
      )
    }
    return chunks
  }

  /**
   * Get user's plan tier from keychain via KeyStorageService
   *
   * @returns Plan tier
   */
  private getUserPlanTier(): BlueArkiveTier {
    if (!this.userId) {
      return 'free'
    }

    try {
      // Synchronous check — KeyStorageService is async so we cache the tier
      // during login and use the cached value here
      if (this.cachedPlanTier) {
        return this.cachedPlanTier as BlueArkiveTier
      }
      return 'free'
    } catch (err) {
      this.log.debug('getPlanTier fallback to free', err)
      return 'free'
    }
  }
}
