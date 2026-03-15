/**
 * TranscriptChunker - Content size limit handling with automatic chunking
 *
 * Purpose:
 * - Enforce plan-based content size limits
 * - Automatically chunk large transcripts
 * - Maintain chunk relationships for reassembly
 * - Warn users when approaching limits
 *
 * Plan Limits:
 * - Free: 5K chars (4.5K with 10% safety buffer)
 * - Starter: 15K chars (13.5K with 10% safety buffer)
 * - Pro: 50K chars (45K with 10% safety buffer)
 * - Team: 100K chars (90K with 10% safety buffer)
 * - Enterprise: 100K chars (90K with 10% safety buffer)
 *
 * Integration:
 * - SyncManager: Automatic chunking before sync
 * - Database: Chunk relationship tracking
 * - UI: Chunking status display
 */

import { PlanTier } from './CloudAccessManager'

export interface ChunkMetadata {
  chunkIndex: number
  totalChunks: number
  parentId: string | null
  originalSize: number
}

export interface TranscriptChunk {
  content: string
  metadata: ChunkMetadata
}

export interface ChunkingResult {
  needsChunking: boolean
  chunks: TranscriptChunk[]
  totalSize: number
  chunkCount: number
  warningMessage?: string
}

export class TranscriptChunker {
  // Plan limits (characters) — must match TierMappingService.transcriptSize
  private readonly PLAN_LIMITS: Record<PlanTier, number> = {
    free: 5000,
    starter: 15000,
    pro: 50000,
    team: 100000,
    enterprise: 100000,
  }

  // Safety buffer (10% below limit)
  private readonly SAFETY_BUFFER = 0.9

  // Warning threshold (80% of limit)
  private readonly WARNING_THRESHOLD = 0.8

  /**
   * Get effective limit for a plan tier (with safety buffer)
   */
  getEffectiveLimit(tier: PlanTier): number {
    const rawLimit = this.PLAN_LIMITS[tier]
    return Math.floor(rawLimit * this.SAFETY_BUFFER)
  }

  /**
   * Get warning threshold for a plan tier
   */
  getWarningThreshold(tier: PlanTier): number {
    const rawLimit = this.PLAN_LIMITS[tier]
    return Math.floor(rawLimit * this.WARNING_THRESHOLD)
  }

  /**
   * Check if content needs chunking
   */
  needsChunking(content: string, tier: PlanTier): boolean {
    const effectiveLimit = this.getEffectiveLimit(tier)
    return content.length > effectiveLimit
  }

  /**
   * Check if content is approaching limit (warning)
   */
  isApproachingLimit(content: string, tier: PlanTier): boolean {
    const warningThreshold = this.getWarningThreshold(tier)
    return content.length > warningThreshold && content.length <= this.getEffectiveLimit(tier)
  }

  /**
   * Chunk transcript content based on plan tier
   * Returns array of chunks with metadata
   */
  chunkTranscript(content: string, tier: PlanTier, parentId: string | null = null): ChunkingResult {
    const totalSize = content.length
    const effectiveLimit = this.getEffectiveLimit(tier)
    const warningThreshold = this.getWarningThreshold(tier)

    // Check if chunking is needed
    if (totalSize <= effectiveLimit) {
      // Check if warning should be shown
      let warningMessage: string | undefined
      if (totalSize > warningThreshold) {
        const percentage = Math.round((totalSize / this.PLAN_LIMITS[tier]) * 100)
        warningMessage = `Meeting size approaching ${tier.toUpperCase()} tier limit (${totalSize} / ${this.PLAN_LIMITS[tier]} chars, ${percentage}%)`
      }

      return {
        needsChunking: false,
        chunks: [
          {
            content,
            metadata: {
              chunkIndex: 0,
              totalChunks: 1,
              parentId,
              originalSize: totalSize,
            },
          },
        ],
        totalSize,
        chunkCount: 1,
        warningMessage,
      }
    }

    // Calculate number of chunks needed
    const chunkCount = Math.ceil(totalSize / effectiveLimit)
    const chunks: TranscriptChunk[] = []

    // Split content into chunks at sentence/word boundaries
    for (let i = 0; i < chunkCount; i++) {
      const start = i === 0 ? 0 : chunks.reduce((acc, c) => acc + c.content.length, 0)
      let end = Math.min(start + effectiveLimit, totalSize)

      // For all chunks except the last, find the nearest sentence/word boundary
      if (end < totalSize) {
        // Try to find a sentence boundary (. ! ? followed by space or newline)
        const searchRegion = content.substring(Math.max(start, end - 200), end)
        const sentenceMatch = searchRegion.match(/.*[.!?\n]\s/)
        if (sentenceMatch && sentenceMatch.index !== undefined) {
          end = Math.max(start, end - 200) + sentenceMatch.index + sentenceMatch[0].length
        } else {
          // Fall back to nearest whitespace
          const lastSpace = content.lastIndexOf(' ', end)
          if (lastSpace > start) {
            end = lastSpace + 1
          }
        }
      }

      const chunkContent = content.substring(start, end)

      chunks.push({
        content: chunkContent,
        metadata: {
          chunkIndex: i,
          totalChunks: chunkCount,
          parentId,
          originalSize: totalSize,
        },
      })
    }

    return {
      needsChunking: true,
      chunks,
      totalSize,
      chunkCount,
      warningMessage: `Meeting size exceeds ${tier.toUpperCase()} tier limit. Split into ${chunkCount} chunks.`,
    }
  }

