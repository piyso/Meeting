import { ipcMain } from 'electron'
import { getEntitiesByMeetingId, getEntitiesByType } from '../../database/crud/entities'
import { getLocalEntityExtractor } from '../../services/LocalEntityExtractor'
import { Logger } from '../../services/Logger'

const log = Logger.create('EntityHandlers')

export function registerEntityHandlers(): void {
  // entity:extract — Real-time entity extraction from text (Tier 2, <10ms local)
  // Pro+: Cloud enrichment via PiyAPI for higher quality NER
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

      // Local extraction (always runs — fast, <10ms)
      const extractor = getLocalEntityExtractor()
      const localEntities = extractor.extract(params.text)

      // Pro+: Cloud enrichment for higher quality NER
      let cloudEntities: Array<{
        text: string
        type: 'PERSON' | 'DATE' | 'AMOUNT' | 'EMAIL' | 'ACTION_ITEM'
        confidence: number
        startOffset: number
        endOffset: number
      }> = []
      try {
        const { getCloudAccessManager } = await import('../../services/CloudAccessManager')
        const cam = getCloudAccessManager()
        const features = await cam.getFeatureAccess()

        if (features.knowledgeGraphInteractive) {
          const { getBackend } = await import('../../services/backend/BackendSingleton')
          const backend = getBackend()
          const health = await backend.healthCheck()

          if (health.status === 'healthy' && typeof backend.extractEntities === 'function') {
            const cloudResult = await backend.extractEntities(
              params.text,
              params.namespace || 'meetings'
            )
            if (Array.isArray(cloudResult)) {
              cloudEntities = cloudResult.map((e: Record<string, unknown>) => ({
                type: ((e.type as string) || 'PERSON') as
                  | 'PERSON'
                  | 'DATE'
                  | 'AMOUNT'
                  | 'EMAIL'
                  | 'ACTION_ITEM',
                text: (e.text as string) || (e.value as string) || '',
                confidence: (e.confidence as number) ?? 0.9,
                startOffset: (e.start_offset as number) ?? (e.startOffset as number) ?? 0,
                endOffset: (e.end_offset as number) ?? (e.endOffset as number) ?? 0,
              }))
            }
          }
          // F3: Also ingest raw text into KG for entity/fact extraction
          if (health.status === 'healthy') {
            backend.kgIngest(params.text).catch(() => {
              /* non-critical */
            })
          }
        }
      } catch (err) {
        // Cloud enrichment is non-fatal
        log.debug('Cloud entity enrichment failed, using local only:', err)
      }

      // Merge + deduplicate (prefer cloud entities when text matches)
      const seenTexts = new Set(cloudEntities.map(e => e.text.toLowerCase()))
      const mergedEntities = [
        ...cloudEntities,
        ...localEntities.filter(e => !seenTexts.has(e.text.toLowerCase())),
      ]

      return { success: true, data: mergedEntities }
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
        return {
          success: false,
          error: {
            code: 'INVALID_PARAMS',
            message: 'meetingId is required',
            timestamp: Date.now(),
          },
        }
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
        return {
          success: false,
          error: {
            code: 'INVALID_PARAMS',
            message: 'meetingId and type are required',
            timestamp: Date.now(),
          },
        }
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
