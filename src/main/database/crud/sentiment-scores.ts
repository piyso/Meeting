/**
 * CRUD Operations for Sentiment Scores Table
 */

import { getDatabase } from '../connection'
import type {
  SentimentScore,
  CreateSentimentScoreInput,
  MeetingMood,
  SentimentLabel,
} from '../../../types/features'
import { v4 as uuidv4 } from 'uuid'

/**
 * Create a single sentiment score
 */
export function createSentimentScore(input: CreateSentimentScoreInput): SentimentScore {
  const db = getDatabase()
  const id = input.id || uuidv4()

  db.prepare(
    `INSERT INTO sentiment_scores (id, meeting_id, transcript_id, score, label, confidence, source, speaker_name, timestamp_sec)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.meeting_id,
    input.transcript_id ?? null,
    input.score,
    input.label,
    input.confidence,
    input.source,
    input.speaker_name ?? null,
    input.timestamp_sec
  )

  return db.prepare('SELECT * FROM sentiment_scores WHERE id = ?').get(id) as SentimentScore
}

/**
 * Batch create sentiment scores (transaction-wrapped)
 */
export function createSentimentScoresBatch(items: CreateSentimentScoreInput[]): number {
  const db = getDatabase()

  const stmt = db.prepare(
    `INSERT INTO sentiment_scores (id, meeting_id, transcript_id, score, label, confidence, source, speaker_name, timestamp_sec)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )

  const insertAll = db.transaction(() => {
    for (const input of items) {
      stmt.run(
        input.id || uuidv4(),
        input.meeting_id,
        input.transcript_id ?? null,
        input.score,
        input.label,
        input.confidence,
        input.source,
        input.speaker_name ?? null,
        input.timestamp_sec
      )
    }
  })

  insertAll()
  return items.length
}

/**
 * Get all sentiment scores for a meeting
 */
export function getSentimentByMeeting(meetingId: string): SentimentScore[] {
  const db = getDatabase()
  return db
    .prepare('SELECT * FROM sentiment_scores WHERE meeting_id = ? ORDER BY timestamp_sec ASC')
    .all(meetingId) as SentimentScore[]
}

/**
 * Get meeting mood aggregate (average score + label)
 */
export function getMeetingMood(meetingId: string): MeetingMood | null {
  const db = getDatabase()
  const row = db
    .prepare(
      `SELECT
         AVG(score) as avgScore,
         AVG(confidence) as confidence,
         COUNT(*) as totalSegments
       FROM sentiment_scores
       WHERE meeting_id = ?`
    )
    .get(meetingId) as
    | { avgScore: number | null; confidence: number; totalSegments: number }
    | undefined

  if (!row || row.totalSegments === 0 || row.avgScore === null) return null

  // Derive label from average score
  let label: SentimentLabel = 'neutral'
  if (row.avgScore > 0.15) label = 'positive'
  else if (row.avgScore < -0.15) label = 'negative'

  return {
    avgScore: Math.round(row.avgScore * 100) / 100,
    label,
    confidence: Math.round(row.confidence * 100) / 100,
    totalSegments: row.totalSegments,
  }
}

/**
 * Get sentiment timeline for a meeting (ordered by time position)
 */
export function getSentimentTimeline(meetingId: string): SentimentScore[] {
  const db = getDatabase()
  return db
    .prepare(
      `SELECT * FROM sentiment_scores
       WHERE meeting_id = ?
       ORDER BY timestamp_sec ASC`
    )
    .all(meetingId) as SentimentScore[]
}

/**
 * Delete all sentiment scores for a meeting
 */
export function deleteSentimentByMeeting(meetingId: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM sentiment_scores WHERE meeting_id = ?').run(meetingId)
}
