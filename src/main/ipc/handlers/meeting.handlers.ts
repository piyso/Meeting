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
import { emitWebhookEvent } from '../../services/WebhookDispatchService'
import {
  MAX_MEETING_FILE_BYTES,
  MEETING_FILE_EXTENSION,
  MeetingFileError,
  buildMeetingFile,
  importMeetingFile,
  parseMeetingFile,
  plainTextFromHtml,
  renderMeetingHtml,
  type MeetingImportResult,
} from '../../services/MeetingFileService'
import { renderHtmlToPdf } from '../../services/PdfRenderer'
import { createMeeting } from '../../database/crud/meetings'
import { createTranscripts } from '../../database/crud/transcripts'
import { createNote } from '../../database/crud/notes'
import { createEntities } from '../../database/crud/entities'
import { createHighlight } from '../../database/crud/highlights'
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

/** Default undo window for a soft-deleted meeting (seconds). */
const DEFAULT_PURGE_AFTER_SEC = 10

/**
 * Startup sweep. Both jobs below are normally done by in-memory timers or by
 * the stop handler, so a crash or a quit at the wrong moment left them undone
 * forever:
 *
 *  1. Meetings soft-deleted more than the undo window ago are purged. Without
 *     this, quitting within 10 seconds of deleting a meeting kept its
 *     transcript on disk indefinitely while hiding it from the list.
 *  2. Meetings with no end_time (the app died mid-recording) are closed, using
 *     the last transcript segment as the duration.
 *
 * Call once after the database is ready and before any recording can start.
 */
export function recoverMeetingsOnStartup(): { purged: number; closed: number } {
  const db = getDatabaseService()
  const raw = db.getDb()
  const now = Math.floor(Date.now() / 1000)
  let purged = 0
  let closed = 0

  const hasDeletedAt = raw
    .prepare("SELECT COUNT(*) as cnt FROM pragma_table_info('meetings') WHERE name='deleted_at'")
    .get() as { cnt: number }
  if (hasDeletedAt?.cnt > 0) {
    const stale = raw
      .prepare('SELECT id FROM meetings WHERE deleted_at IS NOT NULL AND deleted_at <= ?')
      .all(now - DEFAULT_PURGE_AFTER_SEC) as Array<{ id: string }>
    for (const { id } of stale) {
      try {
        db.deleteMeeting(id)
        purged++
      } catch (err) {
        log.warn(`Startup purge failed for meeting ${id}:`, err)
      }
    }
  }

  const orphans = raw
    .prepare('SELECT id, start_time FROM meetings WHERE end_time IS NULL')
    .all() as Array<{ id: string; start_time: number }>
  for (const orphan of orphans) {
    try {
      // Transcript times are seconds from the start of the meeting.
      const last = raw
        .prepare('SELECT MAX(end_time) as lastEnd FROM transcripts WHERE meeting_id = ?')
        .get(orphan.id) as { lastEnd: number | null }
      const duration = Math.max(0, Math.ceil(last?.lastEnd ?? 0))
      db.updateMeeting(orphan.id, { end_time: orphan.start_time + duration, duration })
      closed++
    } catch (err) {
      log.warn(`Could not close interrupted meeting ${orphan.id}:`, err)
    }
  }

  if (purged > 0 || closed > 0) {
    log.info(`Startup recovery: purged ${purged} deleted meeting(s), closed ${closed} interrupted`)
  }
  return { purged, closed }
}

/**
 * Close a meeting that is still open: stamp its end time and duration.
 *
 * Called by meeting:stop and, through the audio pipeline's 'stopping' event,
 * by every other way a recording ends (widget Stop, duration limit, app quit).
 * Those paths used to stop the audio but leave the meeting without an end
 * time until the next launch's recovery sweep.
 *
 * Idempotent: returns false when the meeting does not exist or is already closed.
 */
