import { ipcMain } from 'electron'
import { searchAll } from '../../database/search'
import { getLocalEmbeddingService } from '../../services/LocalEmbeddingService'
import { Logger } from '../../services/Logger'

const log = Logger.create('SearchHandlers')

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
  // Starter+: Cloud semantic search via PiyAPI
  // Pro+: Cloud hybrid search (semantic + keyword) via PiyAPI
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

      // ── Local semantic search (always runs for Starter+) ──
      const embeddingService = getLocalEmbeddingService()

      // Load transcripts with pre-computed embeddings from DB
      const { getDatabase } = await import('../../database/connection')
      const db = getDatabase()
      const rows = db
        .prepare(
          `
        SELECT t.id, t.meeting_id, t.text, t.embedding_blob, t.embedding, t.start_time, t.end_time,
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
        embedding_blob: Buffer | null
        embedding: string | null
        start_time: number
        end_time: number
        meeting_title: string
      }>

      // Map to documents for embedding search
      // Prefer BLOB (migration v3) → fallback to TEXT (legacy)
      const documents = rows.map(r => {
        let parsedEmbedding: number[] | undefined
        if (r.embedding_blob) {
          // BLOB: raw Float32Array binary
          parsedEmbedding = Array.from(
            new Float32Array(
              r.embedding_blob.buffer,
              r.embedding_blob.byteOffset,
              r.embedding_blob.byteLength / 4
            )
          )
        } else if (r.embedding) {
          // Legacy TEXT: JSON-stringified array
          try {
            parsedEmbedding = JSON.parse(r.embedding)
          } catch {
            /* skip */
          }
        }
        return {
          id: r.id,
          text: r.text,
          embedding: parsedEmbedding,
          metadata: {
            meetingId: r.meeting_id,
            meetingTitle: r.meeting_title,
            startTime: r.start_time,
            endTime: r.end_time,
          },
        }
      })

      const searchResults = await embeddingService.search(
        params.query,
        documents,
        params.limit || 10
      )

      // Transform into the format GlobalContextBar expects
      const localResults = searchResults.map(r => ({
        snippet: r.text.substring(0, 200),
        relevance: r.score,
        source: 'local' as const,
        meeting: {
          id: r.metadata?.meetingId,
          title: r.metadata?.meetingTitle || 'Untitled Meeting',
        },
      }))

      // ── Cloud search (Starter+ semantic, Pro+ hybrid) ──
      let cloudResults: Array<{
        snippet: string
        relevance: number
        source: 'local' | 'cloud-semantic' | 'cloud-hybrid'
        meeting: { id: string; title: string }
      }> = []
      try {
        const { getBackend } = await import('../handlers/graph.handlers')
        const backend = getBackend()
        const isHealthy = await backend.healthCheck()

        if (isHealthy) {
          const namespace = params.namespace || 'meetings'
          const limit = params.limit || 10

          if (features.hybridSearch) {
            // Pro+: Hybrid search (semantic + keyword) — best quality
            const cloudHits = await backend.hybridSearch(params.query, namespace, limit)
            cloudResults = cloudHits.map(hit => ({
              snippet: (hit.memory?.content || '').substring(0, 200),
              relevance: hit.similarity ?? 0.5,
              source: 'cloud-hybrid' as const,
              meeting: {
                id: String(
                  hit.memory?.metadata?.meeting_id || hit.memory?.metadata?.meetingId || ''
                ),
                title: String(
                  hit.memory?.metadata?.meeting_title ||
                    hit.memory?.metadata?.meetingTitle ||
                    'Cloud Result'
                ),
              },
            }))
          } else if (features.semanticSearch) {
            // Starter: Semantic search only
            const cloudHits = await backend.semanticSearch(params.query, namespace, limit)
            cloudResults = cloudHits.map(hit => ({
              snippet: (hit.memory?.content || '').substring(0, 200),
              relevance: hit.similarity ?? 0.5,
              source: 'cloud-semantic' as const,
              meeting: {
                id: String(
                  hit.memory?.metadata?.meeting_id || hit.memory?.metadata?.meetingId || ''
                ),
                title: String(
                  hit.memory?.metadata?.meeting_title ||
                    hit.memory?.metadata?.meetingTitle ||
                    'Cloud Result'
                ),
              },
            }))
          }
        }
      } catch (cloudErr) {
        // Cloud search failure is non-fatal — fall back to local results only
        log.warn('Cloud search failed, using local results only:', cloudErr)
      }

      // Merge and deduplicate (local results preferred, cloud results supplement)
      const seenMeetingIds = new Set(localResults.map(r => r.meeting.id))
      const mergedResults = [
        ...localResults,
        ...cloudResults.filter(r => !seenMeetingIds.has(r.meeting.id)),
      ]
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, params.limit || 10)

      return { success: true, data: { results: mergedResults, query: params.query } }
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
