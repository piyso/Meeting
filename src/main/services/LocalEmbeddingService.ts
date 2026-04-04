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

import * as path from 'path'
import * as fs from 'fs'
import { app } from 'electron'
import { Logger } from './Logger'
const log = Logger.create('LocalEmbedding')

// LAZY IMPORT: onnxruntime-node is loaded on first use, NOT at module parse time.
// This prevents a fatal crash if the native binary is missing or wrong-arch.
// The bundler (Vite) would otherwise hoist `import * as ort from 'onnxruntime-node'`
// to a top-level `require()` that executes before any error handling is set up.
type OrtModule = typeof import('onnxruntime-node')
let _ort: OrtModule | null = null
async function getOrt(): Promise<OrtModule> {
  if (!_ort) {
    _ort = await import('onnxruntime-node')
  }
  return _ort
}

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
  metadata?: Record<string, unknown>
}

export class LocalEmbeddingService {
  private session: Awaited<ReturnType<OrtModule['InferenceSession']['create']>> | null = null
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
      : path.join(app.getPath('userData'), 'models')

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
      log.info('[LocalEmbeddingService] Loading ONNX model...')
      const ort = await getOrt()
      this.session = await ort.InferenceSession.create(this.modelPath, {
        // OPT-1: Use DirectML GPU on Windows for 2-10x speedup, falls back to CPU
        executionProviders: process.platform === 'win32' ? ['dml', 'cpu'] : ['cpu'],
        graphOptimizationLevel: 'all',
      })

      // Parse tokenizer and extract special token mappings
      log.info('[LocalEmbeddingService] Loading tokenizer...')
      const tokenizerData = fs.readFileSync(this.tokenizerPath, 'utf-8')
      const tokenizer = JSON.parse(tokenizerData) as Record<string, unknown>

      // Extract special token IDs from tokenizer config if available
      const addedTokens = tokenizer.added_tokens as
        | Array<{ id: number; content: string }>
        | undefined
      if (addedTokens && Array.isArray(addedTokens)) {
        for (const token of addedTokens) {
          if (token.content && typeof token.id === 'number') {
            this.vocab.set(token.content, token.id)
          }
        }
        log.info(
          `[LocalEmbeddingService] Loaded ${addedTokens.length} special tokens from tokenizer`
        )
      }

      // Load vocabulary
      log.info('[LocalEmbeddingService] Loading vocabulary...')
      const vocabData = fs.readFileSync(this.vocabPath, 'utf-8')
      const vocabLines = vocabData.split('\n').filter(line => line.trim())
      vocabLines.forEach((token, index) => {
        this.vocab.set(token, index)
      })

      const loadTime = Date.now() - startTime
      log.info(`[LocalEmbeddingService] Initialized in ${loadTime}ms`)
      log.info(`[LocalEmbeddingService] Model: ${this.MODEL_NAME}`)
      log.info(`[LocalEmbeddingService] Dimensions: ${this.EMBEDDING_DIMENSIONS}`)
      log.info(`[LocalEmbeddingService] Vocabulary size: ${this.vocab.size}`)

