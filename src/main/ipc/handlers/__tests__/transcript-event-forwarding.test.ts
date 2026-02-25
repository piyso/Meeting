/**
 * Tests for Transcript Event Forwarding
 *
 * Verifies that transcript events from TranscriptService are correctly
 * forwarded to the renderer process via IPC.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { EventEmitter } from 'events'
import type { TranscriptChunk } from '../../../../types/ipc'

// Mock Electron
const mockWebContents = {
  send: vi.fn(),
}

const mockMainWindow = {
  webContents: mockWebContents,
  isDestroyed: vi.fn(() => false),
}

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
  BrowserWindow: vi.fn(),
}))

// Mock getMainWindow
vi.mock('../../../../electron/main', () => ({
  getMainWindow: vi.fn(() => mockMainWindow),
}))

// Mock TranscriptService
class MockTranscriptService extends EventEmitter {
  getTranscripts = vi.fn()
  getContext = vi.fn()
}

let mockTranscriptService: MockTranscriptService

vi.mock('../../../services/TranscriptService', () => ({
  getTranscriptService: () => mockTranscriptService,
}))

// Mock database functions
vi.mock('../../../database/crud/transcripts', () => ({
  updateTranscript: vi.fn(),
  getTranscriptsByTimeRange: vi.fn(() => []),
  getTranscriptsBySpeaker: vi.fn(() => []),
}))

describe('Transcript Event Forwarding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTranscriptService = new MockTranscriptService()
  })

  afterEach(() => {
    mockTranscriptService.removeAllListeners()
  })

  it('should forward transcript events to renderer', async () => {
    // Import after mocks are set up
    const { registerTranscriptHandlers } = await import('../transcript.handlers')

    // Register handlers (this sets up event forwarding)
    registerTranscriptHandlers()

    // Emit a transcript event
    const transcriptData = {
      meetingId: 'meeting-123',
      transcriptId: 'transcript-456',
      text: 'Hello, this is a test transcript',
      startTime: 10.5,
      endTime: 15.2,
      confidence: 0.95,
      speakerId: 'speaker-1',
      speakerName: 'John Doe',
    }

    mockTranscriptService.emit('transcript', transcriptData)

    // Verify event was sent to renderer
    expect(mockWebContents.send).toHaveBeenCalledTimes(1)
    expect(mockWebContents.send).toHaveBeenCalledWith('event:transcriptChunk', {
      meetingId: 'meeting-123',
      transcriptId: 'transcript-456',
      text: 'Hello, this is a test transcript',
      startTime: 10.5,
      endTime: 15.2,
      confidence: 0.95,
      speakerId: 'speaker-1',
      isFinal: true,
    } as TranscriptChunk)
  })

  it('should handle missing speakerId gracefully', async () => {
    const { registerTranscriptHandlers } = await import('../transcript.handlers')
    registerTranscriptHandlers()

    const transcriptData = {
      meetingId: 'meeting-123',
      transcriptId: 'transcript-456',
      text: 'Test without speaker',
      startTime: 0,
      endTime: 5,
      confidence: 0.9,
    }

    mockTranscriptService.emit('transcript', transcriptData)

    expect(mockWebContents.send).toHaveBeenCalledWith('event:transcriptChunk', {
      meetingId: 'meeting-123',
      transcriptId: 'transcript-456',
      text: 'Test without speaker',
      startTime: 0,
      endTime: 5,
      confidence: 0.9,
      speakerId: null,
      isFinal: true,
    })
  })

  it('should not send events when window is destroyed', async () => {
    const { registerTranscriptHandlers } = await import('../transcript.handlers')
    registerTranscriptHandlers()

    // Mock window as destroyed
    mockMainWindow.isDestroyed = vi.fn(() => true)

    const transcriptData = {
      meetingId: 'meeting-123',
      transcriptId: 'transcript-456',
      text: 'Test',
      startTime: 0,
      endTime: 5,
      confidence: 0.9,
    }

    mockTranscriptService.emit('transcript', transcriptData)

    // Should not send event
    expect(mockWebContents.send).not.toHaveBeenCalled()
  })

  it('should not send events when window is null', async () => {
    const { registerTranscriptHandlers } = await import('../transcript.handlers')

    // Mock getMainWindow to return null
    const { getMainWindow } = await import('../../../../electron/main')
    vi.mocked(getMainWindow).mockReturnValue(null)

    registerTranscriptHandlers()

    const transcriptData = {
      meetingId: 'meeting-123',
      transcriptId: 'transcript-456',
      text: 'Test',
      startTime: 0,
      endTime: 5,
      confidence: 0.9,
    }

    mockTranscriptService.emit('transcript', transcriptData)

    // Should not send event
    expect(mockWebContents.send).not.toHaveBeenCalled()
  })

  it('should forward multiple transcript events', async () => {
    const { registerTranscriptHandlers } = await import('../transcript.handlers')
    registerTranscriptHandlers()

    // Emit multiple events
    for (let i = 0; i < 5; i++) {
      mockTranscriptService.emit('transcript', {
        meetingId: 'meeting-123',
        transcriptId: `transcript-${i}`,
        text: `Transcript ${i}`,
        startTime: i * 10,
        endTime: (i + 1) * 10,
        confidence: 0.9,
      })
    }

    // Verify all events were sent
    expect(mockWebContents.send).toHaveBeenCalledTimes(5)
  })

  it('should set isFinal to true for all saved transcripts', async () => {
    const { registerTranscriptHandlers } = await import('../transcript.handlers')
    registerTranscriptHandlers()

    mockTranscriptService.emit('transcript', {
      meetingId: 'meeting-123',
      transcriptId: 'transcript-456',
      text: 'Final transcript',
      startTime: 0,
      endTime: 5,
      confidence: 0.95,
    })

    const sentChunk = mockWebContents.send.mock.calls[0][1] as TranscriptChunk
    expect(sentChunk.isFinal).toBe(true)
  })
})
