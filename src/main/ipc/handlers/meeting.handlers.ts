/**
 * Meeting IPC Handlers
 *
 * Handles all meeting-related IPC requests from the renderer process.
 */

import { ipcMain } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { Logger } from '../../services/Logger'

const log = Logger.create('MeetingHandlers')
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
        const audioDevices: Array<{
          id: string
          label: string
          kind: 'system' | 'microphone'
          isDefault: boolean
          isAvailable: boolean
        }> = []
        try {
          if (process.platform === 'darwin') {
            // macOS: use systemPreferences to check permission status
            const { systemPreferences } = await import('electron')
            const hasMic = systemPreferences.getMediaAccessStatus('microphone') === 'granted'
            if (hasMic) {
              audioDevices.push({
                id: 'microphone-default',
                label: 'Default Microphone',
                kind: 'microphone',
                isDefault: true,
                isAvailable: true,
              })
            }
            const hasScreen = systemPreferences.getMediaAccessStatus('screen') === 'granted'
            if (hasScreen) {
              audioDevices.push({
                id: 'system-default',
                label: 'System Audio',
                kind: 'system',
                isDefault: !hasMic,
                isAvailable: true,
              })
            }
          } else {
            // Windows/Linux: no OS-level permission gating — Electron auto-grants
            // media access. Always report both devices as available.
            audioDevices.push({
              id: 'microphone-default',
              label: 'Default Microphone',
              kind: 'microphone',
              isDefault: true,
              isAvailable: true,
            })
            audioDevices.push({
              id: 'system-default',
              label: 'System Audio',
              kind: 'system',
              isDefault: false,
              isAvailable: true,
            })
          }
        } catch (err) {
          log.debug('Permission check failed', err)
        }

        // Start passive WAL checkpoint every 10 minutes during recording
        // Blueprint §2.5: prevents multi-GB WAL files during long meetings
        if (walCheckpointInterval) clearInterval(walCheckpointInterval)
        walCheckpointInterval = setInterval(
          async () => {
            try {
              const { walCheckpoint } = await import('../../database/connection')
              walCheckpoint('PASSIVE')
            } catch (err) {
              log.debug('WAL passive checkpoint skipped', err)
            }
          },
          10 * 60 * 1000
        )
        // OPT-16: Don't let this timer prevent clean app shutdown
        if (walCheckpointInterval.unref) walCheckpointInterval.unref()

        return {
          success: true,
          data: {
            meeting,
            audioDevices,
          },
        }
      } catch (error) {
        // Clean up WAL interval on failure — prevents leaked timer
        if (walCheckpointInterval) {
          clearInterval(walCheckpointInterval)
          walCheckpointInterval = null
        }
        log.error('Failed to start meeting:', error)
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

        // Guard: verify meeting is actually in progress (no end_time yet)
        if (meeting.end_time) {
          log.warn(
            `[meeting:stop] Meeting ${params.meetingId} already stopped at ${meeting.end_time}`
          )
          return { success: true, data: undefined } // Idempotent — already stopped
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
          log.warn('[meeting:stop] Audio stop failed (may not have been recording):', audioErr)
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
        } catch (err) {
          log.debug('WAL truncate checkpoint skipped', err)
        }

        return {
          success: true,
          data: undefined,
        }
      } catch (error) {
        log.error('Failed to stop meeting:', error)
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
        log.error('Failed to get meeting:', error)
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
        // H-6 AUDIT: Cap limit to prevent DB dump via unlimited pagination
        const limit = Math.min(params.limit || 50, 200)
        const offset = Math.max(params.offset || 0, 0)

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
        log.error('Failed to list meetings:', error)
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
        log.error('Failed to update meeting:', error)
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
          data: undefined,
        }
      } catch (error) {
        log.error('Failed to delete meeting:', error)
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
        const { dialog } = await import('electron')
        const db = getDatabaseService()
        const meeting = db.getMeeting(params.meetingId)

        if (!meeting) {
          throw new Error(`Meeting not found: ${params.meetingId}`)
        }

        // Get all meeting data
        const transcripts = db
          .getDb()
          .prepare('SELECT * FROM transcripts WHERE meeting_id = ? ORDER BY start_time ASC')
          .all(params.meetingId) as Array<{
          text: string
          start_time: number
          end_time: number
          speaker_name: string
          confidence: number
        }>

        const notes = db
          .getDb()
          .prepare('SELECT * FROM notes WHERE meeting_id = ? ORDER BY timestamp ASC')
          .all(params.meetingId) as Array<{
          original_text: string
          augmented_text: string
          timestamp: number
        }>

        const entities = db
          .getDb()
          .prepare('SELECT * FROM entities WHERE meeting_id = ?')
          .all(params.meetingId) as Array<{ type: string; text: string; confidence: number }>

        const format = params.format || 'json'
        let content: string
        let fileFormat: 'markdown' | 'json'

        if (format === 'markdown' || format === 'pdf') {
          // M2 fix: Use MM:SS offset from meeting start instead of absolute epoch time
          const meetingStartSec = meeting.start_time || 0
          content = [
            `# ${meeting.title || 'Meeting'}`,
            `**Date:** ${new Date(meeting.start_time * 1000).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`,
            `**Duration:** ${meeting.duration ? Math.round(meeting.duration / 60) + ' minutes' : 'N/A'}`,
            '',
            '## Transcript',
            ...transcripts.map(t => {
              const offsetSec = Math.max(0, (t.start_time || 0) - meetingStartSec)
              const mm = String(Math.floor(offsetSec / 60)).padStart(2, '0')
              const ss = String(Math.floor(offsetSec % 60)).padStart(2, '0')
              return `**${t.speaker_name || 'Speaker'}** [${mm}:${ss}]: ${t.text}`
            }),
            '',
            '## Notes',
            ...notes.map(n => `- ${n.augmented_text || n.original_text}`),
            '',
            '## Entities',
            ...entities.map(
              e => `- **${e.type}**: ${e.text} (${Math.round((e.confidence || 0) * 100)}%)`
            ),
          ].join('\n')
          fileFormat = 'markdown'
        } else {
          // JSON format (default)
          content = JSON.stringify(
            { meeting, transcripts, notes, entities, exportedAt: new Date().toISOString() },
            null,
            2
          )
          fileFormat = 'json'
        }

        // I4 fix: Show save dialog so user can actually save the exported file
        const ext = fileFormat === 'json' ? 'json' : 'md'
        const safeTitle = (meeting.title || 'meeting').replace(/[/\\:*?"<>|]/g, '_')
        const defaultFilename = `${safeTitle}-${meeting.id.slice(0, 8)}.${ext}`

        const { filePath } = await dialog.showSaveDialog({
          title: 'Export Meeting',
          defaultPath: defaultFilename,
          filters:
            fileFormat === 'json'
              ? [{ name: 'JSON', extensions: ['json'] }]
              : [{ name: 'Markdown', extensions: ['md'] }],
        })

        if (filePath) {
          const fs = await import('fs')
          fs.writeFileSync(filePath, content, 'utf-8')
          log.info(`Meeting exported to: ${filePath}`)
        }

        return {
          success: true,
          data: {
            content,
            format: fileFormat,
            filename: defaultFilename,
          },
        }
      } catch (error) {
        log.error('Failed to export meeting:', error)
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
