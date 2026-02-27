import { ipcMain } from 'electron'
import { config } from '../../config/environment'
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

  // intelligence:getEngineStatus — Check ASR + Ollama readiness
  ipcMain.handle('intelligence:getEngineStatus', async () => {
    try {
      const asr = getASRService()
      let ollamaAvailable = false
      try {
        const res = await fetch(`${config.OLLAMA_BASE_URL}/api/tags`)
        ollamaAvailable = res.ok
      } catch (err) {
        log.debug('Ollama not reachable', err)
      }
      return {
        success: true,
        data: {
          asrReady: asr.isServiceReady(),
          ollamaAvailable,
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

  // intelligence:checkOllama — Check if Ollama is running and list models
  ipcMain.handle('intelligence:checkOllama', async () => {
    try {
      const response = await fetch(`${config.OLLAMA_BASE_URL}/api/tags`)
      const data = await response.json()
      return {
        success: true,
        data: { available: true, models: data.models || [] },
      }
    } catch (err) {
      log.debug('Ollama check failed', err)
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
}
