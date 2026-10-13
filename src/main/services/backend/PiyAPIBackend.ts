/**
 * PiyAPI Backend Implementation
 *
 * Official PiyAPI cloud backend implementation.
 * Base URL: https://api.piyapi.cloud/api/v1
 *
 * The contract this file is written against is PiyAPI's own source (route
 * mounting in src/loaders/routes.ts, request schemas in src/validation). The
 * spec published at /docs/openapi.json covers only part of it — /kg, /feedback,
 * /search/fuzzy, /memories/batch and /partner are missing — and names some
 * fields differently, so it is not a substitute.
 */

import {
  IBackendProvider,
  AuthTokens,
  Memory,
  SearchResult,
  AskResponse,
  GraphData,
  HealthStatus,
} from './IBackendProvider'
import { KeyStorageService, KeyType } from '../KeyStorageService'
import { config } from '../../config/environment'
import { EncryptionService } from '../EncryptionService'
import { isCloudEnrichmentAllowed } from '../privacySettings'
import { Logger } from '../Logger'

const log = Logger.create('PiyAPIBackend')

/** An API failure that keeps the HTTP status, so callers can tell a rate limit from a bad request. */
export interface BackendHttpError extends Error {
  status: number
}

/**
 * Build the error for a non-2xx response. Direct PiyAPI replies carry
 * `{ message }`; the Edge Function proxy replies with `{ error }`.
 */
function httpError(
  response: Response,
  body: { message?: unknown; error?: unknown } | null | undefined,
  fallback: string
): BackendHttpError {
  const detail =
    (typeof body?.message === 'string' && body.message) ||
    (typeof body?.error === 'string' && body.error) ||
    fallback
  const err = new Error(detail) as BackendHttpError
  err.status = response.status
  return err
}

/**
 * Turn PiyAPI's batch-create reply into one entry per submitted memory, in
 * the order they were sent. An entry without an `id` was not stored.
 *
 * The reply is `{ successful: Memory[], failed: [{ index, error }], summary }`,
 * and newer servers add `results: [{ index, success, id }]`. It was read as
 * `data.memories || data.results || data`, which yielded the reply object
 * itself; every caller then found no id at any index, so SyncManager counted
 * each create as unconfirmed and uploaded all of them again on every pass.
 */
export function alignBatchCreateResult(submitted: Memory[], reply: unknown): Memory[] {
  if (Array.isArray(reply)) return reply as Memory[]
  const data = (reply ?? {}) as Record<string, unknown>
  if (Array.isArray(data.memories)) return data.memories as Memory[]

  const outcomes = Array.isArray(data.results)
    ? (data.results as Array<{ index?: unknown; success?: unknown; id?: unknown }>)
    : null
  if (outcomes && outcomes.every(o => o && typeof o.index === 'number')) {
    const ids = new Map<number, string>()
    for (const o of outcomes) {
      if (o.success === true && typeof o.id === 'string' && o.id) ids.set(o.index as number, o.id)
    }
    return submitted.map((memory, i) => ({ ...memory, id: ids.get(i) }))
  }

  // Older servers: `successful` holds the stored memories in submission order
  // with the failed ones left out, and `failed` names the positions left out.
  const successful = Array.isArray(data.successful) ? (data.successful as Memory[]) : []
  const failedAt = new Set(
    (Array.isArray(data.failed) ? (data.failed as Array<{ index?: unknown }>) : [])
      .map(f => f?.index)
      .filter((index): index is number => typeof index === 'number')
  )
  let next = 0
  return submitted.map((memory, i) => {
    if (failedAt.has(i)) return { ...memory, id: undefined }
    const stored = successful[next++]
    return stored?.id ? { ...memory, ...stored } : { ...memory, id: undefined }
  })
}

/**
 * Internal DB fields returned by PiyAPI that should NOT be forwarded.
 * These leak implementation details (tsvector, embedding status, etc.).
 */
const INTERNAL_FIELDS = new Set([
  'tsvector_content',
  'embedding_status',
  'requeue_count',
  'data_region',
  'embedding_model',
  'embedding_dimensions',
  'processing_pipeline',
  'raw_embedding',
  'embedding_blob',
  'internal_score',
  'partition_key',
])

/** Local tables SyncManager uploads, each to the namespace `meetings.<table>`. */
const SYNCED_TABLES = [
  'meetings',
  'transcripts',
  'notes',
  'entities',
  'audio_highlights',
  'action_items',
  'sentiment_scores',
  'calendar_events',
  'webhooks',
] as const

/**
 * PiyAPI Backend Class
 */
export class PiyAPIBackend implements IBackendProvider {
  private baseUrl: string
  private accessToken: string | null = null
  private userId: string | null = null
  private proxyMode: boolean = false
  /** Longest text treated as a search question rather than a prompt carrying content. */
  private static readonly MAX_RETRIEVAL_QUERY_CHARS = 400
  // E-HC: Cache health check results for 30 seconds to avoid redundant HTTP calls.
  // graph/search/intelligence handlers call healthCheck() before every API request.
  private _healthCache: HealthStatus | null = null
  private _healthCacheExpiry: number = 0
  private readonly HEALTH_CACHE_TTL = 30_000 // 30 seconds
  /** Namespace and token budget of each context session created here (see retrieveContext). */
  private contextSessions = new Map<string, { namespace: string; tokenBudget: number }>()
  private static readonly MAX_CONTEXT_SESSIONS = 200

