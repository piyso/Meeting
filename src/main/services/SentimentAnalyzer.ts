/**
 * Sentiment Analyzer Service
 *
 * Three strategies:
 *   A. Keyword heuristic (real-time, <1ms, confidence: 0.4)
 *   B. Local LLM (post-meeting, confidence: 0.75)
 *   C. Cloud AI (Pro+, confidence: 0.9)
 */

import { Logger } from './Logger'
import type {
  SentimentScore,
  SentimentLabel,
  CreateSentimentScoreInput,
  MeetingMood,
} from '../../types/features'
import {
  createSentimentScoresBatch,
  getSentimentByMeeting,
  getMeetingMood,
} from '../database/crud/sentiment-scores'

const log = Logger.create('SentimentAnalyzer')

// ─── Lexicons ────────────────────────────────────────────────

const POSITIVE = new Set([
  'great',
  'excellent',
  'love',
  'agree',
  'perfect',
  'wonderful',
  'amazing',
  'fantastic',
  'brilliant',
  'awesome',
  'good',
  'happy',
  'pleased',
  'excited',
  'yes',
  'absolutely',
  'definitely',
  'impressive',
  'outstanding',
  'superb',
  'thank',
  'thanks',
  'appreciate',
  'helpful',
  'progress',
  'success',
  'achieved',
  'accomplished',
  'milestone',
  'opportunity',
  'growth',
])

const NEGATIVE = new Set([
  'bad',
  'terrible',
  'wrong',
  'disagree',
  'concern',
  'problem',
  'issue',
  'risk',
  'worried',
  'unfortunately',
  'fail',
  'failure',
  'mistake',
  'unclear',
  'confusing',
  'frustrated',
  'disappointed',
  'delay',
  'behind',
  'blocked',
  'difficult',
  'struggling',
  'impossible',
  'worse',
  'hate',
  'awful',
  'horrible',
  'critical',
  'broken',
  'bug',
])

const INTENSIFIERS = new Set([
  'very',
  'extremely',
  'really',
  'absolutely',
  'incredibly',
  'completely',
  'totally',
  'highly',
  'deeply',
  'so',
  'quite',
])

const NEGATORS = new Set([
  'not',
  "don't",
  "doesn't",
  "didn't",
  "won't",
  "can't",
  'cannot',
  'no',
  'never',
  'nothing',
  'neither',
  'nor',
  'none',
  "isn't",
  "aren't",
])

// ─── Strategy A: Keyword Heuristic ──────────────────────────

/**
 * Quick sentiment using keyword scoring.
 * Real-time safe (<1ms).
 */
