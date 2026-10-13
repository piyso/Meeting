import { ipcMain, BrowserWindow } from 'electron'
import { Logger } from '../../services/Logger'

const log = Logger.create('NoteHandlers')
import { v4 as uuidv4 } from 'uuid'
import { createNote, getNotesByMeetingId, updateNote, deleteNote } from '../../database/crud/notes'
import { getTranscriptService } from '../../services/TranscriptService'
import { getDatabase } from '../../database/connection'

// ── Shared Prompt & Response Helpers ──────────────────────────────────────────
// DRY: These were previously copy-pasted 3× (cloud, local, batch). A single
// source of truth means forensic guardrail changes propagate everywhere.

function buildExpansionPrompt(contextText: string, noteText: string): string {
  return `You are an executive assistant helping write meeting notes. Respond in the same language as the context and user's note.

CONTEXT (what was being discussed):
${contextText}

USER'S BRIEF NOTE:
<user_note>${noteText}</user_note>

INSTRUCTIONS:
1. Expand the user's note into 1-2 clear, professional sentences
2. Include specific details from the context (numbers, names, deadlines)
3. Write in third person ("The team decided..." not "We decided...")
4. Be concise - maximum 50 words
5. Do not add information not present in the context
6. Use the same language as the transcript context
7. FORENSIC GUARDRAIL: If the user's note is gibberish, unintelligible, or cannot be semantically correlated with the provided context, you MUST reject it.
8. OUTPUT FORMAT: You must respond ONLY with a valid JSON object in this format: { "expandedText": "Your generated sentence here" } OR if rejected: { "error": "UNGROUNDED_NOTE", "message": "Cannot correlate note with transcript context." }

EXPANDED NOTE:`
}

/**
 * Parse the LLM's raw output, extracting the expanded text or detecting
 * UNGROUNDED_NOTE rejection.
 *
 * Returns:
 *   { type: 'expanded', text: string }   — successful expansion
 *   { type: 'ungrounded' }               — forensic guardrail triggered
 *   { type: 'fallback', text: string }    — JSON parse failed, best-effort text
 */
function parseExpansionResponse(
  raw: string,
  originalNoteText: string
):
  | { type: 'expanded'; text: string }
  | { type: 'ungrounded' }
  | { type: 'fallback'; text: string } {
  // The model is asked for one JSON object. Take the first `{` and try each
  // following `}` as its end: a lazy regex stops at the first `}`, which is
  // wrong as soon as the text itself contains one.
  const start = raw.indexOf('{')
  if (start >= 0) {
    for (let end = raw.indexOf('}', start); end >= 0; end = raw.indexOf('}', end + 1)) {
      try {
        const parsed = JSON.parse(raw.slice(start, end + 1))
        if (parsed?.error === 'UNGROUNDED_NOTE') {
          return { type: 'ungrounded' }
        }
        if (typeof parsed?.expandedText === 'string' && parsed.expandedText.trim()) {
          return { type: 'expanded', text: parsed.expandedText.trim() }
        }
        break // valid JSON but not the shape we asked for
      } catch {
        // not a complete object yet — try the next closing brace
      }
    }

    // Output cut off by the token limit: `{ "expandedText": "The team agreed`
    // Recover the sentence instead of showing the user raw JSON.
    if (/"error"\s*:\s*"UNGROUNDED_NOTE/.test(raw)) {
      return { type: 'ungrounded' }
    }
    const partial = /"expandedText"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(raw)
    if (partial?.[1]?.trim()) {
      let text = partial[1]
      try {
        text = JSON.parse(`"${text.replace(/\\$/, '')}"`)
      } catch {
        // keep the raw capture
      }
      return { type: 'expanded', text: text.trim() }
    }
  }

  // Fallback: aggressive regex stripping
  let cleaned = raw
  cleaned = cleaned.replace(/^\*\*(AI )?Expansion:\*\*\s*/i, '').trim()
  cleaned = cleaned.replace(/^(AI )?Expansion:\s*/i, '').trim()
  if (cleaned.startsWith(originalNoteText.trim())) {
    cleaned = cleaned.substring(originalNoteText.trim().length).trim()
  }
  cleaned = cleaned.replace(/^\*\*(AI )?Expansion:\*\*\s*/i, '').trim()

  return { type: 'fallback', text: cleaned }
}

/**
 * Convert a note/"now" timestamp to seconds from the start of the meeting.
 *
 * Transcript segments are stored relative to the meeting start (0…duration),
 * while notes and the renderer send Unix seconds. Comparing the two directly
 * never matched, so every expansion came back "no transcript context".
 */
