/**
 * PiyAPI Backend Implementation
 *
 * Official PiyAPI cloud backend implementation.
 * Base URL: https://api.piyapi.com/v1
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

/**
 * PiyAPI Backend Class
 */
export class PiyAPIBackend implements IBackendProvider {
  private baseUrl: string
  private accessToken: string | null = null
  private userId: string | null = null
  private proxyMode: boolean = false

  constructor(baseUrl: string = config.BLUEARKIVE_FUNCTIONS_URL || config.PIYAPI_BASE_URL) {
    // Edge Functions proxy: requests go to /piyapi-proxy/memories etc.
    // Direct PiyAPI: requests go to /api/v1/memories etc.
    if (baseUrl && (baseUrl.includes('supabase') || baseUrl.includes('functions'))) {
      this.baseUrl = baseUrl.endsWith('/piyapi-proxy') ? baseUrl : `${baseUrl}/piyapi-proxy`
      this.proxyMode = true
    } else {
      const url = baseUrl || config.PIYAPI_BASE_URL
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
    return data.results || data
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
    return data.results || data
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

    const response = await fetch(`${this.baseUrl}/graph/traverse?${params}`, {
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
    const start = Date.now()

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)

      // In proxy mode, just check if the function endpoint is reachable
      const healthUrl = this.proxyMode
        ? `${this.baseUrl}/health` // Proxy will return its own response
        : `${this.baseUrl}/health`

      const response = await fetch(healthUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {},
      })

      clearTimeout(timeout)
      const latency = Date.now() - start

      if (response.ok) {
        const data = await response.json().catch(() => ({}))
        return {
          status: 'healthy',
          latency,
          version: data.version,
        }
      } else if (response.status === 401 || response.status === 403) {
        // In proxy mode, auth errors mean the proxy is reachable
        return {
          status: this.proxyMode ? 'healthy' : 'degraded',
          latency,
          message: this.proxyMode
            ? 'Proxy reachable (auth required for data)'
            : `Backend returned ${response.status}`,
        }
      } else {
        return {
          status: 'degraded',
          latency,
          message: `Backend returned ${response.status}`,
        }
      }
    } catch (error: unknown) {
      const latency = Date.now() - start
      return {
        status: 'down',
        latency,
        message: error instanceof Error ? error.message : 'Backend unreachable',
      }
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
    } catch {
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
      const response = await fetch(
        `${this.baseUrl}/context/retrieve?session_id=${sessionId}&query=${encodeURIComponent(query)}`,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
        }
      )
      if (!response.ok) return null
      return await response.json()
    } catch {
      return null
    }
  }
}
