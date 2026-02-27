/**
 * Tests for TranscriptService
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { TranscriptService } from '../TranscriptService'
import { initializeDatabase, closeDatabase } from '../../database/connection'
import { createMeeting } from '../../database/crud/meetings'
import { v4 as uuidv4 } from 'uuid'

describe('TranscriptService', () => {
  let service: TranscriptService
  let testMeetingId: string

  beforeEach(() => {
    // Initialize in-memory database for testing
    initializeDatabase(':memory:' as any)

    // Create a test meeting
    const meeting = createMeeting({
      id: uuidv4(),
      title: 'Test Meeting',
      start_time: Date.now(),
    })
    testMeetingId = meeting.id

    // Create service instance
    service = new TranscriptService()
  })

  afterEach(() => {
    closeDatabase()
  })

  describe('saveTranscript', () => {
    it('should save a single transcript segment', () => {
      const segment = {
        text: 'Hello, this is a test transcript.',
        start: 0.0,
        end: 2.5,
        confidence: 0.95,
        speakerId: 'speaker_1',
        speakerName: 'John Doe',
        words: [
          { word: 'Hello', start: 0.0, end: 0.5, confidence: 0.98 },
          { word: 'this', start: 0.6, end: 0.8, confidence: 0.96 },
          { word: 'is', start: 0.9, end: 1.0, confidence: 0.97 },
          { word: 'a', start: 1.1, end: 1.2, confidence: 0.95 },
          { word: 'test', start: 1.3, end: 1.6, confidence: 0.94 },
          { word: 'transcript', start: 1.7, end: 2.5, confidence: 0.93 },
        ],
      }

      const transcript = service.saveTranscript({
        meetingId: testMeetingId,
        segment,
      })

      expect(transcript).toBeDefined()
      expect(transcript.meeting_id).toBe(testMeetingId)
      expect(transcript.text).toBe(segment.text)
      expect(transcript.start_time).toBe(segment.start)
      expect(transcript.end_time).toBe(segment.end)
      expect(transcript.confidence).toBe(segment.confidence)
      expect(transcript.speaker_id).toBe(segment.speakerId)
      expect(transcript.speaker_name).toBe(segment.speakerName)
      expect(transcript.words).toBeDefined()
    })

    it('should emit transcript event when saving', () => {
      return new Promise<void>(resolve => {
        const segment = {
          text: 'Test transcript for event emission.',
          start: 0.0,
          end: 2.0,
          confidence: 0.9,
        }

        service.once('transcript', event => {
          expect(event.meetingId).toBe(testMeetingId)
          expect(event.text).toBe(segment.text)
          expect(event.startTime).toBe(segment.start)
          expect(event.endTime).toBe(segment.end)
          resolve()
        })

        service.saveTranscript({
          meetingId: testMeetingId,
          segment,
        })
      })
    })

    it('should save transcript without optional fields', () => {
      const segment = {
        text: 'Minimal transcript.',
        start: 0.0,
        end: 1.5,
        confidence: 0.85,
      }

      const transcript = service.saveTranscript({
        meetingId: testMeetingId,
        segment,
      })

      expect(transcript).toBeDefined()
      expect(transcript.speaker_id).toBeNull()
      expect(transcript.speaker_name).toBeNull()
      expect(transcript.words).toBeNull()
    })
  })

  describe('saveTranscripts', () => {
    it('should save multiple transcript segments in a transaction', () => {
      const segments = [
        {
          text: 'First segment.',
          start: 0.0,
          end: 1.5,
          confidence: 0.95,
          speakerId: 'speaker_1',
        },
        {
          text: 'Second segment.',
          start: 1.6,
          end: 3.2,
          confidence: 0.92,
          speakerId: 'speaker_2',
        },
        {
          text: 'Third segment.',
          start: 3.3,
          end: 5.0,
          confidence: 0.88,
          speakerId: 'speaker_1',
        },
      ]

      const transcripts = service.saveTranscripts({
        meetingId: testMeetingId,
        segments,
      })

      expect(transcripts).toHaveLength(3)
      expect(transcripts[0]!.text).toBe('First segment.')
      expect(transcripts[1]!.text).toBe('Second segment.')
      expect(transcripts[2]!.text).toBe('Third segment.')
    })

    it('should emit events for all saved transcripts', () => {
      const segments = [
        { text: 'First.', start: 0.0, end: 1.0, confidence: 0.9 },
        { text: 'Second.', start: 1.1, end: 2.0, confidence: 0.9 },
      ]

      const events: any[] = []
      service.on('transcript', event => {
        events.push(event)
      })

      service.saveTranscripts({
        meetingId: testMeetingId,
        segments,
      })

      expect(events).toHaveLength(2)
      expect(events[0]!.text).toBe('First.')
      expect(events[1]!.text).toBe('Second.')
    })
  })

  describe('getTranscripts', () => {
    it('should retrieve all transcripts for a meeting', () => {
      // Save some transcripts
      const segments = [
        { text: 'First.', start: 0.0, end: 1.0, confidence: 0.9 },
        { text: 'Second.', start: 1.1, end: 2.0, confidence: 0.9 },
        { text: 'Third.', start: 2.1, end: 3.0, confidence: 0.9 },
      ]

      service.saveTranscripts({
        meetingId: testMeetingId,
        segments,
      })

      // Retrieve transcripts
      const transcripts = service.getTranscripts(testMeetingId)

      expect(transcripts).toHaveLength(3)
      expect(transcripts[0]!.text).toBe('First.')
      expect(transcripts[1]!.text).toBe('Second.')
      expect(transcripts[2]!.text).toBe('Third.')
    })

    it('should return empty array for meeting with no transcripts', () => {
      const transcripts = service.getTranscripts(testMeetingId)
      expect(transcripts).toHaveLength(0)
    })
  })

  describe('getContext', () => {
    beforeEach(() => {
      // Save transcripts at various timestamps
      const segments = [
        { text: 'At 10 seconds.', start: 10.0, end: 12.0, confidence: 0.9, speakerId: 'speaker_1' },
        { text: 'At 30 seconds.', start: 30.0, end: 32.0, confidence: 0.9, speakerId: 'speaker_2' },
        { text: 'At 50 seconds.', start: 50.0, end: 52.0, confidence: 0.9, speakerId: 'speaker_1' },
        { text: 'At 70 seconds.', start: 70.0, end: 72.0, confidence: 0.9, speakerId: 'speaker_2' },
        { text: 'At 90 seconds.', start: 90.0, end: 92.0, confidence: 0.9, speakerId: 'speaker_1' },
      ]

      service.saveTranscripts({
        meetingId: testMeetingId,
        segments,
      })
    })

    it('should get context window around a timestamp', () => {
      // Get context around 70 seconds (default: -60s to +10s)
      const context = service.getContext(testMeetingId, 70.0)

      expect(context.transcripts.length).toBeGreaterThan(0)
      expect(context.startTime).toBeLessThanOrEqual(70.0)
      expect(context.endTime).toBeGreaterThanOrEqual(70.0)
      expect(context.contextText).toContain('At 50 seconds')
      expect(context.contextText).toContain('At 70 seconds')
    })

    it('should respect custom before/after seconds', () => {
      // Get context around 50 seconds with custom window (-20s to +20s)
      const context = service.getContext(testMeetingId, 50.0, 20, 20)

      expect(context.transcripts.length).toBeGreaterThan(0)
      expect(context.contextText).toContain('At 30 seconds')
      expect(context.contextText).toContain('At 50 seconds')
      expect(context.contextText).toContain('At 70 seconds')
    })

    it('should format context text with speaker labels', () => {
      const context = service.getContext(testMeetingId, 50.0, 30, 30)

      expect(context.contextText).toContain('[speaker_1]:')
      expect(context.contextText).toContain('[speaker_2]:')
    })

    it('should handle timestamp with no nearby transcripts', () => {
      const context = service.getContext(testMeetingId, 200.0)

      expect(context.transcripts).toHaveLength(0)
      expect(context.contextText).toBe('')
    })
  })

  describe('integration with database', () => {
    it('should persist transcripts across service instances', () => {
      // Save with first instance
      const segment = {
        text: 'Persistent transcript.',
        start: 0.0,
        end: 2.0,
        confidence: 0.9,
      }

      service.saveTranscript({
        meetingId: testMeetingId,
        segment,
      })

      // Create new instance and retrieve
      const newService = new TranscriptService()
      const transcripts = newService.getTranscripts(testMeetingId)

      expect(transcripts).toHaveLength(1)
      expect(transcripts[0]!.text).toBe('Persistent transcript.')
    })

    it('should maintain referential integrity with meetings', () => {
      const segment = {
        text: 'Test transcript.',
        start: 0.0,
        end: 1.0,
        confidence: 0.9,
      }

      service.saveTranscript({
        meetingId: testMeetingId,
        segment,
      })

      const transcripts = service.getTranscripts(testMeetingId)
      expect(transcripts[0]!.meeting_id).toBe(testMeetingId)
    })
  })
})
