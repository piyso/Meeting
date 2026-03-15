/**
 * PiyAPI Backend Implementation
 *
 * Official PiyAPI cloud backend implementation.
 * Base URL: https://api.piyapi.cloud/api/v1
 *
 * NOTE (P4-3): PiyAPI does not publish an OpenAPI spec or docs site as of March 2026.
 * TypeScript types are manually maintained in IBackendProvider.ts. When PiyAPI
 * publishes an OpenAPI schema, consider generating TS types from it to keep
 * the interface contract tight and reduce manual maintenance.
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
import { Logger } from '../Logger'

const log = Logger.create('PiyAPIBackend')

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

/**
 * PiyAPI Backend Class
 */
export class PiyAPIBackend implements IBackendProvider {
  private baseUrl: string
  private accessToken: string | null = null
  private userId: string | null = null
  private proxyMode: boolean = false
  // E-HC: Cache health check results for 30 seconds to avoid redundant HTTP calls.
  // graph/search/intelligence handlers call healthCheck() before every API request.
  private _healthCache: HealthStatus | null = null
  private _healthCacheExpiry: number = 0
  private readonly HEALTH_CACHE_TTL = 30_000 // 30 seconds

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

    const response = await fetch(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Login failed' }))
      throw new Error(error.message || 'Login failed')
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

    const response = await fetch(`${this.baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Token refresh failed' }))
      throw new Error(error.message || 'Token refresh failed')
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
        await fetch(`${this.baseUrl}/auth/logout`, {
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

    const response = await fetch(`${this.baseUrl}/memories`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(memory),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to create memory' }))
      throw new Error(error.message || 'Failed to create memory')
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
    const response = await fetch(`${this.baseUrl}/memories/batch`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
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
      throw new Error(error.message || 'Batch create failed')
    }

    const data = await response.json()
    return data.memories || data.results || data
  }

  /**
   * Update an existing memory
   */
  public async updateMemory(id: string, updates: Partial<Memory>): Promise<Memory> {
    await this.ensureAuthenticated()

    const response = await fetch(`${this.baseUrl}/memories/${id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to update memory' }))
      throw new Error(error.message || 'Failed to update memory')
    }

    const data = await response.json()
    return data.memory || data
  }

  /**
   * Delete a memory
   */
  public async deleteMemory(id: string): Promise<void> {
    await this.ensureAuthenticated()

    const response = await fetch(`${this.baseUrl}/memories/${id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to delete memory' }))
      throw new Error(error.message || 'Failed to delete memory')
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

    const response = await fetch(`${this.baseUrl}/memories?${params}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to get memories' }))
      throw new Error(error.message || 'Failed to get memories')
    }

    const data = await response.json()
    return data.memories || data
  }

  /**
   * Semantic search across memories
   */
  public async semanticSearch(
    query: string,
    namespace?: string,
    limit: number = 10
  ): Promise<SearchResult[]> {
    await this.ensureAuthenticated()

    const body: Record<string, unknown> = { query, limit }
    if (namespace) {
      body.namespace = namespace
    }

    const response = await fetch(`${this.baseUrl}/search/semantic`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Semantic search failed' }))
      throw new Error(error.message || 'Semantic search failed')
    }

    const data = await response.json()
    return this.normalizeSearchResults(data.results || data)
  }

  /**
   * Hybrid search (semantic + keyword)
   */
  public async hybridSearch(
    query: string,
    namespace?: string,
    limit: number = 10
  ): Promise<SearchResult[]> {
    await this.ensureAuthenticated()

    const body: Record<string, unknown> = { query, limit }
    if (namespace) {
      body.namespace = namespace
    }

    const response = await fetch(`${this.baseUrl}/search/hybrid`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Hybrid search failed' }))
      throw new Error(error.message || 'Hybrid search failed')
    }

    const data = await response.json()
    return this.normalizeSearchResults(data.results || data)
  }

  /**
   * Ask AI a question
   */
  public async ask(query: string, namespace?: string): Promise<AskResponse> {
    await this.ensureAuthenticated()

    const body: Record<string, unknown> = { query }
    if (namespace) {
      body.namespace = namespace
    }

    const response = await fetch(`${this.baseUrl}/ask`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'AI query failed' }))
      throw new Error(error.message || 'AI query failed')
    }

    const data = await response.json()
    return data
  }

  /**
   * Get knowledge graph
   */
  public async getGraph(namespace: string, maxHops: number = 2): Promise<GraphData> {
    await this.ensureAuthenticated()

    const params = new URLSearchParams({
      namespace,
      max_hops: maxHops.toString(),
    })

    const response = await fetch(`${this.baseUrl}/graph?${params}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to get graph' }))
      throw new Error(error.message || 'Failed to get graph')
    }

    const data = await response.json()
    return data
  }

  /**
   * Traverse knowledge graph from a memory
   */
  public async traverseGraph(memoryId: string, maxHops: number = 2): Promise<GraphData> {
    await this.ensureAuthenticated()

    const params = new URLSearchParams({
      memory_id: memoryId,
      max_hops: maxHops.toString(),
    })

    // Live-verified: /graph/traverse returns 404. /graph?memory_id= returns 200
    const response = await fetch(`${this.baseUrl}/graph?${params}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to traverse graph' }))
      throw new Error(error.message || 'Failed to traverse graph')
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

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    try {
      // P1-1 FIX: /health is confirmed working at api.piyapi.cloud/health → {"status":"ok"}
      // In proxy mode: hit the Edge Function base to verify connectivity
      // In direct mode: hit /health which returns {"status":"ok"}
      const healthUrl = this.proxyMode
        ? this.baseUrl.replace(/\/piyapi-proxy$/, '')
        : this.baseUrl.replace(/\/api\/v1$/, '/health')

      const response = await fetch(healthUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {},
      })

      const latency = Date.now() - start
      let result: HealthStatus

      if (response.ok) {
        const data = await response.json().catch(() => ({}))
        result = { status: 'healthy', latency, version: data.version }
      } else if (response.status === 401 || response.status === 403) {
        result = {
          status: this.proxyMode ? 'healthy' : 'degraded',
          latency,
          message: this.proxyMode
            ? 'Proxy reachable (auth required for data)'
            : `Backend returned ${response.status}`,
        }
      } else {
        result = { status: 'degraded', latency, message: `Backend returned ${response.status}` }
      }

      this._healthCache = result
      this._healthCacheExpiry = Date.now() + this.HEALTH_CACHE_TTL
      return result
    } catch (error: unknown) {
      const latency = Date.now() - start
      const result: HealthStatus = {
        status: 'down',
        latency,
        message: error instanceof Error ? error.message : 'Backend unreachable',
      }
      this._healthCache = result
      this._healthCacheExpiry = Date.now() + this.HEALTH_CACHE_TTL
      return result
    } finally {
      clearTimeout(timeout)
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

      const response = await fetch(`${this.baseUrl}/search/fuzzy`, {
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
      const response = await fetch(`${this.baseUrl}/feedback/positive`, {
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
      const response = await fetch(`${this.baseUrl}/feedback/negative`, {
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
   * F3: Ingest content into PiyAPI knowledge graph.
   * Extracts entities and facts from transcript text.
   */
  public async kgIngest(
    content: string,
    memoryId?: string
  ): Promise<{ entities: number; facts: number } | null> {
    try {
      await this.ensureAuthenticated()
      const body: Record<string, unknown> = { content }
      if (memoryId) body.memory_id = memoryId

      const response = await fetch(`${this.baseUrl}/kg/ingest`, {
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

      const response = await fetch(`${this.baseUrl}/memories/deduplicate`, {
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
   * F5: Check text for Protected Health Information (PHI/PII).
   * REST endpoint path unknown (/compliance/phi returns 404).
   * Feature works via MCP (verified: detects MRN, NAME, DATE, INSURANCE, EMAIL, PHONE).
   * Kept as graceful stub — will activate when REST path is documented.
   */
  public async checkPhi(text: string): Promise<{ risk_level: string; entities: unknown[] } | null> {
    try {
      await this.ensureAuthenticated()
      const response = await fetch(`${this.baseUrl}/compliance/phi`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      })

      if (!response.ok) return null
      return await response.json()
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
      const response = await fetch(`${this.baseUrl}/export?type=${type}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      })

      if (!response.ok) return null
      return await response.json()
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
    try {
      await this.ensureAuthenticated()

      // Step 1: Ingest content into KG (triggers server-side entity extraction)
      const ingestResponse = await fetch(`${this.baseUrl}/kg/ingest`, {
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
        const entitiesResponse = await fetch(
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
   * P2-7/P1-5 FIX: /data/delete-all returns 404. Instead, iterate through
   * all namespaces and delete memories individually.
   */
  public async deleteAllData(): Promise<boolean> {
    try {
      await this.ensureAuthenticated()

      // Try bulk endpoint first (in case PiyAPI adds it)
      try {
        const response = await fetch(`${this.baseUrl}/data/delete-all`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${this.accessToken}` },
        })
        if (response.ok) return true
      } catch {
        // Expected 404 — fall through to iterative approach
      }

      // Iterative deletion: fetch all memories and delete each
      const namespaces = [
        'meetings',
        'meetings.transcripts',
        'meetings.notes',
        'meetings.entities',
        'default',
      ]
      let totalDeleted = 0

      for (const ns of namespaces) {
        try {
          const memories = await this.getMemories(ns, 100, 0)
          for (const mem of memories) {
            if (mem.id) {
              try {
                await this.deleteMemory(mem.id)
                totalDeleted++
              } catch (e) {
                log.debug(`GDPR: Failed to delete memory ${mem.id}:`, (e as Error).message)
              }
            }
          }
        } catch (e) {
          log.debug(`GDPR: Namespace ${ns} cleanup skipped:`, (e as Error).message)
        }
      }

      log.info(
        `GDPR deleteAllData: deleted ${totalDeleted} memories across ${namespaces.length} namespaces`
      )
      return totalDeleted > 0
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
      const response = await fetch(`${this.baseUrl}/graph/search`, {
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
      const response = await fetch(
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
      const response = await fetch(`${this.baseUrl}/context/sessions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      })
      if (!response.ok) return null
      return await response.json()
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
      // P4-1 FIX: encodeURIComponent for sessionId to prevent injection
      const response = await fetch(
        `${this.baseUrl}/context/retrieve?session_id=${encodeURIComponent(sessionId)}&query=${encodeURIComponent(query)}`,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
        }
      )
      if (!response.ok) return null
      return await response.json()
    } catch (err) {
      log.debug('retrieveContext failed:', err)
      return null
    }
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
    return results.map(r => ({
      ...r,
      similarity: this.normalizeSimilarity(r.similarity),
      memory: r.memory ? this.stripInternalFields(r.memory) : r.memory,
    }))
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
