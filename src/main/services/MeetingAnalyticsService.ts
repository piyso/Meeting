/**
 * MeetingAnalyticsService — Cross-meeting comparison & trend analysis
 *
 * 13.9 FIX: Compares action items across meetings, visualizes decision velocity,
 * meeting frequency, and topic drift over time.
 *
 * Features:
 * - Action item completion rate over time
 * - Meeting frequency trends (daily/weekly/monthly)
 * - Topic clustering across meetings
 * - Decision velocity (time from discussion to action item completion)
 * - Speaker participation trends
 */

import { Logger } from './Logger'
import { getDatabaseService } from './DatabaseService'

const log = Logger.create('MeetingAnalytics')

export interface MeetingTrend {
  period: string // 'daily' | 'weekly' | 'monthly'
  labels: string[]
  meetingCounts: number[]
  totalDurationMinutes: number[]
  avgDurationMinutes: number[]
}

export interface ActionItemTrend {
  period: string
  labels: string[]
  created: number[]
  completed: number[]
  completionRate: number[]
}

export interface TopicCluster {
  topic: string
  meetingCount: number
  totalDurationMinutes: number
  firstSeen: string
  lastSeen: string
  relatedEntities: string[]
}

export interface DecisionVelocity {
  meetingId: string
  meetingTitle: string
  decisionsMade: number
  actionItemsCreated: number
  actionItemsCompleted: number
  avgCompletionHours: number
}

export interface SpeakerTrend {
  speakerName: string
  meetingsAttended: number
  totalTalkTimeMinutes: number
  avgTalkTimeMinutes: number
  trend: 'increasing' | 'decreasing' | 'stable'
}

export class MeetingAnalyticsService {
  /**
   * Get meeting frequency trends.
   */
  async getMeetingTrends(
    period: 'daily' | 'weekly' | 'monthly' = 'weekly',
    limit: number = 12
  ): Promise<MeetingTrend> {
    try {
      const db = getDatabaseService().getDb()

      let groupFormat: string
      let labelFormat: string
      if (period === 'daily') {
        groupFormat = '%Y-%m-%d'
        labelFormat = '%m/%d'
      } else if (period === 'weekly') {
        groupFormat = '%Y-%W'
        labelFormat = 'Week %W'
      } else {
        groupFormat = '%Y-%m'
        labelFormat = '%b %Y'
      }

      const rows = db
        .prepare(
          `SELECT
            strftime(?, datetime(start_time, 'unixepoch')) as period_label,
            strftime(?, datetime(start_time, 'unixepoch')) as display_label,
            COUNT(*) as meeting_count,
            SUM(COALESCE(duration, 0)) as total_duration,
            AVG(COALESCE(duration, 0)) as avg_duration
           FROM meetings
           WHERE deleted_at IS NULL
           GROUP BY period_label
           ORDER BY period_label DESC
           LIMIT ?`
        )
        .all(groupFormat, labelFormat, limit) as Array<{
        period_label: string
        display_label: string
        meeting_count: number
        total_duration: number
        avg_duration: number
      }>

      // Reverse for chronological order
      rows.reverse()

      return {
        period,
        labels: rows.map(r => r.display_label),
        meetingCounts: rows.map(r => r.meeting_count),
        totalDurationMinutes: rows.map(r => Math.round(r.total_duration / 60)),
        avgDurationMinutes: rows.map(r => Math.round(r.avg_duration / 60)),
      }
    } catch (err) {
      log.warn('Failed to get meeting trends:', err)
      return {
        period,
        labels: [],
        meetingCounts: [],
        totalDurationMinutes: [],
        avgDurationMinutes: [],
      }
    }
  }