function toMeetingSeconds(meetingId: string, timestamp: unknown): number | null {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return null
  // Already relative (a meeting is not 30 years long).
  if (timestamp < 1_000_000_000) return Math.max(0, timestamp)
  const meeting = getDatabase()
    .prepare('SELECT start_time FROM meetings WHERE id = ?')
    .get(meetingId) as { start_time: number } | undefined
  if (!meeting) return null
  return Math.max(0, timestamp - meeting.start_time)
}

/**
 * Transcript context to ground an expansion: the minute before the note's
 * moment, or — when nothing was said then, or the note is being expanded
 * after the meeting ended — the last stretch of transcript before it.
 */
function getGroundingContext(meetingId: string, timestamp: unknown) {
  const transcriptService = getTranscriptService()
  const relative = toMeetingSeconds(meetingId, timestamp)

  if (relative !== null) {
    const context = transcriptService.getContext(meetingId, relative, 60, 10)
    if (context.contextText.trim()) return { context, relative }
  }

  const latest = getDatabase()
    .prepare(
      relative !== null
        ? 'SELECT MAX(end_time) as lastEnd FROM transcripts WHERE meeting_id = ? AND start_time <= ?'
        : 'SELECT MAX(end_time) as lastEnd FROM transcripts WHERE meeting_id = ?'
    )
    .get(...(relative !== null ? [meetingId, relative] : [meetingId])) as {
    lastEnd: number | null
  }
  const anchor = latest?.lastEnd ?? relative ?? 0
  return { context: transcriptService.getContext(meetingId, anchor, 90, 0), relative: anchor }
}

/**
 * Build the standard UNGROUNDED_NOTE error response payload.
 */
