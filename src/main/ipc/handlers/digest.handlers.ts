import { ipcMain } from 'electron'
import { getDatabase } from '../../database/connection'
import { Logger } from '../../services/Logger'
import { createHash } from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { buildMeetingDigest } from '../../utils/meetingDigest'
import { emitWebhookEvent } from '../../services/WebhookDispatchService'

const log = Logger.create('DigestHandlers')

// Cache dynamic imports to avoid re-resolving per call (generateText is called 3× in parallel)
let _modelManagerMod: typeof import('../../services/ModelManager') | null = null

export function registerDigestHandlers(): void {
  // digest:generate — Generate meeting digest via local AI engine
  // Pro+: Uses cloud /ask for AI-generated key decisions, action items, contradictions
  ipcMain.handle('digest:generate', async (_, params) => {
    try {
      const db = getDatabase()

      // ── Single meeting summary ──
      if (params.meetingId) {
        const transcripts = db
          .prepare(
            'SELECT text, speaker_name AS speaker, end_time FROM transcripts WHERE meeting_id = ? ORDER BY start_time ASC'
          )
          .all(params.meetingId) as Array<{
          text: string
          speaker: string | null
          end_time: number | null
        }>

        if (transcripts.length === 0) {
          return {
            success: true,
            data: {
              summary: 'No transcript is available for this meeting yet.',
              actionItems: '',
              decisions: '',
              generatedAt: Date.now(),
              empty: true,
            },
          }
        }

        // What the summary is based on. A cached summary is only reused while
        // the transcript is the same one — a summary generated mid-recording
        // (or before interrupted audio was recovered) used to be served forever.
        const basis = `${DIGEST_METHOD}:${transcripts.length}:${transcripts[transcripts.length - 1]?.end_time ?? 0}`
        const cacheId = `single_${params.meetingId}`

        if (!params.force) {
          const cachedDigest = db
            .prepare(
              "SELECT summary, highlights FROM digests WHERE id = ? AND period_type = 'single'"
            )
            .get(cacheId) as { summary: string; highlights: string } | undefined

          if (cachedDigest) {
            try {
              const parsedHighlights = JSON.parse(cachedDigest.highlights || '{}')
              const usable =
                parsedHighlights.basis === basis && !cachedDigest.summary.startsWith(AI_UNAVAILABLE)
              if (usable) {
                return {
                  success: true,
                  data: {
                    summary: cachedDigest.summary,
                    actionItems: parsedHighlights.actionItems || '',
                    decisions: parsedHighlights.decisions || '',
                    generatedAt: Date.now(),
                    cached: true,
                  },
                }
              }
            } catch (e) {
              log.warn('Failed to parse cached highlights, regenerating...', e)
            }
          }
        }

        // A meeting longer than the model's context is read part by part, so
        // the summary covers all of it instead of only its first ten minutes.
        const {
          summary,
          actionItems: actions,
          decisions,
        } = await buildMeetingDigest(transcripts, tryGenerateText)

        if (summary === null && actions === null && decisions === null) {
          return {
            success: false,
            error: {
              code: 'DIGEST_FAILED',
              message: 'Meeting digest unavailable — AI engine may still be loading.',
              timestamp: Date.now(),
            },
          }
        }

        // Cache only a complete result. A failure message used to be stored
        // here as the meeting's summary and returned from then on.
        if (summary !== null && actions !== null && decisions !== null) {
          try {
            db.prepare(
              `INSERT OR REPLACE INTO digests (id, user_id, period_type, start_date, end_date, summary, highlights, meeting_count)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(
              cacheId,
              'local_user',
              'single',
              Math.floor(Date.now() / 1000), // Dummy start/end date for single meeting cache
              Math.floor(Date.now() / 1000),
              summary,
              JSON.stringify({ actionItems: actions, decisions, basis }),
              1
            )
          } catch (dbErr) {
            log.error('Failed to cache single meeting digest', dbErr)
          }
          emitWebhookEvent('digest.generated', {
            scope: 'meeting',
            meetingId: params.meetingId,
            summary,
            actionItems: actions,
            decisions,
          })
        }

        return {
          success: true,
          data: {
            summary: summary ?? AI_UNAVAILABLE,
            actionItems: actions ?? AI_UNAVAILABLE,
            decisions: decisions ?? AI_UNAVAILABLE,
            generatedAt: Date.now(),
          },
        }
      }

      // ── Period Digest (Daily / Weekly / Monthly) ──
      if (params.startDate && params.endDate) {
        // Frontend sends ms timestamps; DB stores epoch seconds
        const startSec = Math.floor(params.startDate / 1000)
        const endSec = Math.floor(params.endDate / 1000)

        const meetings = db
          .prepare(
            'SELECT id, title, duration, start_time FROM meetings WHERE start_time >= ? AND start_time <= ?'
          )
          .all(startSec, endSec) as Array<{
          id: string
          title: string
          duration: number
          start_time: number
        }>

        const totalDurationSec = meetings.reduce((acc, m) => acc + (m.duration || 0), 0)

        // Gather real unique participants from transcripts
        const speakerRows = db
          .prepare(
            `SELECT DISTINCT speaker_name FROM transcripts t
             JOIN meetings m ON m.id = t.meeting_id
             WHERE m.start_time >= ? AND m.start_time <= ?
               AND t.speaker_name IS NOT NULL AND t.speaker_name != ''`
          )
          .all(startSec, endSec) as Array<{ speaker_name: string }>

        // Gather real entities from meetings — separate queries for people/topics
        // to get proper counts and meeting titles for each
        const personRows = db
          .prepare(
            `SELECT e.text AS name, COUNT(DISTINCT m.id) AS meetingCount,
                    json_group_array(DISTINCT m.title) AS meetingTitlesRaw
             FROM entities e
             JOIN meetings m ON m.id = e.meeting_id
             WHERE m.start_time >= ? AND m.start_time <= ?
               AND e.type = 'PERSON'
             GROUP BY e.text ORDER BY meetingCount DESC LIMIT 15`
          )
          .all(startSec, endSec) as Array<{
          name: string
          meetingCount: number
          meetingTitlesRaw: string | null
        }>

        const topPeople = personRows.map(e => ({
          name: e.name,
          meetingCount: e.meetingCount,
          meetingTitles: parseTitleList(e.meetingTitlesRaw),
        }))

        // Extract topic-like keywords from transcripts in the date range
        // instead of using entity types (no TOPIC entity type exists)
        const topicRows = db
          .prepare(
            `SELECT
                CASE
                  WHEN INSTR(t.text, '.') > 0 AND INSTR(t.text, '.') <= 120
                    THEN TRIM(SUBSTR(t.text, 1, INSTR(t.text, '.')))
                  WHEN INSTR(t.text, '?') > 0 AND INSTR(t.text, '?') <= 120
                    THEN TRIM(SUBSTR(t.text, 1, INSTR(t.text, '?')))
                  WHEN INSTR(t.text, '!') > 0 AND INSTR(t.text, '!') <= 120
                    THEN TRIM(SUBSTR(t.text, 1, INSTR(t.text, '!')))
                  ELSE TRIM(SUBSTR(t.text, 1, 80))
                END AS topic,
                COUNT(*) AS mentionCount,
                json_group_array(DISTINCT m.title) AS meetingTitlesRaw
             FROM transcripts t
             JOIN meetings m ON m.id = t.meeting_id
             WHERE m.start_time >= ? AND m.start_time <= ?
               AND LENGTH(t.text) > 20
             GROUP BY LOWER(topic)
             HAVING mentionCount > 1
             ORDER BY mentionCount DESC LIMIT 15`
          )
          .all(startSec, endSec) as Array<{
          topic: string
          mentionCount: number
          meetingTitlesRaw: string | null
        }>

        const topTopics = topicRows.map(e => ({
          topic: e.topic,
          mentionCount: e.mentionCount,
          meetingTitles: parseTitleList(e.meetingTitlesRaw),
        }))

        // ── Pro+: Cloud AI digest (key decisions, action items, contradictions) ──
        let keyDecisions: Array<{
          text: string
          meetingId: string
          meetingTitle?: string
          meetingDate?: number
          sourceContext?: string
          timestamp: number
          confidence: number
        }> = []
        let aiActionItems: Array<{
          text: string
          meetingId: string
          meetingTitle?: string
          meetingDate?: number
          sourceContext?: string
          assignee: string
          dueDate: number | null
          status: 'open' | 'completed' | 'overdue'
        }> = []
        let contradictions: Array<{
          id: string
          type: 'contradicts' | 'supersedes'
          meeting1: { id: string; title: string } | null
          meeting2: { id: string; title: string } | null
          statement1: string
          statement2: string
          confidence: number
          detectedAt: number
        }> = []
        let aiSummary = ''

        try {
          const { getCloudAccessManager } = await import('../../services/CloudAccessManager')
          const cam = getCloudAccessManager()
          const features = await cam.getFeatureAccess()

          if (features.knowledgeGraphInteractive && meetings.length > 0) {
            // Pro tier — use cloud /ask for AI-generated digest content
            const { getBackend } = await import('../../services/backend/BackendSingleton')
            const backend = getBackend()
            const health = await backend.healthCheck()

            if (health.status === 'healthy') {
              // Get AI-generated summary of the week's meetings
              try {
                const meetingList = meetings
                  .map(
                    m =>
                      `- ${m.title || 'Untitled'} (${new Date(m.start_time * 1000).toLocaleDateString()})`
                  )
                  .join('\n')

                const askResult = await backend.ask(
                  `You are analyzing a week's worth of meetings. Respond in the same language as the meeting titles and content. Provide:\n1. A 2-3 sentence executive summary of the week\n2. Key decisions made (format: "DECISION: [text] | MEETING: [title]")\n3. Action items (format: "ACTION: [task] | ASSIGNEE: [person] | STATUS: open | MEETING: [title]")\n\nMeetings this week:\n${meetingList}\n\nTotal meetings: ${meetings.length}, Total hours: ${(totalDurationSec / 3600).toFixed(1)}, Participants: ${speakerRows.length}\nTop topics: ${topTopics.map(t => t.topic).join(', ')}\nTop people: ${topPeople.map(p => p.name).join(', ')}\n\nAnalysis:`,
                  'meetings'
                )

                if (askResult?.answer) {
                  aiSummary = askResult.answer

                  // P2-5 FIX: More robust regex that handles variations in AI output formatting
                  const decisionMatches = askResult.answer.match(
                    /(?:DECISION|Key\s*Decision|Decision)\s*[:：]\s*(.+?)(?:\s*[|｜]\s*(?:MEETING|Meeting)\s*[:：]\s*(.+?))?$/gim
                  )
                  if (decisionMatches) {
                    keyDecisions = await Promise.all(
                      decisionMatches.map(async match => {
                        const parts = match.replace('DECISION:', '').split('|')
                        const decisionText = (parts[0] || '').trim()
                        const meetingRef = (parts[1] || '').replace('MEETING:', '').trim()
                        // Attribute a decision to a meeting only when the model
                        // named one we can identify — never guess a source.
                        const matchedId = meetingRef
                          ? findMeetingByTitle(meetingRef, meetings) || ''
                          : ''
                        const matchedMeeting = matchedId
                          ? meetings.find(m => m.id === matchedId)
                          : undefined
                        return {
                          text: decisionText,
                          meetingId: matchedMeeting ? matchedId : '',
                          meetingTitle: matchedMeeting?.title || meetingRef || '',
                          meetingDate: matchedMeeting
                            ? matchedMeeting.start_time * 1000
                            : undefined,
                          sourceContext: matchedMeeting
                            ? getTranscriptExcerpt(db, matchedId, decisionText)
                            : undefined,
                          timestamp: matchedMeeting ? matchedMeeting.start_time * 1000 : Date.now(),
                          confidence: matchedMeeting ? 0.85 : 0.5,
                        }
                      })
                    )
                  }

                  // P2-5 FIX: More robust regex that handles variations in AI output formatting
                  const actionMatches = askResult.answer.match(
                    /(?:ACTION|Action\s*Item|Action)\s*[:：]\s*(.+?)(?:\s*[|｜]\s*(?:ASSIGNEE|Assigned\s*to|Assignee)\s*[:：]\s*(.+?))?(?:\s*[|｜]\s*(?:STATUS|Status)\s*[:：]\s*(.+?))?(?:\s*[|｜]\s*(?:MEETING|Meeting)\s*[:：]\s*(.+?))?$/gim
                  )
                  if (actionMatches) {
                    aiActionItems = await Promise.all(
                      actionMatches.map(async (match: string) => {
                        const parts = match
                          .replace(/^\s*(?:ACTION|Action\s*Item|Action)\s*[:：]/i, '')
                          .split(/[|｜]/)
                        const field = (label: RegExp): string => {
                          const part = parts.slice(1).find(p => label.test(p))
                          return part ? part.replace(label, '').trim() : ''
                        }
                        const taskText = (parts[0] || '').trim()
                        const rawStatus = field(/^\s*(?:STATUS|Status)\s*[:：]/).toLowerCase()
                        const meetingRef = field(/^\s*(?:MEETING|Meeting)\s*[:：]/)
                        // Source meeting only when the model named one we can
                        // identify. (Items used to be dealt out to meetings
                        // round-robin, with an invented due date a week out.)
                        const matchedId = meetingRef
                          ? findMeetingByTitle(meetingRef, meetings) || ''
                          : ''
                        const assignedMeeting = matchedId
                          ? meetings.find(m => m.id === matchedId)
                          : undefined
                        return {
                          text: taskText,
                          meetingId: assignedMeeting?.id || '',
                          meetingTitle: assignedMeeting?.title || meetingRef || '',
                          meetingDate: assignedMeeting
                            ? assignedMeeting.start_time * 1000
                            : undefined,
                          assignee:
                            field(/^\s*(?:ASSIGNEE|Assigned\s*to|Assignee)\s*[:：]/) ||
                            'Unassigned',
                          dueDate: null,
                          sourceContext: assignedMeeting
                            ? getTranscriptExcerpt(db, assignedMeeting.id, taskText)
                            : undefined,
                          status: parseActionStatus(rawStatus),
                        }
                      })
                    )
                  }
                }
              } catch (err) {
                log.debug('Cloud digest AI failed, using local stats only', err)
              }

              // Fetch contradictions from graph
              try {
                const graph = await backend.getGraph('meetings', 1)
                const contradictionEdges =
                  graph.edges?.filter((e: { type: string }) => e.type === 'contradicts') || []
                contradictions = contradictionEdges.map(
                  (e: {
                    source: string
                    target: string
                    type: string
                    metadata?: Record<string, unknown>
                  }) => {
                    // Try to resolve meeting references from graph metadata
                    const srcMeetingId = e.metadata?.source_meeting_id as string | undefined
                    const tgtMeetingId = e.metadata?.target_meeting_id as string | undefined
                    const srcMeeting = srcMeetingId
                      ? meetings.find(m => m.id === srcMeetingId)
                      : undefined
                    const tgtMeeting = tgtMeetingId
                      ? meetings.find(m => m.id === tgtMeetingId)
                      : undefined
                    return {
                      id: `c-${e.source}-${e.target}`,
                      type: 'contradicts' as const,
                      meeting1: srcMeeting
                        ? { id: srcMeeting.id, title: srcMeeting.title ?? 'Untitled' }
                        : null,
                      meeting2: tgtMeeting
                        ? { id: tgtMeeting.id, title: tgtMeeting.title ?? 'Untitled' }
                        : null,
                      statement1:
                        (e.metadata?.source_label as string) || e.source || 'Unknown statement',
                      statement2:
                        (e.metadata?.target_label as string) || e.target || 'Unknown statement',
                      confidence: (e.metadata?.confidence as number) || 0.75,
                      detectedAt: Date.now(),
                    }
                  }
                )
              } catch (err) {
                log.debug('Contradiction fetch failed', err)
              }
            }
          }
        } catch (err) {
          // Cloud enrichment is non-fatal — digest still works with local stats
          log.debug('Cloud digest enrichment failed, using local stats only', err)
        }

        const digestId = uuidv4()
        const weeklyDigest = {
          id: digestId,
          startDate: params.startDate,
          endDate: params.endDate,
          generatedAt: Date.now(),
          summary: {
            totalMeetings: meetings.length,
            totalHours: totalDurationSec / 3600,
            uniqueParticipants: speakerRows.length,
            aiSummary,
          },
          keyDecisions,
          actionItems: {
            open: aiActionItems.filter(a => a.status === 'open').length,
            completed: aiActionItems.filter(a => a.status === 'completed').length,
            overdue: aiActionItems.filter(a => a.status === 'overdue').length,
            items: aiActionItems,
          },
          contradictions,
          entityAggregation: {
            topPeople:
              topPeople.length > 0
                ? topPeople
                : speakerRows.slice(0, 5).map(s => ({
                    name: s.speaker_name,
                    meetingCount: 1,
                    meetingTitles: [] as string[],
                  })),
            topTopics,
          },
        }

        // ── Persist digest to DB ──
        try {
          db.prepare(
            `INSERT OR REPLACE INTO digests (id, user_id, period_type, start_date, end_date, summary, highlights, meeting_count, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            digestId,
            params.userId || 'local',
            params.periodType || 'weekly',
            startSec,
            endSec,
            JSON.stringify(weeklyDigest),
            JSON.stringify({ keyDecisions, contradictions }),
            meetings.length,
            Math.floor(Date.now() / 1000)
          )
          log.info(`Digest ${digestId} persisted to DB`)
          emitWebhookEvent('digest.generated', {
            scope: params.periodType || 'weekly',
            digestId,
            startDate: params.startDate,
            endDate: params.endDate,
            totalMeetings: meetings.length,
            totalHours: totalDurationSec / 3600,
            aiSummary,
            keyDecisions: keyDecisions.map(d => ({ text: d.text, meetingTitle: d.meetingTitle })),
            actionItems: aiActionItems.map(a => ({
              text: a.text,
              assignee: a.assignee,
              status: a.status,
              meetingTitle: a.meetingTitle,
            })),
          })

          // ── Persist action items to action_items table ──
          if (aiActionItems.length > 0) {
            const insertAction = db.prepare(
              `INSERT OR IGNORE INTO action_items (id, meeting_id, text, assignee, deadline, status, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)`
            )
            const now = Math.floor(Date.now() / 1000)
            // An action item belongs to a meeting (meeting_id is NOT NULL), so
            // items the model did not tie to one stay in the digest only — one
            // such item used to fail the whole transaction. The id is derived
            // from the meeting and the text, so generating the digest again
            // does not add the same items a second time.
            const linked = aiActionItems.filter(item => item.meetingId && item.text.trim())
            // Use a transaction for atomicity — prevents partial writes on crash
            const insertAll = db.transaction(() => {
              for (const item of linked) {
                const fingerprint = createHash('sha256')
                  .update(`${item.meetingId}\n${item.text.trim().toLowerCase()}`)
                  .digest('hex')
                  .slice(0, 32)
                insertAction.run(
                  `digest-${fingerprint}`,
                  item.meetingId,
                  item.text,
                  item.assignee || null,
                  item.dueDate ? Math.floor(item.dueDate / 1000) : null,
                  item.status,
                  now
                )
              }
            })
            insertAll()
            log.info(`${linked.length} action items persisted to action_items table`)
          }
        } catch (err) {
          log.debug('Digest persistence failed (table may not exist in older DBs)', err)
        }

        return {
          success: true,
          data: weeklyDigest,
        }
      }

      return {
        success: false,
        error: {
          code: 'INVALID_PARAMS',
          message: 'Either meetingId or both startDate & endDate are required',
          timestamp: Date.now(),
        },
      }
    } catch (err) {
      log.warn('Digest generation failed', err)
      return {
        success: false,
        error: {
          code: 'DIGEST_FAILED',
          message: 'Meeting digest unavailable — AI engine may still be loading.',
          timestamp: Date.now(),
        },
      }
    }
  })

  // digest:getLatest — Get the most recent digest from DB
  ipcMain.handle('digest:getLatest', async (_, params) => {
    try {
      const db = getDatabase()
      const periodType = params?.periodType || 'weekly'

      const row = db
        .prepare(
          `SELECT id, user_id, period_type, start_date, end_date, summary, highlights, meeting_count, created_at
           FROM digests WHERE period_type = ? ORDER BY created_at DESC LIMIT 1`
        )
        .get(periodType) as
        | {
            id: string
            summary: string
            highlights: string
            meeting_count: number
            created_at: number
          }
        | undefined

      if (!row) {
        return { success: true, data: null }
      }

      // Parse JSON fields and validate shape
      let parsedDigest
      try {
        parsedDigest = JSON.parse(row.summary)
      } catch {
        parsedDigest = { id: row.id, meetingCount: row.meeting_count }
      }

      // Defensive shape validation — protect renderer from malformed/legacy data
      const safeDigest = {
        id: parsedDigest.id || row.id,
        startDate: parsedDigest.startDate || 0,
        endDate: parsedDigest.endDate || 0,
        generatedAt:
          parsedDigest.generatedAt || (row.created_at ? row.created_at * 1000 : Date.now()),
        summary: {
          totalMeetings: parsedDigest.summary?.totalMeetings ?? row.meeting_count ?? 0,
          totalHours: parsedDigest.summary?.totalHours ?? 0,
          uniqueParticipants: parsedDigest.summary?.uniqueParticipants ?? 0,
          aiSummary: parsedDigest.summary?.aiSummary ?? undefined,
        },
        keyDecisions: Array.isArray(parsedDigest.keyDecisions) ? parsedDigest.keyDecisions : [],
        actionItems: {
          open: parsedDigest.actionItems?.open ?? 0,
          completed: parsedDigest.actionItems?.completed ?? 0,
          overdue: parsedDigest.actionItems?.overdue ?? 0,
          items: Array.isArray(parsedDigest.actionItems?.items)
            ? parsedDigest.actionItems.items
            : [],
        },
        contradictions: Array.isArray(parsedDigest.contradictions)
          ? parsedDigest.contradictions
          : [],
        entityAggregation: {
          topPeople: Array.isArray(parsedDigest.entityAggregation?.topPeople)
            ? parsedDigest.entityAggregation.topPeople
            : [],
          topTopics: Array.isArray(parsedDigest.entityAggregation?.topTopics)
            ? parsedDigest.entityAggregation.topTopics
            : [],
        },
      }

      return { success: true, data: safeDigest }
    } catch (err) {
      log.warn('getLatest failed', err)
      return {
        success: false,
        error: {
          code: 'DIGEST_FETCH_FAILED',
          message: err instanceof Error ? err.message : 'Failed to fetch latest digest',
          timestamp: Date.now(),
        },
      }
    }
  })
}

/**
 * Helper to generate text via ModelManager (node-llama-cpp)
 */
/**
 * Titles collected with json_group_array. They used to be joined with commas
 * and split again, which broke every title containing one — including the
 * default "Meeting - 10/12/2026, 3:16:03 PM".
 */
function parseTitleList(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((t): t is string => typeof t === 'string' && t.length > 0)
      : []
  } catch {
    return []
  }
}

/** Shown in place of a section the model could not produce. */
const AI_UNAVAILABLE = '⚠️ AI unavailable'

/**
 * Part of what a cached meeting summary is keyed on. Raise it when the way
 * summaries are produced changes, so that stored ones are generated afresh.
 */
const DIGEST_METHOD = 2

/** Like generateText, but null on failure so callers can tell it from real output. */
async function tryGenerateText(prompt: string, maxTokens: number): Promise<string | null> {
  try {
    if (!_modelManagerMod) {
      _modelManagerMod = await import('../../services/ModelManager')
    }
    const text = await _modelManagerMod
      .getModelManager()
      .generate({ prompt, temperature: 0.2, maxTokens }, 'digest')
    return text.trim() ? text : null
  } catch (err) {
    log.debug('AI generation failed', err)
    return null
  }
}

/**
 * Get a transcript excerpt relevant to a decision or action item.
 * Searches the transcript for the meeting looking for keywords from the item text.
 * Returns undefined if no relevant excerpt is found.
 */
function getTranscriptExcerpt(
  db: ReturnType<typeof import('../../database').getDatabase>,
  meetingId: string,
  itemText: string
): string | undefined {
  try {
    // Extract first 3 significant words (>3 chars) as search keywords
    const keywords = itemText
      .split(/\s+/)
      .filter(w => w.length > 3)
      .slice(0, 3)

    if (keywords.length === 0) return undefined

    // Try to find a transcript line containing at least one keyword
    for (const kw of keywords) {
      // Sanitize LIKE pattern — escape special SQL characters
      const safeKw = kw.replace(/[%_\\]/g, '\\$&')
      const row = db
        .prepare(
          `SELECT text, speaker_name FROM transcripts
           WHERE meeting_id = ? AND text LIKE ? ESCAPE '\\' LIMIT 1`
        )
        .get(meetingId, `%${safeKw}%`) as { text: string; speaker_name: string } | undefined
      if (row) {
        const speaker = row.speaker_name || 'Speaker'
        return `"${row.text}" — ${speaker}`
      }
    }
    return undefined
  } catch {
    return undefined
  }
}

/**
 * Parse action item status from AI response text.
 * Handles variations like "done", "completed", "overdue", "past due", etc.
 */
function parseActionStatus(raw: string): 'open' | 'completed' | 'overdue' {
  const s = raw.toLowerCase().trim()
  if (s === 'completed' || s === 'done' || s === 'finished' || s === 'closed') return 'completed'
  if (s === 'overdue' || s === 'past due' || s === 'late' || s === 'missed') return 'overdue'
  return 'open'
}

/**
 * Try to match a meeting title reference from AI output to an actual meeting.
 * Uses case-insensitive substring matching.
 */
function findMeetingByTitle(
  titleRef: string,
  meetings: Array<{ id: string; title: string }>
): string | undefined {
  if (!titleRef) return undefined
  const ref = titleRef.toLowerCase().trim()
  // Exact match first
  const exact = meetings.find(m => m.title?.toLowerCase() === ref)
  if (exact) return exact.id
  // Substring match
  const partial = meetings.find(
    m => m.title && (m.title.toLowerCase().includes(ref) || ref.includes(m.title.toLowerCase()))
  )
  return partial?.id
}
