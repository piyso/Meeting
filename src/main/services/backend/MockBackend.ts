/**
 * MockBackend — In-memory backend for development and testing
 *
 * Implements IBackendProvider with purely in-memory storage.
 * Used during development, automated testing, and offline fallback.
 *
 * Zero network calls, zero cloud dependency, zero cost.
 */

import type {
  IBackendProvider,
  AuthTokens,
  Memory,
  SearchResult,
  AskResponse,
  GraphData,
  HealthStatus,
} from './IBackendProvider'
import { Logger } from '../Logger'

const log = Logger.create('MockBackend')

export class MockBackend implements IBackendProvider {
  private memories: Map<string, Memory> = new Map()
  private idCounter = 0

  getName(): string {
    return 'MockBackend'
  }

  getBaseUrl(): string {
    return 'mock://localhost'
  }

  setAccessToken(token: string, userId: string): void {
    log.debug(`Mock token set for user ${userId} (token=${token.slice(0, 8)}...)`)
  }

  async login(_email: string, _password: string): Promise<AuthTokens> {
    return {
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
      expiresIn: 3600,
      userId: 'mock-user-001',
      planTier: 'pro',
    }
  }

  async refreshToken(_refreshToken: string): Promise<AuthTokens> {
    return this.login('mock', 'mock')
  }

  async logout(): Promise<void> {
    log.info('Mock logout')
  }

  async createMemory(memory: Memory): Promise<Memory> {
    const id = memory.id || `mock-${++this.idCounter}`
    const created = { ...memory, id }
    this.memories.set(id, created)
    return created
  }

  async batchCreateMemories(memories: Memory[]): Promise<Memory[]> {
    const results: Memory[] = []
    for (const memory of memories) {
      results.push(await this.createMemory(memory))
    }
    return results
  }

  async updateMemory(id: string, updates: Partial<Memory>): Promise<Memory> {
    const existing = this.memories.get(id)
    if (!existing) throw new Error(`Memory ${id} not found`)
    const updated = { ...existing, ...updates }
    this.memories.set(id, updated)
    return updated
  }

  async deleteMemory(id: string): Promise<void> {
    this.memories.delete(id)
  }

  async getMemories(namespace: string, limit: number, offset: number): Promise<Memory[]> {
    return Array.from(this.memories.values())
      .filter(m => m.namespace === namespace)
      .slice(offset, offset + limit)
  }

  async semanticSearch(query: string, namespace?: string, limit?: number): Promise<SearchResult[]> {
    const q = query.toLowerCase()
    return Array.from(this.memories.values())
      .filter(m => (!namespace || m.namespace === namespace) && m.content.toLowerCase().includes(q))
      .slice(0, limit || 10)
      .map(m => ({ memory: m, similarity: 0.85 }))
  }

  async hybridSearch(query: string, namespace?: string, limit?: number): Promise<SearchResult[]> {
    return this.semanticSearch(query, namespace, limit)
  }

  async ask(query: string, _namespace?: string): Promise<AskResponse> {
    return {
      answer: `[Mock] Answer for: "${query}"`,
      confidence: 0.9,
      sources: [],
      model: 'mock-model',
      tokensUsed: 0,
    }
  }

  async getGraph(_namespace: string, _maxHops: number): Promise<GraphData> {
    return { nodes: [], edges: [] }
  }

  async traverseGraph(_memoryId: string, _maxHops: number): Promise<GraphData> {
    return { nodes: [], edges: [] }
  }

  async healthCheck(): Promise<HealthStatus> {
    return { status: 'healthy', latency: 0, message: 'Mock backend', version: '1.0.0' }
  }

  // ── PiyAPI-specific stubs ──────────────────────────────────────

  async extractEntities(
    _text: string,
    _namespace?: string
  ): Promise<
    Array<{
      type: string
      text: string
      confidence: number
      start_offset?: number
      end_offset?: number
    }>
  > {
    return []
  }

  async kgIngest(
    _content: string,
    _memoryId?: string
  ): Promise<{ entities: number; facts: number } | null> {
    return { entities: 0, facts: 0 }
  }

  async fuzzySearch(query: string, namespace?: string, limit?: number): Promise<SearchResult[]> {
    return this.semanticSearch(query, namespace, limit)
  }

  async feedbackPositive(_memoryIds: string[]): Promise<boolean> {
    return true
  }

  async feedbackNegative(_memoryIds: string[]): Promise<boolean> {
    return true
  }

  async deduplicate(
    _namespace?: string,
    _dryRun?: boolean
  ): Promise<{ duplicates: number; merged: number } | null> {
    return { duplicates: 0, merged: 0 }
  }

  async searchGraph(
    _query: string,
    _namespace?: string,
    _limit?: number
  ): Promise<Array<{ id: string; label: string; type: string; score: number }>> {
    return []
  }

  async getGraphStats(
    _namespace?: string
  ): Promise<{ totalNodes: number; totalEdges: number; clusters: number }> {
    return { totalNodes: 0, totalEdges: 0, clusters: 0 }
  }

  async createContextSession(_params: {
    namespace: string
    token_budget: number
    time_range: { start: number; end: number }
    filters?: Record<string, string>
  }): Promise<{ context_session_id: string; expires_at: number } | null> {
    return { context_session_id: `mock-session-${Date.now()}`, expires_at: Date.now() + 3600000 }
  }

  async retrieveContext(
    _sessionId: string,
    _query: string
  ): Promise<{
    context: string
    tokens_used: number
    segments: Array<{ content: string; timestamp: number; meeting_id: string }>
  } | null> {
    return { context: '', tokens_used: 0, segments: [] }
  }

  async exportAll(_type?: string): Promise<{ download_url: string } | null> {
    return { download_url: 'mock://export' }
  }

  async deleteAllData(): Promise<boolean> {
    this.memories.clear()
    return true
  }

  /**
   * Reset all data (for test isolation)
   */
  reset(): void {
    this.memories.clear()
    this.idCounter = 0
  }
}