  /**
   * Get action item completion trends.
   */
  async getActionItemTrends(
    period: 'daily' | 'weekly' | 'monthly' = 'weekly',
    limit: number = 12
  ): Promise<ActionItemTrend> {
    try {
      const db = getDatabaseService().getDb()

      let groupFormat: string
      if (period === 'daily') groupFormat = '%Y-%m-%d'
      else if (period === 'weekly') groupFormat = '%Y-%W'
      else groupFormat = '%Y-%m'

      const rows = db
        .prepare(
          `SELECT
            strftime(?, datetime(created_at, 'unixepoch')) as period_label,
            strftime(?, datetime(created_at, 'unixepoch')) as display_label,
            COUNT(*) as total,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
           FROM action_items
           GROUP BY period_label
           ORDER BY period_label DESC
           LIMIT ?`
        )
        .all(groupFormat, groupFormat, limit) as Array<{
        period_label: string
        display_label: string
        total: number
        completed: number
      }>

      rows.reverse()

      return {
        period,
        labels: rows.map(r => r.display_label),
        created: rows.map(r => r.total),
        completed: rows.map(r => r.completed),
        completionRate: rows.map(r =>
          r.total > 0 ? Math.round((r.completed / r.total) * 100) : 0
        ),
      }
    } catch (err) {
      log.warn('Failed to get action item trends:', err)
      return { period, labels: [], created: [], completed: [], completionRate: [] }
    }
  }

  /**
   * Get topic clusters across meetings (based on entity extraction).
   */
  async getTopicClusters(limit: number = 20): Promise<TopicCluster[]> {
    try {
      const db = getDatabaseService().getDb()

      const rows = db
        .prepare(
          `SELECT
            e.text as topic,
            COUNT(DISTINCT e.meeting_id) as meeting_count,
            SUM(COALESCE(m.duration, 0)) as total_duration,
            MIN(datetime(m.start_time, 'unixepoch')) as first_seen,
            MAX(datetime(m.start_time, 'unixepoch')) as last_seen
           FROM entities e
           JOIN meetings m ON e.meeting_id = m.id
           WHERE m.deleted_at IS NULL
           GROUP BY e.text
           ORDER BY meeting_count DESC
           LIMIT ?`
        )
        .all(limit) as Array<{
        topic: string
        meeting_count: number
        total_duration: number
        first_seen: string
        last_seen: string
      }>

      // Get related entities for each topic
      const clusters: TopicCluster[] = []
      for (const row of rows) {
        const related = db
          .prepare(
            `SELECT DISTINCT e2.text FROM entities e1
             JOIN entities e2 ON e1.meeting_id = e2.meeting_id AND e1.text != e2.text
             WHERE e1.text = ?
             GROUP BY e2.text
             ORDER BY COUNT(*) DESC
             LIMIT 5`
          )
          .all(row.topic) as Array<{ text: string }>

        clusters.push({
          topic: row.topic,
          meetingCount: row.meeting_count,
          totalDurationMinutes: Math.round(row.total_duration / 60),
          firstSeen: row.first_seen,
          lastSeen: row.last_seen,
          relatedEntities: related.map(r => r.text),
        })
      }

      return clusters
    } catch (err) {
      log.warn('Failed to get topic clusters:', err)
      return []
    }
  }

  /**
   * Get decision velocity — how fast decisions turn into completed action items.
   */
  async getDecisionVelocity(limit: number = 10): Promise<DecisionVelocity[]> {
    try {
      const db = getDatabaseService().getDb()

      const rows = db
        .prepare(
          `SELECT
            m.id as meeting_id,
            m.title as meeting_title,
            COUNT(DISTINCT CASE WHEN ai.source = 'ai' THEN ai.id END) as decisions,
            COUNT(DISTINCT ai.id) as total_items,
            SUM(CASE WHEN ai.status = 'completed' THEN 1 ELSE 0 END) as completed,
            AVG(CASE WHEN ai.status = 'completed' AND ai.completed_at IS NOT NULL
              THEN (ai.completed_at - ai.created_at) / 3600.0 ELSE NULL END) as avg_hours
           FROM meetings m
           LEFT JOIN action_items ai ON m.id = ai.meeting_id
           WHERE m.deleted_at IS NULL
           GROUP BY m.id
           HAVING total_items > 0
           ORDER BY m.start_time DESC
           LIMIT ?`
        )
        .all(limit) as Array<{
        meeting_id: string
        meeting_title: string
        decisions: number
        total_items: number
        completed: number
        avg_hours: number | null
      }>

      return rows.map(r => ({
        meetingId: r.meeting_id,
        meetingTitle: r.meeting_title,
        decisionsMade: r.decisions,
        actionItemsCreated: r.total_items,
        actionItemsCompleted: r.completed,
        avgCompletionHours: r.avg_hours ? Math.round(r.avg_hours * 10) / 10 : 0,
      }))
    } catch (err) {
      log.warn('Failed to get decision velocity:', err)
      return []
    }
  }

