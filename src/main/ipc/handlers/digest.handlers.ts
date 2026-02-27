import { ipcMain } from 'electron'
import { getDatabase } from '../../database/connection'
import { config } from '../../config/environment'
import { Logger } from '../../services/Logger'

const log = Logger.create('DigestHandlers')

export function registerDigestHandlers(): void {
  // digest:generate — Generate meeting digest via Ollama
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
          'SELECT text, speaker FROM transcripts WHERE meeting_id = ? ORDER BY start_time ASC'
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

      // Call Ollama sequentially — parallel calls overwhelm single-GPU machines
      const summary = await callOllama(
        `You are a meeting summarizer. Summarize this meeting transcript concisely in exactly 3 bullet points. Use third person.\n\nTRANSCRIPT:\n${transcriptText}\n\nSUMMARY:`
      )
      const actions = await callOllama(
        `Extract action items from this meeting. Format: "- [ASSIGNEE]: Task description (DEADLINE if mentioned)". Only include items with clear owners.\n\nTRANSCRIPT:\n${transcriptText}\n\nACTION ITEMS:`
      )
      const decisions = await callOllama(
        `List only the final decisions made in this meeting. Format: "- Decision statement". Do not list proposals that were rejected.\n\nTRANSCRIPT:\n${transcriptText}\n\nDECISIONS:`
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
          message: 'Meeting digest unavailable — Ollama not running. Start it with: ollama serve',
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
 * Helper to call Ollama API
 */
async function callOllama(prompt: string): Promise<string> {
  try {
    // Use ModelManager for hardware-tier-aware model selection
    const { getModelManager } = await import('../../services/ModelManager')
    const model = getModelManager().getLLMModel()

    const response = await fetch(`${config.OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          temperature: 0.2,
          num_predict: 300,
        },
      }),
    })
    const data = await response.json()
    return data.response?.trim() || ''
  } catch (err) {
    log.debug('Ollama call failed', err)
    return '⚠️ AI unavailable — Ollama not running'
  }
}
