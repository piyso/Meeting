import { ConflictResolver } from '../ConflictResolver'
import { VectorClock } from '../VectorClockManager'
import { getDatabase } from '../../database/connection'
import { v4 as uuidv4 } from 'uuid'
import * as Y from 'yjs'

describe('ConflictResolver', () => {
  let resolver: ConflictResolver
  let deviceId: string
  let testNoteId: string

  beforeEach(() => {
    deviceId = `device-${uuidv4()}`
    resolver = new ConflictResolver(deviceId)
    testNoteId = `note-${uuidv4()}`

    // Clean up test data
    const db = getDatabase()
    db.prepare('DELETE FROM notes WHERE id LIKE ?').run('note-%')
  })

  afterEach(() => {
    resolver.cleanup()

    // Clean up test data
    const db = getDatabase()
    db.prepare('DELETE FROM notes WHERE id LIKE ?').run('note-%')
  })

  describe('detectConflict', () => {
    it('should return null when remote is newer', async () => {
      const localClock: VectorClock = { 'device-a': 1, 'device-b': 2 }
      const remoteClock: VectorClock = { 'device-a': 2, 'device-b': 3 }

      // Create note in database
      const db = getDatabase()
      db.prepare(
        'INSERT INTO notes (id, content, vector_clock, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).run(
        testNoteId,
        'Local content',
        JSON.stringify(localClock),
        new Date().toISOString(),
        new Date().toISOString()
      )

      const conflict = await resolver.detectConflict(testNoteId, localClock, remoteClock)

      expect(conflict).toBeNull()
    })

    it('should return null when local is newer', async () => {
      const localClock: VectorClock = { 'device-a': 2, 'device-b': 3 }
      const remoteClock: VectorClock = { 'device-a': 1, 'device-b': 2 }

      const db = getDatabase()
      db.prepare(
        'INSERT INTO notes (id, content, vector_clock, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).run(
        testNoteId,
        'Local content',
        JSON.stringify(localClock),
        new Date().toISOString(),
        new Date().toISOString()
      )

      const conflict = await resolver.detectConflict(testNoteId, localClock, remoteClock)

      expect(conflict).toBeNull()
    })

    it('should detect concurrent edits', async () => {
      const localClock: VectorClock = { 'device-a': 2, 'device-b': 1 }
      const remoteClock: VectorClock = { 'device-a': 1, 'device-b': 2 }

      const db = getDatabase()
      db.prepare(
        'INSERT INTO notes (id, content, vector_clock, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).run(
        testNoteId,
        'Local content',
        JSON.stringify(localClock),
        new Date().toISOString(),
        new Date().toISOString()
      )

      const conflict = await resolver.detectConflict(testNoteId, localClock, remoteClock)

      expect(conflict).not.toBeNull()
      expect(conflict!.comparison).toBe('concurrent')
      expect(conflict!.localVersion).toBe('Local content')
      expect(conflict!.autoResolved).toBe(false)
    })
  })

  describe('autoResolve', () => {
    it('should automatically resolve conflict using Yjs', async () => {
      // Create conflict
      const localClock: VectorClock = { 'device-a': 2, 'device-b': 1 }
      const remoteClock: VectorClock = { 'device-a': 1, 'device-b': 2 }

      const db = getDatabase()
      db.prepare(
        'INSERT INTO notes (id, content, vector_clock, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).run(
        testNoteId,
        'Local content',
        JSON.stringify(localClock),
        new Date().toISOString(),
        new Date().toISOString()
      )

      const conflict = await resolver.detectConflict(testNoteId, localClock, remoteClock)
      expect(conflict).not.toBeNull()

      // Create remote Yjs update
      const remoteDoc = new Y.Doc()
      const remoteText = remoteDoc.getText('content')
      remoteText.insert(0, 'Remote content')
      const remoteUpdate = Y.encodeStateAsUpdate(remoteDoc)

      // Auto-resolve
      const resolution = await resolver.autoResolve(conflict!, remoteUpdate)

      expect(resolution).not.toBeNull()
      expect(resolution!.strategy).toBe('auto_merge')
      expect(resolution!.resolvedVersion).toBeDefined()
      expect(resolution!.resolvedClock).toBeDefined()
    })
  })

  describe('manualResolve', () => {
    it('should resolve conflict by keeping local version', async () => {
      const conflict = {
        noteId: testNoteId,
        localVersion: 'Local content',
        remoteVersion: 'Remote content',
        localClock: { 'device-a': 2 } as VectorClock,
        remoteClock: { 'device-b': 2 } as VectorClock,
        comparison: 'concurrent' as const,
        autoResolved: false,
      }

      const resolution = await resolver.manualResolve(conflict, 'keep_local')

      expect(resolution.resolvedVersion).toBe('Local content')
      expect(resolution.strategy).toBe('keep_local')
    })

    it('should resolve conflict by keeping remote version', async () => {
      const conflict = {
        noteId: testNoteId,
        localVersion: 'Local content',
        remoteVersion: 'Remote content',
        localClock: { 'device-a': 2 } as VectorClock,
        remoteClock: { 'device-b': 2 } as VectorClock,
        comparison: 'concurrent' as const,
        autoResolved: false,
      }

      const resolution = await resolver.manualResolve(conflict, 'keep_remote')

      expect(resolution.resolvedVersion).toBe('Remote content')
      expect(resolution.strategy).toBe('keep_remote')
    })

    it('should resolve conflict with custom merged version', async () => {
      const conflict = {
        noteId: testNoteId,
        localVersion: 'Local content',
        remoteVersion: 'Remote content',
        localClock: { 'device-a': 2 } as VectorClock,
        remoteClock: { 'device-b': 2 } as VectorClock,
        comparison: 'concurrent' as const,
        autoResolved: false,
      }

      const resolution = await resolver.manualResolve(conflict, 'merge', 'Merged content')

      expect(resolution.resolvedVersion).toBe('Merged content')
      expect(resolution.strategy).toBe('merge')
    })

    it('should throw error if merge strategy without custom version', async () => {
      const conflict = {
        noteId: testNoteId,
        localVersion: 'Local',
        remoteVersion: 'Remote',
        localClock: {} as VectorClock,
        remoteClock: {} as VectorClock,
        comparison: 'concurrent' as const,
        autoResolved: false,
      }

      await expect(resolver.manualResolve(conflict, 'merge')).rejects.toThrow()
    })
  })

  describe('applyResolution', () => {
    it('should apply resolution to database', async () => {
      // Create note
      const db = getDatabase()
      db.prepare(
        'INSERT INTO notes (id, content, vector_clock, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).run(testNoteId, 'Old content', '{}', new Date().toISOString(), new Date().toISOString())

      const resolution = {
        noteId: testNoteId,
        resolvedVersion: 'Resolved content',
        resolvedClock: { 'device-a': 3 } as VectorClock,
        strategy: 'keep_local' as const,
      }

      const success = await resolver.applyResolution(resolution)

      expect(success).toBe(true)

      // Verify database updated
      const note = db
        .prepare('SELECT content, vector_clock FROM notes WHERE id = ?')
        .get(testNoteId) as any
      expect(note.content).toBe('Resolved content')
      expect(JSON.parse(note.vector_clock)).toEqual({ 'device-a': 3 })
    })
  })

  describe('syncNote', () => {
    it('should create note if it does not exist locally', async () => {
      const remoteClock: VectorClock = { 'device-b': 1 }

      const conflict = await resolver.syncNote(testNoteId, 'Remote content', remoteClock)

      expect(conflict).toBeNull()

      // Verify note created
      const db = getDatabase()
      const note = db.prepare('SELECT content FROM notes WHERE id = ?').get(testNoteId) as any
      expect(note).toBeDefined()
      expect(note.content).toBe('Remote content')
    })

    it('should update local note when remote is newer', async () => {
      const localClock: VectorClock = { 'device-a': 1 }
      const remoteClock: VectorClock = { 'device-a': 2 }

      // Create local note
      const db = getDatabase()
      db.prepare(
        'INSERT INTO notes (id, content, vector_clock, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).run(
        testNoteId,
        'Local content',
        JSON.stringify(localClock),
        new Date().toISOString(),
        new Date().toISOString()
      )

      const conflict = await resolver.syncNote(testNoteId, 'Remote content', remoteClock)

      expect(conflict).toBeNull()

      // Verify note updated
      const note = db.prepare('SELECT content FROM notes WHERE id = ?').get(testNoteId) as any
      expect(note.content).toBe('Remote content')
    })

    it('should not update when local is newer', async () => {
      const localClock: VectorClock = { 'device-a': 2 }
      const remoteClock: VectorClock = { 'device-a': 1 }

      const db = getDatabase()
      db.prepare(
        'INSERT INTO notes (id, content, vector_clock, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).run(
        testNoteId,
        'Local content',
        JSON.stringify(localClock),
        new Date().toISOString(),
        new Date().toISOString()
      )

      const conflict = await resolver.syncNote(testNoteId, 'Remote content', remoteClock)

      expect(conflict).toBeNull()

      // Verify note not updated
      const note = db.prepare('SELECT content FROM notes WHERE id = ?').get(testNoteId) as any
      expect(note.content).toBe('Local content')
    })

    it('should detect and auto-resolve conflict with Yjs update', async () => {
      const localClock: VectorClock = { 'device-a': 2, 'device-b': 1 }
      const remoteClock: VectorClock = { 'device-a': 1, 'device-b': 2 }

      const db = getDatabase()
      db.prepare(
        'INSERT INTO notes (id, content, vector_clock, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).run(
        testNoteId,
        'Local content',
        JSON.stringify(localClock),
        new Date().toISOString(),
        new Date().toISOString()
      )

      // Create remote Yjs update
      const remoteDoc = new Y.Doc()
      const remoteText = remoteDoc.getText('content')
      remoteText.insert(0, 'Remote content')
      const remoteUpdate = Y.encodeStateAsUpdate(remoteDoc)

      const conflict = await resolver.syncNote(
        testNoteId,
        'Remote content',
        remoteClock,
        remoteUpdate
      )

      // Should be auto-resolved
      expect(conflict).toBeNull()

      // Verify note updated with merged content
      const note = db.prepare('SELECT content FROM notes WHERE id = ?').get(testNoteId) as any
      expect(note).toBeDefined()
    })
  })

  describe('getNoteClock and incrementNoteClock', () => {
    it('should get vector clock for note', async () => {
      const clock: VectorClock = { 'device-a': 5 }

      const db = getDatabase()
      db.prepare(
        'INSERT INTO notes (id, content, vector_clock, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).run(
        testNoteId,
        'Content',
        JSON.stringify(clock),
        new Date().toISOString(),
        new Date().toISOString()
      )

      const noteClock = await resolver.getNoteClock(testNoteId)

      expect(noteClock).toEqual(clock)
    })

    it('should return null for non-existent note', async () => {
      const noteClock = await resolver.getNoteClock('nonexistent')

      expect(noteClock).toBeNull()
    })

    it('should increment vector clock for note', async () => {
      const clock: VectorClock = { [deviceId]: 5 }

      const db = getDatabase()
      db.prepare(
        'INSERT INTO notes (id, content, vector_clock, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).run(
        testNoteId,
        'Content',
        JSON.stringify(clock),
        new Date().toISOString(),
        new Date().toISOString()
      )

      const incrementedClock = await resolver.incrementNoteClock(testNoteId)

      expect(incrementedClock[deviceId]).toBe(6)
    })
  })

  describe('initializeNoteClock', () => {
    it('should initialize clock for new note', () => {
      const clock = resolver.initializeNoteClock(testNoteId)

      expect(clock[deviceId]).toBe(0)
    })
  })

  describe('getDeviceId and setDeviceId', () => {
    it('should get device ID', () => {
      expect(resolver.getDeviceId()).toBe(deviceId)
    })

    it('should set device ID', () => {
      resolver.setDeviceId('new-device-id')

      expect(resolver.getDeviceId()).toBe('new-device-id')
    })
  })

  describe('getStats', () => {
    it('should return resolver statistics', () => {
      const stats = resolver.getStats()

      expect(stats.deviceId).toBe(deviceId)
      expect(stats.activeDocuments).toBe(0)
      expect(stats.activeNoteIds).toEqual([])
    })
  })

  describe('cleanup', () => {
    it('should cleanup resources', () => {
      // Create some documents
      resolver.initializeNoteClock('note-1')
      resolver.initializeNoteClock('note-2')

      resolver.cleanup()

      const stats = resolver.getStats()
      expect(stats.activeDocuments).toBe(0)
    })
  })

  describe('Real-world conflict scenarios', () => {
    it('should handle offline edit conflict', async () => {
      // Initial state
      const initialClock: VectorClock = { 'device-a': 1, 'device-b': 1 }

      const db = getDatabase()
      db.prepare(
        'INSERT INTO notes (id, content, vector_clock, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).run(
        testNoteId,
        'Initial content',
        JSON.stringify(initialClock),
        new Date().toISOString(),
        new Date().toISOString()
      )

      // Device A edits offline
      const deviceAClock: VectorClock = { 'device-a': 2, 'device-b': 1 }
      db.prepare('UPDATE notes SET content = ?, vector_clock = ? WHERE id = ?').run(
        'Device A edit',
        JSON.stringify(deviceAClock),
        testNoteId
      )

      // Device B edits offline (concurrent)
      const deviceBClock: VectorClock = { 'device-a': 1, 'device-b': 2 }

      // Sync: Device B's changes arrive
      const conflict = await resolver.syncNote(testNoteId, 'Device B edit', deviceBClock)

      // Conflict should be detected
      expect(conflict).not.toBeNull()
      expect(conflict!.comparison).toBe('concurrent')
    })
  })
})
