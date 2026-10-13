import { ipcMain } from 'electron'
import { searchAll } from '../../database/search'
import { getLocalEmbeddingService } from '../../services/LocalEmbeddingService'
import { Logger } from '../../services/Logger'
import { getDatabase } from '../../database/connection'
import { TopK, cosineSimilarity, embeddingFromBlob } from '../../utils/vectorSearch'

const log = Logger.create('SearchHandlers')

/** Rows scored per step before yielding back to the event loop. */
const SCAN_PAGE_SIZE = 4000

/**
 * Semantic search over every transcript segment that has an embedding.
 *
 * This used to look at the newest 500 segments only — roughly the last hour or
 * two of meetings — so anything older could never be found. The scan reads the
 * stored vectors page by page (yielding between pages so the app stays
 * responsive) and keeps the best matches; text is loaded for those only.
 */
async function searchLocalTranscripts(
  query: string,
  limit: number,
  meetingId?: string
): Promise<
  Array<{
    snippet: string
    relevance: number
    source: 'local'
    startTime?: number
    meeting: { id: string; title: string }
  }>
> {
  const queryVector = Float32Array.from((await getLocalEmbeddingService().embed(query)).embedding)
  const db = getDatabase()

  const meetingFilter = meetingId ? 'AND t.meeting_id = ?' : ''
  const scan = db.prepare(
    `SELECT t.rowid AS rid, t.id, t.embedding_blob, t.embedding
     FROM transcripts t
     JOIN meetings m ON m.id = t.meeting_id
     WHERE t.rowid > ?
       AND (t.embedding_blob IS NOT NULL OR t.embedding IS NOT NULL)
       AND m.deleted_at IS NULL ${meetingFilter}
     ORDER BY t.rowid
     LIMIT ${SCAN_PAGE_SIZE}`
  )

  const best = new TopK<string>(limit)
  let afterRowid = 0
  for (;;) {
    const page = scan.all(...(meetingId ? [afterRowid, meetingId] : [afterRowid])) as Array<{
      rid: number
      id: string
      embedding_blob: Buffer | null
      embedding: string | null
    }>
    for (const row of page) {
      let vector: ArrayLike<number> | null = null
      if (row.embedding_blob) {
        vector = embeddingFromBlob(row.embedding_blob)
      } else if (row.embedding) {
        // Rows written before embeddings were stored as binary
        try {
          const parsed: unknown = JSON.parse(row.embedding)
          if (Array.isArray(parsed)) vector = parsed as number[]
        } catch {
          /* unreadable — skip */
        }
      }
      if (!vector || vector.length !== queryVector.length) continue
      best.offer(cosineSimilarity(queryVector, vector), row.id)
    }
    const last = page[page.length - 1]
    if (page.length < SCAN_PAGE_SIZE || !last) break
    afterRowid = last.rid
    await new Promise<void>(resolve => setImmediate(resolve))
  }

  // Segments saved while the search model was unavailable have no embedding
  // and cannot be found; fill them in for the next search.
  void backfillMissingEmbeddings()

  const hits = best.results()
  if (hits.length === 0) return []

  const details = db
    .prepare(
      `SELECT t.id, t.meeting_id, t.text, t.start_time, m.title AS meeting_title
       FROM transcripts t
       JOIN meetings m ON m.id = t.meeting_id
       WHERE t.id IN (${hits.map(() => '?').join(', ')})`
    )
    .all(...hits.map(hit => hit.item)) as Array<{
    id: string
    meeting_id: string
    text: string
    start_time: number
    meeting_title: string | null
  }>
  const byId = new Map(details.map(row => [row.id, row]))

  return hits.flatMap(hit => {
    const row = byId.get(hit.item)
    if (!row) return []
    return [
      {
        snippet: row.text.substring(0, 200),
        relevance: hit.score,
        source: 'local' as const,
        // Seconds from the start of the recording — lets the UI cite the real moment
        startTime: typeof row.start_time === 'number' ? row.start_time : undefined,
        meeting: { id: row.meeting_id, title: row.meeting_title || 'Untitled Meeting' },
      },
    ]
  })
}

let backfillRunning = false

/**
 * Compute embeddings for transcript segments that have none (newest first, a
 * bounded number per run). Stops at the first failure — that means the model
 * is not available, and retrying every row would only burn CPU.
 */
