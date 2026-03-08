import { ipcMain } from 'electron'
import { getDatabase } from '../../database/connection'
import { Logger } from '../../services/Logger'

const log = Logger.create('ExportHandlers')

/**
 * Export handlers for GDPR data export (Starter+)
 * Allows users to export all their data in JSON or Markdown format.
 */
export function registerExportHandlers(): void {
  // export:userData — Export all user data (GDPR compliance, Starter+)
  ipcMain.handle('export:userData', async (_, params) => {
    try {
      // Tier gate: export requires Starter+ (cloud sync tier)
      const { getCloudAccessManager } = await import('../../services/CloudAccessManager')
      const cam = getCloudAccessManager()
      const features = await cam.getFeatureAccess()

      if (!features.cloudSync) {
        return {
          success: false,
          error: {
            code: 'TIER_REQUIRED',
            message: 'Data export requires Starter plan or higher',
            timestamp: Date.now(),
          },
        }
      }

      const db = getDatabase()
      const format = params?.format || 'json'

      // Gather all user data
      const meetings = db
        .prepare('SELECT * FROM meetings ORDER BY start_time DESC')
        .all() as Record<string, unknown>[]

      const transcripts = db
        .prepare('SELECT * FROM transcripts ORDER BY start_time ASC')
        .all() as Record<string, unknown>[]

      const notes = db.prepare('SELECT * FROM notes ORDER BY timestamp ASC').all() as Record<
        string,
        unknown
      >[]

      const entities = db.prepare('SELECT * FROM entities ORDER BY meeting_id').all() as Record<
        string,
        unknown
      >[]

      const actionItems = (() => {
        try {
          return db.prepare('SELECT * FROM action_items ORDER BY created_at DESC').all() as Record<
            string,
            unknown
          >[]
        } catch {
          return [] // Table may not exist in older DBs
        }
      })()

      const digests = (() => {
        try {
          return db.prepare('SELECT * FROM digests ORDER BY created_at DESC').all() as Record<
            string,
            unknown
          >[]
        } catch {
          return []
        }
      })()

      const exportData = {
        exportedAt: new Date().toISOString(),
        version: '1.0',
        data: {
          meetings,
          transcripts,
          notes,
          entities,
          actionItems,
          digests,
        },
        stats: {
          totalMeetings: meetings.length,
          totalTranscripts: transcripts.length,
          totalNotes: notes.length,
          totalEntities: entities.length,
          totalActionItems: actionItems.length,
          totalDigests: digests.length,
        },
      }

      if (format === 'markdown') {
        // Generate Markdown format
        let md = `# Blue Arkive Data Export\n\nExported: ${exportData.exportedAt}\n\n`
        md += `## Summary\n\n`
        md += `- **Meetings:** ${meetings.length}\n`
        md += `- **Transcripts:** ${transcripts.length}\n`
        md += `- **Notes:** ${notes.length}\n`
        md += `- **Entities:** ${entities.length}\n`
        md += `- **Action Items:** ${actionItems.length}\n\n`

        md += `## Meetings\n\n`
        for (const m of meetings) {
          md += `### ${(m.title as string) || 'Untitled'}\n`
          md += `- **Date:** ${new Date(((m.start_time as number) || 0) * 1000).toISOString()}\n`
          md += `- **Duration:** ${Math.round(((m.duration as number) || 0) / 60)} min\n\n`

          // Transcripts for this meeting
          const meetingTranscripts = transcripts.filter(t => t.meeting_id === m.id)
          if (meetingTranscripts.length > 0) {
            md += `#### Transcript\n\n`
            for (const t of meetingTranscripts) {
              md += `**${(t.speaker_name as string) || 'Speaker'}:** ${t.text}\n\n`
            }
          }

          // Notes for this meeting
          const meetingNotes = notes.filter(n => n.meeting_id === m.id)
          if (meetingNotes.length > 0) {
            md += `#### Notes\n\n`
            for (const n of meetingNotes) {
              md += `- ${n.original_text}\n`
            }
            md += '\n'
          }

          md += `---\n\n`
        }

        return { success: true, data: { content: md, format: 'markdown' } }
      }

      // Default: JSON format
      return {
        success: true,
        data: { content: JSON.stringify(exportData, null, 2), format: 'json' },
      }
    } catch (error) {
      log.error('Data export failed', error)
      return {
        success: false,
        error: {
          code: 'EXPORT_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // export:deleteAllData — GDPR right to be forgotten (deletes local + requests cloud deletion)
  ipcMain.handle('export:deleteAllData', async () => {
    try {
      const { getCloudAccessManager } = await import('../../services/CloudAccessManager')
      const cam = getCloudAccessManager()
      const features = await cam.getFeatureAccess()

      if (!features.cloudSync) {
        return {
          success: false,
          error: {
            code: 'TIER_REQUIRED',
            message: 'Data deletion requires Starter plan or higher',
            timestamp: Date.now(),
          },
        }
      }

      // Request cloud data deletion
      let cloudDeleted = false
      try {
        const { getBackend } = await import('./graph.handlers')
        const backend = getBackend()
        const isHealthy = await backend.healthCheck()
        if (isHealthy) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const backendAny = backend as any
          if (typeof backendAny.deleteAllData === 'function') {
            await backendAny.deleteAllData()
            cloudDeleted = true
          }
        }
      } catch (err) {
        log.warn('Cloud data deletion failed', err)
      }

      // Delete local data
      const db = getDatabase()
      const tables = ['transcripts', 'notes', 'entities', 'sync_queue']
      for (const table of tables) {
        try {
          db.prepare(`DELETE FROM ${table}`).run()
        } catch {
          // Table may not exist
        }
      }

      // Delete meetings last (foreign key references)
      try {
        db.prepare('DELETE FROM meetings').run()
      } catch {
        // Ignore
      }

      log.info(`Data deletion complete. Cloud: ${cloudDeleted ? 'yes' : 'no'}`)
      return {
        success: true,
        data: {
          localDeleted: true,
          cloudDeleted,
          message: cloudDeleted
            ? 'All local and cloud data has been permanently deleted.'
            : 'Local data deleted. Cloud deletion could not be confirmed.',
        },
      }
    } catch (error) {
      log.error('Data deletion failed', error)
      return {
        success: false,
        error: {
          code: 'DELETE_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })
}
