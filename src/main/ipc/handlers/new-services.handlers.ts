/**
 * IPC Handlers for new backend services
 *
 * Wires BackupService, ScreenContextService, SemanticFileSystemService,
 * CrossAppMemoryService, AudioProvenanceService, NotificationService,
 * EntityExtractionService, ExportService, and PodcastSynthesisService
 * into the IPC system so the renderer can invoke them.
 */

import { ipcMain } from 'electron'
import { Logger } from '../../services/Logger'
import type { IPCResponse } from '../../../types/ipc'

import { getBackupService } from '../../services/BackupService'
import { getScreenContextService } from '../../services/ScreenContextService'
import { getSemanticFileSystemService } from '../../services/SemanticFileSystemService'
import { getCrossAppMemoryService } from '../../services/CrossAppMemoryService'
import { getAudioProvenanceService } from '../../services/AudioProvenanceService'
import { getNotificationService } from '../../services/NotificationService'
import { getEntityExtractionService } from '../../services/EntityExtractionService'
import { getExportService } from '../../services/ExportService'
import { getPodcastSynthesisService } from '../../services/PodcastSynthesisService'

const log = Logger.create('NewServicesHandlers')

export function registerNewServiceHandlers(): void {
  // ─── Backup ────────────────────────────────────────────────

  ipcMain.handle('backup:create', async (): Promise<IPCResponse<unknown>> => {
    try {
      const backup = await getBackupService().createBackup()
      return { success: true, data: backup }
    } catch (err) {
      return {
        success: false,
        error: { code: 'BACKUP_FAILED', message: String(err), timestamp: Date.now() },
      }
    }
  })

  ipcMain.handle('backup:list', async (): Promise<IPCResponse<unknown>> => {
    try {
      return { success: true, data: getBackupService().listBackups() }
    } catch (err) {
      return {
        success: false,
        error: { code: 'BACKUP_LIST_FAILED', message: String(err), timestamp: Date.now() },
      }
    }
  })

  ipcMain.handle(
    'backup:restore',
    async (_e, params: { backupId: string }): Promise<IPCResponse<unknown>> => {
      try {
        const ok = await getBackupService().restoreFromBackup(params.backupId)
        return { success: true, data: { restored: ok } }
      } catch (err) {
        return {
          success: false,
          error: { code: 'RESTORE_FAILED', message: String(err), timestamp: Date.now() },
        }
      }
    }
  )

  ipcMain.handle(
    'backup:delete',
    async (_e, params: { backupId: string }): Promise<IPCResponse<unknown>> => {
      try {
        return { success: true, data: getBackupService().deleteBackup(params.backupId) }
      } catch (err) {
        return {
          success: false,
          error: { code: 'BACKUP_DELETE_FAILED', message: String(err), timestamp: Date.now() },
        }
      }
    }
  )

  // ─── Screen Context ────────────────────────────────────────

  ipcMain.handle(
    'screen:startCapture',
    async (_e, params: { meetingId: string }): Promise<IPCResponse<unknown>> => {
      try {
        getScreenContextService().startCapture(params.meetingId)
        return { success: true }
      } catch (err) {
        return {
          success: false,
          error: { code: 'SCREEN_START_FAILED', message: String(err), timestamp: Date.now() },
        }
      }
    }
  )

  ipcMain.handle('screen:stopCapture', async (): Promise<IPCResponse<unknown>> => {
    try {
      getScreenContextService().stopCapture()
      return { success: true }
    } catch (err) {
      return {
        success: false,
        error: { code: 'SCREEN_STOP_FAILED', message: String(err), timestamp: Date.now() },
      }
    }
  })

  ipcMain.handle(
    'screen:storeSnapshot',
    async (
      _e,
      params: {
        meetingId: string
        timestamp: number
        ocrText: string
        activeApp: string
        activeWindowTitle: string
        thumbnailJpeg: Buffer
      }
    ): Promise<IPCResponse<unknown>> => {
      try {
        const snapshot = getScreenContextService().storeSnapshot(params)
        return { success: true, data: snapshot }
      } catch (err) {
        return {
          success: false,
          error: { code: 'SNAPSHOT_STORE_FAILED', message: String(err), timestamp: Date.now() },
        }
      }
    }
  )

  ipcMain.handle(
    'screen:query',
    async (
      _e,
      params: { meetingId: string; startTime: number; endTime: number }
    ): Promise<IPCResponse<unknown>> => {
      try {
        return {
          success: true,
          data: getScreenContextService().querySnapshots(
            params.meetingId,
            params.startTime,
            params.endTime
          ),
        }
      } catch (err) {
        return {
          success: false,
          error: { code: 'SCREEN_QUERY_FAILED', message: String(err), timestamp: Date.now() },
        }
      }
    }
  )

  ipcMain.handle(
    'screen:search',
    async (_e, params: { query: string; limit?: number }): Promise<IPCResponse<unknown>> => {
      try {
        return {
          success: true,
          data: getScreenContextService().searchOcrText(params.query, params.limit),
        }
      } catch (err) {
        return {
          success: false,
          error: { code: 'SCREEN_SEARCH_FAILED', message: String(err), timestamp: Date.now() },
        }
      }
    }
  )

  // ─── Semantic FileSystem ───────────────────────────────────

  ipcMain.handle('filesystem:mount', async (): Promise<IPCResponse<unknown>> => {
    try {
      await getSemanticFileSystemService().mount()
      return { success: true }
    } catch (err) {
      return {
        success: false,
        error: { code: 'FS_MOUNT_FAILED', message: String(err), timestamp: Date.now() },
      }
    }
  })

  ipcMain.handle('filesystem:unmount', async (): Promise<IPCResponse<unknown>> => {
    try {
      getSemanticFileSystemService().unmount()
      return { success: true }
    } catch (err) {
      return {
        success: false,
        error: { code: 'FS_UNMOUNT_FAILED', message: String(err), timestamp: Date.now() },
      }
    }
  })

  ipcMain.handle('filesystem:tree', async (): Promise<IPCResponse<unknown>> => {
    try {
      return { success: true, data: await getSemanticFileSystemService().buildVirtualTree() }
    } catch (err) {
      return {
        success: false,
        error: { code: 'FS_TREE_FAILED', message: String(err), timestamp: Date.now() },
      }
    }
  })

  ipcMain.handle(
    'filesystem:ingest',
    async (
      _e,
      params: { filePath: string; targetFolder: string }
    ): Promise<IPCResponse<unknown>> => {
      try {
        const id = await getSemanticFileSystemService().ingestFile(
          params.filePath,
          params.targetFolder
        )
        return { success: true, data: { id } }
      } catch (err) {
        return {
          success: false,
          error: { code: 'FS_INGEST_FAILED', message: String(err), timestamp: Date.now() },
        }
      }
    }
  )

  // ─── Cross-App Memory ──────────────────────────────────────

  ipcMain.handle('crossapp:start', async (): Promise<IPCResponse<unknown>> => {
    try {
      const ok = await getCrossAppMemoryService().startListening()
      return { success: true, data: { listening: ok } }
    } catch (err) {
      return {
        success: false,
        error: { code: 'CROSSAPP_START_FAILED', message: String(err), timestamp: Date.now() },
      }
    }
  })

  ipcMain.handle('crossapp:stop', async (): Promise<IPCResponse<unknown>> => {
    try {
      getCrossAppMemoryService().stopListening()
      return { success: true }
    } catch (err) {
      return {
        success: false,
        error: { code: 'CROSSAPP_STOP_FAILED', message: String(err), timestamp: Date.now() },
      }
    }
  })

  ipcMain.handle(
    'crossapp:query',
    async (_e, params: { query: string }): Promise<IPCResponse<unknown>> => {
      try {
        const snippets = await getCrossAppMemoryService().queryMemory(params.query)
        return { success: true, data: snippets }
      } catch (err) {
        return {
          success: false,
          error: { code: 'CROSSAPP_QUERY_FAILED', message: String(err), timestamp: Date.now() },
        }
      }
    }
  )

  // ─── Audio Provenance ──────────────────────────────────────

  ipcMain.handle(
    'provenance:sign',
    async (
      _e,
      params: { meetingId: string; segmentIndex: number; audioData: Buffer }
    ): Promise<IPCResponse<unknown>> => {
      try {
        const att = await getAudioProvenanceService().signSegment(
          params.meetingId,
          params.segmentIndex,
          params.audioData
        )
        return { success: true, data: att }
      } catch (err) {
        return {
          success: false,
          error: { code: 'PROVENANCE_SIGN_FAILED', message: String(err), timestamp: Date.now() },
        }
      }
    }
  )

  ipcMain.handle(
    'provenance:list',
    async (_e, params: { meetingId: string }): Promise<IPCResponse<unknown>> => {
      try {
        return {
          success: true,
          data: getAudioProvenanceService().getAttestations(params.meetingId),
        }
      } catch (err) {
        return {
          success: false,
          error: { code: 'PROVENANCE_LIST_FAILED', message: String(err), timestamp: Date.now() },
        }
      }
    }
  )

  ipcMain.handle(
    'provenance:verify',
    async (_e, params: { meetingId: string }): Promise<IPCResponse<unknown>> => {
      try {
        return {
          success: true,
          data: getAudioProvenanceService().verifyMeetingChain(params.meetingId),
        }
      } catch (err) {
        return {
          success: false,
          error: { code: 'PROVENANCE_VERIFY_FAILED', message: String(err), timestamp: Date.now() },
        }
      }
    }
  )

  ipcMain.handle(
    'provenance:report',
    async (_e, params: { meetingId: string }): Promise<IPCResponse<unknown>> => {
      try {
        return {
          success: true,
          data: getAudioProvenanceService().exportProvenanceReport(params.meetingId),
        }
      } catch (err) {
        return {
          success: false,
          error: { code: 'PROVENANCE_REPORT_FAILED', message: String(err), timestamp: Date.now() },
        }
      }
    }
  )

  // ─── Notification ──────────────────────────────────────────

  ipcMain.handle(
    'notification:scheduleMeeting',
    async (
      _e,
      params: {
        meetingId: string
        meetingTitle: string
        startTime: number
        remindBeforeMs?: number
      }
    ): Promise<IPCResponse<unknown>> => {
      try {
        const id = await getNotificationService().scheduleMeetingReminder(
          params.meetingId,
          params.meetingTitle,
          params.startTime,
          params.remindBeforeMs
        )
        return { success: true, data: { id } }
      } catch (err) {
        return {
          success: false,
          error: { code: 'NOTIF_SCHEDULE_FAILED', message: String(err), timestamp: Date.now() },
        }
      }
    }
  )

  ipcMain.handle(
    'notification:scheduleDeadline',
    async (
      _e,
      params: { actionItemId: string; text: string; deadline: number }
    ): Promise<IPCResponse<unknown>> => {
      try {
        const id = await getNotificationService().scheduleActionItemDeadline(
          params.actionItemId,
          params.text,
          params.deadline
        )
        return { success: true, data: { id } }
      } catch (err) {
        return {
          success: false,
          error: { code: 'NOTIF_DEADLINE_FAILED', message: String(err), timestamp: Date.now() },
        }
      }
    }
  )

  ipcMain.handle(
    'notification:dismiss',
    async (_e, params: { notificationId: string }): Promise<IPCResponse<unknown>> => {
      try {
        getNotificationService().dismissNotification(params.notificationId)
        return { success: true }
      } catch (err) {
        return {
          success: false,
          error: { code: 'NOTIF_DISMISS_FAILED', message: String(err), timestamp: Date.now() },
        }
      }
    }
  )

  ipcMain.handle('notification:pending', async (): Promise<IPCResponse<unknown>> => {
    try {
      return { success: true, data: getNotificationService().getPendingNotifications() }
    } catch (err) {
      return {
        success: false,
        error: { code: 'NOTIF_PENDING_FAILED', message: String(err), timestamp: Date.now() },
      }
    }
  })

  // ─── Entity Extraction ─────────────────────────────────────

  ipcMain.handle(
    'entity:extractFromMeeting',
    async (_e, params: { meetingId: string }): Promise<IPCResponse<unknown>> => {
      try {
        // Fetch transcript text from DB before extraction
        const { getDatabaseService } = await import('../../services/DatabaseService')
        const db = getDatabaseService().getDb()
        const rows = db
          .prepare(
            'SELECT text FROM transcript_segments WHERE meeting_id = ? ORDER BY segment_index ASC'
          )
          .all(params.meetingId) as Array<{ text: string }>
        const transcriptText = rows.map(r => r.text).join(' ')

        const entities = await getEntityExtractionService().extractFromMeeting(
          params.meetingId,
          transcriptText
        )
        return { success: true, data: entities }
      } catch (err) {
        return {
          success: false,
          error: { code: 'ENTITY_EXTRACT_FAILED', message: String(err), timestamp: Date.now() },
        }
      }
    }
  )

  ipcMain.handle(
    'entity:query',
    async (
      _e,
      params: { type?: string; meetingId?: string; limit?: number }
    ): Promise<IPCResponse<unknown>> => {
      try {
        return { success: true, data: getEntityExtractionService().queryEntities(params) }
      } catch (err) {
        return {
          success: false,
          error: { code: 'ENTITY_QUERY_FAILED', message: String(err), timestamp: Date.now() },
        }
      }
    }
  )

  // ─── Export ────────────────────────────────────────────────

  ipcMain.handle(
    'export:meeting',
    async (_e, params: { meetingId: string; format: string }): Promise<IPCResponse<unknown>> => {
      try {
        const result = await getExportService().exportMeeting(
          params.meetingId,
          params.format as 'markdown' | 'text' | 'json' | 'notion'
        )
        return { success: result.success, data: result }
      } catch (err) {
        return {
          success: false,
          error: { code: 'EXPORT_MEETING_FAILED', message: String(err), timestamp: Date.now() },
        }
      }
    }
  )

  // ─── Podcast Synthesis ─────────────────────────────────────

  ipcMain.handle('podcast:generate', async (): Promise<IPCResponse<unknown>> => {
    try {
      const digest = await getPodcastSynthesisService().generateWeeklyDigest()
      return { success: true, data: digest }
    } catch (err) {
      return {
        success: false,
        error: { code: 'PODCAST_GEN_FAILED', message: String(err), timestamp: Date.now() },
      }
    }
  })

  ipcMain.handle('podcast:synthesize', async (): Promise<IPCResponse<unknown>> => {
    try {
      const digest = await getPodcastSynthesisService().generateWeeklyDigest()
      const audio = await getPodcastSynthesisService().synthesizeToAudio(digest)
      return { success: true, data: { size: audio.length } }
    } catch (err) {
      return {
        success: false,
        error: { code: 'PODCAST_SYNTH_FAILED', message: String(err), timestamp: Date.now() },
      }
    }
  })

  ipcMain.handle('podcast:latest', async (): Promise<IPCResponse<unknown>> => {
    try {
      return { success: true, data: getPodcastSynthesisService().getLatestDigest() }
    } catch (err) {
      return {
        success: false,
        error: { code: 'PODCAST_LATEST_FAILED', message: String(err), timestamp: Date.now() },
      }
    }
  })

  log.info(
    'New service IPC handlers registered (backup, screen, filesystem, crossapp, provenance, notification, entity, export, podcast)'
  )
}
