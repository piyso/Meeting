/**
 * Conflict Resolver Service
 *
 * Combines Vector Clocks and Yjs CRDT for comprehensive conflict resolution.
 *
 * Strategy:
 * 1. Use Vector Clocks to detect conflicts
 * 2. Use Yjs CRDT for automatic note merging
 * 3. Only show UI for semantic conflicts (rare)
 *
 * Workflow:
 * - Device A edits note offline → increment vector clock
 * - Device B edits same note offline → increment vector clock
 * - Both come online → sync
 * - Vector clocks detect concurrent edits
 * - Yjs automatically merges changes
 * - If semantic conflict detected → show UI
 */

import { VectorClockManager, VectorClock, ClockComparison } from './VectorClockManager'
import { YjsConflictResolver } from './YjsConflictResolver'
import { getDatabaseService } from './DatabaseService'

export interface ConflictInfo {
  noteId: string
  localVersion: string
  remoteVersion: string
  localClock: VectorClock
  remoteClock: VectorClock
  comparison: ClockComparison
  autoResolved: boolean
  mergedVersion?: string
}

export interface ConflictResolution {
  noteId: string
  resolvedVersion: string
  resolvedClock: VectorClock
  strategy: 'keep_local' | 'keep_remote' | 'merge' | 'auto_merge'
}

export class ConflictResolver {
  private vectorClockManager: VectorClockManager
  private yjsResolver: YjsConflictResolver
  private deviceId: string

  constructor(deviceId: string) {
    this.vectorClockManager = new VectorClockManager()
    this.yjsResolver = new YjsConflictResolver()
    this.deviceId = deviceId
  }

  /**
   * Detect conflict between local and remote versions
   *
   * @param noteId - Note ID
   * @param localClock - Local vector clock
   * @param remoteClock - Remote vector clock
   * @returns Conflict info or null if no conflict
   */
  public async detectConflict(
    noteId: string,
    localClock: VectorClock,
    remoteClock: VectorClock
  ): Promise<ConflictInfo | null> {
    const comparison = this.vectorClockManager.compare(localClock, remoteClock)

    // No conflict if one version dominates
    if (comparison !== 'concurrent') {
      return null
    }

    // Conflict detected - get versions
    const db = getDatabaseService().getDb()
    const localNote = db.prepare('SELECT content FROM notes WHERE id = ?').get(noteId) as
      | { content: string }
      | undefined

    if (!localNote) {
      return null
    }

    return {
      noteId,
      localVersion: localNote.content,
      remoteVersion: '', // Will be filled by caller
      localClock,
      remoteClock,
      comparison,
      autoResolved: false,
    }
  }

  /**
   * Automatically resolve conflict using Yjs CRDT
   *
   * @param conflict - Conflict info
   * @param remoteUpdate - Remote Yjs update
   * @returns Resolved conflict or null if manual resolution needed
   */
  public async autoResolve(
    conflict: ConflictInfo,
    remoteUpdate: Uint8Array
  ): Promise<ConflictResolution | null> {
    try {
      // Get or create Yjs document
      let doc = this.yjsResolver.getDocument(conflict.noteId)
      if (!doc) {
        doc = this.yjsResolver.createDocument(conflict.noteId, conflict.localVersion)
      }

      // Apply remote update (Yjs handles merging)
      const success = this.yjsResolver.applyUpdate(conflict.noteId, remoteUpdate)
      if (!success) {
        return null
      }

      // Get merged version
      const mergedVersion = this.yjsResolver.getState(conflict.noteId)

      // Merge vector clocks
      const mergedClock = this.vectorClockManager.merge(conflict.localClock, conflict.remoteClock)

      // Increment local clock for merge operation
      const resolvedClock = this.vectorClockManager.increment(mergedClock, this.deviceId)

      return {
        noteId: conflict.noteId,
        resolvedVersion: mergedVersion,
        resolvedClock,
        strategy: 'auto_merge',
      }
    } catch (error) {
      console.error('[ConflictResolver] Auto-resolve failed:', error)
      return null
    }
  }

  /**
   * Manually resolve conflict (user chooses version)
   *
   * @param conflict - Conflict info
   * @param strategy - Resolution strategy
   * @param customVersion - Custom merged version (if strategy is 'merge')
   * @returns Resolved conflict
   */
  public async manualResolve(
    conflict: ConflictInfo,
    strategy: 'keep_local' | 'keep_remote' | 'merge',
    customVersion?: string
  ): Promise<ConflictResolution> {
    let resolvedVersion: string

    switch (strategy) {
      case 'keep_local':
        resolvedVersion = conflict.localVersion
        break
      case 'keep_remote':
        resolvedVersion = conflict.remoteVersion
        break
      case 'merge':
        if (!customVersion) {
          throw new Error('Custom version required for merge strategy')
        }
        resolvedVersion = customVersion
        break
    }

    // Merge vector clocks
    const mergedClock = this.vectorClockManager.merge(conflict.localClock, conflict.remoteClock)

    // Increment local clock for resolution operation
    const resolvedClock = this.vectorClockManager.increment(mergedClock, this.deviceId)

    return {
      noteId: conflict.noteId,
      resolvedVersion,
      resolvedClock,
      strategy,
    }
  }

