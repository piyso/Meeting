/**
 * Yjs CRDT Conflict Resolver
 *
 * Uses Yjs (CRDT library) for automatic conflict-free merging of notes.
 * Yjs provides Last-Write-Wins (LWW) semantics with operation-based CRDTs.
 *
 * Key Features:
 * - Automatic conflict resolution (no manual intervention needed)
 * - Preserves all edit operations
 * - Supports undo/redo
 * - Efficient state synchronization
 *
 * Integration:
 * - Tiptap editor (Phase 4) uses Yjs for collaborative editing
 * - SyncManager syncs Yjs state vectors across devices
 * - Notes table stores Yjs document state
 *
 * CRITICAL: Install Yjs alongside Tiptap in Phase 4
 * npm install yjs y-protocols
 */

import * as Y from 'yjs'
import { Logger } from './Logger'
const log = Logger.create('YjsConflictResolver')

export interface YjsDocument {
  doc: Y.Doc
  text: Y.Text
  noteId: string
}

export interface YjsUpdate {
  update: Uint8Array
  noteId: string
  deviceId: string
  timestamp: number
}

export interface YjsState {
  stateVector: Uint8Array
  noteId: string
}

export class YjsConflictResolver {
  private documents: Map<string, Y.Doc> = new Map()

  /**
   * Create Yjs document for note
   *
   * @param noteId - Note ID
   * @param initialText - Initial text content
   * @returns Yjs document
   */
  public createDocument(noteId: string, initialText: string = ''): Y.Doc {
    // Check if document already exists
    if (this.documents.has(noteId)) {
      return this.documents.get(noteId)!
    }

    // Create new Yjs document
    const doc = new Y.Doc()
    const text = doc.getText('content')

    // Set initial text
    if (initialText) {
      text.insert(0, initialText)
    }

    // Store document
    this.documents.set(noteId, doc)

    log.info(`[YjsConflictResolver] Created document for note ${noteId}`)

    return doc
  }

  /**
   * Get existing Yjs document
   *
   * @param noteId - Note ID
   * @returns Yjs document or null if not found
   */
  public getDocument(noteId: string): Y.Doc | null {
    return this.documents.get(noteId) || null
  }

  /**
   * Apply update from remote device
   * Yjs automatically merges concurrent edits
   *
   * @param noteId - Note ID
   * @param update - Yjs update (Uint8Array)
   * @returns True if update was applied successfully
   */
  public applyUpdate(noteId: string, update: Uint8Array): boolean {
    try {
      let doc = this.documents.get(noteId)

      // Create document if it doesn't exist
      if (!doc) {
        doc = this.createDocument(noteId)
      }

      // Apply update (Yjs handles conflict resolution automatically)
      Y.applyUpdate(doc, update)

      log.info(`[YjsConflictResolver] Applied update to note ${noteId}`)

      return true
    } catch (error) {
      log.error(`[YjsConflictResolver] Failed to apply update to note ${noteId}:`, error)
      return false
    }
  }

  /**
   * Get current state of note as plain text
   *
   * @param noteId - Note ID
   * @returns Plain text content
   */
  public getState(noteId: string): string {
    const doc = this.documents.get(noteId)
    if (!doc) {
      return ''
    }

    const text = doc.getText('content')
    return text.toString()
  }

  /**
   * Get state vector for sync
   * State vector represents what this device has seen
   *
   * @param noteId - Note ID
   * @returns State vector (Uint8Array)
   */
  public getStateVector(noteId: string): Uint8Array {
    const doc = this.documents.get(noteId)
    if (!doc) {
      return new Uint8Array()
    }

    return Y.encodeStateVector(doc)
  }

  /**
   * Get diff between local state and remote state vector
   * Returns only the updates that remote device hasn't seen
   *
   * @param noteId - Note ID
   * @param remoteStateVector - Remote device's state vector
   * @returns Diff update (Uint8Array)
   */
  public getDiff(noteId: string, remoteStateVector: Uint8Array): Uint8Array {
    const doc = this.documents.get(noteId)
    if (!doc) {
      return new Uint8Array()
    }

    return Y.encodeStateAsUpdate(doc, remoteStateVector)
  }

