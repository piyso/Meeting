/**
 * Backend Provider Interface
 *
 * Abstraction layer for backend services (PiyAPI, self-hosted, PostgreSQL).
 * Allows switching backends via configuration without code changes.
 */

/**
 * Authentication tokens
 */
export interface AuthTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number // seconds until access token expires
  userId?: string
  planTier?: 'free' | 'starter' | 'pro' | 'team' | 'enterprise'
}

/**
 * Memory (meeting data) structure
 */
export interface Memory {
  id?: string
  content: string
  namespace: string // e.g., 'meetings.transcripts', 'meetings.notes'
  tags?: string[]
  metadata?: Record<string, unknown>
  sourceType?: string // e.g., 'transcript', 'note', 'entity'
  eventTime?: string // ISO 8601 timestamp
  embedding?: number[] // Local embedding vector (384 dimensions for all-MiniLM-L6-v2)
}

/**
 * Search result
 */
export interface SearchResult {
  memory: Memory
  similarity: number // 0-1 cosine similarity
  semanticScore?: number // Semantic search score
  keywordScore?: number // Keyword search score (hybrid search)
}

/**
 * AI query response
 */
export interface AskResponse {
  answer: string
  confidence: number // 0-1
  sources: Array<{
    memoryId: string
    content: string
    similarity: number
  }>
  model: string // e.g., 'qwen-2.5-3b', 'llama-3'
  tokensUsed: number
}

/**
 * Knowledge graph data
 */
export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

/**
 * Graph node
 */
export interface GraphNode {
  id: string
  label: string
  type: 'meeting' | 'person' | 'topic' | 'decision' | 'action_item'
  metadata?: Record<string, unknown>
}

/**
 * Graph edge
 */
export interface GraphEdge {
  source: string
  target: string
  type:
    | 'follows'
    | 'references'
    | 'contradicts'
    | 'supersedes'
    | 'supports'
    | 'questions'
    | 'implements'
    | 'parent'
  weight?: number
  metadata?: Record<string, unknown>
}

/**
 * Health status
 */
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'down'
  latency: number // milliseconds
  message?: string
  version?: string
}

/**
 * Backend Provider Interface
 *
 * All backend implementations must implement this interface.
 */
export interface IBackendProvider {
  /**
   * Authenticate user with email and password
   *
   * @param email - User email
   * @param password - User password
   * @returns Authentication tokens
   */
  login(email: string, password: string): Promise<AuthTokens>

  /**
   * Refresh access token using refresh token
   *
   * @param refreshToken - Refresh token
   * @returns New authentication tokens
   */
  refreshToken(refreshToken: string): Promise<AuthTokens>

  /**
   * Logout user and invalidate tokens
   *
   * @returns Promise that resolves when logout is complete
   */
  logout(): Promise<void>

  /**
   * Create a new memory (meeting data)
   *
   * @param memory - Memory to create
   * @returns Created memory with ID
   */
  createMemory(memory: Memory): Promise<Memory>

  /**
   * Update an existing memory
   *
   * @param id - Memory ID
   * @param updates - Partial memory updates
   * @returns Updated memory
   */
  updateMemory(id: string, updates: Partial<Memory>): Promise<Memory>

  /**
   * Delete a memory
   *
   * @param id - Memory ID
   * @returns Promise that resolves when memory is deleted
   */
  deleteMemory(id: string): Promise<void>

  /**
   * Get memories by namespace
   *
   * @param namespace - Namespace to filter by
   * @param limit - Maximum number of memories to return
   * @param offset - Offset for pagination
   * @returns Array of memories
   */
  getMemories(namespace: string, limit: number, offset: number): Promise<Memory[]>

  /**
   * Semantic search across memories
   *
   * @param query - Search query
   * @param namespace - Optional namespace to filter by
   * @param limit - Maximum number of results
   * @returns Array of search results sorted by similarity
   */
  semanticSearch(query: string, namespace?: string, limit?: number): Promise<SearchResult[]>

  /**
   * Hybrid search (semantic + keyword) across memories
   *
   * @param query - Search query
   * @param namespace - Optional namespace to filter by
   * @param limit - Maximum number of results
   * @returns Array of search results sorted by combined score
   */
  hybridSearch(query: string, namespace?: string, limit?: number): Promise<SearchResult[]>

  /**
   * Ask AI a question across all memories
   *
   * @param query - Question to ask
   * @param namespace - Optional namespace to filter by
   * @returns AI-generated answer with sources
   */
  ask(query: string, namespace?: string): Promise<AskResponse>

  /**
   * Get knowledge graph for a namespace
   *
   * @param namespace - Namespace to get graph for
   * @param maxHops - Maximum number of hops from root nodes
   * @returns Graph data with nodes and edges
   */
  getGraph(namespace: string, maxHops: number): Promise<GraphData>

  /**
   * Traverse knowledge graph from a specific memory
   *
   * @param memoryId - Starting memory ID
   * @param maxHops - Maximum number of hops
   * @returns Graph data with nodes and edges
   */
  traverseGraph(memoryId: string, maxHops: number): Promise<GraphData>

  /**
   * Check backend health
   *
   * @returns Health status
   */
  healthCheck(): Promise<HealthStatus>

  /**
   * Get backend name
   *
   * @returns Backend name (e.g., 'PiyAPI', 'Self-Hosted', 'PostgreSQL')
   */
  getName(): string

  /**
   * Get backend base URL
   *
   * @returns Base URL
   */
  getBaseUrl(): string
}
