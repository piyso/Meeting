import { ipcMain } from 'electron'
import { getASRService } from '../../services/ASRService'
import { getHardwareTierService } from '../../services/HardwareTierService'
import { Logger } from '../../services/Logger'

const log = Logger.create('IntelligenceHandlers')

// P1-2 FIX: Per-sender AbortController map to prevent cross-window interference.
// If two windows (main + widget) both call askMeetings, aborting one
// should not affect the other.
const activeAskControllers = new Map<number, AbortController>()

// The local model runs with a 4,096-token context. 9,000 characters of
// transcript is roughly 2,500 tokens, which leaves room for the instructions,
// the question and the 300-token answer. (12,000 characters could overflow it,
// and the model then silently dropped the start of the context.)
const ASK_CONTEXT_CHAR_BUDGET = 9000

export function registerIntelligenceHandlers(): void {
  // intelligence:getHardwareTier — Detect hardware capabilities
  ipcMain.handle('intelligence:getHardwareTier', async () => {
    try {
      const tierService = getHardwareTierService()
      const info = await tierService.detectAndStore()

      // Populate CrashReporter context so crash reports include device info
      try {
        const { CrashReporter } = await import('../../services/CrashReporter')
        CrashReporter.setContext({
          hardwareTier: info.tier,
        })
      } catch {
        // CrashReporter may not be initialized yet — non-critical
      }

      return { success: true, data: info }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'HARDWARE_TIER_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // intelligence:getEngineStatus — Check ASR + AI engine readiness
  ipcMain.handle('intelligence:getEngineStatus', async () => {
    try {
      const asr = getASRService()

      // Check if local AI engine (node-llama-cpp) is available
      const { getModelManager } = await import('../../services/ModelManager')
      const modelManager = getModelManager()
      const aiAvailable = modelManager.isAvailable()

      return {
        success: true,
        data: {
          engine: 'local',
          tokensPerSecond: 0,
          models: [
            {
              name: 'asr-whisper',
              isLoaded: asr.isServiceReady(),
              ramUsage: 0,
              lastUsed: null,
              autoUnloadIn: null,
            },
            {
              name: modelManager.getLLMModel(),
              isLoaded: aiAvailable,
              ramUsage: 0,
              lastUsed: null,
              autoUnloadIn: null,
            },
          ],
        },
      }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'ENGINE_STATUS_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // intelligence:checkOllama — Check if AI engine is available (renamed internally)
  ipcMain.handle('intelligence:checkOllama', async () => {
    try {
      const { getModelManager } = await import('../../services/ModelManager')
      const modelManager = getModelManager()

      return {
        success: true,
        data: {
          available: modelManager.isModelDownloaded(),
          models: [{ name: modelManager.getLLMModel() }],
        },
      }
    } catch (err) {
      log.debug('AI engine check failed', err)
      return {
        success: true,
        data: { available: false, models: [] },
      }
    }
  })

  // intelligence:unloadModels — Unload ASR and LLM models to free RAM
  ipcMain.handle('intelligence:unloadModels', async () => {
    try {
      const asr = getASRService()
      await asr.unload()

      // Unload LLM via ModelManager (handles hardware-tier model selection)
      const { getModelManager } = await import('../../services/ModelManager')
      await getModelManager().forceUnload()

      return { success: true, data: undefined }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'UNLOAD_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // intelligence:meetingSuggestion — Generate meeting suggestions via local AI
  // Supports multi-mode prompts: title, question, action, decision
  // Starter+: Cloud fallback for higher quality (question/decision modes)
  ipcMain.handle('intelligence:meetingSuggestion', async (_event, params) => {
    try {
      if (!params?.meetingId || !params?.recentContext) {
        return {
          success: false,
          error: {
            code: 'INVALID_PARAMS',
            message: 'meetingId and recentContext are required',
            timestamp: Date.now(),
          },
        }
      }

      const mode = params.promptMode || 'title'
      // M-19 AUDIT: Truncate context to fit the local model's 4K-token context.
      // 8000 chars ≈ 2000 tokens, leaving room for prompt template + response.
      const context = params.recentContext.substring(0, 8000)

      // Suggestions are written by the local model from the discussion text
      // passed in. There used to be a "cloud" branch here for paid plans: it
      // sent that text upstream as a search query, charged a monthly AI query,
      // and then generated the suggestion with the same local model anyway.

      // ── Local path (always available) ──
      const { getModelManager } = await import('../../services/ModelManager')
      const modelManager = getModelManager()

      const prompts: Record<string, { text: string; maxTokens: number; temperature: number }> = {
        title: {
          text: `Suggest a concise meeting title in the same language as the discussion content (3-6 words). Do NOT translate — use the same language as the transcript.\n\n${context}\n\nMEETING TITLE:`,
          maxTokens: 20,
          temperature: 0.3,
        },
        question: {
          text: `Based on this meeting discussion, suggest ONE insightful follow-up question that hasn't been addressed yet. Respond in the same language as the discussion content.\n\n${context}\n\nSUGGESTED QUESTION:`,
          maxTokens: 60,
          temperature: 0.5,
        },
        action: {
          text: `Identify any action items from this discussion. Format each as "- [Person]: [Task]". If none, say "No action items yet.":\n\n${context}\n\nACTION ITEMS:`,
          maxTokens: 80,
          temperature: 0.2,
        },
        decision: {
          text: `Summarize any decisions that were made in this discussion in one sentence. If none, say "No decisions yet.":\n\n${context}\n\nDECISION:`,
          maxTokens: 60,
          temperature: 0.2,
        },
      }

      const promptConfig = mode in prompts ? prompts[mode] : prompts['title']
      if (!promptConfig) throw new Error(`Unknown prompt mode: ${mode}`)

      const suggestion = await modelManager.generate(
        {
          prompt: promptConfig.text,
          temperature: promptConfig.temperature,
          maxTokens: promptConfig.maxTokens,
        },
        'meetingSuggestion'
      )

      // The model often wraps a title or a question in quotation marks.
      const text = suggestion.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
      return { success: true, data: { suggestion: text, mode, source: 'local' } }
    } catch (error) {
      log.debug('Meeting suggestion failed', error)
      return {
        success: true,
        data: { suggestion: '' },
      }
    }
  })

  // intelligence:askMeetings — RAG-based Q&A for the "Ask Meetings" view
  // Starter+: Cloud PiyAPI /ask (quota-gated, higher quality)
  // Free/fallback: local Qwen 2.5 via ModelManager
  // Uses event.sender.send for real-time token streaming (ChatGPT-like typewriter)
  ipcMain.handle('intelligence:askMeetings', async (event, params) => {
    // P1-2 FIX: Per-sender AbortController — declared outside try for finally access
    const senderId = event.sender.id
    let ownController: AbortController | null = null
    try {
      if (!params?.question || !params?.context) {
        return {
          success: false,
          error: {
            code: 'INVALID_PARAMS',
            message: 'question and context are required',
            timestamp: Date.now(),
          },
        }
      }

      // P1-2 FIX: Create a new AbortController per request, keyed by sender.
      // If a previous request from the same sender is still running, abort it first.
      const prev = activeAskControllers.get(senderId)
      if (prev) {
        prev.abort()
      }
      const controller = new AbortController()
      ownController = controller
      activeAskControllers.set(senderId, controller)
      const { signal } = controller

      // ── Check cloud availability + quota ──
      const { getCloudAccessManager } = await import('../../services/CloudAccessManager')
      const cam = getCloudAccessManager()
      const features = await cam.getFeatureAccess()
      const cloudStatus = await cam.getCloudAccessStatus()

      let useCloud = false
      let quotaRemaining = 0

      if (features.cloudAI) {
        try {
          const { getQueryQuotaManager } = await import('../../services/QueryQuotaManager')
          const quotaManager = getQueryQuotaManager()
          const quota = await quotaManager.checkQuota(cloudStatus.tier)
          quotaRemaining = quota.remaining

          if (!quota.exhausted) {
            useCloud = true
            // NOTE: recordUsage() moved to AFTER confirmed cloud success (line ~319)
            // to avoid losing quota on failed requests
          } else {
            // Quota exhausted — emit intelligence wall event
            log.info('Cloud AI quota exhausted, emitting intelligence wall event')
            try {
              event.sender.send('show-intelligence-wall', {
                used: quota.used,
                limit: quota.limit,
                resetsAt: quota.resetsAt,
              })
            } catch {
              // Sender may be destroyed if window closed
            }
          }
        } catch (quotaErr) {
          log.warn('Quota check failed, falling back to local:', quotaErr)
        }
      }

      // ── Cloud Retrieval Path (Starter+ with remaining quota via Zero-LLM PiyAPI Search) ──
      let effectiveContext = params.context || ''
      let cloudSources: Array<{ memoryId: string; content: string; similarity: number }> = []

      if (useCloud) {
        try {
          const { getBackend } = await import('../../services/backend/BackendSingleton')
          const backend = getBackend()
          const health = await backend.healthCheck()

          if (health.status === 'healthy') {
            // Retrieve token-budgeted context via PiyAPI LLM-Free Search Endpoint
            const { context: cloudContext, results: cloudResults } = await backend.getContext(
              params.question,
              params.namespace || 'meetings',
              3000
            )

            if (cloudContext?.trim()) {
              effectiveContext = effectiveContext.trim()
                ? `${cloudContext}\n\n${effectiveContext}`
                : cloudContext

              cloudSources = (cloudResults || []).map(r => ({
                memoryId: r.memory?.id || '',
                content: r.memory?.content || '',
                similarity: Number(r.similarity) || 0.85,
              }))

              // Record cloud quota usage after successful search context retrieval
              try {
                const { getQueryQuotaManager } = await import('../../services/QueryQuotaManager')
                getQueryQuotaManager().recordUsage()
              } catch {
                /* non-critical */
              }
            }
          }
        } catch (cloudErr) {
          log.warn('PiyAPI cloud search context retrieval failed, using local context:', cloudErr)
        }
      }

      // ── Generation via Available LLM (Local engine with real-time streaming) ──
      const { getModelManager } = await import('../../services/ModelManager')
      const modelManager = getModelManager()

      // Wording and temperature were measured against the local model: with the
      // instructions in front of the context and a temperature of 0.4 it named
      // the wrong person and answered questions the meetings never touched
      // ("a Paris office budget of 42,000 euros") instead of saying so.
      const systemPrompt = effectiveContext.trim()
        ? `You are a helpful meeting assistant.

MEETING CONTEXT:
${effectiveContext.substring(0, ASK_CONTEXT_CHAR_BUDGET)}

Answer the question below using ONLY the meeting context above. Be concise. First check that the context really talks about what the question asks; if it does not, answer only: "That is not mentioned in your meetings." Do not guess and do not answer about something else. Respond in the same language as the question.

QUESTION: ${params.question}

ANSWER:`
        : `You are a helpful meeting assistant. The user asked: "${params.question}" but no relevant meeting transcripts were found. Let the user know and suggest they try different keywords. Respond in the same language as the question.

ANSWER:`

      const result = await modelManager.generate(
        {
          prompt: systemPrompt,
          temperature: 0.1,
          maxTokens: 300,
          // P1-2 FIX: Pass abort signal so inference stops mid-token on cancel
          signal,
          onToken: (accumulatedText: string) => {
            // Don't stream to destroyed senders or aborted requests
            if (signal.aborted) return
            try {
              event.sender.send('intelligence:streamToken', {
                token: accumulatedText,
                fullText: accumulatedText,
              })
            } catch {
              // Sender may be destroyed if window closed during generation
            }
          },
        },
        'askMeetings'
      )

      return {
        success: true,
        data: {
          answer: result.trim(),
          source: cloudSources.length > 0 ? 'cloud-search' : 'local',
          quotaRemaining:
            cloudSources.length > 0 ? Math.max(0, quotaRemaining - 1) : quotaRemaining,
          sources: cloudSources,
        },
      }
    } catch (error) {
      // P1-2: AbortError is expected when user cancels — don't log as error
      if ((error as Error).name === 'AbortError') {
        log.debug('Ask meetings cancelled by user')
        return {
          success: true,
          data: {
            answer: '',
            source: 'cancelled',
            quotaRemaining: 0,
          },
        }
      }
      log.debug('Ask meetings failed', error)
      return {
        success: false,
        error: {
          code: 'ASK_MEETINGS_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    } finally {
      // Only clear our own entry. A newer question from the same window has
      // already replaced it (and aborted us); deleting unconditionally removed
      // that newer controller, so "stop generating" did nothing for it.
      if (ownController && activeAskControllers.get(senderId) === ownController) {
        activeAskControllers.delete(senderId)
      }
    }
  })

  // P1-2 FIX: intelligence:cancelAsk — Abort the active askMeetings request.
  // Called by the renderer when the user clicks Cancel or navigates away.
  // Triggers the AbortController which interrupts ModelManager.generate()
  // via the signal check in onTextChunk, freeing GPU resources immediately.
  ipcMain.handle('intelligence:cancelAsk', async event => {
    const controller = activeAskControllers.get(event.sender.id)
    if (controller) {
      controller.abort()
      activeAskControllers.delete(event.sender.id)
      log.debug('Active askMeetings generation cancelled via IPC')
    }
    return { success: true, data: undefined }
  })
}
