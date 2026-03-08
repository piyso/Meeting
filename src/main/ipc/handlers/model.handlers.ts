/**
 * Model IPC Handlers
 *
 * Handles IPC communication for AI model management.
 */

import { ipcMain } from 'electron'
import { getModelDownloadService, type ModelType } from '../../services/ModelDownloadService'

export function registerModelHandlers() {
  const modelService = getModelDownloadService()

  /**
   * Detect hardware tier
   */
  ipcMain.handle('model:detectHardwareTier', async () => {
    try {
      const tierInfo = modelService.detectHardwareTier()
      return { success: true, data: tierInfo }
    } catch (error: unknown) {
      return {
        success: false,
        error: { code: 'MODEL_ERROR', message: (error as Error).message, timestamp: Date.now() },
      }
    }
  })

  /**
   * Check if first launch
   */
  ipcMain.handle('model:isFirstLaunch', async () => {
    try {
      const isFirstLaunch = modelService.isFirstLaunch()
      return { success: true, data: isFirstLaunch }
    } catch (error: unknown) {
      return {
        success: false,
        error: { code: 'MODEL_ERROR', message: (error as Error).message, timestamp: Date.now() },
      }
    }
  })

  /**
   * Check if models are downloaded
   */
  ipcMain.handle('model:areModelsDownloaded', async (_event, modelType: string) => {
    try {
      const downloaded = modelService.areModelsDownloaded(modelType as ModelType)
      return { success: true, data: downloaded }
    } catch (error: unknown) {
      return {
        success: false,
        error: { code: 'MODEL_ERROR', message: (error as Error).message, timestamp: Date.now() },
      }
    }
  })

  /**
   * Download models for hardware tier
   */
  ipcMain.handle('model:downloadModelsForTier', async (_event, tierInfo) => {
    try {
      // Download ASR and LLM independently
      const [asrResult, llmResult] = await Promise.allSettled([
        modelService.downloadModelsForTier(tierInfo),
        modelService.downloadLLMForTier(tierInfo),
      ])

      const errors: string[] = []
      if (asrResult.status === 'rejected') {
        errors.push(`ASR: ${asrResult.reason?.message || asrResult.reason}`)
      }
      if (llmResult.status === 'rejected') {
        errors.push(`LLM: ${llmResult.reason?.message || llmResult.reason}`)
      }

      if (errors.length === 2) {
        return {
          success: false,
          error: { code: 'MODEL_ERROR', message: errors.join('; '), timestamp: Date.now() },
        }
      }

      return { success: true, data: undefined }
    } catch (error: unknown) {
      return {
        success: false,
        error: { code: 'MODEL_ERROR', message: (error as Error).message, timestamp: Date.now() },
      }
    }
  })

  /**
   * Verify model integrity
   */
  ipcMain.handle('model:verifyModel', async (_event, modelType: string) => {
    try {
      const valid = await modelService.verifyModel(modelType as ModelType)
      return { success: true, data: valid }
    } catch (error: unknown) {
      return {
        success: false,
        error: { code: 'MODEL_ERROR', message: (error as Error).message, timestamp: Date.now() },
      }
    }
  })

  /**
   * Delete model (for re-download)
   */
  ipcMain.handle('model:deleteModel', async (_event, modelType: string) => {
    try {
      modelService.deleteModel(modelType as ModelType)
      return { success: true, data: undefined }
    } catch (error: unknown) {
      return {
        success: false,
        error: { code: 'MODEL_ERROR', message: (error as Error).message, timestamp: Date.now() },
      }
    }
  })

  /**
   * Get model file paths
   */
  ipcMain.handle('model:getModelPaths', async (_event, modelType: string) => {
    try {
      const paths = modelService.getModelPaths(modelType as ModelType)
      return { success: true, data: paths }
    } catch (error: unknown) {
      return {
        success: false,
        error: { code: 'MODEL_ERROR', message: (error as Error).message, timestamp: Date.now() },
      }
    }
  })

  /**
   * Download all models for detected hardware tier
   */
  ipcMain.handle('model:downloadAll', async () => {
    try {
      const tierInfo = modelService.detectHardwareTier()

      // Download ASR and LLM independently — one can succeed even if the other fails
      const [asrResult, llmResult] = await Promise.allSettled([
        modelService.downloadModelsForTier(tierInfo),
        modelService.downloadLLMForTier(tierInfo),
      ])

      const errors: string[] = []
      if (asrResult.status === 'rejected') {
        errors.push(`ASR download failed: ${asrResult.reason?.message || asrResult.reason}`)
      }
      if (llmResult.status === 'rejected') {
        errors.push(`LLM download failed: ${llmResult.reason?.message || llmResult.reason}`)
      }

      if (errors.length === 2) {
        // Both failed
        return {
          success: false,
          error: { code: 'MODEL_ERROR', message: errors.join('; '), timestamp: Date.now() },
        }
      }

      // At least one succeeded (partial or full success)
      return {
        success: true,
        data: { ...tierInfo, warnings: errors.length > 0 ? errors : undefined },
      }
    } catch (error: unknown) {
      return {
        success: false,
        error: { code: 'MODEL_ERROR', message: (error as Error).message, timestamp: Date.now() },
      }
    }
  })

  /**
   * Get live resource usage stats
   */
  ipcMain.handle('model:getResourceUsage', async () => {
    try {
      const { getModelManager } = await import('../../services/ModelManager')
      const stats = getModelManager().getResourceUsage()
      return { success: true, data: stats }
    } catch (error: unknown) {
      return {
        success: false,
        error: { code: 'MODEL_ERROR', message: (error as Error).message, timestamp: Date.now() },
      }
    }
  })
}
