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
      return { success: false, error: (error as Error).message }
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
      return { success: false, error: (error as Error).message }
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
      return { success: false, error: (error as Error).message }
    }
  })

  /**
   * Download models for hardware tier
   */
  ipcMain.handle('model:downloadModelsForTier', async (_event, tierInfo) => {
    try {
      // Download ASR model
      await modelService.downloadModelsForTier(tierInfo)
      // Download LLM GGUF model (auto-download on first launch)
      await modelService.downloadLLMForTier(tierInfo)
      return { success: true }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
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
      return { success: false, error: (error as Error).message }
    }
  })

  /**
   * Delete model (for re-download)
   */
  ipcMain.handle('model:deleteModel', async (_event, modelType: string) => {
    try {
      modelService.deleteModel(modelType as ModelType)
      return { success: true }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
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
      return { success: false, error: (error as Error).message }
    }
  })

  /**
   * Download all models for detected hardware tier
   */
  ipcMain.handle('model:downloadAll', async () => {
    try {
      const tierInfo = modelService.detectHardwareTier()
      // Download ASR model
      await modelService.downloadModelsForTier(tierInfo)
      // Download LLM GGUF model
      await modelService.downloadLLMForTier(tierInfo)
      return { success: true, data: tierInfo }
    } catch (error: unknown) {
      return { success: false, error: (error as Error).message }
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
      return { success: false, error: (error as Error).message }
    }
  })
}
