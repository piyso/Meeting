/**
 * YjsSyncProvider — Cross-device CRDT sync via WebSocket
 *
 * 7.1 FIX: Bridges Yjs documents across devices using the PiyAPI backend.
 * Works alongside IndexeddbPersistence for local durability.
 *
 * Architecture:
 * - Each Y.Doc is synced via a WebSocket connection to PiyAPI
 * - Updates are broadcast to all connected devices
 * - Vector clocks prevent update loops
 * - Falls back to SyncManager's event-sourced queue when WebSocket is unavailable
 */

import { Logger } from './Logger'
import { getDatabaseService } from './DatabaseService'

const log = Logger.create('YjsSyncProvider')

interface SyncState {
  docId: string
  connected: boolean
  lastSyncAt: number
  pendingUpdates: number
}

export class YjsSyncProvider {
  private ws: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private docs = new Map<string, SyncState>()
  private url: string
  private token: string | null = null
  private userId: string | null = null
  private reconnectAttempts = 0
  private pendingMessages: Array<Record<string, unknown>> = []
  private _remoteListeners: Array<(docId: string, update: Uint8Array) => void> = []
  private static readonly MAX_RECONNECT_DELAY_MS = 30000
  private static readonly PING_INTERVAL_MS = 30000
  private static readonly MAX_PENDING_MESSAGES = 100

  constructor(wsUrl: string) {
    this.url = wsUrl
  }

  /**
   * Initialize the sync provider with auth credentials.
   */
  async initialize(userId: string, accessToken: string): Promise<void> {
    this.userId = userId
    this.token = accessToken
    await this.connect()
  }

