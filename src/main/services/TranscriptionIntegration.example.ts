/**
 * Example: Integrating TranscriptService with ASR Service
 *
 * This file demonstrates how to connect the ASR service output
 * to the TranscriptService for database persistence.
 */

import { getASRService } from './ASRService'
import { getTranscriptService } from './TranscriptService'
import { getCloudTranscriptionService } from './CloudTranscriptionService'

/**
 * Example: Process audio and save transcripts to database
 */
export async function processAudioWithTranscription(
  meetingId: string,
  audioBuffer: Float32Array,
  useCloud: boolean = false
): Promise<void> {
  const transcriptService = getTranscriptService()

  try {
    if (useCloud) {
      // Use cloud transcription
      const cloudService = getCloudTranscriptionService()

      if (!cloudService.isEnabled()) {
        throw new Error('Cloud transcription not enabled')
      }

      const segments = await cloudService.transcribe(audioBuffer)

      // Save all segments to database
      const savedTranscripts = transcriptService.saveTranscripts({
        meetingId,
        segments: segments.map(seg => ({
          text: seg.text,
          start: seg.start,
          end: seg.end,
          confidence: seg.confidence,
          words: seg.words,
        })),
      })

      console.log(`Saved ${savedTranscripts.length} cloud transcripts to database`)
    } else {
      // Use local ASR
      const asrService = getASRService()

      const result = await asrService.transcribe(audioBuffer)

      // Save all segments to database
      const savedTranscripts = transcriptService.saveTranscripts({
        meetingId,
        segments: result.segments.map(seg => ({
          text: seg.text,
          start: seg.start,
          end: seg.end,
          confidence: seg.confidence,
          words: seg.words,
        })),
      })

      console.log(`Saved ${savedTranscripts.length} local transcripts to database`)
    }
  } catch (error) {
    console.error('Failed to process audio with transcription:', error)
    throw error
  }
}

/**
 * Example: Listen for real-time transcript events
 */
export function setupTranscriptEventListener(): void {
  const transcriptService = getTranscriptService()

  // Listen for new transcripts
  transcriptService.on('transcript', event => {
    console.log(`New transcript for meeting ${event.meetingId}:`)
    console.log(`  Time: ${event.startTime.toFixed(1)}s - ${event.endTime.toFixed(1)}s`)
    console.log(`  Text: ${event.text}`)
    console.log(`  Confidence: ${(event.confidence * 100).toFixed(1)}%`)

    if (event.speakerName) {
      console.log(`  Speaker: ${event.speakerName}`)
    }

    // You can emit this to the renderer process via IPC
    // to update the UI in real-time
  })
}

/**
 * Example: Retrieve transcripts for display
 */
export function getTranscriptsForDisplay(meetingId: string): Array<{
  id: string
  text: string
  startTime: number
  endTime: number
  speaker: string
  confidence: number
}> {
  const transcriptService = getTranscriptService()
  const transcripts = transcriptService.getTranscripts(meetingId)

  return transcripts.map(t => ({
    id: t.id,
    text: t.text,
    startTime: t.start_time,
    endTime: t.end_time,
    speaker: t.speaker_name || t.speaker_id || 'Unknown',
    confidence: t.confidence || 0,
  }))
}

/**
 * Example: Get context for note expansion
 */
export function getContextForNoteExpansion(
  meetingId: string,
  noteTimestamp: number
): {
  contextText: string
  transcripts: Array<{ text: string; speaker: string; time: number }>
} {
  const transcriptService = getTranscriptService()

  // Get 60 seconds before and 10 seconds after the note
  const context = transcriptService.getContext(meetingId, noteTimestamp, 60, 10)

  return {
    contextText: context.contextText,
    transcripts: context.transcripts.map(t => ({
      text: t.text,
      speaker: t.speaker_name || t.speaker_id || 'Unknown',
      time: t.start_time,
    })),
  }
}

/**
 * Example: Stream transcripts in real-time during a meeting
 */
export class RealTimeTranscriptionHandler {
  private meetingId: string
  private transcriptService = getTranscriptService()
  private asrService = getASRService()
  private audioChunks: Float32Array[] = []
  private readonly CHUNK_SIZE_SECONDS = 10
  private readonly SAMPLE_RATE = 16000

  constructor(meetingId: string) {
    this.meetingId = meetingId
  }

  /**
   * Add audio data to the buffer
   */
  addAudioData(audioData: Float32Array): void {
    this.audioChunks.push(audioData)

    // Check if we have enough audio for transcription (10 seconds)
    const totalSamples = this.audioChunks.reduce((sum, chunk) => sum + chunk.length, 0)
    const totalSeconds = totalSamples / this.SAMPLE_RATE

    if (totalSeconds >= this.CHUNK_SIZE_SECONDS) {
      this.processChunk()
    }
  }

  /**
   * Process accumulated audio chunk
   */
  private async processChunk(): Promise<void> {
    if (this.audioChunks.length === 0) return

    // Combine all chunks into a single buffer
    const totalLength = this.audioChunks.reduce((sum, chunk) => sum + chunk.length, 0)
    const combinedBuffer = new Float32Array(totalLength)

    let offset = 0
    for (const chunk of this.audioChunks) {
      combinedBuffer.set(chunk, offset)
      offset += chunk.length
    }

    // Clear the buffer
    this.audioChunks = []

    try {
      // Transcribe the chunk
      const result = await this.asrService.transcribe(combinedBuffer)

      // Save to database
      if (result.segments.length > 0) {
        this.transcriptService.saveTranscripts({
          meetingId: this.meetingId,
          segments: result.segments.map(seg => ({
            text: seg.text,
            start: seg.start,
            end: seg.end,
            confidence: seg.confidence,
            words: seg.words,
          })),
        })
      }
    } catch (error) {
      console.error('Failed to process audio chunk:', error)
    }
  }

  /**
   * Flush any remaining audio
   */
  async flush(): Promise<void> {
    if (this.audioChunks.length > 0) {
      await this.processChunk()
    }
  }
}
