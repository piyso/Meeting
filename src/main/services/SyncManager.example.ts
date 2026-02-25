/**
 * SyncManager Usage Examples
 *
 * This file demonstrates how to use the SyncManager service
 * for encrypted sync with PiyAPI backend.
 */

import { SyncManager } from './SyncManager'
import { PiyAPIBackend } from './backend/PiyAPIBackend'

/**
 * Example 1: Initialize and start auto-sync
 */
async function example1_InitializeAndStartAutoSync() {
  // Create backend instance
  const backend = new PiyAPIBackend('https://api.piyapi.com/v1')

  // Create sync manager
  const syncManager = new SyncManager(backend)

  // Initialize with user credentials
  await syncManager.initialize('user-123', 'user-password')

  // Start automatic sync (every 30 seconds)
  syncManager.startAutoSync()

  console.log('Auto-sync started')

  // Later, stop auto-sync
  // syncManager.stopAutoSync()
}

/**
 * Example 2: Queue sync events
 */
async function example2_QueueSyncEvents() {
  const syncManager = new SyncManager()
  await syncManager.initialize('user-123', 'user-password')

  // Queue a create event
  syncManager.queueEvent('create', 'meetings', 'meeting-123', {
    title: 'Team Standup',
    start_time: Date.now(),
    duration: 1800, // 30 minutes
  })

  // Queue an update event
  syncManager.queueEvent('update', 'notes', 'note-456', {
    original_text: 'Updated note text',
    augmented_text: 'AI-expanded note text',
  })

  // Queue a delete event
  syncManager.queueEvent('delete', 'transcripts', 'transcript-789', {
    id: 'transcript-789',
  })

  console.log('Events queued for sync')
}

/**
 * Example 3: Manual sync
 */
async function example3_ManualSync() {
  const syncManager = new SyncManager()
  await syncManager.initialize('user-123', 'user-password')

  // Queue some events
  syncManager.queueEvent('create', 'meetings', 'meeting-123', {
    title: 'Project Review',
  })

  // Manually trigger sync
  const result = await syncManager.syncPendingEvents()

  console.log('Sync result:', {
    success: result.success,
    syncedCount: result.syncedCount,
    failedCount: result.failedCount,
    errors: result.errors,
  })
}

/**
 * Example 4: Check sync queue statistics
 */
async function example4_CheckSyncStats() {
  const syncManager = new SyncManager()
  await syncManager.initialize('user-123', 'user-password')

  // Get sync queue statistics
  const stats = syncManager.getSyncStats()

  console.log('Sync queue stats:', {
    total: stats.total, // Total events in queue
    pending: stats.pending, // Events waiting to be synced
  })
}

/**
 * Example 5: Poll embedding status after sync
 */
async function example5_PollEmbeddingStatus() {
  const syncManager = new SyncManager()
  await syncManager.initialize('user-123', 'user-password')

  // Queue and sync an event
  syncManager.queueEvent('create', 'meetings', 'meeting-123', {
    title: 'Important Meeting',
  })

  const result = await syncManager.syncPendingEvents()

  if (result.success) {
    // Poll embedding status (GAP-16)
    const memoryId = 'memory-id-from-backend'
    const status = await syncManager.pollEmbeddingStatus(memoryId, 10, 1000)

    console.log('Embedding status:', status)

    if (status === 'ready') {
      console.log('Embedding is ready, search is now available')
    } else if (status === 'failed') {
      console.log('Embedding generation failed')
    } else {
      console.log('Embedding is still processing')
    }
  }
}

/**
 * Example 6: Handle large content with automatic chunking
 */
async function example6_LargeContentChunking() {
  const syncManager = new SyncManager()
  await syncManager.initialize('user-123', 'user-password')

  // Queue a large transcript (will be automatically chunked)
  const largeTranscript = 'A'.repeat(15000) // 15K characters

  syncManager.queueEvent('create', 'transcripts', 'transcript-123', {
    text: largeTranscript,
    meeting_id: 'meeting-123',
    start_time: 0,
    end_time: 1800,
  })

  // Sync will automatically chunk content based on plan tier limits
  const result = await syncManager.syncPendingEvents()

  console.log('Large content synced:', {
    syncedCount: result.syncedCount, // Will be > 1 if chunked
  })
}

/**
 * Example 7: Sync recovery after offline period
 */