export function finalizeMeeting(meetingId: string): boolean {
  const db = getDatabaseService()
  const meeting = db.getMeeting(meetingId)
  if (!meeting || meeting.end_time) return false

  const endTime = Math.floor(Date.now() / 1000)
  const duration = Math.max(0, endTime - meeting.start_time)
  db.updateMeeting(meetingId, {
    end_time: endTime,
    duration,
  })

  if (walCheckpointInterval) {
    clearInterval(walCheckpointInterval)
    walCheckpointInterval = null
  }

  // A capture that failed to start is closed within a second or two and then
  // removed by the window; that is not a meeting anyone should be told about.
  if (duration >= MIN_REPORTED_MEETING_SEC) {
    emitWebhookEvent('meeting.completed', {
      meetingId,
      title: meeting.title,
      startTime: meeting.start_time,
      endTime,
      durationSec: duration,
    })
  }
  return true
}

/** Meetings shorter than this are not announced to webhooks (see finalizeMeeting). */
const MIN_REPORTED_MEETING_SEC = 5

/** Longest undo window a caller may ask for when deleting a meeting (seconds). */
const MAX_PURGE_AFTER_SEC = 3600

/**
 * Register all meeting-related IPC handlers
 */
/**
 * Read a `.pnotes` file and add its meeting to this device.
 *
 * Used for a file the user picked and for one the operating system handed
 * over (double-click, drag onto the icon) — which is why it checks the path
 * itself rather than trusting the caller.
 *
 * @throws MeetingFileError with a message for the user.
 */
