import { ipcMain } from 'electron'
import { searchAll } from '../../database/search'
import { getLocalEmbeddingService } from '../../services/LocalEmbeddingService'

export function registerSearchHandlers(): void {
  // search:query — FTS5 full-text search across transcripts and notes
  ipcMain.handle('search:query', async (_, params) => {
    try {
      if (!params?.query) {
        return {
          success: false,
          error: { code: 'INVALID_PARAMS', message: 'query is required', timestamp: Date.now() },
        }
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
        return {
          success: false,
          error: { code: 'INVALID_PARAMS', message: 'query is required', timestamp: Date.now() },
        }
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

      // Load transcripts with pre-computed embeddings from DB
      const { getDatabase } = await import('../../database/connection')
      const db = getDatabase()
      const rows = db
        .prepare(
          `
        SELECT t.id, t.meeting_id, t.text, t.embedding, t.start_time, t.end_time,
               m.title as meeting_title
        FROM transcripts t
        JOIN meetings m ON m.id = t.meeting_id
        WHERE t.text IS NOT NULL AND LENGTH(t.text) > 0
        ORDER BY t.created_at DESC
        LIMIT 500
      `
        )
        .all() as Array<{
        id: string
        meeting_id: string
        text: string
        embedding: string | null
        start_time: number
        end_time: number
        meeting_title: string
      }>

      // Map to documents for embedding search
      const documents = rows.map(r => ({
        id: r.id,
        text: r.text,
        embedding: r.embedding ? JSON.parse(r.embedding) : undefined,
        metadata: {
          meetingId: r.meeting_id,
          meetingTitle: r.meeting_title,
          startTime: r.start_time,
          endTime: r.end_time,
        },
      }))

      const searchResults = await embeddingService.search(
        params.query,
        documents,
        params.limit || 10
      )

      // Transform into the format GlobalContextBar expects
      const results = searchResults.map(r => ({
        snippet: r.text.substring(0, 200),
        relevance: r.score,
        meeting: {
          id: r.metadata?.meetingId,
          title: r.metadata?.meetingTitle || 'Untitled Meeting',
        },
      }))

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
