/**
 * Model IPC Handlers
 *
 * Handles IPC communication for AI model management.
 */

import { ipcMain } from 'electron'
import { getModelDownloadService } from '../../services/ModelDownloadService'

export function registerModelHandlers() {
  const modelService = getModelDownloadService()

  /**
   * Detect hardware tier
   */
  ipcMain.handle('model:detectHardwareTier', async () => {
    try {
      const tierInfo = modelService.detectHardwareTier()
      return { success: true, data: tierInfo }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * Check if first launch
   */
  ipcMain.handle('model:isFirstLaunch', async () => {
    try {
      const isFirstLaunch = modelService.isFirstLaunch()
      return { success: true, data: isFirstLaunch }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * Check if models are downloaded
   */
  ipcMain.handle(
    'model:areModelsDownloaded',
    async (_event, modelType: 'whisper-turbo' | 'moonshine-base') => {
      try {
        const downloaded = modelService.areModelsDownloaded(modelType)
        return { success: true, data: downloaded }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }
  )

  /**
   * Download models for hardware tier
   */
  ipcMain.handle('model:downloadModelsForTier', async (_event, tierInfo) => {
    try {
      await modelService.downloadModelsForTier(tierInfo)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  /**
   * Verify model integrity
   */
  ipcMain.handle(
    'model:verifyModel',
    async (_event, modelType: 'whisper-turbo' | 'moonshine-base') => {
      try {
        const valid = await modelService.verifyModel(modelType)
        return { success: true, data: valid }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }
  )

  /**
   * Delete model (for re-download)
   */
  ipcMain.handle(
    'model:deleteModel',
    async (_event, modelType: 'whisper-turbo' | 'moonshine-base') => {
      try {
        modelService.deleteModel(modelType)
        return { success: true }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }
  )

  /**
   * Get model file paths
   */
  ipcMain.handle(
    'model:getModelPaths',
    async (_event, modelType: 'whisper-turbo' | 'moonshine-base') => {
      try {
        const paths = modelService.getModelPaths(modelType)
        return { success: true, data: paths }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }
  )
}
