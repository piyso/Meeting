/**
 * Meeting IPC Handlers
 *
 * Handles all meeting-related IPC requests from the renderer process.
 */

import { ipcMain } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { getDatabaseService } from '../../services/DatabaseService'
import type {
  IPCResponse,
  StartMeetingParams,
  StartMeetingResponse,
  StopMeetingParams,
  GetMeetingParams,
  ListMeetingsParams,
  UpdateMeetingParams,
  DeleteMeetingParams,
  ExportMeetingParams,
  ExportMeetingResponse,
  PaginatedResponse,
} from '../../../types/ipc'
import type { Meeting } from '../../../types/database'

// WAL passive checkpoint interval during active meetings (§2.5 blueprint)
let walCheckpointInterval: ReturnType<typeof setInterval> | null = null

/**
 * Register all meeting-related IPC handlers
 */
export function registerMeetingHandlers(): void {
  // Start a new meeting
  ipcMain.handle(
    'meeting:start',
    async (_event, params: StartMeetingParams): Promise<IPCResponse<StartMeetingResponse>> => {
      try {
        const db = getDatabaseService()

        // Create meeting record
        const meeting = db.createMeeting({
          id: uuidv4(),
          title: params.title || `Meeting - ${new Date().toLocaleString()}`,
          start_time: Math.floor(Date.now() / 1000),
          namespace: params.namespace || 'default',
        })

        // Get available audio devices via IPC (audio:listDevices handler)
        let audioDevices: any[] = []
        try {
          const { systemPreferences } = await import('electron')
          // Check for audio input devices (microphone)
          const hasMic = systemPreferences.getMediaAccessStatus('microphone') === 'granted'
          if (hasMic) {
            audioDevices.push({ type: 'microphone', available: true })
          }
          // Check for screen recording (system audio)
          const hasScreen = systemPreferences.getMediaAccessStatus('screen') === 'granted'
          if (hasScreen) {
            audioDevices.push({ type: 'system-audio', available: true })
          }
        } catch {
          // Permission check failed — non-critical
        }

        // Start passive WAL checkpoint every 10 minutes during recording
        // Blueprint §2.5: prevents multi-GB WAL files during long meetings
        if (walCheckpointInterval) clearInterval(walCheckpointInterval)
        walCheckpointInterval = setInterval(async () => {
          try {
            const { walCheckpoint } = await import('../../database/connection')
            walCheckpoint('PASSIVE')
          } catch { /* non-critical */ }
        }, 10 * 60 * 1000)

        return {
          success: true,
          data: {
            meeting,
            audioDevices,
          },
        }
      } catch (error) {
        console.error('Failed to start meeting:', error)
        return {
          success: false,
          error: {
            code: 'MEETING_START_FAILED',
            message: error instanceof Error ? error.message : 'Unknown error',
            details: error instanceof Error ? error.stack : undefined,
            timestamp: Date.now(),
          },
        }
      }
    }
  )

  // Stop a meeting
  ipcMain.handle(
    'meeting:stop',
    async (_event, params: StopMeetingParams): Promise<IPCResponse<void>> => {
      try {
        const db = getDatabaseService()
        const meeting = db.getMeeting(params.meetingId)

        if (!meeting) {
          throw new Error(`Meeting not found: ${params.meetingId}`)
        }

        const endTime = Math.floor(Date.now() / 1000)
        const duration = endTime - meeting.start_time

        db.updateMeeting(params.meetingId, {
          end_time: endTime,
          duration,
        })

        // Stop audio capture
        try {
          const { getAudioPipelineService } = await import('../../services/AudioPipelineService')
          await getAudioPipelineService().stopCapture()
        } catch (audioErr) {
          console.warn('[meeting:stop] Audio stop failed (may not have been recording):', audioErr)
        }

        // Stop passive WAL checkpoint interval
        if (walCheckpointInterval) {
          clearInterval(walCheckpointInterval)
          walCheckpointInterval = null
        }

        // WAL checkpoint: merge WAL file back + reclaim disk after recording
        try {
          const { walCheckpoint } = await import('../../database/connection')
          walCheckpoint('TRUNCATE')
        } catch {
          // Non-critical — WAL will auto-checkpoint eventually
        }

        return {
          success: true,
        }
      } catch (error) {
        console.error('Failed to stop meeting:', error)
        return {
          success: false,
          error: {
            code: 'MEETING_STOP_FAILED',
            message: error instanceof Error ? error.message : 'Unknown error',
            details: error instanceof Error ? error.stack : undefined,
            timestamp: Date.now(),
          },
        }
      }
    }
  )

  // Get a single meeting
  ipcMain.handle(
    'meeting:get',
    async (_event, params: GetMeetingParams): Promise<IPCResponse<Meeting>> => {
      try {
        const db = getDatabaseService()
        const meeting = db.getMeeting(params.meetingId)

        if (!meeting) {
          throw new Error(`Meeting not found: ${params.meetingId}`)
        }

        return {
          success: true,
          data: meeting,
        }
      } catch (error) {
        console.error('Failed to get meeting:', error)
        return {
          success: false,
          error: {
            code: 'MEETING_GET_FAILED',
            message: error instanceof Error ? error.message : 'Unknown error',
            details: error instanceof Error ? error.stack : undefined,
            timestamp: Date.now(),
          },
        }
      }
    }
  )

  // List meetings with pagination
  ipcMain.handle(
    'meeting:list',
    async (
      _event,
      params: ListMeetingsParams
    ): Promise<IPCResponse<PaginatedResponse<Meeting>>> => {
      try {
        const db = getDatabaseService()
        const limit = params.limit || 50
        const offset = params.offset || 0

        const { meetings, total } = db.listMeetings({
          namespace: params.namespace,
          limit,
          offset,
          startDate: params.startDate,
          endDate: params.endDate,
          tags: params.tags,
        })

        return {
          success: true,
          data: {
            items: meetings,
            total,
            limit,
            offset,
            hasMore: offset + meetings.length < total,
          },
        }
      } catch (error) {
        console.error('Failed to list meetings:', error)
        return {
          success: false,
          error: {
            code: 'MEETING_LIST_FAILED',
            message: error instanceof Error ? error.message : 'Unknown error',
            details: error instanceof Error ? error.stack : undefined,
            timestamp: Date.now(),
          },
        }
      }
    }
  )

  // Update a meeting
  ipcMain.handle(
    'meeting:update',
    async (_event, params: UpdateMeetingParams): Promise<IPCResponse<Meeting>> => {
      try {
        const db = getDatabaseService()
        const meeting = db.updateMeeting(params.meetingId, params.updates)

        return {
          success: true,
          data: meeting,
        }
      } catch (error) {
        console.error('Failed to update meeting:', error)
        return {
          success: false,
          error: {
            code: 'MEETING_UPDATE_FAILED',
            message: error instanceof Error ? error.message : 'Unknown error',
            details: error instanceof Error ? error.stack : undefined,
            timestamp: Date.now(),
          },
        }
      }
    }
  )

  // Delete a meeting
  ipcMain.handle(
    'meeting:delete',
    async (_event, params: DeleteMeetingParams): Promise<IPCResponse<void>> => {
      try {
        const db = getDatabaseService()
        db.deleteMeeting(params.meetingId)

        return {
          success: true,
        }
      } catch (error) {
        console.error('Failed to delete meeting:', error)
        return {
          success: false,
          error: {
            code: 'MEETING_DELETE_FAILED',
            message: error instanceof Error ? error.message : 'Unknown error',
            details: error instanceof Error ? error.stack : undefined,
            timestamp: Date.now(),
          },
        }
      }
    }
  )

  // Export a meeting
  ipcMain.handle(
    'meeting:export',
    async (_event, params: ExportMeetingParams): Promise<IPCResponse<ExportMeetingResponse>> => {
      try {
        const db = getDatabaseService()
        const meeting = db.getMeeting(params.meetingId)

        if (!meeting) {
          throw new Error(`Meeting not found: ${params.meetingId}`)
        }

        // Get all meeting data
        const transcripts = db.getDb()
          .prepare('SELECT * FROM transcripts WHERE meeting_id = ? ORDER BY start_time ASC')
          .all(params.meetingId) as Array<{ text: string; start_time: number; end_time: number; speaker_name: string; confidence: number }>

        const notes = db.getDb()
          .prepare('SELECT * FROM notes WHERE meeting_id = ? ORDER BY timestamp ASC')
          .all(params.meetingId) as Array<{ original_text: string; augmented_text: string; timestamp: number }>

        const entities = db.getDb()
          .prepare('SELECT * FROM entities WHERE meeting_id = ?')
          .all(params.meetingId) as Array<{ type: string; text: string; confidence: number }>

        const format = params.format || 'json'

        if (format === 'markdown') {
          const md = [
            `# ${meeting.title || 'Meeting'}`,
            `**Date:** ${new Date(meeting.start_time * 1000).toLocaleString()}`,
            `**Duration:** ${meeting.duration ? Math.round(meeting.duration / 60) + ' minutes' : 'N/A'}`,
            '',
            '## Transcript',
            ...transcripts.map(t =>
              `**${t.speaker_name || 'Speaker'}** (${new Date(t.start_time * 1000).toLocaleTimeString()}): ${t.text}`
            ),
            '',
            '## Notes',
            ...notes.map(n => `- ${n.augmented_text || n.original_text}`),
            '',
            '## Entities',
            ...entities.map(e => `- **${e.type}**: ${e.text} (${Math.round((e.confidence || 0) * 100)}%)`),
          ].join('\n')

          return {
            success: true,
            data: {
              content: md,
              format: 'markdown',
              filename: `${meeting.title || 'meeting'}-${meeting.id.slice(0, 8)}.md`,
            },
          }
        }

        // JSON format (default)
        const exportData = {
          meeting,
          transcripts,
          notes,
          entities,
          exportedAt: new Date().toISOString(),
        }

        return {
          success: true,
          data: {
            content: JSON.stringify(exportData, null, 2),
            format: 'json',
            filename: `${meeting.title || 'meeting'}-${meeting.id.slice(0, 8)}.json`,
          },
        }
      } catch (error) {
        console.error('Failed to export meeting:', error)
        return {
          success: false,
          error: {
            code: 'MEETING_EXPORT_FAILED',
            message: error instanceof Error ? error.message : 'Unknown error',
            details: error instanceof Error ? error.stack : undefined,
            timestamp: Date.now(),
          },
        }
      }
    }
  )
}