async function example7_OfflineRecovery() {
  const syncManager = new SyncManager()
  await syncManager.initialize('user-123', 'user-password')

  // Queue events while offline
  syncManager.queueEvent('create', 'meetings', 'meeting-1', { title: 'Meeting 1' })
  syncManager.queueEvent('create', 'meetings', 'meeting-2', { title: 'Meeting 2' })
  syncManager.queueEvent('create', 'meetings', 'meeting-3', { title: 'Meeting 3' })

  console.log('Events queued while offline')

  // Later, when back online, sync will automatically process queued events
  // Events persist in SQLite across app restarts (Task 30.8)

  // Start auto-sync to process queued events
  syncManager.startAutoSync()

  console.log('Auto-sync started, will process queued events')
}

/**
 * Example 8: Error handling with exponential backoff
 */
async function example8_ErrorHandling() {
  const syncManager = new SyncManager()
  await syncManager.initialize('user-123', 'user-password')

  // Queue an event
  syncManager.queueEvent('create', 'meetings', 'meeting-123', {
    title: 'Test Meeting',
  })

  // Attempt sync (may fail due to network issues)
  const result = await syncManager.syncPendingEvents()

  if (!result.success) {
    console.log('Sync failed:', result.errors)
    console.log('Events will be retried with exponential backoff')
    console.log('Retry delays: 5s, 10s, 20s, 30s (max)')
    console.log('Retries: Infinite (never gives up)')
  }

  // Failed events remain in queue and will be retried automatically
  const stats = syncManager.getSyncStats()
  console.log('Pending events:', stats.pending)
}

/**
 * Example 9: Complete workflow with all features
 */
async function example9_CompleteWorkflow() {
  // 1. Initialize sync manager
  const backend = new PiyAPIBackend('https://api.piyapi.com/v1')
  const syncManager = new SyncManager(backend)
  await syncManager.initialize('user-123', 'user-password')

  // 2. Start auto-sync
  syncManager.startAutoSync()

  // 3. Queue events as they occur
  syncManager.queueEvent('create', 'meetings', 'meeting-123', {
    title: 'Team Standup',
    start_time: Date.now(),
  })

  syncManager.queueEvent('create', 'transcripts', 'transcript-456', {
    text: 'Meeting transcript content',
    meeting_id: 'meeting-123',
    start_time: 0,
    end_time: 60,
  })

  syncManager.queueEvent('create', 'notes', 'note-789', {
    original_text: 'Action item: Review PR',
    meeting_id: 'meeting-123',
    timestamp: 30,
  })

  // 4. Check sync status
  const stats = syncManager.getSyncStats()
  console.log('Queued events:', stats.pending)

  // 5. Auto-sync will process events every 30 seconds
  // Or manually trigger sync
  const result = await syncManager.syncPendingEvents()
  console.log('Sync result:', result)

  // 6. Poll embedding status for search availability
  if (result.success) {
    const memoryId = 'memory-id-from-backend'
    const embeddingStatus = await syncManager.pollEmbeddingStatus(memoryId)
    console.log('Embedding status:', embeddingStatus)
  }

  // 7. Stop auto-sync when done
  syncManager.stopAutoSync()
}

/**
 * Example 10: SQL injection protection
 */
async function example10_SQLInjectionProtection() {
  const syncManager = new SyncManager()
  await syncManager.initialize('user-123', 'user-password')

  // ALLOWED_TABLES whitelist: ['meetings', 'transcripts', 'notes', 'entities']

  // ✅ Valid table names
  syncManager.queueEvent('create', 'meetings', 'id-1', {})
  syncManager.queueEvent('create', 'transcripts', 'id-2', {})
  syncManager.queueEvent('create', 'notes', 'id-3', {})
  syncManager.queueEvent('create', 'entities', 'id-4', {})

  // ❌ Invalid table names (will throw error)
  try {
    syncManager.queueEvent('create', 'users', 'id-5', {})
  } catch (error: any) {
    console.error('Rejected:', error.message)
    // Error: Invalid table name: users. Allowed tables: meetings, transcripts, notes, entities
  }

  try {
    syncManager.queueEvent('create', 'DROP TABLE meetings', 'id-6', {})
  } catch (error: any) {
    console.error('SQL injection attempt blocked:', error.message)
  }
}

// Export examples
export {
  example1_InitializeAndStartAutoSync,
  example2_QueueSyncEvents,
  example3_ManualSync,
  example4_CheckSyncStats,
  example5_PollEmbeddingStatus,
  example6_LargeContentChunking,
  example7_OfflineRecovery,
  example8_ErrorHandling,
  example9_CompleteWorkflow,
  example10_SQLInjectionProtection,
}
