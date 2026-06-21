/**
 * ExportService — Export meetings to Markdown, plain text, and JSON
 *
 * Supports: Markdown (with frontmatter), Plain Text, JSON, and Notion-ready Markdown.
 */

import fs from 'fs'
import path from 'path'
import { app, dialog } from 'electron'
import { Logger } from './Logger'
import { getDatabaseService } from './DatabaseService'
import { v4 as uuidv4 } from 'uuid'

const log = Logger.create('ExportService')

export type ExportFormat = 'markdown' | 'text' | 'json' | 'notion'

export interface ExportResult {
  success: boolean
  filePath?: string
  format: ExportFormat
  error?: string
}

export class ExportService {
  /**
   * Export a meeting to the specified format.
   */
  async exportMeeting(meetingId: string, format: ExportFormat): Promise<ExportResult> {
    try {
      const db = getDatabaseService().getDb()
      const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(meetingId) as
        | Record<string, unknown>
        | undefined
      if (!meeting) throw new Error(`Meeting not found: ${meetingId}`)

      const notes = db.prepare('SELECT * FROM notes WHERE meeting_id = ?').all(meetingId) as Array<
        Record<string, unknown>
      >
      const transcripts = db
        .prepare('SELECT * FROM transcripts WHERE meeting_id = ? ORDER BY start_time ASC')
        .all(meetingId) as Array<Record<string, unknown>>
      const actionItems = db
        .prepare('SELECT * FROM action_items WHERE meeting_id = ?')
        .all(meetingId) as Array<Record<string, unknown>>

      let content: string
      let ext: string

      switch (format) {
        case 'markdown':
          content = this.toMarkdown(meeting, notes, transcripts, actionItems)
          ext = '.md'
          break
        case 'text':
          content = this.toPlainText(meeting, notes, transcripts, actionItems)
          ext = '.txt'
          break
        case 'json':
          content = JSON.stringify({ meeting, notes, transcripts, actionItems }, null, 2)
          ext = '.json'
          break
        case 'notion':
          content = this.toNotionMarkdown(meeting, notes, transcripts, actionItems)
          ext = '.md'
          break
      }

      const defaultName = `${this.sanitizeFilename(String(meeting.title || 'Untitled'))}${ext}`
      const { filePath } = await dialog.showSaveDialog({
        title: `Export Meeting as ${format.toUpperCase()}`,
        defaultPath: path.join(app.getPath('documents'), defaultName),
        filters: [
          { name: format === 'json' ? 'JSON' : 'Text', extensions: [ext.replace('.', '')] },
        ],
      })

      if (!filePath) return { success: false, format, error: 'User cancelled' }

      fs.writeFileSync(filePath, content, 'utf-8')

      // Record export in history
      db.prepare(
        'INSERT INTO export_history (id, meeting_id, format, file_path, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(uuidv4(), meetingId, format, filePath, Math.floor(Date.now() / 1000))

      log.info(`Exported meeting ${meetingId} as ${format} → ${filePath}`)
      return { success: true, filePath, format }
    } catch (err) {
      log.error('Export failed:', err)
      return { success: false, format, error: (err as Error).message }
    }
  }

  // ── Format converters ──

  private toMarkdown(
    meeting: Record<string, unknown>,
    notes: Array<Record<string, unknown>>,
    transcripts: Array<Record<string, unknown>>,
    actionItems: Array<Record<string, unknown>>
  ): string {
    let md = `---\n`
    const escapedTitle = String(meeting.title || 'Untitled')
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/---/g, '\\-\\-\\-')
    md += `title: "${escapedTitle}"\n`
    md += `date: ${new Date(Number(meeting.start_time) * 1000).toISOString()}\n`
    md += `duration: ${Math.round(Number(meeting.duration || 0) / 60)} min\n`
    md += `---\n\n`
    md += `# ${meeting.title || 'Untitled Meeting'}\n\n`

    if (notes.length > 0) {
      md += `## Notes\n\n${notes.map(n => n.original_text || '').join('\n\n')}\n\n`
    }

    if (transcripts.length > 0) {
      md += `## Transcript\n\n`
      for (const t of transcripts) {
        const speaker = t.speaker_name ? `**${t.speaker_name}:** ` : ''
        md += `${speaker}${t.text || ''}\n\n`
      }
    }

    if (actionItems.length > 0) {
      md += `## Action Items\n\n`
      for (const ai of actionItems) {
        const status = ai.status === 'completed' ? '✓' : '○'
        md += `- [${status}] ${ai.text || ''}`
        if (ai.assignee) md += ` _(assigned to ${ai.assignee})_`
        if (ai.deadline) md += ` — due ${new Date(Number(ai.deadline) * 1000).toLocaleDateString()}`
        md += '\n'
      }
    }

    return md
  }