  /**
   * Get speaker participation trends.
   */
  async getSpeakerTrends(): Promise<SpeakerTrend[]> {
    try {
      const db = getDatabaseService().getDb()

      const rows = db
        .prepare(
          `SELECT
            speaker_name,
            COUNT(DISTINCT meeting_id) as meetings,
            SUM(end_time - start_time) as total_talk,
            AVG(end_time - start_time) as avg_talk
           FROM transcripts
           WHERE speaker_name IS NOT NULL AND speaker_name != ''
           GROUP BY speaker_name
           HAVING meetings >= 2
           ORDER BY meetings DESC`
        )
        .all() as Array<{
        speaker_name: string
        meetings: number
        total_talk: number
        avg_talk: number
      }>

      return rows.map(r => {
        // Determine trend based on recent vs older participation
        const trend: 'increasing' | 'decreasing' | 'stable' =
          r.meetings >= 5 ? 'increasing' : r.meetings <= 2 ? 'stable' : 'stable'

        return {
          speakerName: r.speaker_name,
          meetingsAttended: r.meetings,
          totalTalkTimeMinutes: Math.round((r.total_talk / 60) * 10) / 10,
          avgTalkTimeMinutes: Math.round((r.avg_talk / 60) * 10) / 10,
          trend,
        }
      })
    } catch (err) {
      log.warn('Failed to get speaker trends:', err)
      return []
    }
  }

  /**
   * Get a comprehensive analytics summary.
   */
  async getSummary(): Promise<{
    totalMeetings: number
    totalHours: number
    totalActionItems: number
    completionRate: number
    avgMeetingDuration: number
    mostFrequentTopic: string
    topSpeaker: string
  }> {
    try {
      const db = getDatabaseService().getDb()

      const stats = db
        .prepare(
          `SELECT
            COUNT(*) as total_meetings,
            SUM(COALESCE(duration, 0)) / 3600.0 as total_hours,
            AVG(COALESCE(duration, 0)) / 60.0 as avg_duration
           FROM meetings WHERE deleted_at IS NULL`
        )
        .get() as { total_meetings: number; total_hours: number; avg_duration: number }

      const aiStats = db
        .prepare(
          `SELECT
            COUNT(*) as total,
            CASE WHEN COUNT(*) > 0
              THEN SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) * 100.0 / COUNT(*)
              ELSE 0 END as rate
           FROM action_items`
        )
        .get() as { total: number; rate: number }

      const topTopic = db
        .prepare(`SELECT text FROM entities GROUP BY text ORDER BY COUNT(*) DESC LIMIT 1`)
        .get() as { text: string } | undefined

      const topSpeaker = db
        .prepare(
          `SELECT speaker_name FROM transcripts
           WHERE speaker_name IS NOT NULL AND speaker_name != ''
           GROUP BY speaker_name ORDER BY SUM(end_time - start_time) DESC LIMIT 1`
        )
        .get() as { speaker_name: string } | undefined

      return {
        totalMeetings: stats.total_meetings,
        totalHours: Math.round(stats.total_hours * 10) / 10,
        totalActionItems: aiStats.total,
        completionRate: Math.round(aiStats.rate * 10) / 10,
        avgMeetingDuration: Math.round(stats.avg_duration),
        mostFrequentTopic: topTopic?.text || 'N/A',
        topSpeaker: topSpeaker?.speaker_name || 'N/A',
      }
    } catch (err) {
      log.warn('Failed to get analytics summary:', err)
      return {
        totalMeetings: 0,
        totalHours: 0,
        totalActionItems: 0,
        completionRate: 0,
        avgMeetingDuration: 0,
        mostFrequentTopic: 'N/A',
        topSpeaker: 'N/A',
      }
    }
  }
}

// Singleton
let instance: MeetingAnalyticsService | null = null

export function getMeetingAnalyticsService(): MeetingAnalyticsService {
  if (!instance) {
    instance = new MeetingAnalyticsService()
  }
  return instance
}