export function quickSentiment(text: string): {
  score: number
  label: SentimentLabel
  confidence: number
} {
  const words = text.toLowerCase().split(/\s+/)
  let score = 0
  let wordCount = 0
  let negateNext = false
  let intensifyNext = false

  for (const word of words) {
    const cleanWord = word.replace(/[^a-z']/g, '')
    if (!cleanWord) continue

    if (NEGATORS.has(cleanWord)) {
      negateNext = true
      continue
    }

    if (INTENSIFIERS.has(cleanWord)) {
      intensifyNext = true
      continue
    }

    let wordScore = 0
    if (POSITIVE.has(cleanWord)) wordScore = 1
    else if (NEGATIVE.has(cleanWord)) wordScore = -1

    if (wordScore !== 0) {
      if (intensifyNext) wordScore *= 1.5
      if (negateNext) wordScore *= -1
      score += wordScore
      wordCount++
    }

    negateNext = false
    intensifyNext = false
  }

  // Normalize to [-1, 1]
  const normalized = wordCount > 0 ? Math.max(-1, Math.min(1, score / Math.sqrt(wordCount))) : 0

  let label: SentimentLabel = 'neutral'
  if (normalized > 0.15) label = 'positive'
  else if (normalized < -0.15) label = 'negative'

  return {
    score: Math.round(normalized * 100) / 100,
    label,
    confidence: 0.4,
  }
}

// ─── Strategy B: Local LLM ──────────────────────────────────

/**
 * Analyze sentiment using local LLM.
 * Batches segments for efficiency.
 */
async function analyzeWithLLM(
  meetingId: string,
  segments: Array<{ id: string; text: string; start_time: number; speaker_name?: string | null }>
): Promise<CreateSentimentScoreInput[]> {
  try {
    const { getModelManager } = await import('./ModelManager')
    const modelManager = getModelManager()

    const results: CreateSentimentScoreInput[] = []

    // Batch 10 segments per LLM call
    for (let i = 0; i < segments.length; i += 10) {
      const batch = segments.slice(i, i + 10)
      const prompt = `Analyze sentiment of each line. Return JSON array: [{"index": 0, "score": -1.0 to 1.0, "label": "positive"|"neutral"|"negative"}]

${batch.map((s, idx) => `${idx}: ${s.text}`).join('\n')}

JSON:`

      // M-11 AUDIT: 30s timeout prevents indefinite hang on slow/stuck LLM
      const response = await Promise.race([
        modelManager.generate({
          prompt,
          temperature: 0.1,
          maxTokens: 512,
        }),
        new Promise<null>(resolve => setTimeout(() => resolve(null), 30_000)),
      ])

      if (!response) continue

      const jsonMatch = response.match(/\[[\s\S]*?\]/)
      if (!jsonMatch) continue

      try {
        const parsed = JSON.parse(jsonMatch[0]) as Array<{
          index: number
          score: number
          label: string
        }>

        for (const item of parsed) {
          const seg = batch[item.index]
          if (!seg) continue
          results.push({
            meeting_id: meetingId,
            transcript_id: seg.id,
            score: Math.max(-1, Math.min(1, item.score)),
            label: (['positive', 'neutral', 'negative'].includes(item.label)
              ? item.label
              : 'neutral') as SentimentLabel,
            confidence: 0.75,
            source: 'llm_local',
            speaker_name: seg.speaker_name || null,
            timestamp_sec: seg.start_time,
          })
        }
      } catch {
        // Parse error for this batch
      }
    }

    return results
  } catch (err) {
    log.error('LLM sentiment analysis failed', err)
    return []
  }
}

// ─── Strategy C: Cloud AI ───────────────────────────────────

async function analyzeWithCloudAI(
  meetingId: string,
  segments: Array<{ id: string; text: string; start_time: number; speaker_name?: string | null }>
): Promise<CreateSentimentScoreInput[]> {
  try {
    const { getBackend } = await import('./backend/BackendSingleton')
    const backend = getBackend()
    const health = await backend.healthCheck()
    if (health.status !== 'healthy') return []

    const text = segments.map(s => `[${s.speaker_name || 'Speaker'}]: ${s.text}`).join('\n')

    // M-11 AUDIT: 30s timeout prevents indefinite hang on cloud API
    const answer = await Promise.race([
      backend.ask(
        `Analyze sentiment per speaker turn. Return JSON array: [{"index": 0, "score": -1.0 to 1.0, "label": "positive"|"neutral"|"negative"}]

${text.substring(0, 6000)}

JSON:`
      ),
      new Promise<null>(resolve => setTimeout(() => resolve(null), 30_000)),
    ])

    if (!answer?.answer) return []

    const jsonMatch = answer.answer.match(/\[[\s\S]*?\]/)
    if (!jsonMatch) return []

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      index: number
      score: number
      label: string
    }>

    const results: CreateSentimentScoreInput[] = []
    for (const item of parsed) {
      const seg = segments[item.index]
      if (!seg) continue
      results.push({
        meeting_id: meetingId,
        transcript_id: seg.id,
        score: Math.max(-1, Math.min(1, item.score)),
        label: (['positive', 'neutral', 'negative'].includes(item.label)
          ? item.label
          : 'neutral') as SentimentLabel,
        confidence: 0.9,
        source: 'llm_cloud' as const,
        speaker_name: seg.speaker_name || null,
        timestamp_sec: seg.start_time,
      })
    }

    // Ingest mood summary into knowledge graph
    if (results.length > 0) {
      try {
        const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length
        const moodLabel = avgScore > 0.15 ? 'positive' : avgScore < -0.15 ? 'negative' : 'neutral'
        await backend.kgIngest(
          `Meeting ${meetingId} had ${moodLabel} sentiment (avg score: ${avgScore.toFixed(2)}, ${results.length} segments analyzed)`
        )
      } catch {
        // Non-critical — KG enrichment is best-effort
      }
    }

    return results
  } catch (err) {
    log.error('Cloud sentiment analysis failed', err)
    return []
  }
}

// ─── Main Pipeline ──────────────────────────────────────────

/**
 * Full sentiment analysis pipeline for a meeting.
 * Uses best available strategy.
 */
export async function analyzeMeeting(meetingId: string): Promise<SentimentScore[]> {
  log.info(`Starting sentiment analysis for meeting ${meetingId}`)

  // Check if already analyzed
  const existing = getSentimentByMeeting(meetingId)
  if (existing.length > 0) {
    log.debug(`Meeting ${meetingId} already has ${existing.length} sentiment scores`)
    return existing
  }

  // Get transcripts
  const { getTranscriptsByMeetingId } = await import('../database/crud/transcripts')
  const transcripts = getTranscriptsByMeetingId(meetingId)
  if (transcripts.length === 0) {
    log.debug('No transcripts found for meeting')
    return []
  }

  const segments = transcripts.map(t => ({
    id: t.id,
    text: t.text,
    start_time: t.start_time,
    speaker_name: t.speaker_name || null,
  }))

  let results: CreateSentimentScoreInput[] = []

  // Try cloud first (Pro+), fall back to LLM, fall back to heuristic
  try {
    const { getCloudAccessManager } = await import('./CloudAccessManager')
    const cam = getCloudAccessManager()
    const features = await cam.getFeatureAccess()
    if (features.cloudAI) {
      results = await analyzeWithCloudAI(meetingId, segments)
    }
  } catch {
    // Cloud not available
  }

  if (results.length === 0) {
    // Try local LLM
    results = await analyzeWithLLM(meetingId, segments)
  }

  if (results.length === 0) {
    // Fall back to heuristic
    results = segments.map(seg => {
      const sentiment = quickSentiment(seg.text)
      return {
        meeting_id: meetingId,
        transcript_id: seg.id,
        score: sentiment.score,
        label: sentiment.label,
        confidence: sentiment.confidence,
        source: 'heuristic' as const,
        speaker_name: seg.speaker_name,
        timestamp_sec: seg.start_time,
      }
    })
  }

  // Batch insert
  const count = createSentimentScoresBatch(results)
  log.info(`Sentiment analysis complete: ${count} scores saved for meeting ${meetingId}`)

  return getSentimentByMeeting(meetingId)
}

/**
 * Get meeting mood (convenience wrapper).
 */
export async function getMood(meetingId: string): Promise<MeetingMood | null> {
  return getMeetingMood(meetingId)
}