      this.isInitialized = true
    } catch (error) {
      log.error('[LocalEmbeddingService] Initialization failed:', error)
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
      // Tokenize text using WordPiece
      const { inputIds: tokenIds, attentionMask: mask } = this.tokenize(text)

      // Create input tensors (lazy-load ort to avoid top-level require crash)
      const ort = await getOrt()
      const inputIds = new ort.Tensor('int64', BigInt64Array.from(tokenIds.map(t => BigInt(t))), [
        1,
        tokenIds.length,
      ])
      const attentionMask = new ort.Tensor('int64', BigInt64Array.from(mask.map(m => BigInt(m))), [
        1,
        mask.length,
      ])

      // Run inference
      const feeds = {
        input_ids: inputIds,
        attention_mask: attentionMask,
      }

      if (!this.session) throw new Error('ONNX session not initialized')
      const results = await this.session.run(feeds)
      const output = results['last_hidden_state']

      if (!output) {
        throw new Error('last_hidden_state missing from output')
      }

      // Mean pooling (excludes padding tokens via attention mask)
      const embedding = this.meanPooling(output.data as Float32Array, mask)

      // L2 normalization
      const normalizedEmbedding = this.normalize(embedding)

      const generationTimeMs = Math.max(1, Date.now() - startTime)

      return {
        embedding: normalizedEmbedding,
        dimensions: this.EMBEDDING_DIMENSIONS,
        model: this.MODEL_NAME,
        generationTimeMs,
      }
    } catch (error) {
      log.error('[LocalEmbeddingService] Embedding generation failed:', error)
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
      const aVal = a[i] ?? 0
      const bVal = b[i] ?? 0
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
      metadata?: Record<string, unknown>
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
   * Tokenize text using WordPiece subword tokenization
   * Properly splits unknown words into subword tokens (e.g., "unbelievable" → "un", "##believ", "##able")
   */
  private tokenize(text: string): { inputIds: number[]; attentionMask: number[] } {
    const inputIds: number[] = []
    const attentionMask: number[] = []

    // Add [CLS] token
    inputIds.push(this.vocab.get('[CLS]') || 101)
    attentionMask.push(1)

    // Tokenize text using WordPiece
    const words = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(w => w.length > 0)

    for (const word of words) {
      if (inputIds.length >= this.MAX_SEQUENCE_LENGTH - 1) break

      // Try full word first
      if (this.vocab.has(word)) {
        inputIds.push(this.vocab.get(word) ?? 100)
        attentionMask.push(1)
        continue
      }

      // WordPiece: try to break into subwords
      let remaining = word
      let isFirst = true
      while (remaining.length > 0 && inputIds.length < this.MAX_SEQUENCE_LENGTH - 1) {
        let matched = false
        for (let end = remaining.length; end > 0; end--) {
          const subword = isFirst ? remaining.substring(0, end) : '##' + remaining.substring(0, end)
          if (this.vocab.has(subword)) {
            inputIds.push(this.vocab.get(subword) ?? 100)
            attentionMask.push(1)
            remaining = remaining.substring(end)
            isFirst = false
            matched = true
            break
          }
        }
        if (!matched) {
          // Fall back to [UNK] for unrecognized character sequences
          inputIds.push(this.vocab.get('[UNK]') || 100)
          attentionMask.push(1)
          break
        }
      }
    }

    // Add [SEP] token
    inputIds.push(this.vocab.get('[SEP]') || 102)
    attentionMask.push(1)

    // Pad to max length (padding tokens get attention mask = 0)
    while (inputIds.length < this.MAX_SEQUENCE_LENGTH) {
      inputIds.push(0) // [PAD] token
      attentionMask.push(0) // Exclude from attention
    }

    return {
      inputIds: inputIds.slice(0, this.MAX_SEQUENCE_LENGTH),
      attentionMask: attentionMask.slice(0, this.MAX_SEQUENCE_LENGTH),
    }
  }

  /**
   * Mean pooling over token embeddings (excludes padding tokens)
   */
  private meanPooling(data: Float32Array, attentionMask: number[]): number[] {
    const embedding = new Array(this.EMBEDDING_DIMENSIONS).fill(0)

    // Count only non-padding tokens for averaging
    let activeTokenCount = 0
    const maxTokens = Math.min(
      attentionMask.length,
      Math.floor(data.length / this.EMBEDDING_DIMENSIONS)
    )

    for (let i = 0; i < maxTokens; i++) {
      if (attentionMask[i] !== 1) continue // Skip padding
      activeTokenCount++
      for (let j = 0; j < this.EMBEDDING_DIMENSIONS; j++) {
        const val = data[i * this.EMBEDDING_DIMENSIONS + j]
        if (val !== undefined && !isNaN(val)) {
          embedding[j] += val
        }
      }
    }

    const divisor = activeTokenCount > 0 ? activeTokenCount : 1
    for (let j = 0; j < this.EMBEDDING_DIMENSIONS; j++) {
      embedding[j] /= divisor
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