  /**
   * Reassemble chunks back into original content
   * Chunks must be sorted by chunkIndex
   */
  reassembleChunks(chunks: TranscriptChunk[]): string {
    if (chunks.length === 0) {
      return ''
    }

    // Sort chunks by index
    const sortedChunks = [...chunks].sort((a, b) => a.metadata.chunkIndex - b.metadata.chunkIndex)

    // Validate chunk sequence
    const firstChunk = sortedChunks[0]
    if (!firstChunk) {
      return ''
    }
    const totalChunks = firstChunk.metadata.totalChunks
    if (sortedChunks.length !== totalChunks) {
      throw new Error(`Missing chunks: expected ${totalChunks}, got ${sortedChunks.length}`)
    }

    for (let i = 0; i < sortedChunks.length; i++) {
      const chunk = sortedChunks[i]
      if (chunk && chunk.metadata.chunkIndex !== i) {
        throw new Error(
          `Chunk sequence error: expected index ${i}, got ${chunk.metadata.chunkIndex}`
        )
      }
    }

    // Reassemble content
    return sortedChunks.map(chunk => chunk.content).join('')
  }

  /**
   * Get chunking status message for UI
   */
  getChunkingStatusMessage(result: ChunkingResult, tier: PlanTier): string {
    if (!result.needsChunking) {
      if (result.warningMessage) {
        return result.warningMessage
      }
      return `Meeting size: ${result.totalSize} / ${this.PLAN_LIMITS[tier]} chars`
    }

    return `Meeting split into ${result.chunkCount} chunks (${result.totalSize} chars total)`
  }

  /**
   * Get upgrade prompt message when limit exceeded
   */
  async getUpgradePromptMessage(tier: PlanTier): Promise<string> {
    try {
      const { getUpgradeMessage } = await import('./TierMappingService')
      return getUpgradeMessage(tier) || `Current limit: ${this.PLAN_LIMITS[tier]} chars`
    } catch {
      return `Current limit: ${this.PLAN_LIMITS[tier]} chars`
    }
  }

  /**
   * Calculate chunk progress for UI (e.g., "Syncing chunk 2/3...")
   */
  getChunkProgress(chunkIndex: number, totalChunks: number): string {
    return `Syncing chunk ${chunkIndex + 1}/${totalChunks}...`
  }

  /**
   * Validate chunk metadata
   */
  validateChunkMetadata(metadata: ChunkMetadata): boolean {
    return (
      metadata.chunkIndex >= 0 &&
      metadata.totalChunks > 0 &&
      metadata.chunkIndex < metadata.totalChunks &&
      metadata.originalSize > 0
    )
  }

  /**
   * Get plan tier limits for display
   */
  getPlanLimits(): Record<PlanTier, number> {
    return { ...this.PLAN_LIMITS }
  }

  /**
   * Get effective limits (with safety buffer) for display
   */
  getEffectiveLimits(): Record<PlanTier, number> {
    const limits: Partial<Record<PlanTier, number>> = {}
    for (const tier of Object.keys(this.PLAN_LIMITS) as PlanTier[]) {
      limits[tier] = this.getEffectiveLimit(tier)
    }
    return limits as Record<PlanTier, number>
  }
}

// Singleton instance
let instance: TranscriptChunker | null = null

export function getTranscriptChunker(): TranscriptChunker {
  if (!instance) {
    instance = new TranscriptChunker()
  }
  return instance
}