  constructor(baseUrl: string = config.BLUEARKIVE_FUNCTIONS_URL || config.BLUEARKIVE_API_URL) {
    // Edge Functions proxy: requests go to /piyapi-proxy/memories etc.
    // Direct PiyAPI: requests go to /api/v1/memories etc.
    if (baseUrl && (baseUrl.includes('supabase') || baseUrl.includes('functions'))) {
      this.baseUrl = baseUrl.endsWith('/piyapi-proxy') ? baseUrl : `${baseUrl}/piyapi-proxy`
      this.proxyMode = true
    } else {
      const url = baseUrl || config.BLUEARKIVE_API_URL
      this.baseUrl = url.endsWith('/api/v1') ? url : `${url}/api/v1`
    }
  }

  // ════════════════════════════════════════════════════════════════
  //  C-4 AUDIT: Timeout-guarded fetch for all API calls
  //  Prevents indefinite hangs during network partitions.
  //  healthCheck already uses its own 5s AbortController.
  // ════════════════════════════════════════════════════════════════
  private async fetchWithTimeout(
    url: string,
    init: RequestInit = {},
    timeoutMs: number = 15_000
  ): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await fetch(url, { ...init, signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * Check if backend is using Edge Function proxy mode
   */
  public isProxyMode(): boolean {
    return this.proxyMode
  }

  /**
   * Get backend name
   */
  public getName(): string {
    return 'Sovereign Cloud'
  }

  /**
   * Get backend base URL
   */
  public getBaseUrl(): string {
    return this.baseUrl
  }

  /**
   * Login with email and password
   * NOTE: In proxy mode, auth is handled by AuthService (Supabase).
   * This method is only used in direct PiyAPI mode.
   */
  public async login(email: string, password: string): Promise<AuthTokens> {
    if (this.proxyMode) {
      throw new Error(
        'Login is handled by AuthService in proxy mode. Use AuthService.login() instead.'
      )
    }

    const response = await this.fetchWithTimeout(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Login failed' }))
      throw httpError(response, error, 'Login failed')
    }

    const data = await response.json()
    const tokens: AuthTokens = {
      accessToken: data.access_token || data.accessToken,
      refreshToken: data.refresh_token || data.refreshToken,
      expiresIn: data.expires_in || data.expiresIn || 900,
      userId: data.user_id || data.userId,
      planTier: data.plan_tier || data.planTier || 'free',
    }

    this.accessToken = tokens.accessToken
    this.userId = tokens.userId || email

    await KeyStorageService.storeAccessToken(this.userId, tokens.accessToken)
    await KeyStorageService.storeRefreshToken(this.userId, tokens.refreshToken)
    if (tokens.planTier) {
      await KeyStorageService.storePlanTier(this.userId, tokens.planTier)
    }

    return tokens
  }

  /**
   * Refresh access token
   * NOTE: In proxy mode, refresh is handled by AuthService (Supabase).
   */
  public async refreshToken(refreshToken: string): Promise<AuthTokens> {
    if (this.proxyMode) {
      throw new Error('Token refresh is handled by AuthService in proxy mode.')
    }

    const response = await this.fetchWithTimeout(`${this.baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Token refresh failed' }))
      throw httpError(response, error, 'Token refresh failed')
    }

    const data = await response.json()
    const tokens: AuthTokens = {
      accessToken: data.access_token || data.accessToken,
      refreshToken: data.refresh_token || data.refreshToken,
      expiresIn: data.expires_in || data.expiresIn || 900,
      userId: data.user_id || data.userId,
      planTier: data.plan_tier || data.planTier,
    }

    this.accessToken = tokens.accessToken
    if (this.userId) {
      await KeyStorageService.storeAccessToken(this.userId, tokens.accessToken)
      await KeyStorageService.storeRefreshToken(this.userId, tokens.refreshToken)
    }

    return tokens
  }

  /**
   * Logout and invalidate tokens
   * In proxy mode: only clears local state (Supabase signOut handled by AuthService)
   */
  public async logout(): Promise<void> {
    if (!this.accessToken) {
      return
    }

    // Only call PiyAPI logout in direct mode
    if (!this.proxyMode) {
      try {
        await this.fetchWithTimeout(`${this.baseUrl}/auth/logout`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
        })
      } catch (error) {
        void error
      }
    }

    // Clear local tokens
    if (this.userId) {
      await KeyStorageService.deleteKey(KeyType.ACCESS_TOKEN, this.userId)
      await KeyStorageService.deleteKey(KeyType.REFRESH_TOKEN, this.userId)
    }

    this.accessToken = null
    this.userId = null
    // P5: Invalidate health cache on logout to prevent stale cross-session results
    this._healthCache = null
    this._healthCacheExpiry = 0
  }

  /**
   * Create a new memory
   */
  public async createMemory(memory: Memory): Promise<Memory> {
    await this.ensureAuthenticated()

    const response = await this.fetchWithTimeout(`${this.baseUrl}/memories`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(memory),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to create memory' }))
      throw httpError(response, error, 'Failed to create memory')
    }

    const data = await response.json()
    return data.memory || data
  }

  /**
   * E2: Batch create up to 100 memories in a single API call.
   * Falls back to individual creates if batch endpoint is unavailable.
   */
  public async batchCreateMemories(memories: Memory[]): Promise<Memory[]> {
    await this.ensureAuthenticated()

    // Try batch endpoint first
    const response = await this.fetchWithTimeout(`${this.baseUrl}/memories/batch`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ memories }),
    })

    if (response.status === 404) {
      // Batch endpoint not available — fall back to individual creates
      const results: Memory[] = []
      for (const mem of memories) {
        results.push(await this.createMemory(mem))
      }
      return results
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Batch create failed' }))
      throw httpError(response, error, 'Batch create failed')
    }

    return alignBatchCreateResult(memories, await response.json())
  }

  /**
   * Update an existing memory
   */
  public async updateMemory(id: string, updates: Partial<Memory>): Promise<Memory> {
    await this.ensureAuthenticated()

    const response = await this.fetchWithTimeout(`${this.baseUrl}/memories/${id}`, {
      method: 'PATCH',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(updates),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to update memory' }))
      throw httpError(response, error, 'Failed to update memory')
    }

    const data = await response.json()
    return data.memory || data
  }

  /**
   * Delete a memory
   */
  public async deleteMemory(id: string): Promise<void> {
    await this.ensureAuthenticated()

    const response = await this.fetchWithTimeout(`${this.baseUrl}/memories/${id}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to delete memory' }))
      throw httpError(response, error, 'Failed to delete memory')
    }
  }

  /**
   * Get memories by namespace
   */
  public async getMemories(
    namespace: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<Memory[]> {
    await this.ensureAuthenticated()

    const params = new URLSearchParams({
      namespace,
      limit: limit.toString(),
      offset: offset.toString(),
    })

    const response = await this.fetchWithTimeout(`${this.baseUrl}/memories?${params}`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to get memories' }))
      throw httpError(response, error, 'Failed to get memories')
    }

    const data = await response.json()
    return data.memories || data
  }

  /**
   * Semantic search across memories via Zero-LLM endpoint on PiyAPI
   * Uses pgvector cosine similarity with semantic and recency weighting ($0.00 cloud LLM spend).
   */
  public async semanticSearch(
    query: string,
    namespace?: string,
    limit: number = 10
  ): Promise<SearchResult[]> {
    await this.ensureAuthenticated()

    const body: Record<string, unknown> = {
      query,
      limit,
      relevanceSemanticWeight: 0.7,
      relevanceRecencyWeight: 0.3,
      includeAttributions: true,
    }
    if (namespace) {
      body.namespace = namespace
    }

    const response = await this.fetchWithTimeout(`${this.baseUrl}/search/semantic`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Semantic search failed' }))
      throw httpError(response, error, 'Semantic search failed')
    }

    const data = await response.json()
    return this.normalizeSearchResults(data.results || data)
  }

  /**
   * Hybrid search (semantic + keyword)
   */
  private getAuthHeaders(additional: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...additional,
    }
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`
    }
    // No partner key here: PiyAPI's partner key can create and delete users,
    // and anything in this app can be read out of the installed bundle. The
    // Edge Function proxy holds it and provisions the managed account.
    return headers
  }

  /**
   * Hybrid search (semantic + keyword) via Zero-LLM endpoint on PiyAPI
   * Zero cloud LLM spend ($0.00). Uses pgvector HNSW + BM25 + cognitive interceptors.
   * Matches PiyAPI's hybridSearchSchema (semanticWeight + keywordWeight = 1.0).
   */
  public async hybridSearch(
    query: string,
    namespace?: string,
    limit: number = 10
  ): Promise<SearchResult[]> {
    await this.ensureAuthenticated()

    const body: Record<string, unknown> = {
      query,
      semanticWeight: 0.7,
      keywordWeight: 0.3,
      limit,
      relevanceRecencyWeight: 0.3,
      includeAttributions: true,
    }
    if (namespace) {
      body.namespace = namespace
    }

    const response = await this.fetchWithTimeout(`${this.baseUrl}/search/hybrid`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Hybrid search failed' }))
      throw httpError(response, error, 'Hybrid search failed')
    }

    const data = await response.json()
    return this.normalizeSearchResults(data.results || data)
  }

  /**
   * Get token-budgeted context for local LLM generation (Zero-LLM endpoint)
   * Fetches relevant memories & graph context from PiyAPI at $0.00 cloud LLM spend.
   */
  public async getContext(
    query: string,
    namespace?: string,
    maxTokens: number = 2000
  ): Promise<{ context: string; results: SearchResult[] }> {
    await this.ensureAuthenticated()

    const body: Record<string, unknown> = { query, max_tokens: maxTokens, format: 'json' }
    if (namespace) {
      body.namespace = namespace
    }

    try {
      // POST /context/retrieve. (This used to call POST /context, a route that
      // does not exist, so every call fell through to the hybrid search below.)
      const response = await this.fetchWithTimeout(`${this.baseUrl}/context/retrieve`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(body),
      })

      if (response.ok) {
        const results = this.contextMemoriesToResults(await response.json())
        // Built from the results after decryption, never from text the
        // server assembled: for an encrypted memory that would be ciphertext.
        const context = results
          .map(r => r.memory?.content || '')
          .filter(Boolean)
          .join('\n\n')
        if (context) return { context, results }
      }
    } catch (err) {
      log.debug('PiyAPI /context/retrieve failed, falling back to hybridSearch:', err)
    }

    // Zero-LLM fallback: Hybrid Search (/search/hybrid)
    const results = await this.hybridSearch(query, namespace, 10)
    const context = results
      .map(r => r.memory?.content || '')
      .filter(Boolean)
      .join('\n\n')
    return { context, results }
  }

  /**
   * Ask AI a question — Zero-LLM Retrieval on PiyAPI + Local LLM Synthesis in BlueArkive
   * Completely bypasses PiyAPI cloud LLM generation costs ($0.00 cloud spend).
   */
  public async ask(query: string, namespace?: string): Promise<AskResponse> {
    // Step 1: Zero-LLM Retrieval via PiyAPI (Hybrid Search / Context Endpoint)
    //
    // The retrieval query is sent upstream as plain text. A short question is
    // what search needs; but several callers pass a whole prompt with the
    // transcript embedded in it, which uploaded that transcript unencrypted.
    // Unless the user has allowed cloud analysis of meeting text, a long
    // prompt skips retrieval and goes straight to the local model — it
    // already carries its own context.
    const isQuestion = query.length <= PiyAPIBackend.MAX_RETRIEVAL_QUERY_CHARS
    const retrieve = isQuestion || isCloudEnrichmentAllowed()
    const { context, results } = retrieve
      ? await this.getContext(query, namespace, 2000)
      : { context: '', results: [] as SearchResult[] }

    // Step 2: Local LLM Synthesis inside BlueArkive
    try {
      const { getModelManager } = await import('../ModelManager')
      const mm = getModelManager()

      const prompt = !retrieve
        ? query
        : context.trim()
          ? `Answer the question concisely based ONLY on the provided meeting context.\n\nCONTEXT:\n${context.substring(0, 6000)}\n\nQUESTION: ${query}\n\nANSWER:`
          : `Answer the following question concisely:\n\nQUESTION: ${query}\n\nANSWER:`

      const localAnswer = await mm.generate({ prompt, temperature: 0.3, maxTokens: 400 }, 'ask')

      if (localAnswer && !localAnswer.startsWith('⚠️')) {
        return {
          answer: localAnswer,
          confidence: results[0]?.similarity ? Number(results[0].similarity) : 0.9,
          sources: results.map(r => ({
            memoryId: r.memory?.id || '',
            content: r.memory?.content || '',
            similarity: Number(r.similarity) || 0,
          })),
          model: 'BlueArkive-Local-LLM (Zero-PiyAPI-Cost)',
          tokensUsed: 0,
        }
      }
    } catch (err) {
      log.debug('Local LLM generation unavailable during ask(), falling back to context:', err)
    }

    // The local model produced nothing (still loading, not downloaded, out of
    // memory). For a short question the retrieved excerpts are still a useful
    // reply. For a long prompt they are not an answer to it, and neither is a
    // canned sentence — callers showed "No relevant context found…" as if it
    // were the generated summary or suggestion. Return no answer instead.
    return {
      answer: isQuestion ? context : '',
      confidence: 0.8,
      sources: results.map(r => ({
        memoryId: r.memory?.id || '',
        content: r.memory?.content || '',
        similarity: Number(r.similarity) || 0,
      })),
      model: 'PiyAPI-Zero-LLM-Context',
      tokensUsed: 0,
    }
  }

  /**
   * Get knowledge graph
   */
  public async getGraph(namespace: string, maxHops: number = 2): Promise<GraphData> {
    await this.ensureAuthenticated()

    // The server reads `maxHops` (1–3). It was sent as `max_hops`, which the
    // server ignores, so every graph came back one hop deep.
    const params = new URLSearchParams({
      namespace,
      maxHops: Math.min(Math.max(maxHops, 1), 3).toString(),
    })

    const response = await this.fetchWithTimeout(`${this.baseUrl}/graph?${params}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to get graph' }))
      throw httpError(response, error, 'Failed to get graph')
    }

    const data = await response.json()
    return data
  }

  /**
   * Traverse knowledge graph from a memory
   */
  public async traverseGraph(memoryId: string, maxHops: number = 2): Promise<GraphData> {
    await this.ensureAuthenticated()

    // `memoryId` and `maxHops` are the names the server reads. With
    // `memory_id` / `max_hops` the filter was ignored and the reply was the
    // whole graph rather than the neighbourhood of this memory.
    const params = new URLSearchParams({
      memoryId,
      maxHops: Math.min(Math.max(maxHops, 1), 3).toString(),
    })

    const response = await this.fetchWithTimeout(`${this.baseUrl}/graph?${params}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to traverse graph' }))
      throw httpError(response, error, 'Failed to traverse graph')
    }

    const data = await response.json()
    return data
  }

  /**
   * Check backend health
   * In proxy mode: pings the Edge Function URL to verify connectivity
   */
  public async healthCheck(): Promise<HealthStatus> {
    // E-HC: Return cached result if within TTL (avoids ~16 redundant HTTP calls per session)
    const now = Date.now()
    if (this._healthCache && now < this._healthCacheExpiry) {
      return this._healthCache
    }

    const start = now

    try {
      // P1-1 FIX: /health is confirmed working at api.piyapi.cloud/health → {"status":"ok"}
      // In proxy mode: hit the Edge Function base to verify connectivity
      // In direct mode: hit /health which returns {"status":"ok"}
      const healthUrl = this.proxyMode
        ? this.baseUrl.replace(/\/piyapi-proxy$/, '')
        : this.baseUrl.replace(/\/api\/v1$/, '/health')

      // 5s: a health probe that takes longer is itself the answer. (A separate
      // AbortController used to be passed here, but fetchWithTimeout replaces
      // the signal with its own, so the probe really waited the default 15s.)
      const response = await this.fetchWithTimeout(
        healthUrl,
        {
          method: 'GET',
          headers: this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {},
        },
        5_000
      )

      const latency = Date.now() - start
      let result: HealthStatus

      if (response.ok) {
        const data = await response.json().catch(() => ({}))
        result = { status: 'healthy', latency, version: data.version }
      } else if (this.proxyMode && response.status < 500) {
        // The probe hits the Edge Functions base URL, which has no handler of
        // its own: any answer below 500 (401/403/404) proves the gateway is
        // reachable. Treating 404 as "degraded" switched every cloud feature
        // off for accounts whose gateway answers the bare URL that way.
        result = { status: 'healthy', latency, message: 'Proxy reachable' }
      } else if (response.status === 401 || response.status === 403) {
        result = { status: 'degraded', latency, message: `Backend returned ${response.status}` }
      } else {
        result = { status: 'degraded', latency, message: `Backend returned ${response.status}` }
      }

      this._healthCache = result
      // P4-3 FIX: Asymmetric cache TTL — short for failures, long for success.
      // When backend goes down, 5s TTL allows fast recovery detection.
      const ttl = result.status === 'healthy' ? this.HEALTH_CACHE_TTL : 5_000
      this._healthCacheExpiry = Date.now() + ttl
      return result
    } catch (error: unknown) {
      const latency = Date.now() - start
      const result: HealthStatus = {
        status: 'down',
        latency,
        message: error instanceof Error ? error.message : 'Backend unreachable',
      }
      this._healthCache = result
      // P4-3 FIX: 5s cache for down state — allow rapid retry
      this._healthCacheExpiry = Date.now() + 5_000
      return result
    }
  }

  // ════════════════════════════════════════════════════════════════
  //  F1-F6: Additional PiyAPI capabilities (non-critical, graceful)
  // ════════════════════════════════════════════════════════════════

  /**
   * F2: Fuzzy search (typo-tolerant) across memories.
   * Falls back gracefully if endpoint unavailable.
   */
  public async fuzzySearch(
    query: string,
    namespace?: string,
    limit: number = 10
  ): Promise<SearchResult[]> {
    try {
      await this.ensureAuthenticated()
      const body: Record<string, unknown> = { query, limit, threshold: 0.3 }
      if (namespace) body.namespace = namespace

      const response = await this.fetchWithTimeout(`${this.baseUrl}/search/fuzzy`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) return [] // Graceful fallback
      const data = await response.json()
      return this.normalizeSearchResults(data.results || data)
    } catch (err) {
      log.debug('fuzzySearch failed (non-critical):', err)
      return []
    }
  }

  /**
   * F1: Record positive/negative feedback for memories.
   * Teaches PiyAPI's adaptive system to prioritize helpful results.
   */
  public async feedbackPositive(memoryIds: string[]): Promise<boolean> {
    try {
      await this.ensureAuthenticated()
      const response = await this.fetchWithTimeout(`${this.baseUrl}/feedback/positive`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          memory_ids: memoryIds,
          signal_type: 'used_in_response',
        }),
      })
      return response.ok
    } catch (err) {
      log.debug('feedbackPositive failed:', err)
      return false
    }
  }

  public async feedbackNegative(memoryIds: string[]): Promise<boolean> {
    try {
      await this.ensureAuthenticated()
      const response = await this.fetchWithTimeout(`${this.baseUrl}/feedback/negative`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          memory_ids: memoryIds,
          signal_type: 'immediate_requery',
        }),
      })
      return response.ok
    } catch (err) {
      log.debug('feedbackNegative failed:', err)
      return false
    }
  }

  /**
   * Pin a memory so PiyAPI always includes it when it assembles context, or
   * unpin it (POST / DELETE /memories/:id/pin).
   */
  public async pinMemory(memoryId: string, unpin: boolean = false): Promise<boolean> {
    try {
      await this.ensureAuthenticated()
      const response = await this.fetchWithTimeout(
        `${this.baseUrl}/memories/${encodeURIComponent(memoryId)}/pin`,
        {
          method: unpin ? 'DELETE' : 'POST',
          headers: this.getAuthHeaders(),
        }
      )
      return response.ok
    } catch (err) {
      log.debug('pinMemory failed:', err)
      return false
    }
  }

  /**
   * F3: Ingest content into PiyAPI knowledge graph.
   * Extracts entities and facts from transcript text.
   */
  public async kgIngest(
    content: string,
    memoryId?: string
  ): Promise<{ entities: number; facts: number } | null> {
    // Sends the text itself. Off unless the user opted in (Settings › Privacy).
    if (!isCloudEnrichmentAllowed()) return null
    try {
      await this.ensureAuthenticated()
      const body: Record<string, unknown> = { content }
      if (memoryId) body.memory_id = memoryId

      const response = await this.fetchWithTimeout(`${this.baseUrl}/kg/ingest`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) return null
      return await response.json()
    } catch (err) {
      log.debug('kgIngest failed:', err)
      return null
    }
  }

  /**
   * F4: Deduplicate near-similar memories.
   * Dry-run by default for safety.
   */
  public async deduplicate(
    namespace?: string,
    dryRun: boolean = true
  ): Promise<{ duplicates: number; merged: number } | null> {
    try {
      await this.ensureAuthenticated()
      const body: Record<string, unknown> = {
        similarity_threshold: 0.85,
        dry_run: dryRun,
      }
      if (namespace) body.namespace = namespace

      const response = await this.fetchWithTimeout(`${this.baseUrl}/memories/deduplicate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) return null
      return await response.json()
    } catch (err) {
      log.debug('deduplicate failed:', err)
      return null
    }
  }

