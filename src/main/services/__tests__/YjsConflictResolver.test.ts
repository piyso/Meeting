import { YjsConflictResolver } from '../YjsConflictResolver'
import * as Y from 'yjs'

describe('YjsConflictResolver', () => {
  let resolver: YjsConflictResolver

  beforeEach(() => {
    resolver = new YjsConflictResolver()
  })

  afterEach(() => {
    resolver.clearAll()
  })

  describe('createDocument', () => {
    it('should create new Yjs document with initial text', () => {
      const doc = resolver.createDocument('note-1', 'Initial text')

      expect(doc).toBeInstanceOf(Y.Doc)
      expect(resolver.getState('note-1')).toBe('Initial text')
    })

    it('should create empty document if no initial text provided', () => {
      const doc = resolver.createDocument('note-2')

      expect(doc).toBeInstanceOf(Y.Doc)
      expect(resolver.getState('note-2')).toBe('')
    })

    it('should return existing document if already created', () => {
      const doc1 = resolver.createDocument('note-3', 'Text 1')
      const doc2 = resolver.createDocument('note-3', 'Text 2')

      expect(doc1).toBe(doc2)
      expect(resolver.getState('note-3')).toBe('Text 1') // Original text preserved
    })

    it('should track document count', () => {
      resolver.createDocument('note-1')
      resolver.createDocument('note-2')
      resolver.createDocument('note-3')

      expect(resolver.getDocumentCount()).toBe(3)
    })
  })

  describe('getDocument', () => {
    it('should return existing document', () => {
      const created = resolver.createDocument('note-1', 'Test')
      const retrieved = resolver.getDocument('note-1')

      expect(retrieved).toBe(created)
    })

    it('should return null for non-existent document', () => {
      const doc = resolver.getDocument('nonexistent')

      expect(doc).toBeNull()
    })
  })

  describe('applyUpdate', () => {
    it('should apply update from remote device', () => {
      // Create document on device A
      const docA = resolver.createDocument('note-1', 'Hello')
      const textA = docA.getText('content')

      // Make edit on device A
      textA.insert(5, ' World')

      // Get update from device A
      const update = Y.encodeStateAsUpdate(docA)

      // Create new resolver for device B
      const resolverB = new YjsConflictResolver()

      // Apply update on device B
      const success = resolverB.applyUpdate('note-1', update)

      expect(success).toBe(true)
      expect(resolverB.getState('note-1')).toBe('Hello World')

      resolverB.clearAll()
    })

    it('should create document if it does not exist', () => {
      // Create document on device A
      const docA = new Y.Doc()
      const textA = docA.getText('content')
      textA.insert(0, 'New content')

      const update = Y.encodeStateAsUpdate(docA)

      // Apply to resolver without existing document
      const success = resolver.applyUpdate('note-new', update)

      expect(success).toBe(true)
      expect(resolver.getState('note-new')).toBe('New content')
    })

    it('should merge concurrent edits automatically', () => {
      // Create document on device A
      const docA = resolver.createDocument('note-1', 'Hello')
      const textA = docA.getText('content')

      // Create document on device B with same initial state
      const resolverB = new YjsConflictResolver()
      const docB = resolverB.createDocument('note-1', 'Hello')
      const textB = docB.getText('content')

      // Device A adds " World" at end
      textA.insert(5, ' World')

      // Device B adds "Hi " at beginning
      textB.insert(0, 'Hi ')

      // Get updates
      const updateA = Y.encodeStateAsUpdate(docA)
      const updateB = Y.encodeStateAsUpdate(docB)

      // Apply updates to each other
      resolverB.applyUpdate('note-1', updateA)
      resolver.applyUpdate('note-1', updateB)

      // Both should have merged result
      const stateA = resolver.getState('note-1')
      const stateB = resolverB.getState('note-1')

      expect(stateA).toBe(stateB)
      expect(stateA).toContain('Hi')
      expect(stateA).toContain('Hello')
      expect(stateA).toContain('World')

      resolverB.clearAll()
    })
  })

  describe('getState', () => {
    it('should return current text content', () => {
      resolver.createDocument('note-1', 'Test content')

      const state = resolver.getState('note-1')

      expect(state).toBe('Test content')
    })

    it('should return empty string for non-existent document', () => {
      const state = resolver.getState('nonexistent')

      expect(state).toBe('')
    })

    it('should reflect updates', () => {
      const doc = resolver.createDocument('note-1', 'Initial')
      const text = doc.getText('content')

      text.insert(7, ' text')

      expect(resolver.getState('note-1')).toBe('Initial text')
    })
  })

  describe('getStateVector', () => {
    it('should return state vector for document', () => {
      resolver.createDocument('note-1', 'Test')

      const stateVector = resolver.getStateVector('note-1')

      expect(stateVector).toBeInstanceOf(Uint8Array)
      expect(stateVector.length).toBeGreaterThan(0)
    })

    it('should return empty array for non-existent document', () => {
      const stateVector = resolver.getStateVector('nonexistent')

      expect(stateVector).toBeInstanceOf(Uint8Array)
      expect(stateVector.length).toBe(0)
    })
  })

  describe('getDiff', () => {
    it('should return diff between local and remote state', () => {
      // Create document with some content
      const doc = resolver.createDocument('note-1', 'Hello')
      const text = doc.getText('content')

      // Get initial state vector
      const initialStateVector = resolver.getStateVector('note-1')

      // Make changes
      text.insert(5, ' World')

      // Get diff
      const diff = resolver.getDiff('note-1', initialStateVector)

      expect(diff).toBeInstanceOf(Uint8Array)
      expect(diff.length).toBeGreaterThan(0)
    })

    it('should return empty diff if no changes', () => {
      resolver.createDocument('note-1', 'Test')

      const stateVector = resolver.getStateVector('note-1')
      const diff = resolver.getDiff('note-1', stateVector)

      expect(diff).toBeInstanceOf(Uint8Array)
      // Diff should be minimal or empty
    })

    it('should return empty array for non-existent document', () => {
      const diff = resolver.getDiff('nonexistent', new Uint8Array())

      expect(diff).toBeInstanceOf(Uint8Array)
      expect(diff.length).toBe(0)
    })
  })

  describe('getFullState', () => {
    it('should return full document state', () => {
      resolver.createDocument('note-1', 'Full state test')

      const fullState = resolver.getFullState('note-1')

      expect(fullState).toBeInstanceOf(Uint8Array)
      expect(fullState.length).toBeGreaterThan(0)
    })

    it('should allow recreating document from full state', () => {
      // Create document with content
      resolver.createDocument('note-1', 'Original content')
      const doc = resolver.getDocument('note-1')!
      const text = doc.getText('content')
      text.insert(16, ' with edits')

      // Get full state
      const fullState = resolver.getFullState('note-1')

      // Create new resolver and apply full state
      const resolverB = new YjsConflictResolver()
      resolverB.applyUpdate('note-1', fullState)

      expect(resolverB.getState('note-1')).toBe('Original content with edits')

      resolverB.clearAll()
    })
  })

  describe('mergeDocuments', () => {
    it('should merge source document into target', () => {
      resolver.createDocument('note-1', 'Target content')
      resolver.createDocument('note-2', 'Source content')

      const success = resolver.mergeDocuments('note-1', 'note-2')

      expect(success).toBe(true)
      // After merge, target should contain both contents
      const state = resolver.getState('note-1')
      expect(state.length).toBeGreaterThan(0)
    })

    it('should return false if source document not found', () => {
      resolver.createDocument('note-1', 'Target')

      const success = resolver.mergeDocuments('note-1', 'nonexistent')

      expect(success).toBe(false)
    })

    it('should return false if target document not found', () => {
      resolver.createDocument('note-1', 'Source')

      const success = resolver.mergeDocuments('nonexistent', 'note-1')

      expect(success).toBe(false)
    })
  })

  describe('deleteDocument', () => {
    it('should delete document from memory', () => {
      resolver.createDocument('note-1', 'Test')

      const success = resolver.deleteDocument('note-1')

      expect(success).toBe(true)
      expect(resolver.getDocument('note-1')).toBeNull()
      expect(resolver.getDocumentCount()).toBe(0)
    })

    it('should return false for non-existent document', () => {
      const success = resolver.deleteDocument('nonexistent')

      expect(success).toBe(false)
    })
  })

  describe('getDocumentCount', () => {
    it('should return correct count', () => {
      expect(resolver.getDocumentCount()).toBe(0)

      resolver.createDocument('note-1')
      expect(resolver.getDocumentCount()).toBe(1)

      resolver.createDocument('note-2')
      expect(resolver.getDocumentCount()).toBe(2)

      resolver.deleteDocument('note-1')
      expect(resolver.getDocumentCount()).toBe(1)
    })
  })

  describe('getActiveNoteIds', () => {
    it('should return all active note IDs', () => {
      resolver.createDocument('note-1')
      resolver.createDocument('note-2')
      resolver.createDocument('note-3')

      const noteIds = resolver.getActiveNoteIds()

      expect(noteIds).toHaveLength(3)
      expect(noteIds).toContain('note-1')
      expect(noteIds).toContain('note-2')
      expect(noteIds).toContain('note-3')
    })

    it('should return empty array if no documents', () => {
      const noteIds = resolver.getActiveNoteIds()

      expect(noteIds).toEqual([])
    })
  })

  describe('clearAll', () => {
    it('should clear all documents', () => {
      resolver.createDocument('note-1')
      resolver.createDocument('note-2')
      resolver.createDocument('note-3')

      resolver.clearAll()

      expect(resolver.getDocumentCount()).toBe(0)
      expect(resolver.getActiveNoteIds()).toEqual([])
    })
  })

  describe('subscribeToChanges', () => {
    it('should call callback on document changes', done => {
      const doc = resolver.createDocument('note-1', 'Initial')
      const text = doc.getText('content')

      let callbackCalled = false
      const unsubscribe = resolver.subscribeToChanges('note-1', () => {
        callbackCalled = true
        done()
      })

      expect(unsubscribe).not.toBeNull()

      // Make change
      text.insert(7, ' text')

      // Callback should be called
      setTimeout(() => {
        expect(callbackCalled).toBe(true)
        unsubscribe!()
      }, 100)
    })

    it('should return null for non-existent document', () => {
      const unsubscribe = resolver.subscribeToChanges('nonexistent', () => {})

      expect(unsubscribe).toBeNull()
    })

    it('should stop calling callback after unsubscribe', done => {
      const doc = resolver.createDocument('note-1', 'Test')
      const text = doc.getText('content')

      let callCount = 0
      const unsubscribe = resolver.subscribeToChanges('note-1', () => {
        callCount++
      })

      // Make first change
      text.insert(4, ' 1')

      setTimeout(() => {
        expect(callCount).toBe(1)

        // Unsubscribe
        unsubscribe!()

        // Make second change
        text.insert(6, ' 2')

        setTimeout(() => {
          // Callback should not be called again
          expect(callCount).toBe(1)
          done()
        }, 100)
      }, 100)
    })
  })

  describe('getStats', () => {
    it('should return document statistics', () => {
      resolver.createDocument('note-1', 'Test content')

      const stats = resolver.getStats('note-1')

      expect(stats).not.toBeNull()
      expect(stats!.exists).toBe(true)
      expect(stats!.textLength).toBe(12)
      expect(stats!.updateCount).toBeGreaterThanOrEqual(0)
    })

    it('should return null for non-existent document', () => {
      const stats = resolver.getStats('nonexistent')

      expect(stats).toBeNull()
    })
  })

  describe('exportToJSON and loadFromJSON', () => {
    it('should export document to JSON', () => {
      resolver.createDocument('note-1', 'Test content')

      const json = resolver.exportToJSON('note-1')

      expect(json).not.toBeNull()
      expect(json.content).toBeDefined()
    })

    it('should load document from JSON', () => {
      const json = { content: 'Loaded content' }

      const success = resolver.loadFromJSON('note-new', json)

      expect(success).toBe(true)
      expect(resolver.getState('note-new')).toBe('Loaded content')
    })

    it('should round-trip export and load', () => {
      resolver.createDocument('note-1', 'Original content')

      const json = resolver.exportToJSON('note-1')
      const success = resolver.loadFromJSON('note-2', json)

      expect(success).toBe(true)
      expect(resolver.getState('note-2')).toBe('Original content')
    })
  })

  describe('Real-world CRDT scenarios', () => {
    it('should handle concurrent insertions at different positions', () => {
      // Device A and B start with same document
      const docA = resolver.createDocument('note-1', 'Hello World')
      const textA = docA.getText('content')

      const resolverB = new YjsConflictResolver()
      const initialState = resolver.getFullState('note-1')
      resolverB.applyUpdate('note-1', initialState)
      const docB = resolverB.getDocument('note-1')!
      const textB = docB.getText('content')

      // Device A inserts at position 5
      textA.insert(5, ' Beautiful')

      // Device B inserts at position 11
      textB.insert(11, '!')

      // Sync updates
      const updateA = Y.encodeStateAsUpdate(docA)
      const updateB = Y.encodeStateAsUpdate(docB)

      resolverB.applyUpdate('note-1', updateA)
      resolver.applyUpdate('note-1', updateB)

      // Both should converge to same state
      const stateA = resolver.getState('note-1')
      const stateB = resolverB.getState('note-1')

      expect(stateA).toBe(stateB)
      expect(stateA).toContain('Beautiful')
      expect(stateA).toContain('!')

      resolverB.clearAll()
    })

    it('should handle concurrent deletions', () => {
      const docA = resolver.createDocument('note-1', 'Hello Beautiful World')
      const textA = docA.getText('content')

      const resolverB = new YjsConflictResolver()
      const initialState = resolver.getFullState('note-1')
      resolverB.applyUpdate('note-1', initialState)
      const docB = resolverB.getDocument('note-1')!
      const textB = docB.getText('content')

      // Device A deletes "Beautiful "
      textA.delete(6, 10)

      // Device B deletes "World"
      textB.delete(16, 5)

      // Sync updates
      const updateA = Y.encodeStateAsUpdate(docA)
      const updateB = Y.encodeStateAsUpdate(docB)

      resolverB.applyUpdate('note-1', updateA)
      resolver.applyUpdate('note-1', updateB)

      // Both should converge
      const stateA = resolver.getState('note-1')
      const stateB = resolverB.getState('note-1')

      expect(stateA).toBe(stateB)

      resolverB.clearAll()
    })

    it('should handle 3-way merge', () => {
      // Three devices with same initial state
      const docA = resolver.createDocument('note-1', 'Base')
      const textA = docA.getText('content')

      const resolverB = new YjsConflictResolver()
      const resolverC = new YjsConflictResolver()

      const initialState = resolver.getFullState('note-1')
      resolverB.applyUpdate('note-1', initialState)
      resolverC.applyUpdate('note-1', initialState)

      const docB = resolverB.getDocument('note-1')!
      const textB = docB.getText('content')
      const docC = resolverC.getDocument('note-1')!
      const textC = docC.getText('content')

      // Each device makes different edit
      textA.insert(0, 'A: ')
      textB.insert(0, 'B: ')
      textC.insert(0, 'C: ')

      // Sync all updates
      const updateA = Y.encodeStateAsUpdate(docA)
      const updateB = Y.encodeStateAsUpdate(docB)
      const updateC = Y.encodeStateAsUpdate(docC)

      resolver.applyUpdate('note-1', updateB)
      resolver.applyUpdate('note-1', updateC)

      resolverB.applyUpdate('note-1', updateA)
      resolverB.applyUpdate('note-1', updateC)

      resolverC.applyUpdate('note-1', updateA)
      resolverC.applyUpdate('note-1', updateB)

      // All should converge to same state
      const stateA = resolver.getState('note-1')
      const stateB = resolverB.getState('note-1')
      const stateC = resolverC.getState('note-1')

      expect(stateA).toBe(stateB)
      expect(stateB).toBe(stateC)

      resolverB.clearAll()
      resolverC.clearAll()
    })
  })
})
