import { ipcMain } from 'electron'
import { getASRService } from '../../services/ASRService'
import { getHardwareTierService } from '../../services/HardwareTierService'
import { Logger } from '../../services/Logger'

const log = Logger.create('IntelligenceHandlers')

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

      // ── Cloud path for question/action/decision modes (Starter+) ──
      if (mode !== 'title') {
        try {
          const { getCloudAccessManager } = await import('../../services/CloudAccessManager')
          const cam = getCloudAccessManager()
          const features = await cam.getFeatureAccess()
          const status = await cam.getCloudAccessStatus()

          if (features.cloudAI && status.hasAccess) {
            const { getQueryQuotaManager } = await import('../../services/QueryQuotaManager')
            const quotaManager = getQueryQuotaManager()
            const quota = await quotaManager.checkQuota(status.tier)

            if (!quota.exhausted) {
              const { getBackend } = await import('./graph.handlers')
              const backend = getBackend()
              const isHealthy = await backend.healthCheck()

              if (isHealthy) {
                const cloudPrompts: Record<string, string> = {
                  question: `Based on this meeting discussion, suggest ONE insightful follow-up question that hasn't been addressed yet:\n\n${params.recentContext}\n\nSUGGESTED QUESTION:`,
                  action: `Identify action items from this discussion. Format each on a new line as "- [Person]: [Task]". If none, say "No action items yet.":\n\n${params.recentContext}\n\nACTION ITEMS:`,
                  decision: `Summarize decisions made in this discussion in one sentence. If none found, say "No decisions yet.":\n\n${params.recentContext}\n\nDECISION:`,
                }

                const prompt = cloudPrompts[mode]
                if (prompt) {
                  const result = await backend.ask(prompt, 'meetings')
                  quotaManager.recordUsage()

                  if (result?.answer) {
                    return {
                      success: true,
                      data: { suggestion: result.answer.trim(), mode, source: 'cloud' },
                    }
                  }
                }
              }
            }
          }
        } catch (err) {
          // Cloud failed — fall through to local
          log.debug('Cloud meetingSuggestion failed, using local', err)
        }
      }

      // ── Local path (always available) ──
      const { getModelManager } = await import('../../services/ModelManager')
      const modelManager = getModelManager()

      const prompts: Record<string, { text: string; maxTokens: number; temperature: number }> = {
        title: {
          text: `Suggest a concise meeting title (3-6 words) based on this discussion:\n\n${params.recentContext}\n\nMEETING TITLE:`,
          maxTokens: 20,
          temperature: 0.3,
        },
        question: {
          text: `Based on this meeting discussion, suggest ONE insightful follow-up question that hasn't been addressed yet:\n\n${params.recentContext}\n\nSUGGESTED QUESTION:`,
          maxTokens: 60,
          temperature: 0.5,
        },
        action: {
          text: `Identify any action items from this discussion. Format each as "- [Person]: [Task]". If none, say "No action items yet.":\n\n${params.recentContext}\n\nACTION ITEMS:`,
          maxTokens: 80,
          temperature: 0.2,
        },
        decision: {
          text: `Summarize any decisions that were made in this discussion in one sentence. If none, say "No decisions yet.":\n\n${params.recentContext}\n\nDECISION:`,
          maxTokens: 60,
          temperature: 0.2,
        },
      }

      const promptConfig = mode in prompts ? prompts[mode] : prompts['title']
      if (!promptConfig) throw new Error(`Unknown prompt mode: ${mode}`)

      const suggestion = await modelManager.generate({
        prompt: promptConfig.text,
        temperature: promptConfig.temperature,
        maxTokens: promptConfig.maxTokens,
      })

      return { success: true, data: { suggestion: suggestion.trim(), mode, source: 'local' } }
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
  // Free/fallback: Local Qwen 2.5 3B via ModelManager
  // Uses event.sender.send for real-time token streaming (ChatGPT-like typewriter)
  ipcMain.handle('intelligence:askMeetings', async (event, params) => {
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
            // Record usage (synchronous)
            quotaManager.recordUsage()
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

      // ── Cloud path (Starter+ with remaining quota) ──
      if (useCloud) {
        try {
          const { getBackend } = await import('../handlers/graph.handlers')
          const backend = getBackend()
          const isHealthy = await backend.healthCheck()

          if (isHealthy) {
            const askResult = await backend.ask(params.question, params.namespace || 'meetings')

            if (askResult?.answer) {
              // Stream the answer to renderer for consistency with local path
              try {
                event.sender.send('intelligence:streamToken', {
                  token: askResult.answer,
                  fullText: askResult.answer,
                })
              } catch {
                // Sender may be destroyed
              }

              return {
                success: true,
                data: {
                  answer: askResult.answer,
                  source: 'cloud',
                  quotaRemaining: quotaRemaining - 1,
                  sources: askResult.sources || [],
                },
              }
            }
          }
        } catch (cloudErr) {
          log.warn('Cloud /ask failed, falling back to local:', cloudErr)
        }
      }

      // ── Local fallback (Free tier or cloud unavailable) ──
      const { getModelManager } = await import('../../services/ModelManager')
      const modelManager = getModelManager()

      const systemPrompt = params.context
        ? `You are a helpful meeting assistant. Answer the user's question based ONLY on the provided meeting transcript excerpts. Be concise and cite which meeting the information comes from. If the answer is not in the context, clearly say so.

MEETING CONTEXT:
${params.context}

USER QUESTION: ${params.question}

ANSWER:`
        : `You are a helpful meeting assistant. The user asked: "${params.question}" but no relevant meeting transcripts were found. Let the user know and suggest they try different keywords.

ANSWER:`

      let fullResponse = ''

      const result = await modelManager.generate({
        prompt: systemPrompt,
        temperature: 0.4,
        maxTokens: 300,
        onToken: (token: string) => {
          fullResponse += token
          // Stream each token to the renderer in real-time
          try {
            event.sender.send('intelligence:streamToken', {
              token,
              fullText: fullResponse,
            })
          } catch {
            // Sender may be destroyed if window closed during generation
          }
        },
      })

      return {
        success: true,
        data: {
          answer: result.trim(),
          source: 'local',
          quotaRemaining,
        },
      }
    } catch (error) {
      log.debug('Ask meetings failed', error)
      return {
        success: false,
        error: {
          code: 'ASK_MEETINGS_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })
}
