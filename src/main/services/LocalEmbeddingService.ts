/**
 * LocalEmbeddingService - Local semantic embeddings using all-MiniLM-L6-v2 ONNX
 *
 * Purpose:
 * - Generate embeddings locally for Free tier users
 * - Enable local semantic search without cloud dependency
 * - Dual-path pipeline: embed locally → encrypt → sync to cloud
 *
 * Model: sentence-transformers/all-MiniLM-L6-v2
 * - Size: ~25MB
 * - Dimensions: 384
 * - Performance: <50ms per embedding
 * - Memory: ~100MB
 *
 * Integration:
 * - SyncManager: Dual-path embedding pipeline
 * - CloudAccessManager: Tier-based feature gating
 * - Search: Local semantic search (Cmd+Shift+K)
 */

import * as ort from 'onnxruntime-node'
import * as path from 'path'
import * as fs from 'fs'
import { app } from 'electron'

export interface EmbeddingResult {
  embedding: number[]
  dimensions: number
  model: string
  generationTimeMs: number
}

export interface SearchResult {
  id: string
  score: number
  text: string
  metadata?: Record<string, any>
}

export class LocalEmbeddingService {
  private session: ort.InferenceSession | null = null
  private vocab: Map<string, number> = new Map()
  private modelPath: string
  private tokenizerPath: string
  private vocabPath: string
  private isInitialized = false

  // Model configuration
  private readonly MAX_SEQUENCE_LENGTH = 128
  private readonly EMBEDDING_DIMENSIONS = 384
  private readonly MODEL_NAME = 'all-MiniLM-L6-v2'

  constructor() {
    // Determine model paths based on environment
    const isDev = !app.isPackaged
    const basePath = isDev
      ? path.join(process.cwd(), 'resources', 'models')
      : path.join(process.resourcesPath, 'models')

    this.modelPath = path.join(basePath, 'all-MiniLM-L6-v2.onnx')
    this.tokenizerPath = path.join(basePath, 'all-MiniLM-L6-v2-tokenizer.json')
    this.vocabPath = path.join(basePath, 'all-MiniLM-L6-v2-vocab.txt')
  }

  /**
   * Initialize the embedding service
   * Loads ONNX model and tokenizer
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    const startTime = Date.now()

    try {
      // Check if model files exist
      if (!fs.existsSync(this.modelPath)) {
        throw new Error(
          `Model file not found: ${this.modelPath}\n` +
            'Please run: npm run download-embedding-model'
        )
      }

      if (!fs.existsSync(this.tokenizerPath)) {
        throw new Error(
          `Tokenizer file not found: ${this.tokenizerPath}\n` +
            'Please run: npm run download-embedding-model'
        )
      }

      if (!fs.existsSync(this.vocabPath)) {
        throw new Error(
          `Vocabulary file not found: ${this.vocabPath}\n` +
            'Please run: npm run download-embedding-model'
        )
      }

      // Load ONNX model
      console.log('[LocalEmbeddingService] Loading ONNX model...')
      this.session = await ort.InferenceSession.create(this.modelPath, {
        executionProviders: ['cpu'],
        graphOptimizationLevel: 'all',
      })

      // Parse tokenizer (not stored as class property since vocab is enough for simple tokenization)
      console.log('[LocalEmbeddingService] Loading tokenizer...')
      const tokenizerData = fs.readFileSync(this.tokenizerPath, 'utf-8')
      JSON.parse(tokenizerData)

      // Load vocabulary
      console.log('[LocalEmbeddingService] Loading vocabulary...')
      const vocabData = fs.readFileSync(this.vocabPath, 'utf-8')
      const vocabLines = vocabData.split('\n').filter(line => line.trim())
      vocabLines.forEach((token, index) => {
        this.vocab.set(token, index)
      })

      const loadTime = Date.now() - startTime
      console.log(`[LocalEmbeddingService] Initialized in ${loadTime}ms`)
      console.log(`[LocalEmbeddingService] Model: ${this.MODEL_NAME}`)
      console.log(`[LocalEmbeddingService] Dimensions: ${this.EMBEDDING_DIMENSIONS}`)
      console.log(`[LocalEmbeddingService] Vocabulary size: ${this.vocab.size}`)

      this.isInitialized = true
    } catch (error) {
      console.error('[LocalEmbeddingService] Initialization failed:', error)
      throw error
    }
  }

  /**
   * Generate embedding for text
   */
  async embed(text: string): Promise<EmbeddingResult> {
    if (!this.isInitialized) {
      await this.initialize()
    }

    const startTime = Date.now()

    try {
      // Tokenize text
      const tokens = this.tokenize(text)

      // Create input tensors
      const inputIds = new ort.Tensor('int64', BigInt64Array.from(tokens.map(t => BigInt(t))), [
        1,
        tokens.length,
      ])
      const attentionMask = new ort.Tensor(
        'int64',
        BigInt64Array.from(tokens.map(() => BigInt(1))),
        [1, tokens.length]
      )

      // Run inference
      const feeds = {
        input_ids: inputIds,
        attention_mask: attentionMask,
      }

      const results = await this.session!.run(feeds)
      const output = results['last_hidden_state']
      
      if (!output) {
        throw new Error('last_hidden_state missing from output')
      }

      // Mean pooling
      const embedding = this.meanPooling(output.data as Float32Array, tokens.length)

      // L2 normalization
      const normalizedEmbedding = this.normalize(embedding)

      const generationTimeMs = Date.now() - startTime

      return {
        embedding: normalizedEmbedding,
        dimensions: this.EMBEDDING_DIMENSIONS,
        model: this.MODEL_NAME,
        generationTimeMs,
      }
    } catch (error) {
      console.error('[LocalEmbeddingService] Embedding generation failed:', error)
      throw error
    }
  }

