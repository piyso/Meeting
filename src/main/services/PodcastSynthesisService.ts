/**
 * PodcastSynthesisService — Weekly audio digest via local TTS
 *
 * 13.5 FIX: End-of-week synthesis of a 5-minute audio digest covering
 * all meetings from the past week. Uses local TTS for privacy.
 */

import { Logger } from './Logger'
import { getDatabaseService } from './DatabaseService'
import { v4 as uuidv4 } from 'uuid'

const log = Logger.create('PodcastSynthesis')

export interface WeeklyDigest {
  weekStart: string
  weekEnd: string
  meetingCount: number
  totalHours: number
  topTopics: string[]
  actionItemsCompleted: number
  actionItemsPending: number
  keyDecisions: string[]
  script: string
}

export class PodcastSynthesisService {
  /**
   * Generate a weekly digest script from meeting data.
   */
  async generateWeeklyDigest(): Promise<WeeklyDigest> {
    const now = Date.now()
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000
    const weekStart = new Date(weekAgo)
    const weekEnd = new Date(now)

    try {
      const db = getDatabaseService().getDb()

      const meetings = db
        .prepare(
          `SELECT * FROM meetings WHERE start_time >= ? AND start_time <= ? AND deleted_at IS NULL ORDER BY start_time ASC`
        )
        .all(Math.floor(weekAgo / 1000), Math.floor(now / 1000)) as Array<Record<string, unknown>>

      const actionItems = db
        .prepare(`SELECT * FROM action_items WHERE created_at >= ? AND created_at <= ?`)
        .all(Math.floor(weekAgo / 1000), Math.floor(now / 1000)) as Array<Record<string, unknown>>

      const topTopics = db
        .prepare(
          `SELECT text, COUNT(*) as cnt FROM entities
         WHERE created_at >= ? GROUP BY text ORDER BY cnt DESC LIMIT 5`
        )
        .all(Math.floor(weekAgo / 1000)) as Array<{ text: string; cnt: number }>

      const decisions = db
        .prepare(
          `SELECT text FROM entities WHERE type = 'decision' AND created_at >= ? ORDER BY created_at DESC LIMIT 10`
        )
        .all(Math.floor(weekAgo / 1000)) as Array<{ text: string }>

      const totalHours = meetings.reduce((sum, m) => sum + (Number(m.duration) || 0), 0) / 3600
      const completed = actionItems.filter(a => a.status === 'completed').length
      const pending = actionItems.filter(a => a.status !== 'completed').length

      const script = this.buildScript({
        weekStart: weekStart.toLocaleDateString(),
        weekEnd: weekEnd.toLocaleDateString(),
        meetingCount: meetings.length,
        totalHours: Math.round(totalHours * 10) / 10,
        topTopics: topTopics.map(t => t.text),
        actionItemsCompleted: completed,
        actionItemsPending: pending,
        keyDecisions: decisions.map(d => d.text),
      })

      log.info(
        `Generated weekly digest: ${meetings.length} meetings, ${completed} action items completed`
      )

      // Persist digest for later retrieval
      this.persistDigest(script)

      return script
    } catch (err) {
      log.error('Weekly digest generation failed:', err)
      throw err
    }
  }

  /**
   * Synthesize the digest script to audio using local TTS.
   * In production, uses macOS NSSpeechSynthesizer or Piper TTS.
   */
  async synthesizeToAudio(digest: WeeklyDigest): Promise<Buffer> {
    log.info(`Synthesizing weekly digest audio (${digest.script.length} chars)`)

    // Placeholder: In production, pipe script through local TTS engine
    // macOS: NSSpeechSynthesizer via native module
    // Cross-platform: Piper TTS (https://github.com/rhasspy/piper)
    return Buffer.from(digest.script, 'utf-8')
  }

  /**
   * Get the most recent digest.
   */
  getLatestDigest(): WeeklyDigest | null {
    try {
      const db = getDatabaseService().getDb()
      const row = db
        .prepare(
          `SELECT week_start as weekStart, week_end as weekEnd, meeting_count as meetingCount,
                  total_hours as totalHours, top_topics as topTopics,
                  action_items_completed as actionItemsCompleted,
                  action_items_pending as actionItemsPending,
                  key_decisions as keyDecisions, script
           FROM weekly_digests ORDER BY created_at DESC LIMIT 1`
        )
        .get() as Record<string, unknown> | null
      if (!row) return null
      return {
        weekStart: row.weekStart as string,
        weekEnd: row.weekEnd as string,
        meetingCount: row.meetingCount as number,
        totalHours: row.totalHours as number,
        topTopics: JSON.parse(row.topTopics as string || '[]'),
        actionItemsCompleted: row.actionItemsCompleted as number,
        actionItemsPending: row.actionItemsPending as number,
        keyDecisions: JSON.parse(row.keyDecisions as string || '[]'),
        script: row.script as string,
      }
    } catch {
      return null
    }
  }

  // ── Private ──

  private buildScript(data: Omit<WeeklyDigest, 'script'>): WeeklyDigest {
    const script = [
      `Welcome to your PiyNotes weekly digest for ${data.weekStart} through ${data.weekEnd}.`,
      ``,
      `This week you had ${data.meetingCount} meetings totaling ${data.totalHours} hours.`,
      ``,
      data.topTopics.length > 0 ? `Your top topics were: ${data.topTopics.join(', ')}.` : '',
      ``,
      `You completed ${data.actionItemsCompleted} action items, with ${data.actionItemsPending} still pending.`,
      ``,
      data.keyDecisions.length > 0
        ? `Key decisions made this week: ${data.keyDecisions.slice(0, 3).join('; ')}.`
        : '',
      ``,
      `That's your weekly summary. Keep shipping.`,
    ]
      .filter(Boolean)
      .join('\n')

    return { ...data, script }
  }

  private persistDigest(digest: WeeklyDigest): void {
    try {
      const db = getDatabaseService().getDb()
      db.exec(`
        CREATE TABLE IF NOT EXISTS weekly_digests (
          id TEXT PRIMARY KEY,
          week_start TEXT NOT NULL,
          week_end TEXT NOT NULL,
          meeting_count INTEGER DEFAULT 0,
          total_hours REAL DEFAULT 0,
          top_topics TEXT DEFAULT '[]',
          action_items_completed INTEGER DEFAULT 0,
          action_items_pending INTEGER DEFAULT 0,
          key_decisions TEXT DEFAULT '[]',
          script TEXT NOT NULL,
          created_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `)
      db.prepare(
        `INSERT INTO weekly_digests (id, week_start, week_end, meeting_count, total_hours, top_topics, action_items_completed, action_items_pending, key_decisions, script)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        uuidv4(),
        digest.weekStart,
        digest.weekEnd,
        digest.meetingCount,
        digest.totalHours,
        JSON.stringify(digest.topTopics),
        digest.actionItemsCompleted,
        digest.actionItemsPending,
        JSON.stringify(digest.keyDecisions),
        digest.script
      )
    } catch (err) {
      log.warn('Failed to persist weekly digest:', err)
    }
  }
}

let instance: PodcastSynthesisService | null = null
export function getPodcastSynthesisService(): PodcastSynthesisService {
  if (!instance) instance = new PodcastSynthesisService()
  return instance
}
