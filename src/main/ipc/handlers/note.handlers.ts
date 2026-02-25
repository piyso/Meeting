import { ipcMain } from 'electron'
import { config } from '../../config/environment'
import { v4 as uuidv4 } from 'uuid'
import {
  createNote,
  getNotesByMeetingId,
  updateNote,
  deleteNote,
} from '../../database/crud/notes'
import { getTranscriptService } from '../../services/TranscriptService'

export function registerNoteHandlers(): void {
  // note:create — Create a new note for a meeting
  ipcMain.handle('note:create', async (_, params) => {
    try {
      if (!params?.meetingId || !params?.text) {
        return { success: false, error: { code: 'INVALID_PARAMS', message: 'meetingId and text are required', timestamp: Date.now() } }
      }
      const note = createNote({
        id: uuidv4(),
        meeting_id: params.meetingId,
        timestamp: params.timestamp,
        original_text: params.text,
      })
      return { success: true, data: note }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NOTE_CREATE_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // note:get — Get all notes for a meeting
  ipcMain.handle('note:get', async (_, params) => {
    try {
      if (!params?.meetingId) {
        return { success: false, error: { code: 'INVALID_PARAMS', message: 'meetingId is required', timestamp: Date.now() } }
      }
      const notes = getNotesByMeetingId(params.meetingId)
      return { success: true, data: notes }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NOTE_GET_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // note:update — Update a note's text
  ipcMain.handle('note:update', async (_, params) => {
    try {
      if (!params?.noteId) {
        return { success: false, error: { code: 'INVALID_PARAMS', message: 'noteId is required', timestamp: Date.now() } }
      }
      const note = updateNote(params.noteId, params.updates)
      return { success: true, data: note }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NOTE_UPDATE_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // note:delete — Delete a note
  ipcMain.handle('note:delete', async (_, params) => {
    try {
      if (!params?.noteId) {
        return { success: false, error: { code: 'INVALID_PARAMS', message: 'noteId is required', timestamp: Date.now() } }
      }
      deleteNote(params.noteId)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NOTE_DELETE_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // note:expand — AI expansion via Ollama (gated by CloudAccessManager)
  ipcMain.handle('note:expand', async (_, params) => {
    try {
      if (!params?.meetingId || !params?.text) {
        return { success: false, error: { code: 'INVALID_PARAMS', message: 'meetingId and text are required', timestamp: Date.now() } }
      }
      // Feature gate: check if AI expansion is available for this user
      const { getCloudAccessManager } = await import('../../services/CloudAccessManager')
      const cam = getCloudAccessManager()
      const features = await cam.getFeatureAccess()

      if (!features.cloudAI) {
        // Free tier: skip cloud path but still allow local Ollama expansion below
        // Only block if feature is explicitly blocked AND there's no local fallback
        const status = await cam.getCloudAccessStatus()
        if (status.tier === 'free') {
          // Free tier still gets local AI — fall through to Ollama path below
        }
      }

      // 1. Get transcript context around timestamp (±60s before, +10s after)
      const transcriptService = getTranscriptService()
      const context = transcriptService.getContext(
        params.meetingId,
        params.timestamp,
        60,
        10
      )

      // 2. Dual-path: Pro+online → PiyAPI Context Sessions, otherwise → local Ollama
      const cloudStatus = await cam.getCloudAccessStatus()
      if (cloudStatus.hasAccess && features.contextSessions) {
        // Check quota for Starter tier (50 queries/month)
        const { getQueryQuotaManager } = await import('../../services/QueryQuotaManager')
        const quotaManager = getQueryQuotaManager()
        const quota = await quotaManager.checkQuota(cloudStatus.tier)

        if (quota.exhausted) {
          // Quota exhausted — fall through to local Ollama path silently (Blueprint §5.1)
          console.log(`[note:expand] Starter quota exhausted (${quota.used}/${quota.limit}), falling back to local`)
        } else {
          // PRO PATH: PiyAPI Context Sessions API (token-budgeted retrieval)
          try {
            const { getBackend } = await import('./graph.handlers')
            const backend = getBackend()

            // Blueprint §2.4: Use Context Sessions for semantic context retrieval
            const sessionResult = await backend.createContextSession({
              namespace: 'meetings.transcripts',
              token_budget: 2048,
              time_range: {
                start: (params.timestamp || 0) - 60,
                end: (params.timestamp || 0) + 10,
              },
              filters: { meeting_id: params.meetingId },
            })

            let cloudContext = context.contextText
            if (sessionResult?.context_session_id) {
              const contextData = await backend.retrieveContext(
                sessionResult.context_session_id,
                params.text
              )
              if (contextData?.context) {
                cloudContext = contextData.context
              }
            }

            // Use /ask endpoint with enriched context
            const result = await backend.ask(
              `You are an executive assistant helping write meeting notes.\n\nCONTEXT (what was being discussed):\n${cloudContext}\n\nUSER'S BRIEF NOTE:\n${params.text}\n\nINSTRUCTIONS:\n1. Expand the user's note into 1-2 clear, professional sentences\n2. Include specific details from the context (numbers, names, deadlines)\n3. Write in third person ("The team decided..." not "We decided...")\n4. Be concise - maximum 50 words\n5. Do not add information not present in the context\n\nEXPANDED NOTE:`
            )

            // Record cloud AI usage for quota tracking
            quotaManager.recordUsage()

            return {
              success: true,
              data: {
                expandedText: result.answer,
                sourceSegments: context.transcripts.map((t: any) => t.id),
                source: 'cloud',
              },
            }
          } catch {
            // Fall through to local Ollama if cloud fails
          }
        }
      }

      // LOCAL PATH: Ollama (Qwen 2.5) — Blueprint §2.4 prompt engineering
      // Preload LLM via ModelManager (handles idle unloading)
      const { getModelManager } = await import('../../services/ModelManager')
      const modelManager = getModelManager()
      await modelManager.ensureLLMLoaded()

      const prompt = `You are an executive assistant helping write meeting notes.

CONTEXT (what was being discussed):
${context.contextText}

USER'S BRIEF NOTE:
${params.text}

INSTRUCTIONS:
1. Expand the user's note into 1-2 clear, professional sentences
2. Include specific details from the context (numbers, names, deadlines)
3. Write in third person ("The team decided..." not "We decided...")
4. Be concise - maximum 50 words
5. Do not add information not present in the context

EXPANDED NOTE:`

      const response = await fetch(`${config.OLLAMA_BASE_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelManager.getLLMModel(),
          prompt,
          stream: false,
          options: {
            temperature: 0.1,
            top_p: 0.9,
            top_k: 40,
            num_predict: 100,
            stop: ['\n\n', 'USER'],
          },
        }),
      })
      const data = await response.json()
      return {
        success: true,
        data: {
          expandedText: data.response?.trim() || '',
          sourceSegments: context.transcripts.map((t: any) => t.id),
          source: 'local',
        },
      }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NOTE_EXPAND_FAILED',
          message: 'AI expansion unavailable — Ollama may not be running. Start it with: ollama serve',
          timestamp: Date.now(),
        },
      }
    }
  })

  // note:batchExpand — Expand multiple notes sequentially (prevents GPU overload)
  ipcMain.handle('note:batchExpand', async (_, params) => {
    try {
      if (!params?.noteIds || !Array.isArray(params.noteIds) || !params.meetingId) {
        return {
          success: false,
          error: { code: 'INVALID_PARAMS', message: 'meetingId and noteIds[] are required', timestamp: Date.now() },
        }
      }

      const { getModelManager } = await import('../../services/ModelManager')
      const modelManager = getModelManager()
      await modelManager.ensureLLMLoaded()

      const transcriptService = getTranscriptService()
      const results: Array<{ noteId: string; expandedText: string; error?: string }> = []

      // Process sequentially to prevent GPU overload (Blueprint §2.4)
      for (const noteId of params.noteIds) {
        try {
          // Get the note text from DB
          const { getNotesByMeetingId } = await import('../../database/crud/notes')
          const notes = getNotesByMeetingId(params.meetingId)
          const note = notes.find((n: any) => n.id === noteId)
          if (!note) {
            results.push({ noteId, expandedText: '', error: 'Note not found' })
            continue
          }

          const context = transcriptService.getContext(
            params.meetingId,
            (note as any).timestamp || 0,
            60,
            10
          )

          const prompt = `You are an executive assistant helping write meeting notes.\n\nCONTEXT:\n${context.contextText}\n\nUSER'S BRIEF NOTE:\n${(note as any).original_text}\n\nINSTRUCTIONS:\n1. Expand into 1-2 professional sentences\n2. Include specific details from context\n3. Third person, max 50 words\n4. Do not fabricate information\n\nEXPANDED NOTE:`

          const response = await fetch(`${config.OLLAMA_BASE_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: modelManager.getLLMModel(),
              prompt,
              stream: false,
              options: { temperature: 0.1, num_predict: 100 },
            }),
          })
          const data = await response.json()
          results.push({ noteId, expandedText: data.response?.trim() || '' })
        } catch (err) {
          results.push({ noteId, expandedText: '', error: (err as Error).message })
        }
      }

      return {
        success: true,
        data: { expanded: results.filter(r => r.expandedText).length, total: params.noteIds.length, results },
      }
    } catch (error) {
      return {
        success: false,
        error: { code: 'BATCH_EXPAND_FAILED', message: (error as Error).message, timestamp: Date.now() },
      }
    }
  })
}
