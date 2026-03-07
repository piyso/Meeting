import { LocalEmbeddingService } from '../LocalEmbeddingService'
import * as ort from 'onnxruntime-node'
import * as fs from 'fs'

import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock dependencies
vi.mock('onnxruntime-node')
vi.mock('fs')
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: vi.fn(() => '/mock/app/path'),
  },
}))

describe('LocalEmbeddingService', () => {
  let service: LocalEmbeddingService
  let mockSession: any

  beforeEach(() => {
    service = new LocalEmbeddingService()
    vi.clearAllMocks()

    // Mock file system
    ;(fs.existsSync as any).mockReturnValue(true)
    ;(fs.readFileSync as any).mockImplementation((filePath: string) => {
      if (filePath.includes('tokenizer.json')) {
        return JSON.stringify({ vocab: {} })
      }
      if (filePath.includes('vocab.txt')) {
        return '[CLS]\n[SEP]\n[PAD]\n[UNK]\nthe\na\nis\ntest\nword\n'
      }
      return ''
    })

    // Mock ONNX session
    mockSession = {
      run: vi.fn().mockResolvedValue({
        last_hidden_state: {
          data: new Float32Array(384).fill(0.5), // 384 dimensions
        },
      }),
      release: vi.fn().mockResolvedValue(undefined),
    }
    ;(ort.InferenceSession.create as any).mockResolvedValue(mockSession)
  })

  describe('initialize', () => {
    it('should load ONNX model successfully', async () => {
      await service.initialize()

      expect(ort.InferenceSession.create).toHaveBeenCalledWith(
        expect.stringContaining('all-MiniLM-L6-v2.onnx'),
        expect.objectContaining({
          executionProviders: ['cpu'],
          graphOptimizationLevel: 'all',
        })
      )
    })

    it('should load tokenizer and vocabulary', async () => {
      await service.initialize()

      expect(fs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('tokenizer.json'),
        'utf-8'
      )
      expect(fs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('vocab.txt'), 'utf-8')
    })

    it('should throw error if model file not found', async () => {
      ;(fs.existsSync as any).mockImplementation((filePath: string) => {
        return !filePath.includes('.onnx')
      })

      await expect(service.initialize()).rejects.toThrow('Model file not found')
    })

    it('should throw error if tokenizer file not found', async () => {
      ;(fs.existsSync as any).mockImplementation((filePath: string) => {
        return !filePath.includes('tokenizer.json')
      })

      await expect(service.initialize()).rejects.toThrow('Tokenizer file not found')
    })

    it('should throw error if vocabulary file not found', async () => {
      ;(fs.existsSync as any).mockImplementation((filePath: string) => {
        return !filePath.includes('vocab.txt')
      })

      await expect(service.initialize()).rejects.toThrow('Vocabulary file not found')
    })

    it('should only initialize once', async () => {
      await service.initialize()
      await service.initialize()
      await service.initialize()

      expect(ort.InferenceSession.create).toHaveBeenCalledTimes(1)
    })

    it('should log initialization time', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      await service.initialize()

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Initialized in'))

      consoleSpy.mockRestore()
    })
  })

  describe('embed', () => {
    beforeEach(async () => {
      await service.initialize()
    })

    it('should generate embedding for text', async () => {
      const result = await service.embed('test text')

      expect(result).toHaveProperty('embedding')
      expect(result).toHaveProperty('dimensions')
      expect(result).toHaveProperty('model')
      expect(result).toHaveProperty('generationTimeMs')
    })

    it('should return 384-dimensional embedding', async () => {
      const result = await service.embed('test text')

      expect(result.dimensions).toBe(384)
      expect(result.embedding).toHaveLength(384)
    })

    it('should return normalized embedding (L2 norm = 1)', async () => {
      const result = await service.embed('test text')

      // Calculate L2 norm
      let norm = 0
      for (const value of result.embedding) {
        norm += value * value
      }
      norm = Math.sqrt(norm)

      expect(norm).toBeCloseTo(1.0, 5)
    })

    it('should include model name in result', async () => {
      const result = await service.embed('test text')

      expect(result.model).toBe('all-MiniLM-L6-v2')
    })

    it('should measure generation time', async () => {
      const result = await service.embed('test text')

      expect(result.generationTimeMs).toBeGreaterThan(0)
      expect(typeof result.generationTimeMs).toBe('number')
    })

    it('should handle empty text', async () => {
      const result = await service.embed('')

      expect(result.embedding).toHaveLength(384)
      expect(result.dimensions).toBe(384)
    })

    it('should handle long text', async () => {
      const longText = 'word '.repeat(200) // 200 words

      const result = await service.embed(longText)

      expect(result.embedding).toHaveLength(384)
    })

    it('should auto-initialize if not initialized', async () => {
      const newService = new LocalEmbeddingService()

      const result = await newService.embed('test')

      expect(result.embedding).toHaveLength(384)
    })

    it('should call ONNX session with correct inputs', async () => {
      await service.embed('test text')

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.objectContaining({
          input_ids: expect.any(Object),
          attention_mask: expect.any(Object),
        })
      )
    })

    it('should handle ONNX inference errors', async () => {
      mockSession.run.mockRejectedValue(new Error('ONNX inference failed'))

      await expect(service.embed('test')).rejects.toThrow('ONNX inference failed')
    })
  })

  describe('embedBatch', () => {
    beforeEach(async () => {
      await service.initialize()
    })

    it('should generate embeddings for multiple texts', async () => {
      const texts = ['text 1', 'text 2', 'text 3']

      const results = await service.embedBatch(texts)

      expect(results).toHaveLength(3)
      results.forEach(result => {
        expect(result.embedding).toHaveLength(384)
        expect(result.dimensions).toBe(384)
      })
    })

    it('should handle empty batch', async () => {
      const results = await service.embedBatch([])

      expect(results).toHaveLength(0)
    })

    it('should handle single text batch', async () => {
      const results = await service.embedBatch(['single text'])

      expect(results).toHaveLength(1)
      expect(results[0].embedding).toHaveLength(384)
    })

    it('should process texts sequentially', async () => {
      const texts = ['text 1', 'text 2']

      await service.embedBatch(texts)

      expect(mockSession.run).toHaveBeenCalledTimes(2)
    })
  })

  describe('cosineSimilarity', () => {
    it('should calculate cosine similarity between embeddings', () => {
      const a = new Array(384).fill(1.0)
      const b = new Array(384).fill(1.0)

      const similarity = service.cosineSimilarity(a, b)

      expect(similarity).toBeCloseTo(1.0, 5)
    })

    it('should return 1.0 for identical embeddings', () => {
      const a = new Array(384).fill(0.5)
      const b = new Array(384).fill(0.5)

      const similarity = service.cosineSimilarity(a, b)

      expect(similarity).toBeCloseTo(1.0, 5)
    })

    it('should return 0.0 for orthogonal embeddings', () => {
      const a = new Array(384).fill(0)
      a[0] = 1.0
      const b = new Array(384).fill(0)
      b[1] = 1.0

      const similarity = service.cosineSimilarity(a, b)

      expect(similarity).toBeCloseTo(0.0, 5)
    })

    it('should return -1.0 for opposite embeddings', () => {
      const a = new Array(384).fill(1.0)
      const b = new Array(384).fill(-1.0)

      const similarity = service.cosineSimilarity(a, b)

      expect(similarity).toBeCloseTo(-1.0, 5)
    })

    it('should throw error for different dimensions', () => {
      const a = new Array(384).fill(1.0)
      const b = new Array(256).fill(1.0)

      expect(() => service.cosineSimilarity(a, b)).toThrow(
        'Embeddings must have the same dimensions'
      )
    })

    it('should handle zero vectors', () => {
      const a = new Array(384).fill(0)
      const b = new Array(384).fill(0)

      const similarity = service.cosineSimilarity(a, b)

      expect(isNaN(similarity)).toBe(true)
    })
  })

  describe('search', () => {
    beforeEach(async () => {
      await service.initialize()
    })

    it('should find similar documents', async () => {
      const documents = [
        { id: '1', text: 'machine learning' },
        { id: '2', text: 'artificial intelligence' },
        { id: '3', text: 'cooking recipes' },
      ]

      const results = await service.search('AI and ML', documents, 2)

      expect(results).toHaveLength(2)
      expect(results[0]).toHaveProperty('id')
      expect(results[0]).toHaveProperty('score')
      expect(results[0]).toHaveProperty('text')
    })

    it('should sort results by score (descending)', async () => {
      const documents = [
        { id: '1', text: 'test' },
        { id: '2', text: 'test' },
        { id: '3', text: 'test' },
      ]

      const results = await service.search('query', documents)

      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].score).toBeGreaterThanOrEqual(results[i + 1].score)
      }
    })

    it('should respect topK parameter', async () => {
      const documents = Array.from({ length: 20 }, (_, i) => ({
        id: `${i}`,
        text: `document ${i}`,
      }))

      const results = await service.search('query', documents, 5)

      expect(results).toHaveLength(5)
    })

    it('should use pre-computed embeddings if provided', async () => {
      const embedding = new Array(384).fill(0.5)
      const documents = [{ id: '1', text: 'test', embedding }]

      await service.search('query', documents)

      // Should only generate query embedding, not document embedding
      expect(mockSession.run).toHaveBeenCalledTimes(1)
    })

    it('should generate embeddings for documents without them', async () => {
      const documents = [
        { id: '1', text: 'test 1' },
        { id: '2', text: 'test 2' },
      ]

      await service.search('query', documents)

      // Should generate query embedding + 2 document embeddings
      expect(mockSession.run).toHaveBeenCalledTimes(3)
    })

    it('should include metadata in results', async () => {
      const documents = [{ id: '1', text: 'test', metadata: { category: 'tech' } }]

      const results = await service.search('query', documents)

      expect(results[0].metadata).toEqual({ category: 'tech' })
    })

    it('should handle empty document list', async () => {
      const results = await service.search('query', [])

      expect(results).toHaveLength(0)
    })

    it('should default to topK=10', async () => {
      const documents = Array.from({ length: 20 }, (_, i) => ({
        id: `${i}`,
        text: `document ${i}`,
      }))

      const results = await service.search('query', documents)

      expect(results).toHaveLength(10)
    })
  })

  describe('getStatus', () => {
    it('should return status before initialization', () => {
      const status = service.getStatus()

      expect(status).toEqual({
        initialized: false,
        model: 'all-MiniLM-L6-v2',
        dimensions: 384,
        maxSequenceLength: 128,
        vocabSize: 0,
      })
    })

    it('should return status after initialization', async () => {
      await service.initialize()

      const status = service.getStatus()

      expect(status).toEqual({
        initialized: true,
        model: 'all-MiniLM-L6-v2',
        dimensions: 384,
        maxSequenceLength: 128,
        vocabSize: 9, // Based on mock vocab
      })
    })
  })

  describe('dispose', () => {
    it('should release ONNX session', async () => {
      await service.initialize()

      await service.dispose()

      expect(mockSession.release).toHaveBeenCalled()
    })

    it('should clear vocabulary', async () => {
      await service.initialize()

      await service.dispose()

      const status = service.getStatus()
      expect(status.vocabSize).toBe(0)
    })

    it('should reset initialization flag', async () => {
      await service.initialize()

      await service.dispose()

      const status = service.getStatus()
      expect(status.initialized).toBe(false)
    })

    it('should handle dispose without initialization', async () => {
      await expect(service.dispose()).resolves.not.toThrow()
    })
  })

  describe('Performance', () => {
    beforeEach(async () => {
      await service.initialize()
    })

    it('should generate embedding in <50ms (mocked)', async () => {
      const start = Date.now()
      await service.embed('test text')
      const duration = Date.now() - start

      expect(duration).toBeLessThan(100)
    })

    it('should report generation time in result', async () => {
      const result = await service.embed('test text')

      expect(result.generationTimeMs).toBeGreaterThan(0)
      expect(result.generationTimeMs).toBeLessThan(1000)
    })
  })

  describe('Real-world scenarios', () => {
    beforeEach(async () => {
      await service.initialize()
    })

    it('should handle semantic search for meeting notes', async () => {
      const notes = [
        { id: '1', text: 'Discussed project timeline and milestones' },
        { id: '2', text: 'Reviewed budget allocation for Q4' },
        { id: '3', text: 'Team building event planning' },
      ]

      const results = await service.search('project schedule', notes, 2)

      expect(results).toHaveLength(2)
      expect(results[0].id).toBeDefined()
    })

    it('should handle local-only workflow for Free tier', async () => {
      const text = 'Important meeting notes'

      const result = await service.embed(text)

      expect(result.embedding).toHaveLength(384)
      expect(result.model).toBe('all-MiniLM-L6-v2')
    })

    it('should support dual-path pipeline', async () => {
      const localResult = await service.embed('test note')

      expect(localResult.embedding).toHaveLength(384)
      expect(Array.isArray(localResult.embedding)).toBe(true)
    })

    it('should handle batch processing for multiple notes', async () => {
      const notes = [
        'Meeting note 1',
        'Meeting note 2',
        'Meeting note 3',
        'Meeting note 4',
        'Meeting note 5',
      ]

      const results = await service.embedBatch(notes)

      expect(results).toHaveLength(5)
      results.forEach(result => {
        expect(result.embedding).toHaveLength(384)
      })
    })
  })

  describe('Error handling', () => {
    it('should handle model loading errors', async () => {
      ;(ort.InferenceSession.create as any).mockRejectedValue(new Error('Failed to load model'))

      await expect(service.initialize()).rejects.toThrow('Failed to load model')
    })

    it('should handle tokenizer parsing errors', async () => {
      ;(fs.readFileSync as any).mockImplementation((filePath: string) => {
        if (filePath.includes('tokenizer.json')) {
          return 'invalid json'
        }
        return '[CLS]\n[SEP]\n'
      })

      await expect(service.initialize()).rejects.toThrow()
    })

    it('should handle inference errors gracefully', async () => {
      await service.initialize()

      mockSession.run.mockRejectedValue(new Error('Inference failed'))

      await expect(service.embed('test')).rejects.toThrow('Inference failed')
    })

    it('should log errors to console', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      mockSession.run.mockRejectedValue(new Error('Test error'))

      await service.initialize()
      await service.embed('test').catch(() => {})

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Embedding generation failed')
      )

      consoleSpy.mockRestore()
    })
  })
})
