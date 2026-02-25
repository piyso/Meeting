import { ipcMain } from 'electron'
import {
  searchAll,
  searchTranscripts,
  searchNotes,
} from '../../database/search'
import { getLocalEmbeddingService } from '../../services/LocalEmbeddingService'

export function registerSearchHandlers(): void {
  // search:query — FTS5 full-text search across transcripts and notes
  ipcMain.handle('search:query', async (_, params) => {
    try {
      if (!params?.query) {
        return { success: false, error: { code: 'INVALID_PARAMS', message: 'query is required', timestamp: Date.now() } }
      }
      const results = searchAll(params.query, {
        limit: params.limit || 20,
      })
      return { success: true, data: results }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'SEARCH_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // search:semantic — Local embedding-based semantic search (gated for cross-meeting)
  ipcMain.handle('search:semantic', async (_, params) => {
    try {
      if (!params?.query) {
        return { success: false, error: { code: 'INVALID_PARAMS', message: 'query is required', timestamp: Date.now() } }
      }
      // Gate cross-meeting semantic search for free tier
      const { getCloudAccessManager } = await import('../../services/CloudAccessManager')
      const cam = getCloudAccessManager()
      const features = await cam.getFeatureAccess()

      if (!features.semanticSearch) {
        return {
          success: true,
          data: {
            results: [],
            query: params.query || '',
            blocked: true,
            reason: 'Semantic search requires Starter or Pro plan',
          },
        }
      }

      const embeddingService = getLocalEmbeddingService()
      const results = await embeddingService.search(
        params.query,
        params.limit || 10
      )
      return { success: true, data: { results, query: params.query } }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'SEMANTIC_SEARCH_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })
}