/** Strip editor markup so prompts and search see plain words. */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function makeUngroundedResponse(message?: string) {
  return {
    success: false as const,
    error: {
      code: 'UNGROUNDED_NOTE',
      message: message || 'Cannot correlate note with transcript context.',
      timestamp: Date.now(),
    },
  }
}

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
        timestamp: params.timestamp ?? Math.floor(Date.now() / 1000),
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
      return { success: true, data: undefined }
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

      // 1. Get transcript context around the note's moment in the meeting
      const { context, relative: meetingSeconds } = getGroundingContext(
        params.meetingId,
        params.timestamp
      )

      // BUG-2 FIX: If there's no transcript context at all, reject deterministically.
      // Sending an empty CONTEXT block to the LLM is a hallucination vector —
      // the model will invent context. This is a pre-LLM guardrail.
      if (!context.contextText || !context.contextText.trim()) {
        log.debug(
          '[note:expand] No transcript context available — deterministic UNGROUNDED rejection'
        )
        return makeUngroundedResponse(
          'No transcript context available around this timestamp. Cannot ground expansion.'
        )
      }

      // 2. Grounding text. Every tier writes the expansion with the local model;
      //    paid tiers may first ask the cloud for a better-targeted excerpt of
      //    the meeting (PiyAPI Context Sessions, token-budgeted).
      //
      //    The cloud step used to hand the *whole prompt* — transcript excerpt
      //    included — to backend.ask(), which sent it upstream in plain text as
      //    a search query and then wrapped it in a second prompt for the local
      //    model. Only the user's short note is sent now.
      let groundingText = context.contextText
      let source: 'local' | 'cloud' = 'local'
      let recordCloudUsage: (() => void) | null = null

      const cloudStatus = await cam.getCloudAccessStatus()
      if (cloudStatus.hasAccess && features.contextSessions) {
        // Check quota for Starter tier (50 queries/month)
        const { getQueryQuotaManager } = await import('../../services/QueryQuotaManager')
        const quotaManager = getQueryQuotaManager()
        const quota = await quotaManager.checkQuota(cloudStatus.tier)

        if (quota.exhausted) {
          // Quota exhausted — stay on the local excerpt (Blueprint §5.1)
          log.info(
            `[note:expand] Starter quota exhausted (${quota.used}/${quota.limit}), using local context`
          )
        } else {
          try {
            const { getBackend } = await import('../../services/backend/BackendSingleton')
            const backend = getBackend()

            // P1-6 FIX: Check health before cloud calls to prevent unhelpful errors when offline
            const health = await backend.healthCheck()
            if (health.status !== 'healthy') {
              log.debug('[note:expand] Cloud unhealthy, using local context')
            } else {
              // Blueprint §2.4: Use Context Sessions for semantic context retrieval
              const sessionResult = await backend.createContextSession({
                namespace: 'meetings.transcripts',
                token_budget: 2048,
                time_range: {
                  start: Math.max(0, meetingSeconds - 60),
                  end: meetingSeconds + 10,
                },
                filters: { meeting_id: params.meetingId },
              })

              if (sessionResult?.context_session_id) {
                const contextData = await backend.retrieveContext(
                  sessionResult.context_session_id,
                  params.text
                )
                if (contextData?.context?.trim()) {
                  groundingText = contextData.context
                  source = 'cloud'
                  recordCloudUsage = () => quotaManager.recordUsage()
                }
              }
            }
          } catch (err) {
            // Cloud context is an enhancement; the local excerpt always works.
            log.debug('Cloud context retrieval failed, using local context', err)
          }
        }
      }

      // 3. Generate with the local model — Blueprint §2.4 prompt engineering
      const { getModelManager } = await import('../../services/ModelManager')
      const modelManager = getModelManager()
      const localStartTime = Date.now()

      const prompt = buildExpansionPrompt(groundingText, params.text)

      const expandedText = await modelManager.generate(
        {
          prompt,
          temperature: 0.1,
          topP: 0.9,
          topK: 40,
          // ~50 words of text plus the JSON wrapper; 100 routinely cut the
          // closing quote/brace off. ('USER' was a stop string and truncated
          // any expansion that mentioned the word.)
          maxTokens: 180,
          stop: ['\n\n'],
        },
        'noteExpand'
      )

      const parsed = parseExpansionResponse(expandedText, params.text)

      if (parsed.type === 'ungrounded') {
        return makeUngroundedResponse()
      }

      const finalLocalExpandedText =
        parsed.type === 'expanded' ? parsed.text : parsed.type === 'fallback' ? parsed.text : ''

      // BUG-3 FIX: Only charge quota if we actually produced valid output.
      if (finalLocalExpandedText) recordCloudUsage?.()

      const inferenceTime = Date.now() - localStartTime
      return {
        success: true,
        data: {
          expandedText: finalLocalExpandedText,
          context: groundingText,
          tokensUsed: Math.ceil(expandedText.length / 4),
          inferenceTime,
          sourceSegments: context.transcripts.map((t: { id: string }) => t.id),
          source,
        },
      }
    } catch (error) {
      log.error('note:expand failed:', error)
      return {
        success: false,
        error: {
          code: 'NOTE_EXPAND_FAILED',
          message:
            (error instanceof Error ? error.message : null) ||
            'AI expansion unavailable — AI engine may still be loading. Please try again.',
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

      const results: Array<{ noteId: string; expandedText: string; error?: string }> = []

      // BUG-7 FIX: Use the static import at the top of the file instead of
      // a redundant dynamic import. getNotesByMeetingId is already imported.
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

          const { context } = getGroundingContext(
            params.meetingId,
            (note as { timestamp?: number }).timestamp
          )

          // BUG-2 FIX (batch path): Empty context → deterministic rejection
          if (!context.contextText || !context.contextText.trim()) {
            results.push({
              noteId,
              expandedText: '',
              error: 'No transcript context available around this timestamp.',
            })
            continue
          }

          // Notes are stored as editor HTML; the model should see the words.
          const originalText = htmlToPlainText(
            (note as { original_text?: string }).original_text ?? ''
          )
          const prompt = buildExpansionPrompt(context.contextText, originalText)

          const expandedText = await modelManager.generate(
            {
              prompt,
              temperature: 0.1,
              maxTokens: 180,
              stop: ['\n\n'],
            },
            'noteExpand'
          )

          // BUG-4 FIX: Use parseExpansionResponse instead of manual throw-rethrow.
          // The previous throw-new-Error('UNGROUNDED_NOTE') → catch → throw-again
          // pattern was fragile and produced misleading error strings.
          const parsed = parseExpansionResponse(expandedText, originalText)

          if (parsed.type === 'ungrounded') {
            results.push({
              noteId,
              expandedText: '',
              error: 'UNGROUNDED_NOTE: Cannot correlate note with transcript context.',
            })
            continue
          }

          const finalExpandedText =
            parsed.type === 'expanded' ? parsed.text : parsed.type === 'fallback' ? parsed.text : ''

          // Persist expanded text to DB — without this, augmented_text stays NULL
          if (finalExpandedText) {
            // BUG-5 FIX: Also set is_augmented: true so getAugmentedNotes()
            // and downstream logic that checks this flag can find batch-expanded notes.
            updateNote(noteId, {
              augmented_text: finalExpandedText,
              is_augmented: true,
            })
          }

          results.push({ noteId, expandedText: finalExpandedText })

          // Emit progress event to renderer — C6 fix: avoid circular require('electron/main')
          // BrowserWindow.getAllWindows() queries Electron's window registry directly
          // Broadcast — picking "the window wider than 400px" now matches the
          // 480px recording widget as well as the main window.
          for (const win of BrowserWindow.getAllWindows()) {
            if (win.isDestroyed()) continue
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