  /**
   * F5: Check text for Protected Health Information (PHI/PII) with
   * POST /compliance/phi-check.
   */
  public async checkPhi(text: string): Promise<{ risk_level: string; entities: unknown[] } | null> {
    // Sends the text itself. Off unless the user opted in (Settings › Privacy).
    if (!isCloudEnrichmentAllowed()) return null
    try {
      await this.ensureAuthenticated()
      const response = await this.fetchWithTimeout(`${this.baseUrl}/compliance/phi-check`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: text }),
      })

      if (!response.ok) return null
      const data = (await response.json()) as {
        riskLevel?: string
        risk_level?: string
        detectedTypes?: unknown[]
        entities?: unknown[]
      }
      return {
        risk_level: data.riskLevel ?? data.risk_level ?? 'none',
        entities: data.detectedTypes ?? data.entities ?? [],
      }
    } catch (err) {
      log.debug('checkPhi failed:', err)
      return null
    }
  }

  /**
   * F6: Export all user data (GDPR compliance).
   * Returns a download URL for the exported data.
   */
  public async exportAll(
    type: 'memories' | 'usage' | 'all' = 'all'
  ): Promise<{ download_url: string } | null> {
    try {
      await this.ensureAuthenticated()
      // GET /export only lists the export endpoints; the export itself is
      // /export/all, /export/memories or /export/usage, and its reply names
      // the link `downloadUrl`.
      const response = await this.fetchWithTimeout(`${this.baseUrl}/export/${type}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      })

      if (!response.ok) return null
      const data = (await response.json()) as { downloadUrl?: string; download_url?: string }
      const downloadUrl = data.downloadUrl ?? data.download_url
      return downloadUrl ? { download_url: downloadUrl } : null
    } catch (err) {
      log.debug('exportAll failed:', err)
      return null
    }
  }

  /**
   * Extract entities from text using PiyAPI's NLP pipeline.
   * P1-2 FIX: /kg/ingest returns {entitiesExtracted: N, factsExtracted: N}
   * NOT an entity array. We now use the KG entities endpoint to list
   * recently extracted entities after ingestion.
   */
  public async extractEntities(
    text: string,
    namespace: string = 'meetings'
  ): Promise<
    Array<{
      type: string
      text: string
      confidence: number
      start_offset?: number
      end_offset?: number
    }>
  > {
    // Sends the text itself. Off unless the user opted in (Settings › Privacy).
    if (!isCloudEnrichmentAllowed()) return []
    try {
      await this.ensureAuthenticated()

      // Step 1: Ingest content into KG (triggers server-side entity extraction)
      const ingestResponse = await this.fetchWithTimeout(`${this.baseUrl}/kg/ingest`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: text, namespace }),
      })

      if (!ingestResponse.ok) return []
      const ingestData = await ingestResponse.json()
      const extractedCount = ingestData.entitiesExtracted || ingestData.entities_extracted || 0

      // If no entities were extracted, return early
      if (extractedCount === 0) return []

      // Step 2: Fetch the recently extracted entities from KG
      try {
        const entitiesResponse = await this.fetchWithTimeout(
          `${this.baseUrl}/kg/entities?limit=${Math.min(extractedCount + 5, 50)}`,
          {
            headers: {
              Authorization: `Bearer ${this.accessToken}`,
            },
          }
        )

        if (!entitiesResponse.ok) return []
        const entitiesData = await entitiesResponse.json()
        const entities = entitiesData.entities || entitiesData.results || entitiesData

        if (!Array.isArray(entities)) return []

        // Map KG entities to the expected shape
        return entities
          .filter((e: Record<string, unknown>) => {
            // Only return entities whose text appears in the input
            const entityText = (e.name as string) || (e.text as string) || ''
            return entityText && text.toLowerCase().includes(entityText.toLowerCase())
          })
          .map((e: Record<string, unknown>) => ({
            type: ((e.type as string) || 'UNKNOWN').toUpperCase(),
            text: (e.name as string) || (e.text as string) || '',
            confidence: (e.confidence as number) ?? 0.8,
            start_offset: (e.start_offset as number) ?? undefined,
            end_offset: (e.end_offset as number) ?? undefined,
          }))
      } catch (err) {
        log.debug('KG entities fetch failed:', err)
        return []
      }
    } catch (err) {
      log.debug('extractEntities failed:', err)
      return []
    }
  }

  /**
   * Delete all user data from PiyAPI cloud (GDPR Article 17).
   *
   * Namespace by namespace (DELETE /memories/namespace/<ns>, then one by one
   * for whatever is left), followed by the knowledge graph built from it.
   * PiyAPI's own "delete everything" route (DELETE /compliance/data) is not
   * used: it removes the account and its API keys as well, which would leave
   * a signed-in user without cloud storage.
   */
  public async deleteAllData(): Promise<boolean> {
    try {
      await this.ensureAuthenticated()

      // SyncManager stores every table under `meetings.<table>`; the list here
      // used to name only three of the nine, so meeting titles, action items,
      // highlights, sentiment, calendar events and webhooks stayed in the cloud
      // after "delete all my data".
      const namespaces = [
        ...SYNCED_TABLES.map(table => `meetings.${table}`),
        'meetings.keyring', // wrapped copies of the account's data key
        'meetings', // knowledge-graph ingests and pre-namespace uploads
        'default',
      ]
      const PAGE_SIZE = 100
      let totalDeleted = 0
      let complete = true

      for (const ns of namespaces) {
        try {
          // One call for the whole namespace where the server supports it;
          // the loop below then finds nothing, or finishes the job.
          try {
            await this.fetchWithTimeout(
              `${this.baseUrl}/memories/namespace/${encodeURIComponent(ns)}`,
              { method: 'DELETE', headers: { Authorization: `Bearer ${this.accessToken}` } },
              60_000
            )
          } catch (e) {
            log.debug(`GDPR: namespace delete not available for ${ns}:`, (e as Error).message)
          }

          // No page cap: erasure has to be complete. The loop ends when the
          // namespace is empty, or when a full page could not be deleted at
          // all (deleting is always from offset 0 — the rest shifts down).
          for (;;) {
            const memories = await this.getMemories(ns, PAGE_SIZE, 0)
            if (memories.length === 0) break

            let deletedThisPage = 0
            for (const mem of memories) {
              if (!mem.id) continue
              try {
                await this.deleteMemory(mem.id)
                deletedThisPage++
              } catch (e) {
                // 404: someone else already removed it.
                if ((e as BackendHttpError)?.status === 404) {
                  deletedThisPage++
                } else {
                  log.warn(`GDPR: failed to delete a memory in ${ns}:`, (e as Error).message)
                }
              }
            }
            totalDeleted += deletedThisPage
            if (deletedThisPage === 0) {
              complete = false
              break
            }
          }
        } catch (e) {
          complete = false
          log.warn(`GDPR: could not clear namespace ${ns}:`, (e as Error).message)
        }
      }

      // Entities and facts the knowledge graph extracted (only present when
      // the user allowed cloud analysis). 404: nothing was ever ingested.
      try {
        const response = await this.fetchWithTimeout(`${this.baseUrl}/kg/data`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${this.accessToken}` },
        })
        if (!response.ok && response.status !== 404) {
          complete = false
          log.warn(`GDPR: knowledge graph was not cleared (HTTP ${response.status})`)
        }
      } catch (e) {
        complete = false
        log.warn('GDPR: knowledge graph could not be cleared:', (e as Error).message)
      }

      log.info(
        `GDPR deleteAllData: deleted ${totalDeleted} memories across ${namespaces.length} namespaces` +
          (complete ? '' : ' — INCOMPLETE')
      )
      // True only when every namespace was listed and left empty — including
      // the case where there was nothing to delete in the first place.
      return complete
    } catch (error) {
      log.error('deleteAllData failed:', error)
      return false
    }
  }

  /**
   * Search the knowledge graph for matching nodes.
   * Used by graph.handlers for graph search functionality.
   */
  public async searchGraph(
    query: string,
    namespace: string = 'meetings',
    limit: number = 20
  ): Promise<Array<{ id: string; label: string; type: string; score: number }>> {
    try {
      await this.ensureAuthenticated()
      const response = await this.fetchWithTimeout(`${this.baseUrl}/graph/search`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, namespace, limit }),
      })

      if (!response.ok) return []
      const data = await response.json()
      return data.results || data
    } catch (err) {
      log.debug('searchGraph failed:', err)
      return []
    }
  }

  /**
   * Get knowledge graph statistics for a namespace.
   * Used by graph.handlers for the stats panel.
   */
  public async getGraphStats(namespace: string = 'meetings'): Promise<{
    totalNodes: number
    totalEdges: number
    clusters: number
  }> {
    try {
      await this.ensureAuthenticated()
      const response = await this.fetchWithTimeout(
        `${this.baseUrl}/graph/stats?namespace=${encodeURIComponent(namespace)}`,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
        }
      )

      if (!response.ok) return { totalNodes: 0, totalEdges: 0, clusters: 0 }
      return await response.json()
    } catch (err) {
      log.debug('getGraphStats failed:', err)
      return { totalNodes: 0, totalEdges: 0, clusters: 0 }
    }
  }

  /**
   * Ensure user is authenticated
   * Throws error if not authenticated
   */
  private async ensureAuthenticated(): Promise<void> {
    if (!this.accessToken) {
      // Try to load from keychain
      if (this.userId) {
        const token = await KeyStorageService.getAccessToken(this.userId)
        if (token) {
          this.accessToken = token
          return
        }
      }

      throw new Error('Not authenticated. Please login first.')
    }
  }

  /**
   * Set access token (for testing or manual token management)
   */
  public setAccessToken(token: string, userId: string): void {
    this.accessToken = token
    this.userId = userId
    // P5: Invalidate health cache on token change — new user may have different status
    this._healthCache = null
    this._healthCacheExpiry = 0
  }

  /**
   * Get current access token (for internal use by SyncManager)
   */
  public getAccessToken(): string | null {
    return this.accessToken
  }

  /**
   * Create a context session for token-budgeted retrieval
   * Blueprint §2.4: Used for note expansion with optimal context
   */
  async createContextSession(params: {
    namespace: string
    token_budget: number
    time_range: { start: number; end: number }
    filters?: Record<string, string>
  }): Promise<{ context_session_id: string; expires_at: number } | null> {
    try {
      await this.ensureAuthenticated()
      const response = await this.fetchWithTimeout(`${this.baseUrl}/context/sessions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      })
      if (!response.ok) return null
      const data = (await response.json()) as {
        context_session_id?: string
        expires_in_seconds?: number
      }
      if (!data.context_session_id) return null

      // The server keeps only the id; remember what this session was for.
      if (this.contextSessions.size >= PiyAPIBackend.MAX_CONTEXT_SESSIONS) {
        const oldest = this.contextSessions.keys().next().value
        if (oldest !== undefined) this.contextSessions.delete(oldest)
      }
      this.contextSessions.set(data.context_session_id, {
        namespace: params.namespace,
        tokenBudget: params.token_budget,
      })
      return {
        context_session_id: data.context_session_id,
        expires_at: Date.now() + (data.expires_in_seconds ?? 24 * 60 * 60) * 1000,
      }
    } catch (err) {
      log.debug('createContextSession failed:', err)
      return null
    }
  }

  /**
   * Retrieve optimized context from a session
   * Blueprint §2.4: Returns transcript segments within token budget
   */
  async retrieveContext(
    sessionId: string,
    query: string
  ): Promise<{
    context: string
    tokens_used: number
    segments: Array<{ content: string; timestamp: number; meeting_id: string }>
  } | null> {
    try {
      await this.ensureAuthenticated()
      // The session itself carries nothing but an id on the server (it tracks
      // what has been returned already); the namespace and token budget asked
      // for when it was created have to be sent with each retrieval.
      const session = this.contextSessions.get(sessionId)
      const body: Record<string, unknown> = {
        query,
        context_session_id: sessionId,
        format: 'json',
      }
      if (session?.namespace) body.namespace = session.namespace
      if (session?.tokenBudget) body.max_tokens = session.tokenBudget

      // POST, so the user's text stays out of the URL (and out of access logs).
      const response = await this.fetchWithTimeout(`${this.baseUrl}/context/retrieve`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(body),
      })
      if (!response.ok) return null

      // The reply is `{ memories, metadata: { tokens_used } }`. It was read as
      // `{ context, tokens_used, segments }`, none of which exist, so the cloud
      // context was never used.
      const data = (await response.json()) as { metadata?: { tokens_used?: unknown } }
      const results = this.contextMemoriesToResults(data)
      const segments = results
        .filter(r => r.memory?.content)
        .map(r => {
          const memory = r.memory as Memory & { event_time?: string; created_at?: string }
          const when = Date.parse(memory.eventTime || memory.event_time || memory.created_at || '')
          return {
            content: memory.content,
            timestamp: Number.isNaN(when) ? 0 : when,
            meeting_id: String(memory.metadata?.meeting_id ?? ''),
          }
        })
      return {
        context: segments.map(s => s.content).join('\n\n'),
        tokens_used: Number(data.metadata?.tokens_used) || 0,
        segments,
      }
    } catch (err) {
      log.debug('retrieveContext failed:', err)
      return null
    }
  }

  /** `{ memories: [...] }` from /context/retrieve, as decrypted search results. */
  private contextMemoriesToResults(data: unknown): SearchResult[] {
    const memories = (data as { memories?: unknown } | null)?.memories
    if (!Array.isArray(memories)) return []
    return this.normalizeSearchResults(
      memories.map(item => {
        const memory = item as Memory & { similarity?: number | string; score?: number | string }
        return { memory, similarity: memory.similarity ?? memory.score ?? 0 }
      })
    )
  }

  // ════════════════════════════════════════════════════════════════
  //  P3-2: Response normalization helpers
  // ════════════════════════════════════════════════════════════════

  /**
   * Normalize search results from PiyAPI.
   * PiyAPI returns similarity in 3 formats: int (85), string ("0.871"), float (0.51).
   * This normalizes ALL to float 0-1.
   * Also strips internal DB fields from memory objects.
   */
  private normalizeSearchResults(results: SearchResult[]): SearchResult[] {
    if (!Array.isArray(results)) return []
    // A memory this app encrypted before upload cannot be ranked by the
    // server: whatever score it comes back with was computed from ciphertext.
    // Such hits are dropped rather than decrypted and shown at a random rank.
    const rankable = results.filter(r => {
      const meta = r.memory?.metadata as Record<string, unknown> | undefined
      return !(meta?.client_encrypted === true || meta?.skip_server_embedding === true)
    })
    return rankable.map(r => {
      const rawSim =
        r.similarity !== undefined && r.similarity !== null
          ? r.similarity
          : // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ((r as any).hybridScore ?? (r as any).semanticScore ?? (r as any).score ?? 0.85)

      return {
        ...r,
        similarity: this.normalizeSimilarity(rawSim),
        memory: r.memory ? this.decryptMemory(this.stripInternalFields(r.memory)) : r.memory,
      }
    })
  }

  /**
   * Synced memories hold ciphertext (see SyncManager). Search results used to
   * hand that ciphertext straight to the UI and to the local LLM as "context".
   * Decrypt with the session's key; if this device cannot read a memory, blank
   * it rather than pass base64 noise downstream.
   */
  private decryptMemory(memory: Memory): Memory {
    const meta = memory.metadata as Record<string, unknown> | undefined
    if (!meta?.encrypted || typeof memory.content !== 'string') return memory

    const plaintext = EncryptionService.decryptWithCachedKey({
      ciphertext: memory.content,
      iv: String(meta.iv ?? ''),
      authTag: String(meta.authTag ?? ''),
      salt: typeof meta.salt === 'string' ? meta.salt : undefined,
    })
    if (plaintext === null) {
      return { ...memory, content: '', metadata: { ...meta, encrypted: true, locked: true } }
    }

    try {
      const record = JSON.parse(plaintext) as Record<string, unknown>
      const text = [record.text, record.content, record.original_text, record.title].find(
        value => typeof value === 'string' && value.length > 0
      ) as string | undefined
      return {
        ...memory,
        content: text ?? '',
        metadata: {
          ...meta,
          encrypted: false,
          ...(typeof record.meeting_id === 'string' ? { meeting_id: record.meeting_id } : {}),
          ...(typeof record.title === 'string' ? { meeting_title: record.title } : {}),
          ...(typeof record.speaker_name === 'string' ? { speaker_name: record.speaker_name } : {}),
        },
      }
    } catch {
      return { ...memory, content: plaintext, metadata: { ...meta, encrypted: false } }
    }
  }

  /**
   * Normalize similarity to 0-1 float.
   * Handles: int (85 → 0.85), string ("0.871" → 0.871), float (0.51 → 0.51)
   */
  private normalizeSimilarity(value: number | string | undefined): number {
    if (value === undefined || value === null) return 0
    const num = typeof value === 'string' ? parseFloat(value) : value
    if (isNaN(num)) return 0
    // If > 1, assume it's a percentage (e.g., 85 → 0.85)
    return num > 1 ? num / 100 : Math.max(0, Math.min(1, num))
  }

  /**
   * Strip internal PiyAPI DB fields from memory objects.
   * Prevents leaking tsvector_content, embedding_status, etc.
   */
  private stripInternalFields(obj: Memory): Memory {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cleaned = { ...obj } as any
    for (const field of INTERNAL_FIELDS) {
      delete cleaned[field]
    }
    return cleaned as Memory
  }
}
