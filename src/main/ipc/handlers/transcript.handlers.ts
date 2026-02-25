/**
 * IPC Handlers for Transcript Operations
 */

import { ipcMain, BrowserWindow } from 'electron'
import { getTranscriptService } from '../../services/TranscriptService'
import type {
  IPCResponse,
  GetTranscriptsParams,
  GetTranscriptContextParams,
  GetTranscriptContextResponse,
  UpdateSpeakerNameParams,
  TranscriptChunk,
} from '../../../types/ipc'
import type { Transcript } from '../../../types/database'
import { updateTranscript } from '../../database/crud/transcripts'

/**
 * Register all transcript-related IPC handlers
 */
export function registerTranscriptHandlers(): void {
  const transcriptService = getTranscriptService()

  // Forward transcript events to renderer
  setupTranscriptEventForwarding(transcriptService)

  /**
   * Get transcripts for a meeting
   */
  ipcMain.handle(
    'transcript:get',
    async (_, params: GetTranscriptsParams): Promise<IPCResponse<Transcript[]>> => {
      try {
        const { meetingId, startTime, endTime } = params

        let transcripts: Transcript[]

        if (startTime !== undefined && endTime !== undefined) {
          // Get transcripts in time range
          const { getTranscriptsByTimeRange } = await import('../../database/crud/transcripts')
          transcripts = getTranscriptsByTimeRange(meetingId, startTime, endTime)
        } else {
          // Get all transcripts
          transcripts = transcriptService.getTranscripts(meetingId)
        }

        return {
          success: true,
          data: transcripts,
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error('[IPC] transcript:get error:', error)
        return {
          success: false,
          error: {
            code: 'TRANSCRIPT_GET_ERROR',
            message: errorMessage,
            timestamp: Date.now(),
          },
        }
      }
    }
  )

  /**
   * Get transcript context around a timestamp
   */
  ipcMain.handle(
    'transcript:getContext',
    async (
      _,
      params: GetTranscriptContextParams
    ): Promise<IPCResponse<GetTranscriptContextResponse>> => {
      try {
        const { meetingId, timestamp, beforeSeconds, afterSeconds } = params

        const context = transcriptService.getContext(
          meetingId,
          timestamp,
          beforeSeconds,
          afterSeconds
        )

        return {
          success: true,
          data: context,
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error('[IPC] transcript:getContext error:', error)
        return {
          success: false,
          error: {
            code: 'TRANSCRIPT_GET_CONTEXT_ERROR',
            message: errorMessage,
            timestamp: Date.now(),
          },
        }
      }
    }
  )

  /**
   * Update speaker name for a transcript
   */
  ipcMain.handle(
    'transcript:updateSpeaker',
    async (_, params: UpdateSpeakerNameParams): Promise<IPCResponse<void>> => {
      try {
        const { speakerId, speakerName } = params

        // Update all transcripts with this speaker ID
        const { getTranscriptsBySpeaker } = await import('../../database/crud/transcripts')
        const transcripts = getTranscriptsBySpeaker('', speakerId)

        for (const transcript of transcripts) {
          updateTranscript(transcript.id, {
            speaker_name: speakerName,
          })
        }

        return {
          success: true,
          data: undefined,
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error('[IPC] transcript:updateSpeaker error:', error)
        return {
          success: false,
          error: {
            code: 'TRANSCRIPT_UPDATE_SPEAKER_ERROR',
            message: errorMessage,
            timestamp: Date.now(),
          },
        }
      }
    }
  )

  console.log('[IPC] Transcript handlers registered')
}

/**
 * Setup event forwarding from TranscriptService to renderer process
 */
function setupTranscriptEventForwarding(
  transcriptService: ReturnType<typeof getTranscriptService>
): void {
  transcriptService.on(
    'transcript',
    (data: {
      meetingId: string
      transcriptId: string
      text: string
      startTime: number
      endTime: number
      confidence: number
      speakerId?: string
      speakerName?: string
    }) => {
      // Get main window via Electron API (no circular imports)
      const windows = BrowserWindow.getAllWindows()
      const mainWindow: BrowserWindow | null = windows.length > 0 ? windows[0]! : null

      if (!mainWindow || mainWindow.isDestroyed()) {
        console.warn('[IPC] Cannot send transcript event: main window not available')
        return
      }

      // Transform to TranscriptChunk format expected by renderer
      const chunk: TranscriptChunk = {
        meetingId: data.meetingId,
        transcriptId: data.transcriptId,
        text: data.text,
        startTime: data.startTime,
        endTime: data.endTime,
        confidence: data.confidence,
        speakerId: data.speakerId || null,
        isFinal: true, // Transcripts saved to DB are always final
      }

      // Send to renderer via IPC event
      mainWindow.webContents.send('event:transcriptChunk', chunk)

      console.log(`[IPC] Forwarded transcript event to renderer: ${chunk.text.substring(0, 30)}...`)
    }
  )

  console.log('[IPC] Transcript event forwarding setup complete')
}
