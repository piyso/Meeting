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
        const summary = await generateText(
          `Summarize this meeting transcript concisely in exactly 3 bullet points.\n\nTRANSCRIPT:\n${transcriptText}\n\nSUMMARY:`,
          300
        )
        const actions = await generateText(
          `Extract action items from this meeting. Format: "- [ASSIGNEE]: Task description".\n\nTRANSCRIPT:\n${transcriptText}\n\nACTION ITEMS:`,
          300
        )
        const decisions = await generateText(
          `List only the final decisions made in this meeting. Format: "- Decision statement".\n\nTRANSCRIPT:\n${transcriptText}\n\nDECISIONS:`,
          300
        )

        return {
          success: true,
          data: { summary, actionItems: actions, decisions, generatedAt: Date.now() },
        }
      }

      // ── Weekly Digest ──
      if (params.startDate && params.endDate) {
        const meetings = db
          .prepare(
            'SELECT id, title, duration, start_time FROM meetings WHERE start_time >= ? AND start_time <= ?'
          )
          .all(params.startDate, params.endDate) as Array<{
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
          .all(params.startDate, params.endDate) as Array<{ speaker_name: string }>

        // Gather real entities from meetings
        const entityRows = db
          .prepare(
            `SELECT e.type, e.text, COUNT(*) as cnt FROM entities e
             JOIN meetings m ON m.id = e.meeting_id
             WHERE m.start_time >= ? AND m.start_time <= ?
             GROUP BY e.type, e.text ORDER BY cnt DESC LIMIT 10`
          )
          .all(params.startDate, params.endDate) as Array<{
          type: string
          text: string
          cnt: number
        }>

        const topPeople = entityRows
          .filter(e => e.type === 'PERSON')
          .slice(0, 5)
          .map(e => ({ name: e.text, meetingCount: e.cnt }))

        const topTopics = entityRows
          .filter(e => e.type !== 'PERSON')
          .slice(0, 5)
          .map(e => ({ topic: e.text, mentionCount: e.cnt }))

        // ── Pro+: Cloud AI digest (key decisions, action items, contradictions) ──
        let keyDecisions: Array<{
          text: string
          meetingId: string
          timestamp: number
          confidence: number
        }> = []
        let aiActionItems: Array<{
          text: string
          meetingId: string
          assignee: string
          dueDate: number
          status: 'open' | 'completed' | 'overdue'
        }> = []
        let contradictions: Array<{ from: string; to: string; topic: string }> = []
        let aiSummary = ''

        try {
          const { getCloudAccessManager } = await import('../../services/CloudAccessManager')
          const cam = getCloudAccessManager()
          const features = await cam.getFeatureAccess()

          if (features.knowledgeGraphInteractive && meetings.length > 0) {
            // Pro tier — use cloud /ask for AI-generated digest content
            const { getBackend } = await import('./graph.handlers')
            const backend = getBackend()
            const isHealthy = await backend.healthCheck()

            if (isHealthy) {
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

                  // Parse decisions from AI response
                  const decisionMatches = askResult.answer.match(
                    /DECISION:\s*(.+?)(?:\s*\|\s*MEETING:\s*(.+?))?$/gm
                  )
                  if (decisionMatches) {
                    keyDecisions = decisionMatches.map(match => {
                      const parts = match.replace('DECISION:', '').split('|')
                      return {
                        text: (parts[0] || '').trim(),
                        meetingId: meetings[0]?.id || '',
                        timestamp: Date.now(),
                        confidence: 0.85,
                      }
                    })
                  }

                  // Parse action items from AI response
                  const actionMatches = askResult.answer.match(
                    /ACTION:\s*(.+?)(?:\s*\|\s*ASSIGNEE:\s*(.+?))?(?:\s*\|\s*STATUS:\s*(.+?))?$/gm
                  )
                  if (actionMatches) {
                    aiActionItems = actionMatches.map(match => {
                      const parts = match.replace('ACTION:', '').split('|')
                      return {
                        text: (parts[0] || '').trim(),
                        meetingId: meetings[0]?.id || '',
                        assignee: (parts[1] || '').replace('ASSIGNEE:', '').trim() || 'Unassigned',
                        dueDate: Date.now() + 7 * 86400000, // 1 week default
                        status: 'open' as const,
                      }
                    })
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
                  }) => ({
                    from: (e.metadata?.source_label as string) || e.source || 'Unknown',
                    to: (e.metadata?.target_label as string) || e.target || 'Unknown',
                    topic: (e.metadata?.label as string) || 'Decision changed',
                  })
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
                : speakerRows.slice(0, 3).map(s => ({ name: s.speaker_name, meetingCount: 1 })),
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
            'weekly',
            params.startDate,
            params.endDate,
            JSON.stringify(weeklyDigest),
            JSON.stringify({ keyDecisions, contradictions }),
            meetings.length,
            Math.floor(Date.now() / 1000)
          )
          log.info(`Digest ${digestId} persisted to DB`)
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

      // Parse JSON fields
      let parsedDigest
      try {
        parsedDigest = JSON.parse(row.summary)
      } catch {
        parsedDigest = { id: row.id, meetingCount: row.meeting_count }
      }

      return { success: true, data: parsedDigest }
    } catch (err) {
      log.debug('getLatest failed', err)
      return { success: true, data: null }
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