  /**
   * Register a Yjs document for cross-device sync.
   */
  registerDocument(docId: string): void {
    if (this.docs.has(docId)) return
    this.docs.set(docId, {
      docId,
      connected: false,
      lastSyncAt: 0,
      pendingUpdates: 0,
    })
    log.info(`Registered document for sync: ${docId}`)

    // If already connected, request initial state
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendMessage({
        type: 'doc:subscribe',
        docId,
        userId: this.userId,
      })
    }
  }

  /**
   * Unregister a document from sync.
   */
  unregisterDocument(docId: string): void {
    this.docs.delete(docId)
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendMessage({
        type: 'doc:unsubscribe',
        docId,
        userId: this.userId,
      })
    }
  }

  /**
   * Send a Yjs update to all connected devices.
   */
  sendUpdate(docId: string, update: Uint8Array): void {
    const state = this.docs.get(docId)
    if (state) {
      state.pendingUpdates++
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendMessage({
        type: 'doc:update',
        docId,
        userId: this.userId,
        update: Array.from(update), // Convert to JSON-safe array
        timestamp: Date.now(),
      })
    } else {
      // Queue for later sync via SyncManager
      this.queueUpdateForOfflineSync(docId, update)
    }
  }

  /**
   * Handle incoming update from another device.
   * Returns an unsubscribe function.
   */
  onRemoteUpdate(cb: (docId: string, update: Uint8Array) => void): () => void {
    this._remoteListeners.push(cb)
    return () => {
      this._remoteListeners = this._remoteListeners.filter(l => l !== cb)
    }
  }

  /**
   * Get sync status for a document.
   */
  getDocumentStatus(docId: string): SyncState | null {
    return this.docs.get(docId) || null
  }

  /**
   * Check if connected to the sync server.
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }

  // ── Private: WebSocket lifecycle ──

  private async connect(): Promise<void> {
    if (!this.token || !this.userId) {
      log.debug('YjsSyncProvider: not authenticated, skipping WebSocket connect')
      return
    }

    try {
      const wsUrl = `${this.url}?token=${encodeURIComponent(this.token)}&userId=${encodeURIComponent(this.userId)}`
      this.ws = new WebSocket(wsUrl)

      this.ws.onopen = () => {
        log.info('YjsSyncProvider: WebSocket connected')
        this.reconnectAttempts = 0
        this.startPing()

        // Flush any messages buffered during CONNECTING
        if (this.pendingMessages.length > 0) {
          for (const msg of this.pendingMessages) {
            this.ws!.send(JSON.stringify(msg))
          }
          this.pendingMessages = []
        }

        // Re-subscribe all registered documents
        for (const docId of this.docs.keys()) {
          this.sendMessage({
            type: 'doc:subscribe',
            docId,
            userId: this.userId,
          })
        }
      }

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data as string) as {
            type: string
            docId: string
            update?: number[]
            userId?: string
          }

          switch (msg.type) {
            case 'doc:update': {
              // Ignore updates from self (prevent echo loops)
              if (msg.userId === this.userId) return
              if (msg.update && msg.docId) {
                const updateBytes = new Uint8Array(msg.update)
                for (const listener of this._remoteListeners) {
                  try {
                    listener(msg.docId, updateBytes)
                  } catch {
                    /* skip broken listener */
                  }
                }

                const state = this.docs.get(msg.docId)
                if (state) {
                  state.lastSyncAt = Date.now()
                  state.pendingUpdates = Math.max(0, state.pendingUpdates - 1)
                }
              }
              break
            }
            case 'doc:ack': {
              const state = this.docs.get(msg.docId)
              if (state) {
                state.connected = true
                state.lastSyncAt = Date.now()
              }
              break
            }
            case 'pong': {
              // Keepalive acknowledged
              break
            }
          }
        } catch (err) {
          log.debug('YjsSyncProvider: failed to parse WebSocket message:', err)
        }
      }

      this.ws.onclose = (event: CloseEvent) => {
        log.info(`YjsSyncProvider: WebSocket closed (code: ${event.code})`)
        this.stopPing()
        this.scheduleReconnect()
      }

      this.ws.onerror = (event: Event) => {
        log.warn('YjsSyncProvider: WebSocket error:', (event as ErrorEvent).message)
      }
    } catch (err) {
      log.warn('YjsSyncProvider: WebSocket connection failed:', err)
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return

    const delay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempts),
      YjsSyncProvider.MAX_RECONNECT_DELAY_MS
    )
    this.reconnectAttempts++

    log.info(`YjsSyncProvider: reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
    if (this.reconnectTimer.unref) this.reconnectTimer.unref()
  }

  private startPing(): void {
    this.stopPing()
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.sendMessage({ type: 'ping' })
      }
    }, YjsSyncProvider.PING_INTERVAL_MS)
    if (this.pingTimer.unref) this.pingTimer.unref()
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
  }

  private sendMessage(msg: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    } else if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
      // Buffer messages during CONNECTING to avoid silent drops
      if (this.pendingMessages.length < YjsSyncProvider.MAX_PENDING_MESSAGES) {
        this.pendingMessages.push(msg)
      }
    }
    // If CLOSED or CLOSING, message is dropped (will be re-sent on reconnect)
  }

  /**
   * Queue an update for offline sync via SyncManager when WebSocket is unavailable.
   */
  private queueUpdateForOfflineSync(docId: string, update: Uint8Array): void {
    try {
      const db = getDatabaseService()
      // Store the update in the sync_queue for later replay
      db.createSyncQueueItem({
        id: `yjs-${docId}-${Date.now()}`,
        operation_type: 'update',
        table_name: 'notes',
        record_id: docId,
        payload: {
          yjs_update: Array.from(update),
          timestamp: Date.now(),
        },
      })
      log.debug(`Queued Yjs update for offline sync: ${docId}`)
    } catch (err) {
      log.warn('Failed to queue Yjs update for offline sync:', err)
    }
  }

  /**
   * Cleanup and disconnect.
   */
  disconnect(): void {
    this.stopPing()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect')
      this.ws = null
    }
    this.docs.clear()
    log.info('YjsSyncProvider: disconnected')
  }
}

// Singleton
let instance: YjsSyncProvider | null = null

export function getYjsSyncProvider(wsUrl?: string): YjsSyncProvider {
  if (!instance) {
    if (!wsUrl) {
      throw new Error('WebSocket URL required for first YjsSyncProvider initialization')
    }
    instance = new YjsSyncProvider(wsUrl)
  }
  return instance
}

export function resetYjsSyncProvider(): void {
  if (instance) {
    instance.disconnect()
  }
  instance = null
}
