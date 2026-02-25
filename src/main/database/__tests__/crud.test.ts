/**
 * Unit Tests for CRUD Operations
 *
 * Run with: node --test src/main/database/__tests__/crud.test.ts
 */

import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert'
import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { initializeDatabase, closeDatabase, getDatabase } from '../connection'
import {
  createMeeting,
  getMeetingById,
  getAllMeetings,
  updateMeeting,
  deleteMeeting,
} from '../crud/meetings'
import {
  createTranscript,
  getTranscriptById,
  getTranscriptsByMeetingId,
  getTranscriptContext,
  deleteTranscript,
} from '../crud/transcripts'
import { createNote, getNoteById, getNotesByMeetingId, updateNote, deleteNote } from '../crud/notes'
import { createEntity, getEntitiesByType, deleteEntity } from '../crud/entities'

describe('CRUD Operations', () => {
  const testDbPath = path.join(__dirname, 'test-crud.db')

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

  describe('Meetings CRUD', () => {
    it('should create a meeting', () => {
      const meetingId = uuidv4()
      const meeting = createMeeting({
        id: meetingId,
        title: 'Test Meeting',
        start_time: Date.now(),
        tags: ['test', 'demo'],
      })

      assert.strictEqual(meeting.id, meetingId)
      assert.strictEqual(meeting.title, 'Test Meeting')
      assert.strictEqual(meeting.namespace, 'default')
    })

    it('should get meeting by ID', () => {
      const meetingId = uuidv4()
      createMeeting({
        id: meetingId,
        title: 'Get Test',
        start_time: Date.now(),
      })

      const meeting = getMeetingById(meetingId)
      assert.ok(meeting)
      assert.strictEqual(meeting.id, meetingId)
      assert.strictEqual(meeting.title, 'Get Test')
    })

    it('should update meeting', () => {
      const meetingId = uuidv4()
      createMeeting({
        id: meetingId,
        title: 'Original Title',
        start_time: Date.now(),
      })

      const updated = updateMeeting(meetingId, {
        title: 'Updated Title',
        duration: 3600,
      })

      assert.ok(updated)
      assert.strictEqual(updated.title, 'Updated Title')
      assert.strictEqual(updated.duration, 3600)
    })

    it('should delete meeting', () => {
      const meetingId = uuidv4()
      createMeeting({
        id: meetingId,
        title: 'To Delete',
        start_time: Date.now(),
      })

      const deleted = deleteMeeting(meetingId)
      assert.strictEqual(deleted, true)

      const meeting = getMeetingById(meetingId)
      assert.strictEqual(meeting, null)
    })

    it('should get all meetings', () => {
      const meetings = getAllMeetings({ limit: 10 })
      assert.ok(Array.isArray(meetings))
      assert.ok(meetings.length > 0)
    })
  })

  describe('Transcripts CRUD', () => {
    let testMeetingId: string

    beforeEach(() => {
      testMeetingId = uuidv4()
      createMeeting({
        id: testMeetingId,
        title: 'Transcript Test Meeting',
        start_time: Date.now(),
      })
    })

    it('should create a transcript', () => {
      const transcriptId = uuidv4()
      const transcript = createTranscript({
        id: transcriptId,
        meeting_id: testMeetingId,
        start_time: 0,
        end_time: 10,
        text: 'Hello world',
        confidence: 0.95,
      })

      assert.strictEqual(transcript.id, transcriptId)
      assert.strictEqual(transcript.meeting_id, testMeetingId)
      assert.strictEqual(transcript.text, 'Hello world')
    })

    it('should get transcripts by meeting ID', () => {
      const t1 = uuidv4()
      const t2 = uuidv4()

      createTranscript({
        id: t1,
        meeting_id: testMeetingId,
        start_time: 0,
        end_time: 10,
        text: 'First transcript',
      })

      createTranscript({
        id: t2,
        meeting_id: testMeetingId,
        start_time: 10,
        end_time: 20,
        text: 'Second transcript',
      })

      const transcripts = getTranscriptsByMeetingId(testMeetingId)
      assert.strictEqual(transcripts.length, 2)
      assert.strictEqual(transcripts[0].text, 'First transcript')
      assert.strictEqual(transcripts[1].text, 'Second transcript')
    })

    it('should get transcript context window', () => {
      // Create transcripts at different times
      for (let i = 0; i < 10; i++) {
        createTranscript({
          id: uuidv4(),
          meeting_id: testMeetingId,
          start_time: i * 10,
          end_time: (i + 1) * 10,
          text: `Transcript ${i}`,
        })
      }

      // Get context around timestamp 50 (±30 seconds)
      const context = getTranscriptContext(testMeetingId, 50, 30, 30)

      assert.ok(context.length > 0)
      assert.ok(context.some(t => t.start_time <= 50 && t.end_time >= 50))
    })

    it('should delete transcript', () => {
      const transcriptId = uuidv4()
      createTranscript({
        id: transcriptId,
        meeting_id: testMeetingId,
        start_time: 0,
        end_time: 10,
        text: 'To delete',
      })

      const deleted = deleteTranscript(transcriptId)
      assert.strictEqual(deleted, true)

      const transcript = getTranscriptById(transcriptId)
      assert.strictEqual(transcript, null)
    })
  })

  describe('Notes CRUD', () => {
    let testMeetingId: string

    beforeEach(() => {
      testMeetingId = uuidv4()
      createMeeting({
        id: testMeetingId,
        title: 'Notes Test Meeting',
        start_time: Date.now(),
      })
    })

    it('should create a note', () => {
      const noteId = uuidv4()
      const note = createNote({
        id: noteId,
        meeting_id: testMeetingId,
        timestamp: 30,
        original_text: 'Important point',
      })

      assert.strictEqual(note.id, noteId)
      assert.strictEqual(note.original_text, 'Important point')
      assert.strictEqual(note.is_augmented, false)
    })

    it('should update note with augmentation', () => {
      const noteId = uuidv4()
      createNote({
        id: noteId,
        meeting_id: testMeetingId,
        timestamp: 30,
        original_text: 'Budget cuts',
      })

      const updated = updateNote(noteId, {
        augmented_text: 'The team discussed budget cuts for Q2 2024',
        is_augmented: true,
      })

      assert.ok(updated)
      assert.strictEqual(updated.is_augmented, true)
      assert.strictEqual(updated.augmented_text, 'The team discussed budget cuts for Q2 2024')
      assert.strictEqual(updated.version, 2)
    })

    it('should get notes by meeting ID', () => {
      createNote({
        id: uuidv4(),
        meeting_id: testMeetingId,
        timestamp: 10,
        original_text: 'Note 1',
      })

      createNote({
        id: uuidv4(),
        meeting_id: testMeetingId,
        timestamp: 20,
        original_text: 'Note 2',
      })

      const notes = getNotesByMeetingId(testMeetingId)
      assert.strictEqual(notes.length, 2)
    })

    it('should delete note', () => {
      const noteId = uuidv4()
      createNote({
        id: noteId,
        meeting_id: testMeetingId,
        timestamp: 30,
        original_text: 'To delete',
      })

      const deleted = deleteNote(noteId)
      assert.strictEqual(deleted, true)

      const note = getNoteById(noteId)
      assert.strictEqual(note, null)
    })
  })

  describe('Entities CRUD', () => {
    let testMeetingId: string

    beforeEach(() => {
      testMeetingId = uuidv4()
      createMeeting({
        id: testMeetingId,
        title: 'Entities Test Meeting',
        start_time: Date.now(),
      })
    })

    it('should create an entity', () => {
      const entityId = uuidv4()
      const entity = createEntity({
        id: entityId,
        meeting_id: testMeetingId,
        type: 'PERSON',
        text: 'John Doe',
        confidence: 0.9,
      })

      assert.strictEqual(entity.id, entityId)
      assert.strictEqual(entity.type, 'PERSON')
      assert.strictEqual(entity.text, 'John Doe')
    })

    it('should get entities by type', () => {
      createEntity({
        id: uuidv4(),
        meeting_id: testMeetingId,
        type: 'PERSON',
        text: 'Alice',
      })

      createEntity({
        id: uuidv4(),
        meeting_id: testMeetingId,
        type: 'PERSON',
        text: 'Bob',
      })

      createEntity({
        id: uuidv4(),
        meeting_id: testMeetingId,
        type: 'DATE',
        text: '2024-03-15',
      })

      const people = getEntitiesByType(testMeetingId, 'PERSON')
      assert.strictEqual(people.length, 2)

      const dates = getEntitiesByType(testMeetingId, 'DATE')
      assert.strictEqual(dates.length, 1)
    })

    it('should delete entity', () => {
      const entityId = uuidv4()
      createEntity({
        id: entityId,
        meeting_id: testMeetingId,
        type: 'TOPIC',
        text: 'AI',
      })

      const deleted = deleteEntity(entityId)
      assert.strictEqual(deleted, true)
    })
  })

  describe('Cascade Deletes', () => {
    it('should cascade delete transcripts when meeting is deleted', () => {
      const meetingId = uuidv4()
      createMeeting({
        id: meetingId,
        title: 'Cascade Test',
        start_time: Date.now(),
      })

      const transcriptId = uuidv4()
      createTranscript({
        id: transcriptId,
        meeting_id: meetingId,
        start_time: 0,
        end_time: 10,
        text: 'Test',
      })

      deleteMeeting(meetingId)

      const transcript = getTranscriptById(transcriptId)
      assert.strictEqual(transcript, null, 'Transcript should be deleted')
    })

    it('should cascade delete notes when meeting is deleted', () => {
      const meetingId = uuidv4()
      createMeeting({
        id: meetingId,
        title: 'Cascade Test',
        start_time: Date.now(),
      })

      const noteId = uuidv4()
      createNote({
        id: noteId,
        meeting_id: meetingId,
        timestamp: 30,
        original_text: 'Test note',
      })

      deleteMeeting(meetingId)

      const note = getNoteById(noteId)
      assert.strictEqual(note, null, 'Note should be deleted')
    })
  })
})
