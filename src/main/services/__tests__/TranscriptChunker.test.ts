import { TranscriptChunker, PlanTier } from '../TranscriptChunker'

describe('TranscriptChunker', () => {
  let chunker: TranscriptChunker

  beforeEach(() => {
    chunker = new TranscriptChunker()
  })

  describe('getEffectiveLimit', () => {
    it('should return 90% of Free tier limit (4500)', () => {
      const limit = chunker.getEffectiveLimit('free')

      expect(limit).toBe(4500) // 5000 * 0.9
    })

    it('should return 90% of Starter tier limit (9000)', () => {
      const limit = chunker.getEffectiveLimit('starter')

      expect(limit).toBe(9000) // 10000 * 0.9
    })

    it('should return 90% of Pro tier limit (22500)', () => {
      const limit = chunker.getEffectiveLimit('pro')

      expect(limit).toBe(22500) // 25000 * 0.9
    })

    it('should return 90% of Team tier limit (45000)', () => {
      const limit = chunker.getEffectiveLimit('team')

      expect(limit).toBe(45000) // 50000 * 0.9
    })

    it('should return 90% of Enterprise tier limit (90000)', () => {
      const limit = chunker.getEffectiveLimit('enterprise')

      expect(limit).toBe(90000) // 100000 * 0.9
    })
  })

  describe('getWarningThreshold', () => {
    it('should return 80% of Free tier limit (4000)', () => {
      const threshold = chunker.getWarningThreshold('free')

      expect(threshold).toBe(4000) // 5000 * 0.8
    })

    it('should return 80% of Starter tier limit (8000)', () => {
      const threshold = chunker.getWarningThreshold('starter')

      expect(threshold).toBe(8000) // 10000 * 0.8
    })

    it('should return 80% of Pro tier limit (20000)', () => {
      const threshold = chunker.getWarningThreshold('pro')

      expect(threshold).toBe(20000) // 25000 * 0.8
    })

    it('should return 80% of Team tier limit (40000)', () => {
      const threshold = chunker.getWarningThreshold('team')

      expect(threshold).toBe(40000) // 50000 * 0.8
    })

    it('should return 80% of Enterprise tier limit (80000)', () => {
      const threshold = chunker.getWarningThreshold('enterprise')

      expect(threshold).toBe(80000) // 100000 * 0.8
    })
  })

  describe('needsChunking', () => {
    it('should return false for content below effective limit', () => {
      const content = 'a'.repeat(4000) // Below 4500 limit

      const needs = chunker.needsChunking(content, 'free')

      expect(needs).toBe(false)
    })

    it('should return false for content at effective limit', () => {
      const content = 'a'.repeat(4500) // At 4500 limit

      const needs = chunker.needsChunking(content, 'free')

      expect(needs).toBe(false)
    })

    it('should return true for content above effective limit', () => {
      const content = 'a'.repeat(4501) // Above 4500 limit

      const needs = chunker.needsChunking(content, 'free')

      expect(needs).toBe(true)
    })

    it('should work for all tiers', () => {
      const tiers: PlanTier[] = ['free', 'starter', 'pro', 'team', 'enterprise']

      tiers.forEach(tier => {
        const limit = chunker.getEffectiveLimit(tier)
        const contentBelow = 'a'.repeat(limit - 1)
        const contentAbove = 'a'.repeat(limit + 1)

        expect(chunker.needsChunking(contentBelow, tier)).toBe(false)
        expect(chunker.needsChunking(contentAbove, tier)).toBe(true)
      })
    })
  })

  describe('isApproachingLimit', () => {
    it('should return false for content below warning threshold', () => {
      const content = 'a'.repeat(3000) // Below 4000 threshold

      const approaching = chunker.isApproachingLimit(content, 'free')

      expect(approaching).toBe(false)
    })

    it('should return true for content between warning and effective limit', () => {
      const content = 'a'.repeat(4200) // Between 4000 and 4500

      const approaching = chunker.isApproachingLimit(content, 'free')

      expect(approaching).toBe(true)
    })

    it('should return false for content above effective limit', () => {
      const content = 'a'.repeat(5000) // Above 4500 limit

      const approaching = chunker.isApproachingLimit(content, 'free')

      expect(approaching).toBe(false)
    })

    it('should work for all tiers', () => {
      const tiers: PlanTier[] = ['free', 'starter', 'pro', 'team', 'enterprise']

      tiers.forEach(tier => {
        const warning = chunker.getWarningThreshold(tier)
        const effective = chunker.getEffectiveLimit(tier)
        const contentInRange = 'a'.repeat(warning + 100)

        expect(chunker.isApproachingLimit(contentInRange, tier)).toBe(true)
      })
    })
  })

  describe('chunkTranscript', () => {
    it('should not chunk content below effective limit', () => {
      const content = 'a'.repeat(4000)

      const result = chunker.chunkTranscript(content, 'free')

      expect(result.needsChunking).toBe(false)
      expect(result.chunks).toHaveLength(1)
      expect(result.chunks[0].content).toBe(content)
      expect(result.chunkCount).toBe(1)
    })

    it('should chunk content above effective limit', () => {
      const content = 'a'.repeat(10000) // Above 4500 limit

      const result = chunker.chunkTranscript(content, 'free')

      expect(result.needsChunking).toBe(true)
      expect(result.chunks.length).toBeGreaterThan(1)
      expect(result.chunkCount).toBeGreaterThan(1)
    })

    it('should create correct number of chunks', () => {
      const content = 'a'.repeat(10000) // 10000 chars
      const effectiveLimit = 4500

      const result = chunker.chunkTranscript(content, 'free')

      const expectedChunks = Math.ceil(10000 / effectiveLimit)
      expect(result.chunkCount).toBe(expectedChunks)
      expect(result.chunks).toHaveLength(expectedChunks)
    })

    it('should set correct chunk metadata', () => {
      const content = 'a'.repeat(10000)

      const result = chunker.chunkTranscript(content, 'free', 'parent-123')

      result.chunks.forEach((chunk, index) => {
        expect(chunk.metadata.chunkIndex).toBe(index)
        expect(chunk.metadata.totalChunks).toBe(result.chunkCount)
        expect(chunk.metadata.parentId).toBe('parent-123')
        expect(chunk.metadata.originalSize).toBe(10000)
      })
    })

    it('should respect effective limit per chunk', () => {
      const content = 'a'.repeat(10000)
      const effectiveLimit = chunker.getEffectiveLimit('free')

      const result = chunker.chunkTranscript(content, 'free')

      result.chunks.forEach(chunk => {
        expect(chunk.content.length).toBeLessThanOrEqual(effectiveLimit)
      })
    })

    it('should preserve all content when reassembled', () => {
      const content = 'a'.repeat(10000)

      const result = chunker.chunkTranscript(content, 'free')

      const reassembled = result.chunks.map(c => c.content).join('')
      expect(reassembled).toBe(content)
    })

    it('should show warning message when approaching limit', () => {
      const content = 'a'.repeat(4200) // Between 4000 and 4500

      const result = chunker.chunkTranscript(content, 'free')

      expect(result.warningMessage).toBeDefined()
      expect(result.warningMessage).toContain('approaching')
      expect(result.warningMessage).toContain('FREE')
    })

    it('should show chunking message when chunked', () => {
      const content = 'a'.repeat(10000)

      const result = chunker.chunkTranscript(content, 'free')

      expect(result.warningMessage).toBeDefined()
      expect(result.warningMessage).toContain('exceeds')
      expect(result.warningMessage).toContain('chunks')
    })

    it('should work for all tiers', () => {
      const tiers: PlanTier[] = ['free', 'starter', 'pro', 'team', 'enterprise']

      tiers.forEach(tier => {
        const limit = chunker.getEffectiveLimit(tier)
        const content = 'a'.repeat(limit * 2) // 2x the limit

        const result = chunker.chunkTranscript(content, tier)

        expect(result.needsChunking).toBe(true)
        expect(result.chunks.length).toBeGreaterThan(1)
      })
    })

    it('should handle null parentId', () => {
      const content = 'a'.repeat(10000)

      const result = chunker.chunkTranscript(content, 'free', null)

      result.chunks.forEach(chunk => {
        expect(chunk.metadata.parentId).toBeNull()
      })
    })

    it('should set totalSize correctly', () => {
      const content = 'a'.repeat(10000)

      const result = chunker.chunkTranscript(content, 'free')

      expect(result.totalSize).toBe(10000)
    })
  })

  describe('reassembleChunks', () => {
    it('should reassemble chunks in correct order', () => {
      const content = 'a'.repeat(10000)
      const result = chunker.chunkTranscript(content, 'free')

      const reassembled = chunker.reassembleChunks(result.chunks)

      expect(reassembled).toBe(content)
    })

    it('should handle single chunk', () => {
      const content = 'a'.repeat(4000)
      const result = chunker.chunkTranscript(content, 'free')

      const reassembled = chunker.reassembleChunks(result.chunks)

      expect(reassembled).toBe(content)
    })

    it('should handle empty chunk array', () => {
      const reassembled = chunker.reassembleChunks([])

      expect(reassembled).toBe('')
    })

    it('should sort chunks by index before reassembling', () => {
      const content = 'a'.repeat(10000)
      const result = chunker.chunkTranscript(content, 'free')

      // Shuffle chunks
      const shuffled = [...result.chunks].reverse()

      const reassembled = chunker.reassembleChunks(shuffled)

      expect(reassembled).toBe(content)
    })

    it('should throw error if chunks are missing', () => {
      const content = 'a'.repeat(10000)
      const result = chunker.chunkTranscript(content, 'free')

      // Remove one chunk
      const incomplete = result.chunks.slice(0, -1)

      expect(() => chunker.reassembleChunks(incomplete)).toThrow('Missing chunks')
    })

    it('should throw error if chunk sequence is broken', () => {
      const content = 'a'.repeat(10000)
      const result = chunker.chunkTranscript(content, 'free')

      // Corrupt chunk index
      result.chunks[1].metadata.chunkIndex = 99

      expect(() => chunker.reassembleChunks(result.chunks)).toThrow('Chunk sequence error')
    })

    it('should preserve content exactly', () => {
      const content = 'The quick brown fox jumps over the lazy dog. '.repeat(200)
      const result = chunker.chunkTranscript(content, 'free')

      const reassembled = chunker.reassembleChunks(result.chunks)

      expect(reassembled).toBe(content)
      expect(reassembled.length).toBe(content.length)
    })
  })

  describe('getChunkingStatusMessage', () => {
    it('should return size message for non-chunked content', () => {
      const content = 'a'.repeat(3000)
      const result = chunker.chunkTranscript(content, 'free')

      const message = chunker.getChunkingStatusMessage(result, 'free')

      expect(message).toContain('3000')
      expect(message).toContain('5000')
    })

    it('should return warning message when approaching limit', () => {
      const content = 'a'.repeat(4200)
      const result = chunker.chunkTranscript(content, 'free')

      const message = chunker.getChunkingStatusMessage(result, 'free')

      expect(message).toContain('approaching')
    })

    it('should return chunk count message when chunked', () => {
      const content = 'a'.repeat(10000)
      const result = chunker.chunkTranscript(content, 'free')

      const message = chunker.getChunkingStatusMessage(result, 'free')

      expect(message).toContain('split')
      expect(message).toContain('chunks')
      expect(message).toContain('10000')
    })
  })

  describe('getUpgradePromptMessage', () => {
    it('should suggest Starter upgrade for Free tier', () => {
      const message = chunker.getUpgradePromptMessage('free')

      expect(message).toContain('Starter')
      expect(message).toContain('$9/mo')
      expect(message).toContain('10K')
    })

    it('should suggest Pro upgrade for Starter tier', () => {
      const message = chunker.getUpgradePromptMessage('starter')

      expect(message).toContain('Pro')
      expect(message).toContain('$19/mo')
      expect(message).toContain('25K')
    })

    it('should suggest Team upgrade for Pro tier', () => {
      const message = chunker.getUpgradePromptMessage('pro')

      expect(message).toContain('Team')
      expect(message).toContain('$29/seat/mo')
      expect(message).toContain('50K')
    })

    it('should suggest Enterprise upgrade for Team tier', () => {
      const message = chunker.getUpgradePromptMessage('team')

      expect(message).toContain('Enterprise')
      expect(message).toContain('100K')
    })

    it('should show current limit for Enterprise tier', () => {
      const message = chunker.getUpgradePromptMessage('enterprise')

      expect(message).toContain('100000')
    })
  })

  describe('getChunkProgress', () => {
    it('should return progress message', () => {
      const message = chunker.getChunkProgress(0, 3)

      expect(message).toBe('Syncing chunk 1/3...')
    })

    it('should handle different chunk indices', () => {
      expect(chunker.getChunkProgress(0, 5)).toBe('Syncing chunk 1/5...')
      expect(chunker.getChunkProgress(2, 5)).toBe('Syncing chunk 3/5...')
      expect(chunker.getChunkProgress(4, 5)).toBe('Syncing chunk 5/5...')
    })
  })

  describe('validateChunkMetadata', () => {
    it('should validate correct metadata', () => {
      const metadata = {
        chunkIndex: 0,
        totalChunks: 3,
        parentId: 'parent-123',
        originalSize: 10000,
      }

      const valid = chunker.validateChunkMetadata(metadata)

      expect(valid).toBe(true)
    })

    it('should reject negative chunk index', () => {
      const metadata = {
        chunkIndex: -1,
        totalChunks: 3,
        parentId: null,
        originalSize: 10000,
      }

      const valid = chunker.validateChunkMetadata(metadata)

      expect(valid).toBe(false)
    })

    it('should reject zero total chunks', () => {
      const metadata = {
        chunkIndex: 0,
        totalChunks: 0,
        parentId: null,
        originalSize: 10000,
      }

      const valid = chunker.validateChunkMetadata(metadata)

      expect(valid).toBe(false)
    })

    it('should reject chunk index >= total chunks', () => {
      const metadata = {
        chunkIndex: 3,
        totalChunks: 3,
        parentId: null,
        originalSize: 10000,
      }

      const valid = chunker.validateChunkMetadata(metadata)

      expect(valid).toBe(false)
    })

    it('should reject zero or negative original size', () => {
      const metadata = {
        chunkIndex: 0,
        totalChunks: 3,
        parentId: null,
        originalSize: 0,
      }

      const valid = chunker.validateChunkMetadata(metadata)

      expect(valid).toBe(false)
    })

    it('should accept null parentId', () => {
      const metadata = {
        chunkIndex: 0,
        totalChunks: 1,
        parentId: null,
        originalSize: 5000,
      }

      const valid = chunker.validateChunkMetadata(metadata)

      expect(valid).toBe(true)
    })
  })

  describe('getPlanLimits', () => {
    it('should return all plan limits', () => {
      const limits = chunker.getPlanLimits()

      expect(limits).toEqual({
        free: 5000,
        starter: 10000,
        pro: 25000,
        team: 50000,
        enterprise: 100000,
      })
    })

    it('should return a copy (not modify original)', () => {
      const limits = chunker.getPlanLimits()
      limits.free = 9999

      const limits2 = chunker.getPlanLimits()
      expect(limits2.free).toBe(5000)
    })
  })

  describe('getEffectiveLimits', () => {
    it('should return all effective limits (90% of raw)', () => {
      const limits = chunker.getEffectiveLimits()

      expect(limits).toEqual({
        free: 4500,
        starter: 9000,
        pro: 22500,
        team: 45000,
        enterprise: 90000,
      })
    })
  })

  describe('Real-world scenarios', () => {
    it('should handle typical meeting transcript (Free tier)', () => {
      const transcript = 'Meeting transcript content. '.repeat(150) // ~4200 chars

      const result = chunker.chunkTranscript(transcript, 'free')

      expect(result.needsChunking).toBe(false)
      expect(result.warningMessage).toBeDefined() // Approaching limit
    })

    it('should handle long meeting transcript (Free tier)', () => {
      const transcript = 'Meeting transcript content. '.repeat(300) // ~8400 chars

      const result = chunker.chunkTranscript(transcript, 'free')

      expect(result.needsChunking).toBe(true)
      expect(result.chunkCount).toBe(2)
    })

    it('should handle Pro tier with large transcript', () => {
      const transcript = 'Meeting transcript content. '.repeat(800) // ~22400 chars

      const result = chunker.chunkTranscript(transcript, 'pro')

      expect(result.needsChunking).toBe(false) // Within Pro limit
    })

    it('should handle Enterprise tier with very large transcript', () => {
      const transcript = 'Meeting transcript content. '.repeat(3000) // ~84000 chars

      const result = chunker.chunkTranscript(transcript, 'enterprise')

      expect(result.needsChunking).toBe(false) // Within Enterprise limit
    })

    it('should handle sync workflow with chunking', () => {
      const transcript = 'Meeting transcript content. '.repeat(300)

      // Chunk before sync
      const result = chunker.chunkTranscript(transcript, 'free', 'meeting-123')

      // Each chunk can be synced separately
      result.chunks.forEach((chunk, index) => {
        expect(chunk.metadata.parentId).toBe('meeting-123')
        expect(chunk.metadata.chunkIndex).toBe(index)

        // Progress message for UI
        const progress = chunker.getChunkProgress(index, result.chunkCount)
        expect(progress).toContain(`${index + 1}/${result.chunkCount}`)
      })

      // Reassemble after download
      const reassembled = chunker.reassembleChunks(result.chunks)
      expect(reassembled).toBe(transcript)
    })

    it('should handle tier upgrade scenario', () => {
      const transcript = 'Meeting transcript content. '.repeat(300) // ~8400 chars

      // Free tier: needs chunking
      const freeResult = chunker.chunkTranscript(transcript, 'free')
      expect(freeResult.needsChunking).toBe(true)

      // After upgrade to Starter: no chunking needed
      const starterResult = chunker.chunkTranscript(transcript, 'starter')
      expect(starterResult.needsChunking).toBe(false)
    })

    it('should show appropriate upgrade prompt', () => {
      const transcript = 'Meeting transcript content. '.repeat(300)

      const result = chunker.chunkTranscript(transcript, 'free')

      if (result.needsChunking) {
        const upgradeMessage = chunker.getUpgradePromptMessage('free')
        expect(upgradeMessage).toContain('Starter')
        expect(upgradeMessage).toContain('10K')
      }
    })
  })

  describe('Edge cases', () => {
    it('should handle empty content', () => {
      const result = chunker.chunkTranscript('', 'free')

      expect(result.needsChunking).toBe(false)
      expect(result.chunks).toHaveLength(1)
      expect(result.totalSize).toBe(0)
    })

    it('should handle single character', () => {
      const result = chunker.chunkTranscript('a', 'free')

      expect(result.needsChunking).toBe(false)
      expect(result.chunks).toHaveLength(1)
    })

    it('should handle content exactly at effective limit', () => {
      const content = 'a'.repeat(4500) // Exactly at Free tier effective limit

      const result = chunker.chunkTranscript(content, 'free')

      expect(result.needsChunking).toBe(false)
      expect(result.chunks).toHaveLength(1)
    })

    it('should handle content one char above effective limit', () => {
      const content = 'a'.repeat(4501) // One char above Free tier effective limit

      const result = chunker.chunkTranscript(content, 'free')

      expect(result.needsChunking).toBe(true)
      expect(result.chunks.length).toBeGreaterThan(1)
    })

    it('should handle very large content', () => {
      const content = 'a'.repeat(1000000) // 1M chars

      const result = chunker.chunkTranscript(content, 'enterprise')

      expect(result.needsChunking).toBe(true)
      expect(result.chunks.length).toBeGreaterThan(10)
    })
  })
})