  /**
   * Generate embeddings for multiple texts (batch)
   */
  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    const results: EmbeddingResult[] = []

    for (const text of texts) {
      const result = await this.embed(text)
      results.push(result)
    }

    return results
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Embeddings must have the same dimensions')
    }

    let dotProduct = 0
    let normA = 0
    let normB = 0

    for (let i = 0; i < a.length; i++) {
      const aVal = a[i]!
      const bVal = b[i]!
      dotProduct += aVal * bVal
      normA += aVal * aVal
      normB += bVal * bVal
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
  }

  /**
   * Search for similar texts using local embeddings
   */
  async search(
    query: string,
    documents: Array<{
      id: string
      text: string
      embedding?: number[]
      metadata?: Record<string, any>
    }>,
    topK: number = 10
  ): Promise<SearchResult[]> {
    // Generate query embedding
    const queryResult = await this.embed(query)
    const queryEmbedding = queryResult.embedding

    // Calculate similarities
    const results: SearchResult[] = []

    for (const doc of documents) {
      let docEmbedding: number[]

      if (doc.embedding) {
        docEmbedding = doc.embedding
      } else {
        const result = await this.embed(doc.text)
        docEmbedding = result.embedding
      }

      const score = this.cosineSimilarity(queryEmbedding, docEmbedding)

      results.push({
        id: doc.id,
        score,
        text: doc.text,
        metadata: doc.metadata,
      })
    }

    // Sort by score (descending) and return top K
    results.sort((a, b) => b.score - a.score)
    return results.slice(0, topK)
  }

  /**
   * Tokenize text using vocabulary
   */
  private tokenize(text: string): number[] {
    // Simple whitespace tokenization + vocabulary lookup
    // For production, use proper WordPiece tokenization
    const tokens: number[] = []

    // Add [CLS] token
    tokens.push(this.vocab.get('[CLS]') || 101)

    // Tokenize text
    const words = text.toLowerCase().split(/\s+/)
    for (const word of words) {
      if (tokens.length >= this.MAX_SEQUENCE_LENGTH - 1) {
        break
      }

      const tokenId = this.vocab.get(word) || this.vocab.get('[UNK]') || 100
      tokens.push(tokenId)
    }

    // Add [SEP] token
    tokens.push(this.vocab.get('[SEP]') || 102)

    // Pad to max length
    while (tokens.length < this.MAX_SEQUENCE_LENGTH) {
      tokens.push(0) // [PAD] token
    }

    return tokens.slice(0, this.MAX_SEQUENCE_LENGTH)
  }

  /**
   * Mean pooling over token embeddings
   */
  private meanPooling(data: Float32Array, seqLength: number): number[] {
    const embedding = new Array(this.EMBEDDING_DIMENSIONS).fill(0)

    for (let i = 0; i < seqLength; i++) {
      for (let j = 0; j < this.EMBEDDING_DIMENSIONS; j++) {
        embedding[j] += data[i * this.EMBEDDING_DIMENSIONS + j]
      }
    }

    for (let j = 0; j < this.EMBEDDING_DIMENSIONS; j++) {
      embedding[j] /= seqLength
    }

    return embedding
  }

  /**
   * L2 normalization
   */
  private normalize(embedding: number[]): number[] {
    let norm = 0
    for (const value of embedding) {
      norm += value * value
    }
    norm = Math.sqrt(norm)

    return embedding.map(value => value / norm)
  }

  /**
   * Get service status
   */
  getStatus(): {
    initialized: boolean
    model: string
    dimensions: number
    maxSequenceLength: number
    vocabSize: number
  } {
    return {
      initialized: this.isInitialized,
      model: this.MODEL_NAME,
      dimensions: this.EMBEDDING_DIMENSIONS,
      maxSequenceLength: this.MAX_SEQUENCE_LENGTH,
      vocabSize: this.vocab.size,
    }
  }

  /**
   * Cleanup resources
   */
  async dispose(): Promise<void> {
    if (this.session) {
      await this.session.release()
      this.session = null
    }
    this.vocab.clear()
    this.isInitialized = false
  }
}

// Singleton instance
let instance: LocalEmbeddingService | null = null

export function getLocalEmbeddingService(): LocalEmbeddingService {
  if (!instance) {
    instance = new LocalEmbeddingService()
  }
  return instance
}
