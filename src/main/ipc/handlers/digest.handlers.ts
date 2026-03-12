import { ipcMain } from 'electron'
import { getDatabase } from '../../database/connection'
import { Logger } from '../../services/Logger'
import { v4 as uuidv4 } from 'uuid'

const log = Logger.create('DigestHandlers')

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
            'SELECT text, speaker_name AS speaker FROM transcripts WHERE meeting_id = ? ORDER BY start_time ASC'
          )
          .all(params.meetingId) as Array<{ text: string; speaker: string }>

        if (transcripts.length === 0) {
          return {
            success: true,
            data: {
              digest: 'No transcript data available for this meeting.',
              generatedAt: new Date().toISOString(),
            },
          }
        }

        const transcriptText = transcripts.map(t => `${t.speaker}: ${t.text}`).join('\n')

        // Run all 3 AI calls in parallel for ~3× speedup
        const [summary, actions, decisions] = await Promise.all([
          generateText(
            `Summarize this meeting transcript concisely in exactly 3 bullet points.\n\nTRANSCRIPT:\n${transcriptText}\n\nSUMMARY:`,
            300
          ),
          generateText(
            `Extract action items from this meeting. Format: "- [ASSIGNEE]: Task description".\n\nTRANSCRIPT:\n${transcriptText}\n\nACTION ITEMS:`,
            300
          ),
          generateText(
            `List only the final decisions made in this meeting. Format: "- Decision statement".\n\nTRANSCRIPT:\n${transcriptText}\n\nDECISIONS:`,
            300
          ),
        ])

        return {
          success: true,
          data: { summary, actionItems: actions, decisions, generatedAt: Date.now() },
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
                    GROUP_CONCAT(DISTINCT m.title) AS meetingTitlesRaw
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
          meetingTitles: e.meetingTitlesRaw ? e.meetingTitlesRaw.split(',').filter(Boolean) : [],
        }))

        // Extract topic-like keywords from transcripts in the date range
        // instead of using entity types (no TOPIC entity type exists)
        const topicRows = db
          .prepare(
            `SELECT SUBSTR(t.text, 1, 80) AS topic, COUNT(*) AS mentionCount,
                    GROUP_CONCAT(DISTINCT m.title) AS meetingTitlesRaw
             FROM transcripts t
             JOIN meetings m ON m.id = t.meeting_id
             WHERE m.start_time >= ? AND m.start_time <= ?
               AND LENGTH(t.text) > 20
             GROUP BY LOWER(SUBSTR(t.text, 1, 80))
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
          meetingTitles: e.meetingTitlesRaw ? e.meetingTitlesRaw.split(',').filter(Boolean) : [],
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
          dueDate: number
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
                  `You are analyzing a week's worth of meetings. Provide:\n1. A 2-3 sentence executive summary of the week\n2. Key decisions made (format: "DECISION: [text] | MEETING: [title]")\n3. Action items (format: "ACTION: [task] | ASSIGNEE: [person] | STATUS: open")\n\nMeetings this week:\n${meetingList}\n\nTotal meetings: ${meetings.length}, Total hours: ${(totalDurationSec / 3600).toFixed(1)}, Participants: ${speakerRows.length}\nTop topics: ${topTopics.map(t => t.topic).join(', ')}\nTop people: ${topPeople.map(p => p.name).join(', ')}\n\nAnalysis:`,
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
                        const matchedId =
                          findMeetingByTitle(meetingRef, meetings) || meetings[0]?.id || ''
                        const matchedMeeting = meetings.find(m => m.id === matchedId)
                        return {
                          text: decisionText,
                          meetingId: matchedId,
                          meetingTitle: matchedMeeting?.title || meetingRef || 'Meeting',
                          meetingDate: matchedMeeting
                            ? matchedMeeting.start_time * 1000
                            : undefined,
                          sourceContext: matchedMeeting
                            ? getTranscriptExcerpt(db, matchedId, decisionText)
                            : undefined,
                          timestamp: Date.now(),
                          confidence: 0.85,
                        }
                      })
                    )
                  }

                  // P2-5 FIX: More robust regex that handles variations in AI output formatting
                  const actionMatches = askResult.answer.match(
                    /(?:ACTION|Action\s*Item|Action)\s*[:：]\s*(.+?)(?:\s*[|｜]\s*(?:ASSIGNEE|Assigned\s*to|Assignee)\s*[:：]\s*(.+?))?(?:\s*[|｜]\s*(?:STATUS|Status)\s*[:：]\s*(.+?))?$/gim
                  )
                  if (actionMatches) {
                    aiActionItems = await Promise.all(
                      actionMatches.map(async (match: string, idx: number) => {
                        const parts = match.replace('ACTION:', '').split('|')
                        const rawStatus = (parts[2] || '')
                          .replace('STATUS:', '')
                          .trim()
                          .toLowerCase()
                        const assignedMeeting = meetings[idx % meetings.length] || meetings[0]
                        return {
                          text: (parts[0] || '').trim(),
                          meetingId: assignedMeeting?.id || '',
                          meetingTitle: assignedMeeting?.title || 'Meeting',
                          meetingDate: assignedMeeting
                            ? assignedMeeting.start_time * 1000
                            : undefined,
                          assignee:
                            (parts[1] || '').replace('ASSIGNEE:', '').trim() || 'Unassigned',
                          dueDate: Date.now() + 7 * 86400000,
                          sourceContext: assignedMeeting
                            ? getTranscriptExcerpt(db, assignedMeeting.id, (parts[0] || '').trim())
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

          // ── Persist action items to action_items table ──
          if (aiActionItems.length > 0) {
            const insertAction = db.prepare(
              `INSERT OR IGNORE INTO action_items (id, meeting_id, text, assignee, deadline, status, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)`
            )
            const now = Math.floor(Date.now() / 1000)
            // Use a transaction for atomicity — prevents partial writes on crash
            const insertAll = db.transaction(() => {
              for (const item of aiActionItems) {
                insertAction.run(
                  uuidv4(),
                  item.meetingId || null,
                  item.text,
                  item.assignee || null,
                  item.dueDate ? Math.floor(item.dueDate / 1000) : null,
                  item.status,
                  now
                )
              }
            })
            insertAll()
            log.info(`${aiActionItems.length} action items persisted to action_items table`)
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
async function generateText(prompt: string, maxTokens: number = 300): Promise<string> {
  try {
    const { getModelManager } = await import('../../services/ModelManager')
    const modelManager = getModelManager()

    return await modelManager.generate({
      prompt,
      temperature: 0.2,
      maxTokens,
    })
  } catch (err) {
    log.debug('AI generation failed', err)
    return '⚠️ AI unavailable — engine may still be loading'
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
