/**
 * Transcript Service
 *
 * Manages transcript creation and storage.
 * Integrates ASR output with database persistence.
 */

import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'
import {
  createTranscript,
  createTranscripts,
  getTranscriptsByMeetingId,
  getTranscriptContext,
} from '../database/crud/transcripts'
import type { CreateTranscriptInput, Transcript, Word } from '../../types/database'
import { Logger } from './Logger'
const log = Logger.create('TranscriptService')

// Cache dynamic imports to avoid re-resolving per segment
let _embeddingMod: typeof import('./LocalEmbeddingService') | null = null
let _dbMod: typeof import('../database/connection') | null = null

interface TranscriptSegment {
  text: string
  start: number
  end: number
  confidence: number
  speakerId?: string
  speakerName?: string
  words?: Array<{
    word: string
    start: number
    end: number
    confidence: number
  }>
}

interface SaveTranscriptOptions {
  meetingId: string
  segment: TranscriptSegment
}

interface SaveTranscriptsOptions {
  meetingId: string
  segments: TranscriptSegment[]
}

export class TranscriptService extends EventEmitter {
  constructor() {
    super()
  }

  /**
   * Save a single transcript segment to the database
   */
  saveTranscript(options: SaveTranscriptOptions): Transcript {
    const { meetingId, segment } = options

    const input: CreateTranscriptInput = {
      id: uuidv4(),
      meeting_id: meetingId,
      start_time: segment.start,
      end_time: segment.end,
      text: segment.text,
      confidence: segment.confidence,
      speaker_id: segment.speakerId,
      speaker_name: segment.speakerName,
      words: segment.words,
    }

    const transcript = createTranscript(input)

    // Emit event for real-time updates
    this.emit('transcript', {
      meetingId,
      transcriptId: transcript.id,
      text: transcript.text,
      startTime: transcript.start_time,
      endTime: transcript.end_time,
      confidence: transcript.confidence,
      speakerId: transcript.speaker_id,
      speakerName: transcript.speaker_name,
    })

    log.info(
      `[Transcript Service] Saved transcript: ${transcript.text.substring(0, 50)}... (${transcript.start_time.toFixed(1)}s - ${transcript.end_time.toFixed(1)}s)`
    )

    // Generate embedding asynchronously (fire-and-forget, non-blocking)
    // FIX: Added .catch() — previously async errors were silently swallowed
    this.generateEmbeddingAsync(transcript.id, transcript.text).catch(err =>
      log.debug('Embedding generation failed (non-critical):', err)
    )

    return transcript
  }

  /**
   * Generate and store embedding for a transcript (non-blocking)
   * Stores as BLOB (Float32Array binary) in embedding_blob column for ~4× disk savings
   */
  private async generateEmbeddingAsync(transcriptId: string, text: string): Promise<void> {
    try {
      if (!_embeddingMod) {
        _embeddingMod = await import('./LocalEmbeddingService')
      }
      const embeddingService = _embeddingMod.getLocalEmbeddingService()

      const result = await embeddingService.embed(text)
      if (!_dbMod) {
        _dbMod = await import('../database/connection')
      }
      const db = _dbMod.getDatabase()

      // Store as raw Float32Array binary (BLOB) instead of JSON text
      const buffer = Buffer.from(new Float32Array(result.embedding).buffer)
      db.prepare('UPDATE transcripts SET embedding_blob = ? WHERE id = ?').run(buffer, transcriptId)

      log.debug(`Embedding generated for transcript ${transcriptId}`)
    } catch {
      // Non-critical — embeddings will be generated on next search if missing
    }
  }

  /**
   * Save multiple transcript segments in a transaction
   */
  saveTranscripts(options: SaveTranscriptsOptions): Transcript[] {
    const { meetingId, segments } = options

    const inputs: CreateTranscriptInput[] = segments.map(segment => ({
      id: uuidv4(),
      meeting_id: meetingId,
      start_time: segment.start,
      end_time: segment.end,
      text: segment.text,
      confidence: segment.confidence,
      speaker_id: segment.speakerId,
      speaker_name: segment.speakerName,
      words: segment.words,
    }))

    const transcripts = createTranscripts(inputs)

    // Emit events for each transcript
    transcripts.forEach(transcript => {
      this.emit('transcript', {
        meetingId,
        transcriptId: transcript.id,
        text: transcript.text,
        startTime: transcript.start_time,
        endTime: transcript.end_time,
        confidence: transcript.confidence,
        speakerId: transcript.speaker_id,
        speakerName: transcript.speaker_name,
      })
    })

    log.info(
      `[Transcript Service] Saved ${transcripts.length} transcripts for meeting ${meetingId}`
    )

    // Generate embeddings for batch-saved transcripts (fire-and-forget, non-blocking)
    // FIX: Added .catch() — previously async errors were silently swallowed
    for (const transcript of transcripts) {
      this.generateEmbeddingAsync(transcript.id, transcript.text).catch(err =>
        log.debug('Batch embedding failed (non-critical):', err)
      )
    }

    return transcripts
  }

  /**
   * Get all transcripts for a meeting
   */
  getTranscripts(meetingId: string): Transcript[] {
    return getTranscriptsByMeetingId(meetingId)
  }

  /**
   * Get transcript context around a timestamp
   * Used for note expansion
   */
  getContext(
    meetingId: string,
    timestamp: number,
    beforeSeconds: number = 60,
    afterSeconds: number = 10
  ): {
    transcripts: Transcript[]
    contextText: string
    startTime: number
    endTime: number
  } {
    const transcripts = getTranscriptContext(meetingId, timestamp, beforeSeconds, afterSeconds)

    // Build context text
    const contextText = transcripts
      .map(t => {
        const speaker = t.speaker_name || t.speaker_id || 'Speaker'
        return `[${speaker}]: ${t.text}`
      })
      .join('\n')

    const startTime =
      transcripts.length > 0
        ? (transcripts[0]?.start_time ?? timestamp - beforeSeconds)
        : timestamp - beforeSeconds
    const endTime =
      transcripts.length > 0
        ? (transcripts[transcripts.length - 1]?.end_time ?? timestamp + afterSeconds)
        : timestamp + afterSeconds

    return {
      transcripts,
      contextText,
      startTime,
      endTime,
    }
  }

  /**
   * Parse words from JSON string
   */
  parseWords(wordsJson: string | null): Word[] | undefined {
    if (!wordsJson) return undefined

    try {
      return JSON.parse(wordsJson)
    } catch (error) {
      log.error('[Transcript Service] Failed to parse words JSON:', error)
      return undefined
    }
  }
}

// Singleton instance
let transcriptServiceInstance: TranscriptService | null = null

export function getTranscriptService(): TranscriptService {
  if (!transcriptServiceInstance) {
    transcriptServiceInstance = new TranscriptService()
  }
  return transcriptServiceInstance
}
