import { ipcMain } from 'electron'
import {
  getEntitiesByMeetingId,
  getEntitiesByType,
} from '../../database/crud/entities'
import { getLocalEntityExtractor } from '../../services/LocalEntityExtractor'

export function registerEntityHandlers(): void {
  // entity:extract — Real-time entity extraction from text (Tier 2, <10ms)
  ipcMain.handle('entity:extract', async (_, params) => {
    try {
      if (!params?.text) {
        return {
          success: false,
          error: {
            code: 'INVALID_PARAMS',
            message: 'text is required',
            timestamp: Date.now(),
          },
        }
      }
      const extractor = getLocalEntityExtractor()
      const entities = extractor.extract(params.text)
      return { success: true, data: entities }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'ENTITY_EXTRACT_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // entity:get — Get all entities for a meeting
  ipcMain.handle('entity:get', async (_, params) => {
    try {
      if (!params?.meetingId) {
        return { success: false, error: { code: 'INVALID_PARAMS', message: 'meetingId is required', timestamp: Date.now() } }
      }
      const entities = getEntitiesByMeetingId(params.meetingId)
      return { success: true, data: entities }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'ENTITY_GET_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // entity:getByType — Get entities filtered by type (PERSON, DATE, AMOUNT, ACTION)
  ipcMain.handle('entity:getByType', async (_, params) => {
    try {
      if (!params?.meetingId || !params?.type) {
        return { success: false, error: { code: 'INVALID_PARAMS', message: 'meetingId and type are required', timestamp: Date.now() } }
      }
      const entities = getEntitiesByType(params.meetingId, params.type)
      return { success: true, data: entities }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'ENTITY_GET_BY_TYPE_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })
}