async function backfillMissingEmbeddings(maxRows = 200): Promise<void> {
  if (backfillRunning) return
  backfillRunning = true
  try {
    // Not while recording: transcription needs the CPU more than old segments do.
    const { getAudioPipelineService } = await import('../../services/AudioPipelineService')
    if (getAudioPipelineService().getStatus().isCapturing) return

    const db = getDatabase()
    const rows = db
      .prepare(
        `SELECT id, text FROM transcripts
         WHERE embedding_blob IS NULL AND embedding IS NULL AND LENGTH(text) > 0
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(maxRows) as Array<{ id: string; text: string }>
    if (rows.length === 0) return

    const store = db.prepare('UPDATE transcripts SET embedding_blob = ? WHERE id = ?')
    let stored = 0
    for (const row of rows) {
      const { embedding } = await getLocalEmbeddingService().embed(row.text)
      store.run(Buffer.from(new Float32Array(embedding).buffer), row.id)
      stored++
    }
    log.info(`Backfilled embeddings for ${stored} transcript segment(s)`)
  } catch (err) {
    log.debug('Embedding backfill stopped:', err)
  } finally {
    backfillRunning = false
  }
}

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
      // M-14 AUDIT: Cap limit to prevent large result set abuse
      const results = searchAll(params.query.substring(0, 500), {
        limit: Math.min(params.limit || 20, 100),
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
      // P2-3 FIX: Removed early gate here that returned blocked:true for free tier.
      // Free users still get local semantic search; only cloud search is tier-gated below.
      // Check cloud access for the cloud-search portion
      const { getCloudAccessManager } = await import('../../services/CloudAccessManager')
      const cam = getCloudAccessManager()
      const features = await cam.getFeatureAccess()

      // ── Local semantic search (every plan) ──
      const limit = Math.min(Math.max(1, Math.floor(Number(params.limit)) || 10), 50)
      let localResults: Array<{
        snippet: string
        relevance: number
        source: 'local'
        startTime?: number
        meeting: { id: string; title: string }
      }> = []
      try {
        localResults = await searchLocalTranscripts(params.query, limit, params.meetingId)
      } catch (localErr) {
        // The search model may not be downloaded yet — cloud results (if the
        // plan has them) are still worth returning.
        log.warn('Local semantic search unavailable:', localErr)
      }

      // ── Cloud search (Starter+ semantic, Pro+ hybrid) ──
      let cloudResults: Array<{
        snippet: string
        relevance: number
        source: 'local' | 'cloud-semantic' | 'cloud-hybrid' | 'cloud-fuzzy'
        startTime?: number
        meeting: { id: string; title: string }
      }> = []
      try {
        const { getBackend } = await import('../../services/backend/BackendSingleton')
        const backend = getBackend()
        const health = await backend.healthCheck()

        if (health.status === 'healthy') {
          const namespace = params.namespace || 'meetings'

          // Helper to map a cloud search hit to the result format
          // (previously this 15-line block was copy-pasted 3× for hybrid/semantic/fuzzy)
          const mapCloudHit = (
            hit: {
              memory?: { id?: string; content?: string; metadata?: Record<string, unknown> }
              similarity?: number | string
            },
            source: 'cloud-hybrid' | 'cloud-semantic' | 'cloud-fuzzy',
            defaultRelevance: number
          ) => {
            const isEncrypted = hit.memory?.metadata?.encrypted === true
            const snippet = isEncrypted
              ? String(
                  hit.memory?.metadata?.meeting_title ||
                    hit.memory?.metadata?.meetingTitle ||
                    'Cloud result'
                )
              : (hit.memory?.content || '').substring(0, 200)
            return {
              snippet,
              relevance: Number(hit.similarity) || defaultRelevance,
              source,
              _piyApiMemoryId: hit.memory?.id || '',
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
            }
          }

          if (features.hybridSearch) {
            // Pro+: Hybrid search (semantic + keyword) — best quality
            const cloudHits = await backend.hybridSearch(params.query, namespace, limit)
            cloudResults = cloudHits.map(hit => mapCloudHit(hit, 'cloud-hybrid', 0.5))
          } else if (features.semanticSearch) {
            // Starter: Semantic search only
            const cloudHits = await backend.semanticSearch(params.query, namespace, limit)
            cloudResults = cloudHits.map(hit => mapCloudHit(hit, 'cloud-semantic', 0.5))
          } else {
            // Free tier: Fuzzy search (typo-tolerant, no plan requirement)
            const cloudHits = await backend.fuzzySearch(params.query, namespace, limit)
            cloudResults = cloudHits.map(hit => mapCloudHit(hit, 'cloud-fuzzy', 0.4))
          }

          // No feedback is sent from here. Every hit used to be reported to
          // PiyAPI as "used in a response" the moment it was listed, whether
          // or not anyone opened it — which teaches the ranking that whatever
          // it returned was right. Feedback belongs where a result is acted
          // on (piyapi:feedback); each hit carries its memory id for that.
        }
      } catch (cloudErr) {
        // Cloud search failure is non-fatal — fall back to local results only
        log.warn('Cloud search failed, using local results only:', cloudErr)
      }

      // I9 fix: Dedup by meetingId+snippet instead of just meetingId
      // to preserve multiple relevant snippets from the same meeting
      const seenKeys = new Set(
        localResults.map(r => `${r.meeting.id}:${r.snippet?.slice(0, 80) ?? ''}`)
      )
      const mergedResults = [
        ...localResults,
        ...cloudResults.filter(
          r => !seenKeys.has(`${r.meeting.id}:${r.snippet?.slice(0, 80) ?? ''}`)
        ),
      ]
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, limit)

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