  /**
   * Get full document state as update
   * Used for initial sync or full state transfer
   *
   * @param noteId - Note ID
   * @returns Full state update (Uint8Array)
   */
  public getFullState(noteId: string): Uint8Array {
    const doc = this.documents.get(noteId)
    if (!doc) {
      return new Uint8Array()
    }

    return Y.encodeStateAsUpdate(doc)
  }

  /**
   * Merge two Yjs documents
   * Applies all updates from source to target
   *
   * @param targetNoteId - Target note ID
   * @param sourceNoteId - Source note ID
   * @returns True if merge was successful
   */
  public mergeDocuments(targetNoteId: string, sourceNoteId: string): boolean {
    try {
      const targetDoc = this.documents.get(targetNoteId)
      const sourceDoc = this.documents.get(sourceNoteId)

      if (!targetDoc || !sourceDoc) {
        log.error('[YjsConflictResolver] Cannot merge: document not found')
        return false
      }

      // Get full state from source
      const sourceState = Y.encodeStateAsUpdate(sourceDoc)

      // Apply to target
      Y.applyUpdate(targetDoc, sourceState)

      log.info(`[YjsConflictResolver] Merged ${sourceNoteId} into ${targetNoteId}`)

      return true
    } catch (error) {
      log.error('[YjsConflictResolver] Merge failed:', error)
      return false
    }
  }

  /**
   * Delete document from memory
   *
   * @param noteId - Note ID
   * @returns True if document was deleted
   */
  public deleteDocument(noteId: string): boolean {
    const doc = this.documents.get(noteId)
    if (!doc) {
      return false
    }

    // Destroy document
    doc.destroy()

    // Remove from map
    this.documents.delete(noteId)

    log.info(`[YjsConflictResolver] Deleted document for note ${noteId}`)

    return true
  }

  /**
   * Get number of active documents
   *
   * @returns Number of documents in memory
   */
  public getDocumentCount(): number {
    return this.documents.size
  }

  /**
   * Get all note IDs with active documents
   *
   * @returns Array of note IDs
   */
  public getActiveNoteIds(): string[] {
    return Array.from(this.documents.keys())
  }

  /**
   * Clear all documents from memory
   */
  public clearAll(): void {
    for (const doc of this.documents.values()) {
      doc.destroy()
    }
    this.documents.clear()
    log.info('[YjsConflictResolver] Cleared all documents')
  }

  /**
   * Subscribe to document changes
   *
   * @param noteId - Note ID
   * @param callback - Callback function called on every change
   * @returns Unsubscribe function
   */
  public subscribeToChanges(
    noteId: string,
    callback: (update: Uint8Array, origin: unknown) => void
  ): (() => void) | null {
    const doc = this.documents.get(noteId)
    if (!doc) {
      return null
    }

    // Subscribe to updates
    doc.on('update', callback)

    // Return unsubscribe function
    return () => {
      doc.off('update', callback)
    }
  }

  /**
   * Get document statistics
   *
   * @param noteId - Note ID
   * @returns Document statistics
   */
  public getStats(noteId: string): {
    exists: boolean
    textLength: number
    updateCount: number
  } | null {
    const doc = this.documents.get(noteId)
    if (!doc) {
      return null
    }

    const text = doc.getText('content')

    return {
      exists: true,
      textLength: text.length,
      updateCount: doc.store.clients.size,
    }
  }

  /**
   * Export document to JSON (for debugging)
   *
   * @param noteId - Note ID
   * @returns JSON representation
   */
  public exportToJSON(noteId: string): Record<string, unknown> | null {
    const doc = this.documents.get(noteId)
    if (!doc) {
      return null
    }

    return doc.toJSON()
  }

  /**
   * Load document from JSON
   *
   * @param noteId - Note ID
   * @param json - JSON representation
   * @returns True if loaded successfully
   */
  public loadFromJSON(noteId: string, json: Record<string, unknown>): boolean {
    try {
      const doc = this.createDocument(noteId)
      const text = doc.getText('content')

      // Clear existing content
      text.delete(0, text.length)

      // Insert JSON content
      if (typeof json.content === 'string') {
        text.insert(0, json.content)
      }

      return true
    } catch (error) {
      log.error('[YjsConflictResolver] Failed to load from JSON:', error)
      return false
    }
  }
}

// Singleton instance
let instance: YjsConflictResolver | null = null

export function getYjsConflictResolver(): YjsConflictResolver {
  if (!instance) {
    instance = new YjsConflictResolver()
  }
  return instance
}
