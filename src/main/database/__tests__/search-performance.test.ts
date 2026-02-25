/**
 * Performance Tests for FTS5 Search
 *
 * Validates: Requirements 5.1 (Search response time <50ms)
 *
 * Tests search performance across 100 transcripts to ensure
 * the <50ms target is met for local FTS5 search operations.
 *
 * Run with: npx tsx --test src/main/database/__tests__/search-performance.test.ts
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { initializeDatabase, closeDatabase } from '../connection'
import { createMeeting } from '../crud/meetings'
import { createTranscript } from '../crud/transcripts'
import { searchTranscripts, searchAll } from '../search'

describe('Search Performance Tests', () => {
  const testDbPath = path.join(__dirname, 'test-search-performance.db')
  const meetingIds: string[] = []
  const TRANSCRIPT_COUNT = 100
  const PERFORMANCE_TARGET_MS = 50

  before(() => {
    console.log('Setting up performance test database...')

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

    // Create 10 meetings with 10 transcripts each = 100 total transcripts
    const sampleTexts = [
      'We need to discuss the budget allocation for the new project',
      'The deadline for the first milestone is March 30th',
      'John will handle the frontend development tasks',
      'Sarah is responsible for the backend API implementation',
      'The team expressed concerns about the timeline',
      'We should schedule a follow-up meeting next week',
      'The client requested additional features for the dashboard',
      'Performance optimization is a high priority',
      'We need to review the security audit results',
      'The deployment process needs to be automated',
    ]

    for (let i = 0; i < 10; i++) {
      const meetingId = uuidv4()
      meetingIds.push(meetingId)

      createMeeting({
        id: meetingId,
        title: `Performance Test Meeting ${i + 1}`,
        start_time: Date.now() - i * 3600000, // Stagger meetings by 1 hour
      })

      // Create 10 transcripts per meeting
      for (let j = 0; j < 10; j++) {
        const text = sampleTexts[j]
        if (!text) continue // Skip if text is undefined

        createTranscript({
          id: uuidv4(),
          meeting_id: meetingId,
          start_time: j * 10,
          end_time: (j + 1) * 10,
          text,
          confidence: 0.9 + Math.random() * 0.1,
        })
      }
    }

    console.log(`Created ${TRANSCRIPT_COUNT} transcripts across ${meetingIds.length} meetings`)
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

  describe('Search Performance Across 100 Transcripts', () => {
    it('should search single word in <50ms', () => {
      const startTime = performance.now()
      const results = searchTranscripts('budget')
      const endTime = performance.now()
      const duration = endTime - startTime

      console.log(`  Single word search: ${duration.toFixed(2)}ms`)

      assert.ok(results.length > 0, 'Should find results')
      assert.ok(
        duration < PERFORMANCE_TARGET_MS,
        `Search took ${duration.toFixed(2)}ms, should be <${PERFORMANCE_TARGET_MS}ms`
      )
    })

    it('should search phrase in <50ms', () => {
      const startTime = performance.now()
      const results = searchTranscripts('frontend development')
      const endTime = performance.now()
      const duration = endTime - startTime

      console.log(`  Phrase search: ${duration.toFixed(2)}ms`)

      assert.ok(results.length > 0, 'Should find results')
      assert.ok(
        duration < PERFORMANCE_TARGET_MS,
        `Search took ${duration.toFixed(2)}ms, should be <${PERFORMANCE_TARGET_MS}ms`
      )
    })

    it('should search with wildcard in <50ms', () => {
      const startTime = performance.now()
      const results = searchTranscripts('develop*')
      const endTime = performance.now()
      const duration = endTime - startTime

      console.log(`  Wildcard search: ${duration.toFixed(2)}ms`)

      assert.ok(results.length > 0, 'Should find results')
      assert.ok(
        duration < PERFORMANCE_TARGET_MS,
        `Search took ${duration.toFixed(2)}ms, should be <${PERFORMANCE_TARGET_MS}ms`
      )
    })

    it('should search with meeting filter in <50ms', () => {
      const meetingId = meetingIds[0]
      assert.ok(meetingId, 'Should have at least one meeting')

      const startTime = performance.now()
      const results = searchTranscripts('meeting', { meetingId })
      const endTime = performance.now()
      const duration = endTime - startTime

      console.log(`  Filtered search: ${duration.toFixed(2)}ms`)

      assert.ok(results.length >= 0, 'Should return results array')
      assert.ok(
        duration < PERFORMANCE_TARGET_MS,
        `Search took ${duration.toFixed(2)}ms, should be <${PERFORMANCE_TARGET_MS}ms`
      )
    })

    it('should perform combined search in <50ms', () => {
      const startTime = performance.now()
      const results = searchAll('project')
      const endTime = performance.now()
      const duration = endTime - startTime

      console.log(`  Combined search: ${duration.toFixed(2)}ms`)

      assert.ok(results.transcripts.length > 0, 'Should find transcript results')
      assert.ok(
        duration < PERFORMANCE_TARGET_MS,
        `Search took ${duration.toFixed(2)}ms, should be <${PERFORMANCE_TARGET_MS}ms`
      )
    })

    it('should handle multiple consecutive searches in <50ms each', () => {
      const queries = ['budget', 'deadline', 'frontend', 'backend', 'security']
      const durations: number[] = []

      for (const query of queries) {
        const startTime = performance.now()
        const results = searchTranscripts(query)
        const endTime = performance.now()
        const duration = endTime - startTime
        durations.push(duration)

        assert.ok(results.length > 0, `Should find results for "${query}"`)
        assert.ok(
          duration < PERFORMANCE_TARGET_MS,
          `Search for "${query}" took ${duration.toFixed(2)}ms, should be <${PERFORMANCE_TARGET_MS}ms`
        )
      }

      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length
      console.log(`  Average of ${queries.length} searches: ${avgDuration.toFixed(2)}ms`)
      console.log(
        `  Min: ${Math.min(...durations).toFixed(2)}ms, Max: ${Math.max(...durations).toFixed(2)}ms`
      )
    })
  })

  describe('Search Result Correctness', () => {
    it('should return correct results with proper structure', () => {
      const results = searchTranscripts('budget')

      assert.ok(results.length > 0, 'Should find results')

      const firstResult = results[0]
      assert.ok(firstResult, 'Should have first result')
      assert.ok(firstResult.transcript, 'Should have transcript object')
      assert.ok(firstResult.meeting, 'Should have meeting object')
      assert.ok(typeof firstResult.rank === 'number', 'Should have rank')
      assert.ok(typeof firstResult.snippet === 'string', 'Should have snippet')

      assert.ok(firstResult.transcript.id, 'Transcript should have id')
      assert.ok(firstResult.transcript.meeting_id, 'Transcript should have meeting_id')
      assert.ok(firstResult.transcript.text, 'Transcript should have text')

      assert.ok(firstResult.meeting.id, 'Meeting should have id')
      assert.ok(firstResult.meeting.title, 'Meeting should have title')
    })

    it('should return results with highlighted snippets', () => {
      const results = searchTranscripts('budget')

      assert.ok(results.length > 0, 'Should find results')
      const firstResult = results[0]
      assert.ok(firstResult, 'Should have first result')
      assert.ok(firstResult.snippet.includes('<mark>'), 'Snippet should have opening mark tag')
      assert.ok(firstResult.snippet.includes('</mark>'), 'Snippet should have closing mark tag')
    })

    it('should return results ordered by relevance', () => {
      const results = searchTranscripts('development')

      assert.ok(results.length > 0, 'Should find results')

      // Verify ranks are in descending order (lower rank = more relevant)
      for (let i = 1; i < results.length; i++) {
        const current = results[i]
        const previous = results[i - 1]
        assert.ok(current && previous, 'Results should exist')
        assert.ok(
          current.rank >= previous.rank,
          'Results should be ordered by rank (most relevant first)'
        )
      }
    })

    it('should respect limit parameter', () => {
      const limit = 5
      const results = searchTranscripts('the', { limit })

      assert.ok(results.length <= limit, `Should return at most ${limit} results`)
    })

    it('should filter by meeting ID correctly', () => {
      const targetMeetingId = meetingIds[0]
      const results = searchTranscripts('the', { meetingId: targetMeetingId })

      assert.ok(results.length > 0, 'Should find results')
      assert.ok(
        results.every(r => r.meeting.id === targetMeetingId),
        'All results should be from the specified meeting'
      )
    })
  })

  describe('Performance Summary', () => {
    it('should generate performance report', () => {
      const testCases = [
        { name: 'Single word', query: 'budget' },
        { name: 'Phrase', query: 'frontend development' },
        { name: 'Wildcard', query: 'develop*' },
        { name: 'Common word', query: 'the' },
        { name: 'Rare word', query: 'optimization' },
      ]

      console.log('\n  Performance Summary:')
      console.log('  ' + '='.repeat(60))
      console.log(`  Target: <${PERFORMANCE_TARGET_MS}ms per search`)
      console.log(`  Dataset: ${TRANSCRIPT_COUNT} transcripts across ${meetingIds.length} meetings`)
      console.log('  ' + '='.repeat(60))

      const durations: number[] = []

      for (const testCase of testCases) {
        const startTime = performance.now()
        const results = searchTranscripts(testCase.query)
        const endTime = performance.now()
        const duration = endTime - startTime
        durations.push(duration)

        const status = duration < PERFORMANCE_TARGET_MS ? '✅' : '❌'
        console.log(
          `  ${status} ${testCase.name.padEnd(20)} ${duration.toFixed(2)}ms (${results.length} results)`
        )
      }

      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length
      const minDuration = Math.min(...durations)
      const maxDuration = Math.max(...durations)

      console.log('  ' + '='.repeat(60))
      console.log(`  Average: ${avgDuration.toFixed(2)}ms`)
      console.log(`  Min: ${minDuration.toFixed(2)}ms`)
      console.log(`  Max: ${maxDuration.toFixed(2)}ms`)
      console.log('  ' + '='.repeat(60))

      // All searches should be under target
      assert.ok(
        maxDuration < PERFORMANCE_TARGET_MS,
        `Maximum search time ${maxDuration.toFixed(2)}ms exceeds target of ${PERFORMANCE_TARGET_MS}ms`
      )
    })
  })
})
