/**
 * CloudAccessManager - Tier-based feature access control
 *
 * Purpose:
 * - Determine if user has cloud access based on tier and connectivity
 * - Implement dual-path logic: cloud vs local processing
 * - Feature gating for Free/Starter/Pro/Team/Enterprise tiers
 *
 * Integration:
 * - Context Sessions API (Task 24.2)
 * - Local Embedding Service (Task 26.7)
 * - Entity Extraction
 * - Note Expansion
 *
 * Tier Features:
 * - Free: Local-only (no cloud access)
 * - Starter/Pro/Team/Enterprise: Cloud access when online
 */

import { KeyStorageService } from './KeyStorageService'
import { Logger } from './Logger'
const log = Logger.create('CloudAccess')

export type PlanTier = 'free' | 'starter' | 'pro' | 'team' | 'enterprise'

export type CloudAccessReason =
  | 'available' // Cloud access available
  | 'not_logged_in' // User not logged in
  | 'free_tier' // Free tier (local-only)
  | 'offline' // No internet connectivity
  | 'token_expired' // Access token expired

export interface CloudAccessStatus {
  hasAccess: boolean
  reason: CloudAccessReason
  tier: PlanTier
  isOnline: boolean
  isLoggedIn: boolean
}

export interface FeatureAccess {
  // Intelligence features
  cloudAI: boolean // Cloud AI for note expansion
  contextSessions: boolean // PiyAPI Context Sessions API
  semanticSearch: boolean // Cloud semantic search
  hybridSearch: boolean // Cloud hybrid search (semantic + keyword — Pro+ only)
  crossMeetingQueries: boolean // AI queries across meetings
  knowledgeGraph: boolean // Knowledge graph visualization (read-only for Starter)
  knowledgeGraphInteractive: boolean // Interactive KG features (Pro+ only)

  // Sync features
  cloudSync: boolean // Sync to cloud
  multiDevice: boolean // Multi-device sync
  deviceLimit: number // Max devices (2 for Starter, unlimited for Pro+)

  // Content limits
  transcriptSizeLimit: number // Max transcript size per meeting (chars)
  monthlyAIQueries: number // AI query limit per month

  // Advanced features
  speakerDiarization: boolean // Speaker identification
  weeklyDigest: boolean // Weekly summary generation
  teamCollaboration: boolean // Team sharing and collaboration
  auditLogs: boolean // Audit logging (Enterprise only)
}

export class CloudAccessManager {
  // private keyStorage: KeyStorageService (removed)
  private cachedStatus: CloudAccessStatus | null = null
  private cacheExpiry: number = 0
  private readonly CACHE_TTL = 60000 // 1 minute cache

  constructor() {
    // KeyStorageService now uses static methods
  }

  /**
   * Check if user has cloud access
   * Returns true if user is logged in, has paid tier, and is online
   */
  async hasCloudAccess(): Promise<boolean> {
    const status = await this.getCloudAccessStatus()
    return status.hasAccess
  }

  /**
   * Get detailed cloud access status
   * Includes reason for access/denial and tier information
   */
  async getCloudAccessStatus(): Promise<CloudAccessStatus> {
    // Return cached status if still valid
    if (this.cachedStatus && Date.now() < this.cacheExpiry) {
      return this.cachedStatus
    }

    // Check internet connectivity (main process — no navigator.onLine)
    let isOnline = true
    try {
      const { net } = await import('electron')
      isOnline = net.isOnline()
    } catch {
      // net module unavailable (test env) — assume online
      isOnline = true
    }

    // Check if user is logged in (has access token)
    const userId = await this.getCurrentUserId()
    const isLoggedIn = userId !== null

    if (!isLoggedIn) {
      const status: CloudAccessStatus = {
        hasAccess: false,
        reason: 'not_logged_in',
        tier: 'free',
        isOnline,
        isLoggedIn: false,
      }
      this.cacheStatus(status)
      return status
    }

    // Get user's plan tier
    const tier = await this.getUserTier(userId)

    // Free tier users don't get cloud access
    if (tier === 'free') {
      const status: CloudAccessStatus = {
        hasAccess: false,
        reason: 'free_tier',
        tier,
        isOnline,
        isLoggedIn: true,
      }
      this.cacheStatus(status)
      return status
    }

    // Check if offline
    if (!isOnline) {
      const status: CloudAccessStatus = {
        hasAccess: false,
        reason: 'offline',
        tier,
        isOnline: false,
        isLoggedIn: true,
      }
      this.cacheStatus(status)
      return status
    }

    // Check if access token is valid
    const hasValidToken = await this.hasValidAccessToken(userId)
    if (!hasValidToken) {
      const status: CloudAccessStatus = {
        hasAccess: false,
        reason: 'token_expired',
        tier,
        isOnline: true,
        isLoggedIn: true,
      }
      this.cacheStatus(status)
      return status
    }

    // All checks passed - cloud access available
    const status: CloudAccessStatus = {
      hasAccess: true,
      reason: 'available',
      tier,
      isOnline: true,
      isLoggedIn: true,
    }
    this.cacheStatus(status)
    return status
  }

