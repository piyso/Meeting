/**
 * Sync Manager Tests
 *
 * Tests for all 12 subtasks of Task 30
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { SyncManager } from '../SyncManager'
import { PiyAPIBackend } from '../backend/PiyAPIBackend'
import {
  getPendingSyncItems,
  clearSyncQueue,
} from '../../database/crud/sync-queue'
import { getDatabase, initializeDatabase, closeDatabase } from '../../database/connection'
import { v4 as uuidv4 } from 'uuid'

// Mock backend for testing
class MockPiyAPIBackend extends PiyAPIBackend {
  public createMemoryCalls: any[] = []
  public getMemoriesCalls: any[] = []
  public shouldFail: boolean = false
  public mockMemories: any[] = []

  async createMemory(memory: any): Promise<any> {
    this.createMemoryCalls.push(memory)
    if (this.shouldFail) {
      throw new Error('Network error')
    }
    return {
      id: uuidv4(),
      ...memory,
    }
  }

  async getMemories(): Promise<any[]> {
    this.getMemoriesCalls.push(arguments)
    return this.mockMemories
  }

  reset() {
    this.createMemoryCalls = []
    this.getMemoriesCalls = []
    this.shouldFail = false
    this.mockMemories = []
  }
}

describe('SyncManager', () => {
  let syncManager: SyncManager
  let mockBackend: MockPiyAPIBackend
  const testUserId = 'test-user-123'
  const testPassword = 'test-password-123'

  before(async () => {
    // Initialize in-memory database for testing
    initializeDatabase(':memory:' as any)
  })

  after(() => {
    closeDatabase()
  })

  describe('Task 30.1: Event-sourced sync queue', () => {
    it('should implement event-sourced sync queue', async () => {
      clearSyncQueue()
      mockBackend = new MockPiyAPIBackend()
      syncManager = new SyncManager(mockBackend)
      await syncManager.initialize(testUserId, testPassword)

      // Queue an event
      syncManager.queueEvent('create', 'meetings', 'meeting-123', {
        title: 'Test Meeting',
        start_time: Date.now(),
      })

      // Verify event is in queue
      const stats = syncManager.getSyncStats()
      assert.strictEqual(stats.total, 1)
      assert.strictEqual(stats.pending, 1)
    })

    it('should persist events in SQLite', async () => {
      clearSyncQueue()
      mockBackend = new MockPiyAPIBackend()
      syncManager = new SyncManager(mockBackend)
      await syncManager.initialize(testUserId, testPassword)

      // Queue multiple events
      syncManager.queueEvent('create', 'meetings', 'meeting-1', { title: 'Meeting 1' })
      syncManager.queueEvent('update', 'notes', 'note-1', { text: 'Updated note' })
      syncManager.queueEvent('delete', 'transcripts', 'transcript-1', { id: 'transcript-1' })

      // Verify all events are persisted
      const pendingEvents = getPendingSyncItems(10)
      assert.strictEqual(pendingEvents.length, 3)
      assert.strictEqual(pendingEvents[0]!.table_name, 'meetings')
      assert.strictEqual(pendingEvents[1]!.table_name, 'notes')
      assert.strictEqual(pendingEvents[2]!.table_name, 'transcripts')
    })
  })

  describe('Task 30.2: Queue events on create/update/delete', () => {
    it('should queue create, update, and delete events', async () => {
      clearSyncQueue()
      mockBackend = new MockPiyAPIBackend()
      syncManager = new SyncManager(mockBackend)
      await syncManager.initialize(testUserId, testPassword)

      syncManager.queueEvent('create', 'meetings', 'meeting-123', { title: 'New Meeting' })
      syncManager.queueEvent('update', 'notes', 'note-123', { text: 'Updated text' })
      syncManager.queueEvent('delete', 'transcripts', 'transcript-123', { id: 'transcript-123' })

      const events = getPendingSyncItems(10)
      assert.strictEqual(events[0]!.operation_type, 'create')
      assert.strictEqual(events[1]!.operation_type, 'update')
      assert.strictEqual(events[2]!.operation_type, 'delete')
    })
  })

  describe('Task 30.3: Batch up to 50 events per sync', () => {
    it('should batch up to 50 events', async () => {
      clearSyncQueue()
      mockBackend = new MockPiyAPIBackend()
      syncManager = new SyncManager(mockBackend)
      await syncManager.initialize(testUserId, testPassword)

      // Queue 60 events
      for (let i = 0; i < 60; i++) {
        syncManager.queueEvent('create', 'meetings', `meeting-${i}`, { title: `Meeting ${i}` })
      }

      // Sync should process max 50 events
      const result = await syncManager.syncPendingEvents()
      assert.ok(result.syncedCount <= 50)

      // Remaining events should still be in queue
      const stats = syncManager.getSyncStats()
      assert.ok(stats.pending > 0)
    })
  })

  describe('Task 30.4: Encrypt events before upload', () => {
    it('should encrypt payload before upload', async () => {
      clearSyncQueue()
      mockBackend = new MockPiyAPIBackend()
      syncManager = new SyncManager(mockBackend)
      await syncManager.initialize(testUserId, testPassword)

      const payload = { title: 'Secret Meeting', content: 'Confidential data' }
      syncManager.queueEvent('create', 'meetings', 'meeting-123', payload)

      await syncManager.syncPendingEvents()

      // Verify createMemory was called with encrypted content
      assert.strictEqual(mockBackend.createMemoryCalls.length, 1)
      const call = mockBackend.createMemoryCalls[0]

      // Content should be encrypted (not plain text)
      assert.ok(!call.content.includes('Secret Meeting'))
      assert.ok(!call.content.includes('Confidential data'))

      // Metadata should contain encryption parameters
      assert.ok(call.metadata.iv)
      assert.ok(call.metadata.salt)
      assert.ok(call.metadata.authTag)
      assert.strictEqual(call.metadata.algorithm, 'aes-256-gcm')
    })
  })

  describe('Task 30.5: POST to /api/v1/memories', () => {
    it('should POST to /api/v1/memories via backend', async () => {
      clearSyncQueue()
      mockBackend = new MockPiyAPIBackend()
      syncManager = new SyncManager(mockBackend)
      await syncManager.initialize(testUserId, testPassword)

      syncManager.queueEvent('create', 'meetings', 'meeting-123', { title: 'Test Meeting' })

      await syncManager.syncPendingEvents()

      assert.strictEqual(mockBackend.createMemoryCalls.length, 1)
    })

    it('should include correct namespace and tags', async () => {
      clearSyncQueue()
      mockBackend = new MockPiyAPIBackend()
      syncManager = new SyncManager(mockBackend)
      await syncManager.initialize(testUserId, testPassword)

      syncManager.queueEvent('update', 'notes', 'note-123', { text: 'Updated note' })

      await syncManager.syncPendingEvents()

      const call = mockBackend.createMemoryCalls[0]
      assert.strictEqual(call.namespace, 'notes.update')
      assert.ok(call.tags.includes('notes'))
      assert.ok(call.tags.includes('update'))
    })
  })

  describe('Task 30.6: Mark synced_at on success', () => {
    it('should mark synced_at on successful sync', async () => {
      clearSyncQueue()
      mockBackend = new MockPiyAPIBackend()
      syncManager = new SyncManager(mockBackend)
      await syncManager.initialize(testUserId, testPassword)

      const db = getDatabase()

      // Create a meeting
      const meetingId = uuidv4()
      db.prepare(
        `
        INSERT INTO meetings (id, title, start_time, namespace)
        VALUES (?, ?, ?, ?)
      `
      ).run(meetingId, 'Test Meeting', Date.now(), 'default')

      // Queue sync event
      syncManager.queueEvent('create', 'meetings', meetingId, { title: 'Test Meeting' })

      // Sync
      await syncManager.syncPendingEvents()

      // Verify synced_at is set
      const meeting = db.prepare('SELECT synced_at FROM meetings WHERE id = ?').get(meetingId) as {
        synced_at: number
      }

      assert.ok(meeting.synced_at > 0)
    })
  })

  describe('Task 30.7: Exponential backoff with infinite retries', () => {
    it('should implement exponential backoff on failure', async () => {
      clearSyncQueue()
      mockBackend = new MockPiyAPIBackend()
      mockBackend.shouldFail = true
      syncManager = new SyncManager(mockBackend)
      await syncManager.initialize(testUserId, testPassword)

      syncManager.queueEvent('create', 'meetings', 'meeting-123', { title: 'Test Meeting' })

      // First attempt
      await syncManager.syncPendingEvents()

      // Verify retry count increased
      const events = getPendingSyncItems(10)
      assert.strictEqual(events[0]!.retry_count, 1)

      // Second attempt
      await syncManager.syncPendingEvents()
      const events2 = getPendingSyncItems(10)
      assert.strictEqual(events2[0]!.retry_count, 2)
    })
  })

  describe('Task 30.8: Queue persists across app restarts', () => {
    it('should persist queue in SQLite', async () => {
      clearSyncQueue()
      mockBackend = new MockPiyAPIBackend()
      syncManager = new SyncManager(mockBackend)
      await syncManager.initialize(testUserId, testPassword)

      // Queue events
      syncManager.queueEvent('create', 'meetings', 'meeting-1', { title: 'Meeting 1' })
      syncManager.queueEvent('create', 'meetings', 'meeting-2', { title: 'Meeting 2' })

      // Simulate app restart by creating new sync manager
      const newSyncManager = new SyncManager(mockBackend)

      // Verify events are still in queue
      const stats = newSyncManager.getSyncStats()
      assert.strictEqual(stats.total, 2)
      assert.strictEqual(stats.pending, 2)
    })
  })

  describe('Task 30.9: Test sync recovery after 24-hour offline period', () => {
    it('should sync events after long offline period', async () => {
      clearSyncQueue()
      mockBackend = new MockPiyAPIBackend()
      syncManager = new SyncManager(mockBackend)
      await syncManager.initialize(testUserId, testPassword)

      // Queue events with old timestamps
      const oldTimestamp = Math.floor(Date.now() / 1000) - 86400 // 24 hours ago

      const db = getDatabase()
      const eventId = uuidv4()

      db.prepare(
        `
        INSERT INTO sync_queue (id, operation_type, table_name, record_id, payload, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        eventId,
        'create',
        'meetings',
        'meeting-123',
        JSON.stringify({ title: 'Old Meeting' }),
        oldTimestamp
      )

      // Sync should process old events
      await syncManager.syncPendingEvents()

      assert.ok(mockBackend.createMemoryCalls.length > 0)

      // Event should be removed from queue
      const stats = syncManager.getSyncStats()
      assert.strictEqual(stats.pending, 0)
    })
  })

  describe('Task 30.10: ALLOWED_TABLES whitelist', () => {
    it('should allow whitelisted tables', async () => {
      clearSyncQueue()
      mockBackend = new MockPiyAPIBackend()
      syncManager = new SyncManager(mockBackend)
      await syncManager.initialize(testUserId, testPassword)

      assert.doesNotThrow(() => {
        syncManager.queueEvent('create', 'meetings', 'id-1', {})
      })

      assert.doesNotThrow(() => {
        syncManager.queueEvent('create', 'transcripts', 'id-2', {})
      })

      assert.doesNotThrow(() => {
        syncManager.queueEvent('create', 'notes', 'id-3', {})
      })

      assert.doesNotThrow(() => {
        syncManager.queueEvent('create', 'entities', 'id-4', {})
      })
    })

    it('should reject non-whitelisted tables', async () => {
      clearSyncQueue()
      mockBackend = new MockPiyAPIBackend()
      syncManager = new SyncManager(mockBackend)
      await syncManager.initialize(testUserId, testPassword)

      assert.throws(() => {
        syncManager.queueEvent('create', 'users', 'id-1', {})
      }, /Invalid table name: users/)

      assert.throws(() => {
        syncManager.queueEvent('create', 'admin', 'id-2', {})
      }, /Invalid table name: admin/)

      assert.throws(() => {
        syncManager.queueEvent('create', 'DROP TABLE meetings', 'id-3', {})
      }, /Invalid table name/)
    })
  })

  describe('Task 30.11: Content size limits and chunking', () => {
    it('should not chunk content within limits', async () => {
      clearSyncQueue()
      mockBackend = new MockPiyAPIBackend()
      syncManager = new SyncManager(mockBackend)
      await syncManager.initialize(testUserId, testPassword)

      const smallContent = 'A'.repeat(4000) // 4K characters (within free tier limit)

      syncManager.queueEvent('create', 'transcripts', 'transcript-123', {
        text: smallContent,
      })

      await syncManager.syncPendingEvents()

      // Should create only 1 memory (no chunking)
      assert.strictEqual(mockBackend.createMemoryCalls.length, 1)
    })

    it('should chunk content exceeding limits', async () => {
      clearSyncQueue()
      mockBackend = new MockPiyAPIBackend()
      syncManager = new SyncManager(mockBackend)
      await syncManager.initialize(testUserId, testPassword)

      const largeContent = 'A'.repeat(12000) // 12K characters (exceeds free tier 5K limit)

      syncManager.queueEvent('create', 'transcripts', 'transcript-123', {
        text: largeContent,
      })

      await syncManager.syncPendingEvents()

      // Should create multiple memories (chunked)
      assert.strictEqual(mockBackend.createMemoryCalls.length, 3) // 12K / 5K = 3 chunks
    })
  })

  describe('Task 30.12: Embedding status polling', () => {
    it('should poll embedding status until ready', async () => {
      clearSyncQueue()
      mockBackend = new MockPiyAPIBackend()
      syncManager = new SyncManager(mockBackend)
      await syncManager.initialize(testUserId, testPassword)

      const memoryId = 'memory-123'

      // Mock getMemories to return memory with embedding status
      mockBackend.mockMemories = [
        {
          id: memoryId,
          content: 'test',
          namespace: 'meetings',
          metadata: { embedding_status: 'ready' },
        },
      ]

      const status = await syncManager.pollEmbeddingStatus(memoryId, 10, 100)

      assert.strictEqual(status, 'ready')
    })

    it('should timeout after max attempts', async () => {
      clearSyncQueue()
      mockBackend = new MockPiyAPIBackend()
      syncManager = new SyncManager(mockBackend)
      await syncManager.initialize(testUserId, testPassword)

      const memoryId = 'memory-123'

      // Mock getMemories to always return processing status
      mockBackend.mockMemories = [
        {
          id: memoryId,
          content: 'test',
          namespace: 'meetings',
          metadata: { embedding_status: 'processing' },
        },
      ]

      const status = await syncManager.pollEmbeddingStatus(memoryId, 3, 100)

      assert.strictEqual(status, 'pending')
    })
  })

  describe('Integration tests', () => {
    it('should handle complete sync workflow', async () => {
      clearSyncQueue()
      mockBackend = new MockPiyAPIBackend()
      syncManager = new SyncManager(mockBackend)
      await syncManager.initialize(testUserId, testPassword)

      const db = getDatabase()

      // Create a meeting
      const meetingId = uuidv4()
      db.prepare(
        `
        INSERT INTO meetings (id, title, start_time, namespace)
        VALUES (?, ?, ?, ?)
      `
      ).run(meetingId, 'Integration Test Meeting', Date.now(), 'default')

      // Queue sync event
      syncManager.queueEvent('create', 'meetings', meetingId, {
        title: 'Integration Test Meeting',
        start_time: Date.now(),
      })

      // Verify event is queued
      assert.strictEqual(syncManager.getSyncStats().pending, 1)

      // Sync
      const result = await syncManager.syncPendingEvents()

      // Verify sync succeeded
      assert.strictEqual(result.success, true)
      assert.strictEqual(result.syncedCount, 1)
      assert.strictEqual(result.failedCount, 0)

      // Verify event is removed from queue
      assert.strictEqual(syncManager.getSyncStats().pending, 0)

      // Verify meeting is marked as synced
      const meeting = db.prepare('SELECT synced_at FROM meetings WHERE id = ?').get(meetingId) as {
        synced_at: number
      }
      assert.ok(meeting.synced_at > 0)

      // Verify backend was called
      assert.ok(mockBackend.createMemoryCalls.length > 0)
    })
  })
})