  /**
   * Apply resolved conflict to database
   *
   * @param resolution - Conflict resolution
   * @returns True if applied successfully
   */
  public async applyResolution(resolution: ConflictResolution): Promise<boolean> {
    try {
      const db = getDatabaseService().getDb()

      // Update note content
      db.prepare('UPDATE notes SET content = ?, updated_at = ? WHERE id = ?').run(
        resolution.resolvedVersion,
        new Date().toISOString(),
        resolution.noteId
      )

      // Update vector clock in metadata
      const clockJson = this.vectorClockManager.serialize(resolution.resolvedClock)
      db.prepare('UPDATE notes SET vector_clock = ? WHERE id = ?').run(clockJson, resolution.noteId)

      console.log(`[ConflictResolver] Applied resolution for note ${resolution.noteId}`)

      return true
    } catch (error) {
      console.error('[ConflictResolver] Failed to apply resolution:', error)
      return false
    }
  }

  /**
   * Sync note with remote version
   * Detects and resolves conflicts automatically
   *
   * @param noteId - Note ID
   * @param remoteVersion - Remote note content
   * @param remoteClock - Remote vector clock
   * @param remoteUpdate - Remote Yjs update (optional)
   * @returns Conflict info if manual resolution needed, null otherwise
   */
  public async syncNote(
    noteId: string,
    remoteVersion: string,
    remoteClock: VectorClock,
    remoteUpdate?: Uint8Array
  ): Promise<ConflictInfo | null> {
    // Get local version
    const db = getDatabaseService().getDb()
    const localNote = db
      .prepare('SELECT content, vector_clock FROM notes WHERE id = ?')
      .get(noteId) as { content: string; vector_clock: string } | undefined

    if (!localNote) {
      // Note doesn't exist locally - create it
      const clockJson = this.vectorClockManager.serialize(remoteClock)
      db.prepare(
        'INSERT INTO notes (id, content, vector_clock, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).run(noteId, remoteVersion, clockJson, new Date().toISOString(), new Date().toISOString())
      return null
    }

    // Parse local clock
    const localClock = this.vectorClockManager.deserialize(localNote.vector_clock || '{}')

    // Compare clocks
    const comparison = this.vectorClockManager.compare(localClock, remoteClock)

    if (comparison === 'remote_newer') {
      // Remote is newer - update local
      const clockJson = this.vectorClockManager.serialize(remoteClock)
      db.prepare('UPDATE notes SET content = ?, vector_clock = ?, updated_at = ? WHERE id = ?').run(
        remoteVersion,
        clockJson,
        new Date().toISOString(),
        noteId
      )
      return null
    } else if (comparison === 'local_newer') {
      // Local is newer - no update needed
      return null
    } else {
      // Concurrent edits - conflict detected
      const conflict: ConflictInfo = {
        noteId,
        localVersion: localNote.content,
        remoteVersion,
        localClock,
        remoteClock,
        comparison,
        autoResolved: false,
      }

      // Try auto-resolve with Yjs if update provided
      if (remoteUpdate) {
        const resolution = await this.autoResolve(conflict, remoteUpdate)
        if (resolution) {
          await this.applyResolution(resolution)
          conflict.autoResolved = true
          conflict.mergedVersion = resolution.resolvedVersion
          return null // Conflict resolved automatically
        }
      }

      // Manual resolution needed
      return conflict
    }
  }

  /**
   * Get vector clock for note
   *
   * @param noteId - Note ID
   * @returns Vector clock or null if not found
   */
  public async getNoteClock(noteId: string): Promise<VectorClock | null> {
    const db = getDatabaseService().getDb()
    const note = db.prepare('SELECT vector_clock FROM notes WHERE id = ?').get(noteId) as
      | { vector_clock: string }
      | undefined

    if (!note || !note.vector_clock) {
      return null
    }

    return this.vectorClockManager.deserialize(note.vector_clock)
  }

  /**
   * Initialize vector clock for new note
   *
   * @param noteId - Note ID
   * @returns Initial vector clock
   */
  public initializeNoteClock(_noteId: string): VectorClock {
    return this.vectorClockManager.initializeForDevice(this.deviceId)
  }

  /**
   * Increment vector clock for note edit
   *
   * @param noteId - Note ID
   * @returns Updated vector clock
   */
  public async incrementNoteClock(noteId: string): Promise<VectorClock> {
    const currentClock = (await this.getNoteClock(noteId)) || this.initializeNoteClock(noteId)
    return this.vectorClockManager.increment(currentClock, this.deviceId)
  }

  /**
   * Get device ID
   *
   * @returns Device ID
   */
  public getDeviceId(): string {
    return this.deviceId
  }

  /**
   * Set device ID
   *
   * @param deviceId - New device ID
   */
  public setDeviceId(deviceId: string): void {
    this.deviceId = deviceId
  }

  /**
   * Get conflict resolver statistics
   *
   * @returns Statistics
   */
  public getStats(): {
    deviceId: string
    activeDocuments: number
    activeNoteIds: string[]
  } {
    return {
      deviceId: this.deviceId,
      activeDocuments: this.yjsResolver.getDocumentCount(),
      activeNoteIds: this.yjsResolver.getActiveNoteIds(),
    }
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    this.yjsResolver.clearAll()
  }
}

// Singleton instance
let instance: ConflictResolver | null = null

export function getConflictResolver(deviceId?: string): ConflictResolver {
  if (!instance) {
    if (!deviceId) {
      throw new Error('Device ID required for first initialization')
    }
    instance = new ConflictResolver(deviceId)
  }
  return instance
}