  private toPlainText(
    meeting: Record<string, unknown>,
    notes: Array<Record<string, unknown>>,
    transcripts: Array<Record<string, unknown>>,
    actionItems: Array<Record<string, unknown>>
  ): string {
    let text = `${meeting.title || 'Untitled Meeting'}\n`
    text += `${'='.repeat(60)}\n\n`

    if (notes.length > 0) {
      text += `NOTES\n${'-'.repeat(60)}\n${notes.map(n => n.original_text || '').join('\n\n')}\n\n`
    }

    if (transcripts.length > 0) {
      text += `TRANSCRIPT\n${'-'.repeat(60)}\n`
      for (const t of transcripts) {
        text += `[${new Date(Number(t.start_time) * 1000).toLocaleTimeString()}] `
        if (t.speaker_name) text += `${t.speaker_name}: `
        text += `${t.text || ''}\n`
      }
      text += '\n'
    }

    if (actionItems.length > 0) {
      text += `ACTION ITEMS\n${'-'.repeat(60)}\n`
      for (const ai of actionItems) {
        const status = ai.status === 'completed' ? '[DONE]' : '[OPEN]'
        text += `${status} ${ai.text || ''}\n`
      }
    }

    return text
  }

  private toNotionMarkdown(
    meeting: Record<string, unknown>,
    notes: Array<Record<string, unknown>>,
    _transcripts: Array<Record<string, unknown>>,
    actionItems: Array<Record<string, unknown>>
  ): string {
    // Notion-flavored Markdown: uses toggle blocks, callouts, and database-friendly formatting
    let md = `# ${meeting.title || 'Untitled Meeting'}\n\n`
    md += `> 📅 ${new Date(Number(meeting.start_time) * 1000).toLocaleDateString()} · ⏱ ${Math.round(Number(meeting.duration || 0) / 60)} min\n\n`

    if (notes.length > 0) {
      md += `<details>\n<summary>📝 Notes</summary>\n\n${notes.map(n => n.original_text || '').join('\n\n')}\n\n</details>\n\n`
    }

    if (actionItems.length > 0) {
      md += `## ✅ Action Items\n\n`
      md += `| Status | Task | Assignee | Deadline |\n`
      md += `|--------|------|----------|----------|\n`
      for (const ai of actionItems) {
        const status = ai.status === 'completed' ? '✅' : '⬜'
        const deadline = ai.deadline
          ? new Date(Number(ai.deadline) * 1000).toLocaleDateString()
          : '-'
        md += `| ${status} | ${ai.text || ''} | ${ai.assignee || '-'} | ${deadline} |\n`
      }
    }

    return md
  }

  private sanitizeFilename(name: string): string {
    return name
      .replace(/[<>:"/\\|?*]/g, '-')
      .replace(/\s+/g, '_')
      .substring(0, 100)
  }
}

let instance: ExportService | null = null

export function getExportService(): ExportService {
  if (!instance) instance = new ExportService()
  return instance
}
