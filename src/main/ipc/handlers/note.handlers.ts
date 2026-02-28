import { ipcMain } from 'electron'
import { Logger } from '../../services/Logger'

const log = Logger.create('NoteHandlers')
import { v4 as uuidv4 } from 'uuid'
import { createNote, getNotesByMeetingId, updateNote, deleteNote } from '../../database/crud/notes'
import { getTranscriptService } from '../../services/TranscriptService'

export function registerNoteHandlers(): void {
  // note:create — Create a new note for a meeting
  ipcMain.handle('note:create', async (_, params) => {
    try {
      if (!params?.meetingId || !params?.text) {
        return {
          success: false,
          error: {
            code: 'INVALID_PARAMS',
            message: 'meetingId and text are required',
            timestamp: Date.now(),
          },
        }
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
        return {
          success: false,
          error: {
            code: 'INVALID_PARAMS',
            message: 'meetingId is required',
            timestamp: Date.now(),
          },
        }
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
        return {
          success: false,
          error: { code: 'INVALID_PARAMS', message: 'noteId is required', timestamp: Date.now() },
        }
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
        return {
          success: false,
          error: { code: 'INVALID_PARAMS', message: 'noteId is required', timestamp: Date.now() },
        }
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

  // note:expand — AI expansion via node-llama-cpp (gated by CloudAccessManager)
  ipcMain.handle('note:expand', async (_, params) => {
    try {
      if (!params?.meetingId || !params?.text) {
        return {
          success: false,
          error: {
            code: 'INVALID_PARAMS',
            message: 'meetingId and text are required',
            timestamp: Date.now(),
          },
        }
      }
      // Feature gate: check if AI expansion is available for this user
      const { getCloudAccessManager } = await import('../../services/CloudAccessManager')
      const cam = getCloudAccessManager()
      const features = await cam.getFeatureAccess()

      // Note: all tiers get local AI expansion via node-llama-cpp
      // cloudAI check only gates the PiyAPI Context Sessions path below

      // 1. Get transcript context around timestamp (±60s before, +10s after)
      const transcriptService = getTranscriptService()
      const context = transcriptService.getContext(params.meetingId, params.timestamp, 60, 10)

      // 2. Dual-path: Pro+online → PiyAPI Context Sessions, otherwise → local node-llama-cpp
      const cloudStatus = await cam.getCloudAccessStatus()
      if (cloudStatus.hasAccess && features.contextSessions) {
        // Check quota for Starter tier (50 queries/month)
        const { getQueryQuotaManager } = await import('../../services/QueryQuotaManager')
        const quotaManager = getQueryQuotaManager()
        const quota = await quotaManager.checkQuota(cloudStatus.tier)

        if (quota.exhausted) {
          // Quota exhausted — fall through to local AI path silently (Blueprint §5.1)
          log.info(
            `[note:expand] Starter quota exhausted (${quota.used}/${quota.limit}), falling back to local`
          )
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
                context: cloudContext,
                tokensUsed: 0,
                inferenceTime: 0,
                sourceSegments: context.transcripts.map((t: { id: string }) => t.id),
                source: 'cloud',
              },
            }
          } catch (err) {
            // Fall through to local AI if cloud fails
            log.debug('Cloud expand failed, falling back to local AI', err)
          }
        }
      }

      // LOCAL PATH: node-llama-cpp (Qwen 2.5) — Blueprint §2.4 prompt engineering
      const { getModelManager } = await import('../../services/ModelManager')
      const modelManager = getModelManager()
      const localStartTime = Date.now()

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

      const expandedText = await modelManager.generate({
        prompt,
        temperature: 0.1,
        topP: 0.9,
        topK: 40,
        maxTokens: 100,
        stop: ['\n\n', 'USER'],
      })
      const inferenceTime = Date.now() - localStartTime
      return {
        success: true,
        data: {
          expandedText,
          context: context.contextText,
          tokensUsed: Math.ceil(expandedText.length / 4),
          inferenceTime,
          sourceSegments: context.transcripts.map((t: { id: string }) => t.id),
          source: 'local',
        },
      }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NOTE_EXPAND_FAILED',
          message: 'AI expansion unavailable — AI engine may still be loading. Please try again.',
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
          error: {
            code: 'INVALID_PARAMS',
            message: 'meetingId and noteIds[] are required',
            timestamp: Date.now(),
          },
        }
      }

      const { getModelManager } = await import('../../services/ModelManager')
      const modelManager = getModelManager()
      await modelManager.ensureLLMLoaded()

      const transcriptService = getTranscriptService()
      const results: Array<{ noteId: string; expandedText: string; error?: string }> = []

      const { getNotesByMeetingId } = await import('../../database/crud/notes')
      const allNotes = getNotesByMeetingId(params.meetingId)

      // Process sequentially to prevent GPU overload (Blueprint §2.4)
      for (let i = 0; i < params.noteIds.length; i++) {
        const noteId = params.noteIds[i]
        try {
          const note = allNotes.find((n: { id: string }) => n.id === noteId)
          if (!note) {
            results.push({ noteId, expandedText: '', error: 'Note not found' })
            continue
          }

          const context = transcriptService.getContext(
            params.meetingId,
            (note as { timestamp?: number }).timestamp ?? 0,
            60,
            10
          )

          const prompt = `You are an executive assistant helping write meeting notes.\n\nCONTEXT:\n${context.contextText}\n\nUSER'S BRIEF NOTE:\n${(note as { original_text?: string }).original_text ?? ''}\n\nINSTRUCTIONS:\n1. Expand into 1-2 professional sentences\n2. Include specific details from context\n3. Third person, max 50 words\n4. Do not fabricate information\n\nEXPANDED NOTE:`

          const expandedText = await modelManager.generate({
            prompt,
            temperature: 0.1,
            maxTokens: 100,
          })
          results.push({ noteId, expandedText })

          // Emit progress event to renderer
          const { BrowserWindow } = await import('electron')
          const win = BrowserWindow.getAllWindows()[0]
          if (win) {
            win.webContents.send('event:batchExpandProgress', {
              total: params.noteIds.length,
              completed: i + 1,
              current: noteId,
              note,
            })
          }
        } catch (err) {
          results.push({ noteId, expandedText: '', error: (err as Error).message })
        }
      }

      return {
        success: true,
        data: {
          expanded: results.filter(r => r.expandedText).length,
          total: params.noteIds.length,
          results,
        },
      }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'BATCH_EXPAND_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })
}
