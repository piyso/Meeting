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
      // GDPR Article 20: Right to data portability applies to ALL tiers.
      // No tier gate — every user can export their own data.

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
          sentimentScores: (() => {
            try {
              return db.prepare('SELECT * FROM sentiment_scores').all()
            } catch {
              return []
            }
          })(),
          calendarEvents: (() => {
            try {
              return db.prepare('SELECT * FROM calendar_events').all()
            } catch {
              return []
            }
          })(),
          webhooks: (() => {
            try {
              // Strip HMAC secrets from webhooks export
              return db
                .prepare(
                  'SELECT id, url, events, description, is_active, created_at, updated_at FROM webhooks'
                )
                .all()
            } catch {
              return []
            }
          })(),
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
      // GDPR Article 17: Right to erasure applies to ALL tiers.
      // No tier gate — every user can delete their own data.

      // Request cloud data deletion
      let cloudDeleted = false
      try {
        const { getBackend } = await import('../../services/backend/BackendSingleton')
        const backend = getBackend()
        const health = await backend.healthCheck()
        if (health.status === 'healthy') {
          // F6: Use proper GDPR exportAll before deletion (user gets a download link)
          const exportResult = await backend.exportAll('all')
          if (exportResult?.download_url) {
            log.info(`GDPR export created: ${exportResult.download_url}`)
          }

          // P2-6 FIX: Removed deduplicate(dryRun=false) that was here — pointless before deletion

          const deleted = await backend.deleteAllData()
          cloudDeleted = deleted
        }
      } catch (err) {
        log.warn('Cloud data deletion failed', err)
      }

      // Delete local data
      const db = getDatabase()
      // Delete ALL user data tables including FTS, audit trails, and ancillary data
      // Order: children first, parents last (FK constraints: transcripts/notes/entities → meetings)
      const tables = [
        'transcripts',
        'notes',
        'entities',
        'action_items',
        'sentiment_scores',
        'webhook_deliveries', // BEFORE webhooks (FK constraint)
        'webhooks',
        'calendar_events',
        'digests',
        'audio_highlights',
        'sync_queue',
        'query_usage',
        'meeting_templates',
        'devices',
        'audit_logs',
        'encryption_keys',
        'settings',
        'meetings', // LAST — parent table referenced by FKs above
      ]
      for (const table of tables) {
        try {
          db.prepare(`DELETE FROM ${table}`).run()
        } catch {
          // Table may not exist in older DB schemas
        }
      }

      // Clear FTS virtual tables (separate since they need different handling)
      // I11 fix: include entities_fts — was missing, causing stale search results
      for (const fts of ['transcripts_fts', 'notes_fts', 'entities_fts', 'action_items_fts']) {
        try {
          db.prepare(`DELETE FROM ${fts}`).run()
        } catch {
          // FTS table may not exist
        }
      }

      // C8 fix: meetings table already deleted in the loop above (last in the array)
      // Removed duplicate DELETE FROM meetings that was here

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
