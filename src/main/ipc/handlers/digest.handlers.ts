import { ipcMain } from 'electron'
import { getDatabase } from '../../database/connection'
import { Logger } from '../../services/Logger'

const log = Logger.create('DigestHandlers')

export function registerDigestHandlers(): void {
  // digest:generate — Generate meeting digest via local AI engine
  ipcMain.handle('digest:generate', async (_, params) => {
    try {
      if (!params?.meetingId) {
        return {
          success: false,
          error: {
            code: 'INVALID_PARAMS',
            message: 'meetingId is required',
            timestamp: Date.now(),
          },
        }
      }
      // Get meeting transcripts from database
      const db = getDatabase()
      const transcripts = db
        .prepare(
          'SELECT text, speaker_name AS speaker FROM transcripts WHERE meeting_id = ? ORDER BY start_time ASC'
        )
        .all(params.meetingId) as Array<{
        text: string
        speaker: string
      }>

      if (transcripts.length === 0) {
        return {
          success: true,
          data: {
            digest: 'No transcript data available for this meeting.',
            generatedAt: new Date().toISOString(),
          },
        }
      }

      // Format transcript for LLM
      const transcriptText = transcripts.map(t => `${t.speaker}: ${t.text}`).join('\n')

      // Call AI engine sequentially — parallel calls overwhelm single-GPU machines
      const summary = await generateText(
        `You are a meeting summarizer. Summarize this meeting transcript concisely in exactly 3 bullet points. Use third person.\n\nTRANSCRIPT:\n${transcriptText}\n\nSUMMARY:`,
        300
      )
      const actions = await generateText(
        `Extract action items from this meeting. Format: "- [ASSIGNEE]: Task description (DEADLINE if mentioned)". Only include items with clear owners.\n\nTRANSCRIPT:\n${transcriptText}\n\nACTION ITEMS:`,
        300
      )
      const decisions = await generateText(
        `List only the final decisions made in this meeting. Format: "- Decision statement". Do not list proposals that were rejected.\n\nTRANSCRIPT:\n${transcriptText}\n\nDECISIONS:`,
        300
      )

      return {
        success: true,
        data: {
          summary,
          actionItems: actions,
          decisions,
          generatedAt: new Date().toISOString(),
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

  // digest:getLatest — Get the most recent digest
  ipcMain.handle('digest:getLatest', async () => {
    return { success: true, data: null }
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
