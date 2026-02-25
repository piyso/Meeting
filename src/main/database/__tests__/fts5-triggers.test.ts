/**
 * Unit Tests for FTS5 Trigger Functionality
 *
 * Verifies that FTS5 indexes are automatically updated via triggers
 * when transcripts and notes are inserted, updated, or deleted.
 *
 * Run with: npx tsx --test src/main/database/__tests__/fts5-triggers.test.ts
 */

import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { v4 as uuidv4 } from 'uuid'
import { initializeDatabase, closeDatabase, getDatabase } from '../connection'
import { createMeeting } from '../crud/meetings'
import { createTranscript, updateTranscript, deleteTranscript } from '../crud/transcripts'
import { createNote, updateNote, deleteNote } from '../crud/notes'
import { searchTranscripts, searchNotes } from '../search'

describe('FTS5 Trigger Functionality', () => {
  let testMeetingId: string

  beforeEach(() => {
    // Initialize in-memory database for testing
    initializeDatabase({ filename: ':memory:' })

    // Create a test meeting
    const meeting = createMeeting({
      id: uuidv4(),
      title: 'FTS5 Trigger Test Meeting',
      start_time: Date.now(),
    })
    testMeetingId = meeting.id
  })

  afterEach(() => {
    closeDatabase()
  })

  describe('Transcript FTS5 Triggers', () => {
    it('should automatically index transcript on INSERT', () => {
      // Create a transcript with searchable text
      createTranscript({
        id: uuidv4(),
        meeting_id: testMeetingId,
        start_time: 0,
        end_time: 5,
        text: 'We need to discuss the budget for the new project',
      })

      // Search for a term in the transcript - should find it immediately
      const results = searchTranscripts('budget')

      assert.strictEqual(results.length, 1, 'Should find exactly one result')
      assert.ok(
        results[0].transcript.text.includes('budget'),
        'Result should contain the search term'
      )
      assert.strictEqual(
        results[0].meeting.id,
        testMeetingId,
        'Result should be from the test meeting'
      )
    })

    it('should automatically update FTS5 index on UPDATE', () => {
      // Create initial transcript
      const transcript = createTranscript({
        id: uuidv4(),
        meeting_id: testMeetingId,
        start_time: 0,
        end_time: 5,
        text: 'Initial text about marketing',
      })

      // Verify initial text is searchable
      let results = searchTranscripts('marketing')
      assert.strictEqual(results.length, 1, 'Initial text should be searchable')

      // Update the transcript text
      updateTranscript(transcript.id, {
        text: 'Updated text about engineering',
      })

      // Old text should no longer be found
      results = searchTranscripts('marketing')
      assert.strictEqual(results.length, 0, 'Old text should not be found after update')

      // New text should be searchable
      results = searchTranscripts('engineering')
      assert.strictEqual(results.length, 1, 'Updated text should be searchable')
      assert.ok(
        results[0].transcript.text.includes('engineering'),
        'Result should contain updated text'
      )
    })

    it('should automatically remove from FTS5 index on DELETE', () => {
      // Create transcript
      const transcript = createTranscript({
        id: uuidv4(),
        meeting_id: testMeetingId,
        start_time: 0,
        end_time: 5,
        text: 'Temporary transcript about sales',
      })

      // Verify it's searchable
      let results = searchTranscripts('sales')
      assert.strictEqual(results.length, 1, 'Transcript should be searchable before delete')

      // Delete the transcript
      const deleted = deleteTranscript(transcript.id)
      assert.strictEqual(deleted, true, 'Delete should return true')

      // Should no longer be searchable
      results = searchTranscripts('sales')
      assert.strictEqual(results.length, 0, 'Transcript should not be searchable after delete')
    })

    it('should handle multiple inserts with immediate searchability', () => {
      // Insert 5 transcripts with different unique terms
      createTranscript({
        id: uuidv4(),
        meeting_id: testMeetingId,
        start_time: 0,
        end_time: 10,
        text: 'First transcript about design',
      })
      createTranscript({
        id: uuidv4(),
        meeting_id: testMeetingId,
        start_time: 10,
        end_time: 20,
        text: 'Second transcript about development',
      })
      createTranscript({
        id: uuidv4(),
        meeting_id: testMeetingId,
        start_time: 20,
        end_time: 30,
        text: 'Third transcript about testing',
      })
      createTranscript({
        id: uuidv4(),
        meeting_id: testMeetingId,
        start_time: 30,
        end_time: 40,
        text: 'Fourth transcript about deployment',
      })
      createTranscript({
        id: uuidv4(),
        meeting_id: testMeetingId,
        start_time: 40,
        end_time: 50,
        text: 'Fifth transcript about monitoring',
      })

      // All should be immediately searchable
      const searchTerms = ['design', 'development', 'testing', 'deployment', 'monitoring']
      for (const term of searchTerms) {
        const results = searchTranscripts(term)
        assert.strictEqual(results.length, 1, `Term "${term}" should be searchable`)
        assert.ok(results[0].transcript.text.includes(term), `Result should contain term "${term}"`)
      }
    })
  })

  describe('Note FTS5 Triggers', () => {
    it('should automatically index note on INSERT', () => {
      // Create a note with searchable text
      createNote({
        id: uuidv4(),
        meeting_id: testMeetingId,
        timestamp: 10,
        original_text: 'Important deadline reminder',
      })

      // Search for a term in the note - should find it immediately
      const results = searchNotes('deadline')

      assert.strictEqual(results.length, 1, 'Should find exactly one result')
      assert.ok(
        results[0].note.original_text.includes('deadline'),
        'Result should contain the search term'
      )
      assert.strictEqual(
        results[0].meeting.id,
        testMeetingId,
        'Result should be from the test meeting'
      )
    })

    it('should index both original_text and augmented_text', () => {
      createNote({
        id: uuidv4(),
        meeting_id: testMeetingId,
        timestamp: 10,
        original_text: 'Budget concerns',
        augmented_text: 'The team expressed concerns about the budget allocation for Q2',
      })

      // Both terms should be searchable
      let results = searchNotes('concerns')
      assert.strictEqual(results.length, 1, 'Original text term should be searchable')

      results = searchNotes('allocation')
      assert.strictEqual(results.length, 1, 'Augmented text term should be searchable')
    })

    it('should automatically update FTS5 index on UPDATE', () => {
      // Create initial note
      const note = createNote({
        id: uuidv4(),
        meeting_id: testMeetingId,
        timestamp: 10,
        original_text: 'Initial note about hiring',
      })

      // Verify initial text is searchable
      let results = searchNotes('hiring')
      assert.strictEqual(results.length, 1, 'Initial text should be searchable')

      // Update the note text
      updateNote(note.id, {
        original_text: 'Updated note about training',
      })

      // Old text should no longer be found
      results = searchNotes('hiring')
      assert.strictEqual(results.length, 0, 'Old text should not be found after update')

      // New text should be searchable
      results = searchNotes('training')
      assert.strictEqual(results.length, 1, 'Updated text should be searchable')
      assert.ok(
        results[0].note.original_text.includes('training'),
        'Result should contain updated text'
      )
    })

    it('should automatically remove from FTS5 index on DELETE', () => {
      // Create note
      const note = createNote({
        id: uuidv4(),
        meeting_id: testMeetingId,
        timestamp: 10,
        original_text: 'Temporary note about vacation',
      })

      // Verify it's searchable
      let results = searchNotes('vacation')
      assert.strictEqual(results.length, 1, 'Note should be searchable before delete')

      // Delete the note
      const deleted = deleteNote(note.id)
      assert.strictEqual(deleted, true, 'Delete should return true')

      // Should no longer be searchable
      results = searchNotes('vacation')
      assert.strictEqual(results.length, 0, 'Note should not be searchable after delete')
    })
  })

  describe('Trigger Integrity', () => {
    it('should verify triggers exist in database', () => {
      const db = getDatabase()

      // Query sqlite_master for triggers
      const triggers = db
        .prepare(
          `
        SELECT name, tbl_name 
        FROM sqlite_master 
        WHERE type = 'trigger' 
        AND name LIKE '%fts%'
        ORDER BY name
      `
        )
        .all() as Array<{ name: string; tbl_name: string }>

      // Should have 6 triggers (insert, update, delete for both transcripts and notes)
      assert.ok(
        triggers.length >= 6,
        `Should have at least 6 FTS triggers, found ${triggers.length}`
      )

      // Verify transcript triggers exist
      const transcriptTriggers = triggers.filter(t => t.tbl_name === 'transcripts')
      assert.strictEqual(transcriptTriggers.length, 3, 'Should have 3 transcript triggers')

      const transcriptTriggerNames = transcriptTriggers.map(t => t.name)
      assert.ok(
        transcriptTriggerNames.includes('transcripts_fts_insert'),
        'Should have transcripts_fts_insert trigger'
      )
      assert.ok(
        transcriptTriggerNames.includes('transcripts_fts_update'),
        'Should have transcripts_fts_update trigger'
      )
      assert.ok(
        transcriptTriggerNames.includes('transcripts_fts_delete'),
        'Should have transcripts_fts_delete trigger'
      )

      // Verify note triggers exist
      const noteTriggers = triggers.filter(t => t.tbl_name === 'notes')
      assert.strictEqual(noteTriggers.length, 3, 'Should have 3 note triggers')

      const noteTriggerNames = noteTriggers.map(t => t.name)
      assert.ok(
        noteTriggerNames.includes('notes_fts_insert'),
        'Should have notes_fts_insert trigger'
      )
      assert.ok(
        noteTriggerNames.includes('notes_fts_update'),
        'Should have notes_fts_update trigger'
      )
      assert.ok(
        noteTriggerNames.includes('notes_fts_delete'),
        'Should have notes_fts_delete trigger'
      )
    })

    it('should verify FTS5 virtual tables exist', () => {
      const db = getDatabase()

      // Query for FTS5 virtual tables
      const ftsTables = db
        .prepare(
          `
        SELECT name 
        FROM sqlite_master 
        WHERE type = 'table' 
        AND name LIKE '%_fts'
        ORDER BY name
      `
        )
        .all() as Array<{ name: string }>

      assert.strictEqual(ftsTables.length, 2, 'Should have 2 FTS5 virtual tables')

      const tableNames = ftsTables.map(t => t.name)
      assert.ok(tableNames.includes('transcripts_fts'), 'Should have transcripts_fts table')
      assert.ok(tableNames.includes('notes_fts'), 'Should have notes_fts table')
    })
  })
})