  /**
   * Get feature access based on user's tier
   *
   * All limits and features are imported from TierMappingService
   * (the single source of truth for BlueArkive pricing).
   */
  async getFeatureAccess(): Promise<FeatureAccess> {
    const status = await this.getCloudAccessStatus()
    const { getTierLimits, isUnlimited } = await import('./TierMappingService')
    const limits = getTierLimits(status.tier)

    // Free tier has no cloud access regardless of online status
    const hasCloud = limits.cloudSync && status.hasAccess

    return {
      cloudAI: limits.cloudAI && status.hasAccess,
      contextSessions: limits.cloudAI && status.hasAccess,
      semanticSearch: limits.cloudAI && status.hasAccess,
      hybridSearch: limits.hybridSearch && status.hasAccess,
      crossMeetingQueries: limits.cloudAI && status.hasAccess,
      knowledgeGraph: limits.knowledgeGraph && status.hasAccess,
      knowledgeGraphInteractive: limits.knowledgeGraphInteractive && status.hasAccess,
      cloudSync: hasCloud,
      multiDevice: limits.deviceLimit !== 1,
      deviceLimit: isUnlimited(limits.deviceLimit) ? Infinity : limits.deviceLimit,
      transcriptSizeLimit: limits.transcriptSize,
      monthlyAIQueries: isUnlimited(limits.monthlyAIQueries) ? Infinity : limits.monthlyAIQueries,
      speakerDiarization: limits.speakerDiarization,
      weeklyDigest: limits.weeklyDigest,
      teamCollaboration: limits.teamCollaboration,
      auditLogs: limits.auditLogs,
    }
  }

  /**
   * Get user-friendly status message
   */
  async getStatusMessage(): Promise<string> {
    const status = await this.getCloudAccessStatus()

    if (status.hasAccess) {
      return `☁️ Cloud intelligence enabled (${status.tier.toUpperCase()} tier)`
    }

    switch (status.reason) {
      case 'not_logged_in':
        return '💻 Local mode (not logged in)'
      case 'free_tier':
        return '💻 Local mode (Free tier)'
      case 'offline':
        return '💻 Local mode (offline)'
      case 'token_expired':
        return '⚠️ Session expired - please log in again'
      default:
        return '💻 Local mode'
    }
  }

  /**
   * Check if feature is available for current user
   */
  async isFeatureAvailable(feature: keyof FeatureAccess): Promise<boolean> {
    const access = await this.getFeatureAccess()
    const value = access[feature]

    // Handle boolean features
    if (typeof value === 'boolean') {
      return value
    }

    // Handle numeric features (limits)
    if (typeof value === 'number') {
      return value > 0
    }

    return false
  }

  /**
   * Get current user ID from keytar
   */
  private async getCurrentUserId(): Promise<string | null> {
    try {
      // Try to get access token to determine if user is logged in
      const users = await KeyStorageService.getAllUsers()
      if (users.length === 0) {
        return null
      }

      // Return first user (single-user app for now)
      return users[0] || null
    } catch (error) {
      log.error('[CloudAccessManager] Failed to get current user:', error)
      return null
    }
  }

  /**
   * Get user's plan tier from keytar
   */
  private async getUserTier(userId: string): Promise<PlanTier> {
    try {
      const tier = await KeyStorageService.getPlanTier(userId)
      return (tier as PlanTier) || 'free'
    } catch (error) {
      log.error('[CloudAccessManager] Failed to get user tier:', error)
      return 'free'
    }
  }

  /**
   * Check if user has valid access token
   */
  private async hasValidAccessToken(userId: string): Promise<boolean> {
    try {
      const token = await KeyStorageService.getAccessToken(userId)
      return token !== null && token.length > 0
    } catch (error) {
      log.error('[CloudAccessManager] Failed to check access token:', error)
      return false
    }
  }

  /**
   * Cache status for performance
   */
  private cacheStatus(status: CloudAccessStatus): void {
    this.cachedStatus = status
    this.cacheExpiry = Date.now() + this.CACHE_TTL
  }

  /**
   * Clear cached status (call after login/logout)
   */
  clearCache(): void {
    this.cachedStatus = null
    this.cacheExpiry = 0
  }

  /**
   * Update user tier (call after subscription change)
   */
  async updateUserTier(userId: string, tier: PlanTier): Promise<void> {
    await KeyStorageService.storePlanTier(userId, tier)
    this.clearCache()
  }
}

// Singleton instance
let instance: CloudAccessManager | null = null

export function getCloudAccessManager(): CloudAccessManager {
  if (!instance) {
    instance = new CloudAccessManager()
  }
  return instance
}
