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
      const aiModelExists = modelManager.isModelDownloaded()

      return {
        success: true,
        data: {
          asrReady: asr.isServiceReady(),
          aiAvailable: aiAvailable,
          aiModelDownloaded: aiModelExists,
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

      return { success: true }
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

  // intelligence:meetingSuggestion — Generate meeting title suggestions via local AI
  ipcMain.handle('intelligence:meetingSuggestion', async (_, params) => {
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

      const { getModelManager } = await import('../../services/ModelManager')
      const modelManager = getModelManager()

      const suggestion = await modelManager.generate({
        prompt: `Suggest a concise meeting title (3-6 words) based on this discussion:\n\n${params.recentContext}\n\nMEETING TITLE:`,
        temperature: 0.3,
        maxTokens: 20,
      })

      return { success: true, data: { suggestion: suggestion.trim() } }
    } catch (error) {
      log.debug('Meeting suggestion failed', error)
      return {
        success: true,
        data: { suggestion: '' },
      }
    }
  })
}
