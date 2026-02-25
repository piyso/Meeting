/**
 * Unit Tests for FTS5 Search
 *
 * Run with: node --test src/main/database/__tests__/search.test.ts
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { initializeDatabase, closeDatabase } from '../connection'
import { createMeeting } from '../crud/meetings'
import { createTranscript } from '../crud/transcripts'
import { createNote } from '../crud/notes'
import {
  searchTranscripts,
  searchNotes,
  searchAll,
  countSearchResults,
  rebuildSearchIndexes,
  optimizeSearchIndexes,
} from '../search'

describe('FTS5 Search', () => {
  const testDbPath = path.join(__dirname, 'test-search.db')
  let testMeetingId: string

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

    initializeDatabase({ filename: testDbPath })

    // Create test data
    testMeetingId = uuidv4()
    createMeeting({
      id: testMeetingId,
      title: 'Search Test Meeting',
      start_time: Date.now(),
    })

    // Create transcripts with searchable content
    createTranscript({
      id: uuidv4(),
      meeting_id: testMeetingId,
      start_time: 0,
      end_time: 10,
      text: 'We need to discuss the budget for the new project',
    })

    createTranscript({
      id: uuidv4(),
      meeting_id: testMeetingId,
      start_time: 10,
      end_time: 20,
      text: 'The deadline is March 30th for the first milestone',
    })

    createTranscript({
      id: uuidv4(),
      meeting_id: testMeetingId,
      start_time: 20,
      end_time: 30,
      text: 'John will handle the frontend development',
    })

    // Create notes with searchable content
    createNote({
      id: uuidv4(),
      meeting_id: testMeetingId,
      timestamp: 5,
      original_text: 'Budget concerns',
      augmented_text: 'The team expressed concerns about the budget allocation for Q2',
    })

    createNote({
      id: uuidv4(),
      meeting_id: testMeetingId,
      timestamp: 15,
      original_text: 'Deadline reminder',
      augmented_text: 'Important deadline on March 30th must be met',
    })
  })

  after(() => {
    closeDatabase()
    // Clean up test database
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

  describe('Transcript Search', () => {
    it('should search transcripts by single word', () => {
      const results = searchTranscripts('budget')

      assert.ok(results.length > 0, 'Should find results')
      assert.ok(
        results.some(r => r.transcript.text.toLowerCase().includes('budget')),
        'Results should contain the search term'
      )
    })

    it('should search transcripts by phrase', () => {
      const results = searchTranscripts('new project')

      assert.ok(results.length > 0, 'Should find results')
      assert.ok(
        results.some(r => r.transcript.text.toLowerCase().includes('new project')),
        'Results should contain the phrase'
      )
    })

    it('should return snippets with highlights', () => {
      const results = searchTranscripts('deadline')

      assert.ok(results.length > 0, 'Should find results')
      assert.ok(results[0]!.snippet, 'Should have snippet')
      assert.ok(
        results[0]!.snippet.includes('<mark>') && results[0]!.snippet.includes('</mark>'),
        'Snippet should have highlight markers'
      )
    })

    it('should filter search by meeting ID', () => {
      const results = searchTranscripts('budget', { meetingId: testMeetingId })

      assert.ok(results.length > 0, 'Should find results')
      assert.ok(
        results.every(r => r.meeting.id === testMeetingId),
        'All results should be from specified meeting'
      )
    })

    it('should respect limit parameter', () => {
      const results = searchTranscripts('the', { limit: 2 })

      assert.ok(results.length <= 2, 'Should respect limit')
    })
  })

  describe('Note Search', () => {
    it('should search notes by original text', () => {
      const results = searchNotes('budget')

      assert.ok(results.length > 0, 'Should find results')
      assert.ok(
        results.some(
          r =>
            r.note.original_text.toLowerCase().includes('budget') ||
            (r.note.augmented_text && r.note.augmented_text.toLowerCase().includes('budget'))
        ),
        'Results should contain the search term'
      )
    })

    it('should search notes by augmented text', () => {
      const results = searchNotes('allocation')

      assert.ok(results.length > 0, 'Should find results in augmented text')
      assert.ok(
        results.some(r => r.note.augmented_text?.toLowerCase().includes('allocation')),
        'Results should contain the search term in augmented text'
      )
    })

    it('should return snippets for notes', () => {
      const results = searchNotes('deadline')

      assert.ok(results.length > 0, 'Should find results')
      assert.ok(results[0]!.snippet, 'Should have snippet')
    })
  })

  describe('Combined Search', () => {
    it('should search both transcripts and notes', () => {
      const results = searchAll('deadline')

      assert.ok(results.transcripts.length > 0, 'Should find transcript results')
      assert.ok(results.notes.length > 0, 'Should find note results')
    })

    it('should return separate arrays for transcripts and notes', () => {
      const results = searchAll('budget')

      assert.ok(Array.isArray(results.transcripts), 'Transcripts should be an array')
      assert.ok(Array.isArray(results.notes), 'Notes should be an array')
    })
  })

  describe('Search Count', () => {
    it('should count search results without fetching them', () => {
      const counts = countSearchResults('budget')

      assert.ok(typeof counts.transcripts === 'number', 'Should return transcript count')
      assert.ok(typeof counts.notes === 'number', 'Should return note count')
      assert.ok(typeof counts.total === 'number', 'Should return total count')
      assert.strictEqual(
        counts.total,
        counts.transcripts + counts.notes,
        'Total should equal sum of transcripts and notes'
      )
    })
  })

  describe('Index Maintenance', () => {
    it('should rebuild search indexes without error', () => {
      assert.doesNotThrow(() => {
        rebuildSearchIndexes()
      }, 'Should rebuild indexes without error')
    })

    it('should optimize search indexes without error', () => {
      assert.doesNotThrow(() => {
        optimizeSearchIndexes()
      }, 'Should optimize indexes without error')
    })

    it('should still search after rebuild', () => {
      rebuildSearchIndexes()

      const results = searchTranscripts('budget')
      assert.ok(results.length > 0, 'Should still find results after rebuild')
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty search query gracefully', () => {
      assert.throws(() => searchTranscripts(''), 'Should throw error for empty query')
    })

    it('should return empty results for non-existent terms', () => {
      const results = searchTranscripts('xyzabc123nonexistent')

      assert.strictEqual(results.length, 0, 'Should return empty array')
    })

    it('should handle special characters in search', () => {
      // FTS5 should handle special characters
      assert.doesNotThrow(() => {
        searchTranscripts('budget*')
      }, 'Should handle wildcard searches')
    })
  })
})