export async function importMeetingFromPath(filePath: string): Promise<MeetingImportResult> {
  const fs = await import('fs')
  if (!filePath.toLowerCase().endsWith(`.${MEETING_FILE_EXTENSION}`)) {
    throw new MeetingFileError('This is not a BlueArkive meeting file.')
  }
  let stats: import('fs').Stats
  try {
    stats = await fs.promises.stat(filePath)
  } catch {
    throw new MeetingFileError('The file could not be opened.')
  }
  if (!stats.isFile()) throw new MeetingFileError('The file could not be opened.')
  if (stats.size > MAX_MEETING_FILE_BYTES) {
    throw new MeetingFileError('This meeting file is too large to import.')
  }

  const file = parseMeetingFile(await fs.promises.readFile(filePath, 'utf-8'))
  const result = importMeetingFile(file, {
    db: getDatabaseService().getDb(),
    createMeeting,
    createTranscripts,
    createNote,
    createEntities,
    createHighlight,
  })
  log.info(
    result.status === 'imported'
      ? `Imported meeting ${result.meetingId} (${result.transcripts} segments, ${result.notes} notes)`
      : `Meeting ${result.meetingId} is already on this device — not imported again`
  )
  return result
}

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

        // Idempotent: a meeting that is already closed keeps its end time. The
        // pipeline is still stopped below if it is recording this meeting (the
        // widget's Stop closes the meeting before this handler is reached).
        finalizeMeeting(params.meetingId)

        // Stop audio capture — only if the pipeline is recording *this*
        // meeting. Stopping a stale meeting from its detail view must not
        // cut off a different meeting that is being recorded right now.
        try {
          const { getAudioPipelineService } = await import('../../services/AudioPipelineService')
          const pipeline = getAudioPipelineService()
          const capturingMeetingId = pipeline.getStatus().meetingId
          if (!capturingMeetingId || capturingMeetingId === params.meetingId) {
            await pipeline.stopCapture()
          }
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

  // Delete a meeting (soft-delete with undo support)
  // 6.2 FIX: Replaces window.confirm() with soft-delete + undo toast.
  // Meeting is marked deleted_at = NOW(), purged after 10s unless restored.
  ipcMain.handle(
    'meeting:delete',
    async (
      _event,
      params: DeleteMeetingParams
    ): Promise<IPCResponse<{ deleted: boolean; meetingId: string }>> => {
      try {
        const db = getDatabaseService()
        const meeting = db.getMeeting(params.meetingId)
        if (!meeting) {
          throw new Error(`Meeting not found: ${params.meetingId}`)
        }

        // A meeting that is being recorded keeps receiving transcript rows;
        // once it is purged every one of those inserts fails its foreign key
        // and the rest of the recording is lost without a word.
        try {
          const { getAudioPipelineService } = await import('../../services/AudioPipelineService')
          const status = getAudioPipelineService().getStatus()
          if (status.isCapturing && status.meetingId === params.meetingId) {
            return {
              success: false,
              error: {
                code: 'MEETING_IS_RECORDING',
                message: 'Stop the recording before deleting this meeting.',
                timestamp: Date.now(),
              },
            }
          }
        } catch (statusErr) {
          log.debug('Recording status check skipped:', statusErr)
        }

        // Soft-delete: mark deleted_at instead of hard delete
        const now = Math.floor(Date.now() / 1000)
        // Clamp: a huge value overflows setTimeout's 32-bit delay, which fires
        // immediately — i.e. no undo window at all.
        const requestedPurgeSec = Number(params.purgeAfterSec)
        const purgeAfterSec =
          Number.isFinite(requestedPurgeSec) && requestedPurgeSec > 0
            ? Math.min(requestedPurgeSec, MAX_PURGE_AFTER_SEC)
            : DEFAULT_PURGE_AFTER_SEC

        // Ensure deleted_at column exists (migration-safe)
        try {
          const hasCol = db
            .getDb()
            .prepare(
              "SELECT COUNT(*) as cnt FROM pragma_table_info('meetings') WHERE name='deleted_at'"
            )
            .get() as { cnt: number }
          if (!hasCol || hasCol.cnt === 0) {
            db.getDb().exec('ALTER TABLE meetings ADD COLUMN deleted_at INTEGER')
          }
        } catch {
          // Column may already exist
        }

        db.getDb()
          .prepare('UPDATE meetings SET deleted_at = ? WHERE id = ?')
          .run(now, params.meetingId)

        // Schedule hard delete after purge window
        const purgeTimer = setTimeout(() => {
          try {
            const currentState = db
              .getDb()
              .prepare('SELECT deleted_at FROM meetings WHERE id = ?')
              .get(params.meetingId) as { deleted_at: number | null } | undefined
            // Only hard-delete if still marked by *this* delete. If the meeting
            // was restored and deleted again, the newer delete owns the purge
            // and its own full undo window.
            if (currentState?.deleted_at === now) {
              db.deleteMeeting(params.meetingId)
              log.info(`Purged soft-deleted meeting: ${params.meetingId}`)
            }
          } catch (purgeErr) {
            log.debug('Purge timer cleanup failed:', purgeErr)
          }
        }, purgeAfterSec * 1000)
        if (purgeTimer.unref) purgeTimer.unref()

        return {
          success: true,
          data: { deleted: true, meetingId: params.meetingId },
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

  // Restore a soft-deleted meeting (undo)
  // 6.2 FIX: Clears deleted_at to restore the meeting before purge window expires.
  ipcMain.handle(
    'meeting:restore',
    async (_event, params: { meetingId: string }): Promise<IPCResponse<Meeting>> => {
      try {
        const db = getDatabaseService()

        // Direct SQL check: getMeeting() filters deleted_at, so we query raw
        const raw = db
          .getDb()
          .prepare('SELECT deleted_at FROM meetings WHERE id = ?')
          .get(params.meetingId) as { deleted_at: number | null } | undefined

        if (!raw) {
          throw new Error(`Meeting not found: ${params.meetingId}`)
        }
        if (!raw.deleted_at) {
          throw new Error(`Meeting is not deleted: ${params.meetingId}`)
        }

        db.getDb()
          .prepare('UPDATE meetings SET deleted_at = NULL WHERE id = ?')
          .run(params.meetingId)

        const restored = db.getMeeting(params.meetingId)
        if (!restored) {
          throw new Error(`Meeting not found after restore: ${params.meetingId}`)
        }
        log.info(`Restored soft-deleted meeting: ${params.meetingId}`)

        return { success: true, data: restored }
      } catch (error) {
        log.error('Failed to restore meeting:', error)
        return {
          success: false,
          error: {
            code: 'MEETING_RESTORE_FAILED',
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
        const { app, dialog } = await import('electron')
        const file = buildMeetingFile(
          getDatabaseService().getDb(),
          params.meetingId,
          app.getVersion()
        )
        if (!file) {
          throw new Error(`Meeting not found: ${params.meetingId}`)
        }
        const { meeting, transcripts, notes, entities } = file

        const format = params.format || 'json'
        let content: string | Buffer
        let ext: string
        let filterName: string

        if (format === 'pdf') {
          // A real PDF. This used to save Markdown under the "PDF" button.
          content = await renderHtmlToPdf(renderMeetingHtml(file))
          ext = 'pdf'
          filterName = 'PDF'
        } else if (format === 'markdown') {
          content = [
            `# ${meeting.title || 'Meeting'}`,
            `**Date:** ${new Date(meeting.start_time * 1000).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`,
            `**Duration:** ${meeting.duration ? Math.round(meeting.duration / 60) + ' minutes' : 'N/A'}`,
            '',
            '## Transcript',
            ...transcripts.map(t => {
              // Segment times are seconds from the start of the meeting; only
              // rows written by very old builds hold absolute epoch seconds.
              const raw = t.start_time || 0
              const offsetSec = Math.max(
                0,
                raw >= 1_000_000_000 ? raw - (meeting.start_time || 0) : raw
              )
              const hours = Math.floor(offsetSec / 3600)
              const mm = String(Math.floor((offsetSec % 3600) / 60)).padStart(2, '0')
              const ss = String(Math.floor(offsetSec % 60)).padStart(2, '0')
              const stamp = hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`
              return `**${t.speaker_name || 'Speaker'}** [${stamp}]: ${t.text}`
            }),
            '',
            '## Notes',
            // Notes are stored as editor HTML; Markdown readers want the text.
            ...notes.map(n => `- ${plainTextFromHtml(n.augmented_text || n.original_text)}`),
            '',
            '## Entities',
            ...entities.map(
              e => `- **${e.type}**: ${e.text} (${Math.round((e.confidence || 0) * 100)}%)`
            ),
          ].join('\n')
          ext = 'md'
          filterName = 'Markdown'
        } else if (format === 'pnotes') {
          // The app's own file: opens in BlueArkive on a double-click.
          content = JSON.stringify(file)
          ext = MEETING_FILE_EXTENSION
          filterName = 'BlueArkive Meeting'
        } else {
          content = JSON.stringify(file, null, 2)
          ext = 'json'
          filterName = 'JSON'
        }

        // I4 fix: Show save dialog so user can actually save the exported file
        const safeTitle = (meeting.title || 'meeting').replace(/[/\\:*?"<>|]/g, '_')
        const defaultFilename = `${safeTitle}-${meeting.id.slice(0, 8)}.${ext}`

        const { filePath } = await dialog.showSaveDialog({
          title: 'Export Meeting',
          defaultPath: defaultFilename,
          filters: [{ name: filterName, extensions: [ext] }],
        })

        if (filePath) {
          const fs = await import('fs')
          await fs.promises.writeFile(filePath, content)
          log.info(`Meeting exported to: ${filePath}`)
        }

        return {
          success: true,
          data: {
            // The file is on disk; a long meeting is not also sent back
            // through IPC as one string.
            content: '',
            format: ext,
            filename: defaultFilename,
            // Absent when the save dialog was cancelled — nothing was written.
            filePath: filePath || undefined,
            fileSize: Buffer.byteLength(content),
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

  // Import a meeting file (.pnotes) chosen by the user
  ipcMain.handle(
    'meeting:importFile',
    async (): Promise<IPCResponse<MeetingImportResult | null>> => {
      try {
        const { dialog } = await import('electron')
        const picked = await dialog.showOpenDialog({
          title: 'Import Meeting',
          properties: ['openFile'],
          filters: [{ name: 'BlueArkive Meeting', extensions: [MEETING_FILE_EXTENSION] }],
        })
        const filePath = picked.canceled ? undefined : picked.filePaths[0]
        if (!filePath) return { success: true, data: null }
        return { success: true, data: await importMeetingFromPath(filePath) }
      } catch (error) {
        if (!(error instanceof MeetingFileError)) log.error('Failed to import meeting file:', error)
        return {
          success: false,
          error: {
            code: 'MEETING_IMPORT_FAILED',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: Date.now(),
          },
        }
      }
    }
  )
}
