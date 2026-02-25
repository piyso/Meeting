/**
 * Test: Transcript-Meeting Linkage (Task 17.3)
 *
 * Verifies that transcripts are properly linked to meetings via foreign key:
 * - Foreign key constraint exists and is enforced
 * - Cascade delete behavior works correctly
 * - Referential integrity is maintained
 * - Queries can join transcripts with meetings
 *
 * Run with: node --test src/main/database/__tests__/transcript-meeting-linkage.test.ts
 */

import { describe, it, beforeEach, before, after } from 'node:test'
import assert from 'node:assert'
import fs from 'fs'
import path from 'path'
import { initializeDatabase, closeDatabase, getDatabase } from '../connection'
import { createMeeting, deleteMeeting } from '../crud/meetings'
import { createTranscript, getTranscriptsByMeetingId } from '../crud/transcripts'
import type { CreateMeetingInput, CreateTranscriptInput } from '../../../types/database'

describe('Task 17.3: Transcript-Meeting Linkage', () => {
  const testDbPath = path.join(__dirname, 'test-linkage.db')

  before(() => {
    // Clean up any existing test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath)
    }
    if (fs.existsSync(`${testDbPath}-shm`)) {
      fs.unlinkSync(`${testDbPath}-shm`)
    }
    if (fs.existsSync(`${testDbPath}-wal`)) {
      fs.unlinkSync(`${testDbPath}-wal`)
    }

    // Initialize database
    initializeDatabase({ filename: testDbPath })
  })

  after(() => {
    // Close database and clean up
    closeDatabase()

    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath)
    }
    if (fs.existsSync(`${testDbPath}-shm`)) {
      fs.unlinkSync(`${testDbPath}-shm`)
    }
    if (fs.existsSync(`${testDbPath}-wal`)) {
      fs.unlinkSync(`${testDbPath}-wal`)
    }
  })

  beforeEach(() => {
    // Clear all tables before each test
    const db = getDatabase()
    db.exec('DELETE FROM transcripts')
    db.exec('DELETE FROM notes')
    db.exec('DELETE FROM entities')
    db.exec('DELETE FROM meetings')
  })

  describe('Foreign Key Constraint', () => {
    it('should allow creating transcript with valid meeting_id', () => {
      // Create a meeting
      const meetingInput: CreateMeetingInput = {
        id: 'meeting-1',
        title: 'Test Meeting',
        start_time: Date.now(),
      }
      createMeeting(meetingInput)

      // Create transcript linked to meeting
      const transcriptInput: CreateTranscriptInput = {
        id: 'transcript-1',
        meeting_id: 'meeting-1',
        start_time: 0.0,
        end_time: 5.0,
        text: 'This is a test transcript.',
        confidence: 0.95,
      }

      // Should not throw
      createTranscript(transcriptInput)

      // Verify transcript was created
      const transcripts = getTranscriptsByMeetingId('meeting-1')
      assert.strictEqual(transcripts.length, 1)
      assert.strictEqual(transcripts[0]!.text, 'This is a test transcript.')
    })

    it('should reject transcript with invalid meeting_id', () => {
      const db = getDatabase()

      // Enable foreign key enforcement (should be on by default, but verify)
      db.pragma('foreign_keys = ON')

      // Try to create transcript with non-existent meeting_id
      const transcriptInput: CreateTranscriptInput = {
        id: 'transcript-orphan',
        meeting_id: 'non-existent-meeting',
        start_time: 0.0,
        end_time: 5.0,
        text: 'Orphan transcript',
        confidence: 0.95,
      }

      // Should throw due to foreign key constraint violation
      assert.throws(() => createTranscript(transcriptInput))
    })

    it('should verify foreign key constraint is enabled', () => {
      const db = getDatabase()
      const result = db.pragma('foreign_keys', { simple: true })

      // Foreign keys should be enabled (1 = ON)
      assert.strictEqual(result, 1)
    })
  })

  describe('Cascade Delete Behavior', () => {
    it('should delete transcripts when meeting is deleted', () => {
      // Create meeting
      const meetingInput: CreateMeetingInput = {
        id: 'meeting-cascade',
        title: 'Meeting to Delete',
        start_time: Date.now(),
      }
      createMeeting(meetingInput)

      // Create multiple transcripts
      const transcripts: CreateTranscriptInput[] = [
        {
          id: 'transcript-1',
          meeting_id: 'meeting-cascade',
          start_time: 0.0,
          end_time: 5.0,
          text: 'First transcript',
          confidence: 0.95,
        },
        {
          id: 'transcript-2',
          meeting_id: 'meeting-cascade',
          start_time: 5.0,
          end_time: 10.0,
          text: 'Second transcript',
          confidence: 0.92,
        },
        {
          id: 'transcript-3',
          meeting_id: 'meeting-cascade',
          start_time: 10.0,
          end_time: 15.0,
          text: 'Third transcript',
          confidence: 0.88,
        },
      ]

      transcripts.forEach(t => createTranscript(t))

      // Verify transcripts exist
      let foundTranscripts = getTranscriptsByMeetingId('meeting-cascade')
      assert.strictEqual(foundTranscripts.length, 3)

      // Delete the meeting
      const deleted = deleteMeeting('meeting-cascade')
      assert.strictEqual(deleted, true)

      // Verify transcripts were cascade deleted
      foundTranscripts = getTranscriptsByMeetingId('meeting-cascade')
      assert.strictEqual(foundTranscripts.length, 0)
    })

    it('should not affect transcripts of other meetings', () => {
      // Create two meetings
      createMeeting({
        id: 'meeting-keep',
        title: 'Meeting to Keep',
        start_time: Date.now(),
      })

      createMeeting({
        id: 'meeting-delete',
        title: 'Meeting to Delete',
        start_time: Date.now(),
      })

      // Create transcripts for both meetings
      createTranscript({
        id: 'transcript-keep',
        meeting_id: 'meeting-keep',
        start_time: 0.0,
        end_time: 5.0,
        text: 'Keep this transcript',
        confidence: 0.95,
      })

      createTranscript({
        id: 'transcript-delete',
        meeting_id: 'meeting-delete',
        start_time: 0.0,
        end_time: 5.0,
        text: 'Delete this transcript',
        confidence: 0.95,
      })

      // Delete one meeting
      deleteMeeting('meeting-delete')

      // Verify only the correct transcripts were deleted
      const keptTranscripts = getTranscriptsByMeetingId('meeting-keep')
      const deletedTranscripts = getTranscriptsByMeetingId('meeting-delete')

      assert.strictEqual(keptTranscripts.length, 1)
      assert.strictEqual(keptTranscripts[0].text, 'Keep this transcript')
      assert.strictEqual(deletedTranscripts.length, 0)
    })
  })

  describe('Referential Integrity', () => {
    it('should maintain integrity across multiple operations', () => {
      // Create meeting
      createMeeting({
        id: 'meeting-integrity',
        title: 'Integrity Test',
        start_time: Date.now(),
      })

      // Create transcript
      createTranscript({
        id: 'transcript-integrity',
        meeting_id: 'meeting-integrity',
        start_time: 0.0,
        end_time: 5.0,
        text: 'Integrity test transcript',
        confidence: 0.95,
      })

      // Verify relationship
      const transcripts = getTranscriptsByMeetingId('meeting-integrity')
      assert.strictEqual(transcripts.length, 1)
      assert.strictEqual(transcripts[0]!.meeting_id, 'meeting-integrity')

      // Try to create another transcript with same meeting_id (should succeed)
      createTranscript({
        id: 'transcript-integrity-2',
        meeting_id: 'meeting-integrity',
        start_time: 5.0,
        end_time: 10.0,
        text: 'Second integrity test transcript',
        confidence: 0.92,
      })

      const allTranscripts = getTranscriptsByMeetingId('meeting-integrity')
      assert.strictEqual(allTranscripts.length, 2)
    })

    it('should enforce meeting_id is NOT NULL', () => {
      const db = getDatabase()

      // Try to insert transcript without meeting_id
      const stmt = db.prepare(`
        INSERT INTO transcripts (id, start_time, end_time, text)
        VALUES (?, ?, ?, ?)
      `)

      // Should throw due to NOT NULL constraint
      assert.throws(() => stmt.run('transcript-null', 0.0, 5.0, 'No meeting'))
    })
  })

  describe('Join Queries', () => {
    it('should join transcripts with meetings', () => {
      const db = getDatabase()

      // Create meeting
      createMeeting({
        id: 'meeting-join',
        title: 'Join Test Meeting',
        start_time: Date.now(),
      })

      // Create transcripts
      createTranscript({
        id: 'transcript-join-1',
        meeting_id: 'meeting-join',
        start_time: 0.0,
        end_time: 5.0,
        text: 'First transcript',
        confidence: 0.95,
      })

      createTranscript({
        id: 'transcript-join-2',
        meeting_id: 'meeting-join',
        start_time: 5.0,
        end_time: 10.0,
        text: 'Second transcript',
        confidence: 0.92,
      })

      // Query with JOIN
      const stmt = db.prepare(`
        SELECT 
          m.id as meeting_id,
          m.title as meeting_title,
          t.id as transcript_id,
          t.text as transcript_text,
          t.start_time,
          t.end_time
        FROM meetings m
        INNER JOIN transcripts t ON m.id = t.meeting_id
        WHERE m.id = ?
        ORDER BY t.start_time ASC
      `)

      const results = stmt.all('meeting-join') as any[]

      assert.strictEqual(results.length, 2)
      assert.strictEqual(results[0].meeting_id, 'meeting-join')
      assert.strictEqual(results[0].meeting_title, 'Join Test Meeting')
      assert.strictEqual(results[0].transcript_text, 'First transcript')
      assert.strictEqual(results[0].start_time, 0.0)
      assert.strictEqual(results[0].end_time, 5.0)

      assert.strictEqual(results[1].meeting_id, 'meeting-join')
      assert.strictEqual(results[1].meeting_title, 'Join Test Meeting')
      assert.strictEqual(results[1].transcript_text, 'Second transcript')
      assert.strictEqual(results[1].start_time, 5.0)
      assert.strictEqual(results[1].end_time, 10.0)
    })

    it('should aggregate transcript data by meeting', () => {
      const db = getDatabase()

      // Create multiple meetings with transcripts
      createMeeting({
        id: 'meeting-agg-1',
        title: 'Meeting 1',
        start_time: Date.now(),
      })

      createMeeting({
        id: 'meeting-agg-2',
        title: 'Meeting 2',
        start_time: Date.now(),
      })

      // Meeting 1: 3 transcripts
      for (let i = 0; i < 3; i++) {
        createTranscript({
          id: `transcript-agg-1-${i}`,
          meeting_id: 'meeting-agg-1',
          start_time: i * 5.0,
          end_time: (i + 1) * 5.0,
          text: `Meeting 1 transcript ${i}`,
          confidence: 0.95,
        })
      }

      // Meeting 2: 2 transcripts
      for (let i = 0; i < 2; i++) {
        createTranscript({
          id: `transcript-agg-2-${i}`,
          meeting_id: 'meeting-agg-2',
          start_time: i * 5.0,
          end_time: (i + 1) * 5.0,
          text: `Meeting 2 transcript ${i}`,
          confidence: 0.92,
        })
      }

      // Aggregate query
      const stmt = db.prepare(`
        SELECT 
          m.id,
          m.title,
          COUNT(t.id) as transcript_count,
          MIN(t.start_time) as first_transcript_time,
          MAX(t.end_time) as last_transcript_time
        FROM meetings m
        LEFT JOIN transcripts t ON m.id = t.meeting_id
        GROUP BY m.id
        ORDER BY m.id
      `)

      const results = stmt.all() as any[]

      assert.strictEqual(results.length, 2)
      assert.strictEqual(results[0].id, 'meeting-agg-1')
      assert.strictEqual(results[0].title, 'Meeting 1')
      assert.strictEqual(results[0].transcript_count, 3)
      assert.strictEqual(results[0].first_transcript_time, 0.0)
      assert.strictEqual(results[0].last_transcript_time, 15.0)

      assert.strictEqual(results[1].id, 'meeting-agg-2')
      assert.strictEqual(results[1].title, 'Meeting 2')
      assert.strictEqual(results[1].transcript_count, 2)
      assert.strictEqual(results[1].first_transcript_time, 0.0)
      assert.strictEqual(results[1].last_transcript_time, 10.0)
    })

    it('should handle meetings with no transcripts', () => {
      const db = getDatabase()

      // Create meeting without transcripts
      createMeeting({
        id: 'meeting-empty',
        title: 'Empty Meeting',
        start_time: Date.now(),
      })

      // LEFT JOIN should return meeting even with no transcripts
      const stmt = db.prepare(`
        SELECT 
          m.id,
          m.title,
          COUNT(t.id) as transcript_count
        FROM meetings m
        LEFT JOIN transcripts t ON m.id = t.meeting_id
        WHERE m.id = ?
        GROUP BY m.id
      `)

      const result = stmt.get('meeting-empty') as any

      assert.strictEqual(result.id, 'meeting-empty')
      assert.strictEqual(result.title, 'Empty Meeting')
      assert.strictEqual(result.transcript_count, 0)
    })
  })

  describe('Schema Verification', () => {
    it('should verify foreign key definition in schema', () => {
      const db = getDatabase()

      // Query foreign key list for transcripts table
      const foreignKeys = db.pragma('foreign_key_list(transcripts)') as any[]

      assert.strictEqual(foreignKeys.length, 1)
      assert.strictEqual(foreignKeys[0].table, 'meetings')
      assert.strictEqual(foreignKeys[0].from, 'meeting_id')
      assert.strictEqual(foreignKeys[0].to, 'id')
      assert.strictEqual(foreignKeys[0].on_delete, 'CASCADE')
    })

    it('should verify indexes exist for meeting_id', () => {
      const db = getDatabase()

      // Query indexes on transcripts table
      const indexes = db.pragma('index_list(transcripts)') as any[]

      // Should have index on meeting_id
      const meetingIdIndex = indexes.find((idx: any) => idx.name === 'idx_transcripts_meeting')

      assert.ok(meetingIdIndex, 'Index idx_transcripts_meeting should exist')
    })
  })

  describe('Performance with Linkage', () => {
    it('should efficiently query transcripts by meeting_id', () => {
      // Create meeting
      createMeeting({
        id: 'meeting-perf',
        title: 'Performance Test',
        start_time: Date.now(),
      })

      // Create 100 transcripts
      const transcripts: CreateTranscriptInput[] = []
      for (let i = 0; i < 100; i++) {
        transcripts.push({
          id: `transcript-perf-${i}`,
          meeting_id: 'meeting-perf',
          start_time: i * 5.0,
          end_time: (i + 1) * 5.0,
          text: `Transcript ${i}`,
          confidence: 0.95,
        })
      }

      // Batch insert
      const db = getDatabase()
      const insertMany = db.transaction((items: CreateTranscriptInput[]) => {
        const stmt = db.prepare(`
          INSERT INTO transcripts (id, meeting_id, start_time, end_time, text, confidence)
          VALUES (?, ?, ?, ?, ?, ?)
        `)
        for (const item of items) {
          stmt.run(
            item.id,
            item.meeting_id,
            item.start_time,
            item.end_time,
            item.text,
            item.confidence
          )
        }
      })

      insertMany(transcripts)

      // Query should be fast with index
      const start = performance.now()
      const results = getTranscriptsByMeetingId('meeting-perf')
      const duration = performance.now() - start

      assert.strictEqual(results.length, 100)
      assert.ok(duration < 50, `Query took ${duration}ms, should be < 50ms`)
    })
  })
})
