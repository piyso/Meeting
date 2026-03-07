import { describe, it, expect, beforeEach, vi, Mock } from 'vitest'
import { CloudAccessManager } from '../CloudAccessManager'
import { KeyStorageService } from '../KeyStorageService'

// Mock KeyStorageService
vi.mock('../KeyStorageService')

// Mock navigator.onLine
Object.defineProperty(global.navigator, 'onLine', {
  writable: true,
  value: true,
})

describe('CloudAccessManager', () => {
  let manager: CloudAccessManager

  beforeEach(() => {
    manager = new CloudAccessManager()
    manager.clearCache()
    vi.clearAllMocks()

    // Default mocks
    ;(KeyStorageService.getAllUsers as Mock).mockResolvedValue(['user-123'])
    ;(KeyStorageService.getPlanTier as Mock).mockResolvedValue('pro')
    ;(KeyStorageService.getAccessToken as Mock).mockResolvedValue('valid-token')
    Object.defineProperty(global.navigator, 'onLine', { value: true, writable: true })
  })

  describe('hasCloudAccess', () => {
    it('should return true for Pro tier + online + logged in', async () => {
      const hasAccess = await manager.hasCloudAccess()

      expect(hasAccess).toBe(true)
    })

    it('should return false for Free tier', async () => {
      ;(KeyStorageService.getPlanTier as Mock).mockResolvedValue('free')

      const hasAccess = await manager.hasCloudAccess()

      expect(hasAccess).toBe(false)
    })

    it('should return false when offline', async () => {
      Object.defineProperty(global.navigator, 'onLine', { value: false, writable: true })

      const hasAccess = await manager.hasCloudAccess()

      expect(hasAccess).toBe(false)
    })

    it('should return false when not logged in', async () => {
      ;(KeyStorageService.getAllUsers as Mock).mockResolvedValue([])

      const hasAccess = await manager.hasCloudAccess()

      expect(hasAccess).toBe(false)
    })

    it('should return false when access token is missing', async () => {
      ;(KeyStorageService.getAccessToken as Mock).mockResolvedValue(null)

      const hasAccess = await manager.hasCloudAccess()

      expect(hasAccess).toBe(false)
    })

    it('should return false when access token is empty', async () => {
      ;(KeyStorageService.getAccessToken as Mock).mockResolvedValue('')

      const hasAccess = await manager.hasCloudAccess()

      expect(hasAccess).toBe(false)
    })

    it('should return true for Starter tier + online + logged in', async () => {
      ;(KeyStorageService.getPlanTier as Mock).mockResolvedValue('starter')

      const hasAccess = await manager.hasCloudAccess()

      expect(hasAccess).toBe(true)
    })

    it('should return true for Team tier + online + logged in', async () => {
      ;(KeyStorageService.getPlanTier as Mock).mockResolvedValue('team')

      const hasAccess = await manager.hasCloudAccess()

      expect(hasAccess).toBe(true)
    })

    it('should return true for Enterprise tier + online + logged in', async () => {
      ;(KeyStorageService.getPlanTier as Mock).mockResolvedValue('enterprise')

      const hasAccess = await manager.hasCloudAccess()

      expect(hasAccess).toBe(true)
    })
  })

  describe('getCloudAccessStatus', () => {
    it('should return "available" for Pro tier + online + logged in', async () => {
      const status = await manager.getCloudAccessStatus()

      expect(status).toEqual({
        hasAccess: true,
        reason: 'available',
        tier: 'pro',
        isOnline: true,
        isLoggedIn: true,
      })
    })

    it('should return "not_logged_in" when user not logged in', async () => {
      ;(KeyStorageService.getAllUsers as Mock).mockResolvedValue([])

      const status = await manager.getCloudAccessStatus()

      expect(status).toEqual({
        hasAccess: false,
        reason: 'not_logged_in',
        tier: 'free',
        isOnline: true,
        isLoggedIn: false,
      })
    })

    it('should return "free_tier" for Free tier users', async () => {
      ;(KeyStorageService.getPlanTier as Mock).mockResolvedValue('free')

      const status = await manager.getCloudAccessStatus()

      expect(status).toEqual({
        hasAccess: false,
        reason: 'free_tier',
        tier: 'free',
        isOnline: true,
        isLoggedIn: true,
      })
    })

    it('should return "offline" when no internet connectivity', async () => {
      Object.defineProperty(global.navigator, 'onLine', { value: false, writable: true })

      const status = await manager.getCloudAccessStatus()

      expect(status).toEqual({
        hasAccess: false,
        reason: 'offline',
        tier: 'pro',
        isOnline: false,
        isLoggedIn: true,
      })
    })

    it('should return "token_expired" when access token is invalid', async () => {
      ;(KeyStorageService.getAccessToken as Mock).mockResolvedValue(null)

      const status = await manager.getCloudAccessStatus()

      expect(status).toEqual({
        hasAccess: false,
        reason: 'token_expired',
        tier: 'pro',
        isOnline: true,
        isLoggedIn: true,
      })
    })

    it('should cache status for 1 minute', async () => {
      // First call
      await manager.getCloudAccessStatus()
      expect(KeyStorageService.getAllUsers).toHaveBeenCalledTimes(1)

      // Second call within cache TTL
      await manager.getCloudAccessStatus()
      expect(KeyStorageService.getAllUsers).toHaveBeenCalledTimes(1) // Not called again

      // Clear cache
      manager.clearCache()

      // Third call after cache clear
      await manager.getCloudAccessStatus()
      expect(KeyStorageService.getAllUsers).toHaveBeenCalledTimes(2)
    })
  })

  describe('getFeatureAccess', () => {
    it('should return Free tier features', async () => {
      ;(KeyStorageService.getPlanTier as Mock).mockResolvedValue('free')

      const features = await manager.getFeatureAccess()

      expect(features).toEqual({
        cloudAI: false,
        contextSessions: false,
        semanticSearch: false,
        crossMeetingQueries: false,
        knowledgeGraph: false,
        cloudSync: false,
        multiDevice: false,
        deviceLimit: 1,
        transcriptSizeLimit: 5000,
        monthlyAIQueries: 0,
        speakerDiarization: false,
        weeklyDigest: false,
        teamCollaboration: false,
        auditLogs: false,
      })
    })

    it('should return Starter tier features', async () => {
      ;(KeyStorageService.getPlanTier as Mock).mockResolvedValue('starter')

      const features = await manager.getFeatureAccess()

      expect(features).toEqual({
        cloudAI: true,
        contextSessions: true,
        semanticSearch: true,
        crossMeetingQueries: true,
        knowledgeGraph: true,
        cloudSync: true,
        multiDevice: true,
        deviceLimit: 2,
        transcriptSizeLimit: 10000,
        monthlyAIQueries: 50,
        speakerDiarization: false,
        weeklyDigest: false,
        teamCollaboration: false,
        auditLogs: false,
      })
    })

    it('should return Pro tier features', async () => {
      ;(KeyStorageService.getPlanTier as Mock).mockResolvedValue('pro')

      const features = await manager.getFeatureAccess()

      expect(features).toEqual({
        cloudAI: true,
        contextSessions: true,
        semanticSearch: true,
        crossMeetingQueries: true,
        knowledgeGraph: true,
        cloudSync: true,
        multiDevice: true,
        deviceLimit: Infinity,
        transcriptSizeLimit: 25000,
        monthlyAIQueries: Infinity,
        speakerDiarization: true,
        weeklyDigest: true,
        teamCollaboration: false,
        auditLogs: false,
      })
    })

    it('should return Team tier features', async () => {
      ;(KeyStorageService.getPlanTier as Mock).mockResolvedValue('team')

      const features = await manager.getFeatureAccess()

      expect(features).toEqual({
        cloudAI: true,
        contextSessions: true,
        semanticSearch: true,
        crossMeetingQueries: true,
        knowledgeGraph: true,
        cloudSync: true,
        multiDevice: true,
        deviceLimit: Infinity,
        transcriptSizeLimit: 50000,
        monthlyAIQueries: Infinity,
        speakerDiarization: true,
        weeklyDigest: true,
        teamCollaboration: true,
        auditLogs: false,
      })
    })

    it('should return Enterprise tier features', async () => {
      ;(KeyStorageService.getPlanTier as Mock).mockResolvedValue('enterprise')

      const features = await manager.getFeatureAccess()

      expect(features).toEqual({
        cloudAI: true,
        contextSessions: true,
        semanticSearch: true,
        crossMeetingQueries: true,
        knowledgeGraph: true,
        cloudSync: true,
        multiDevice: true,
        deviceLimit: Infinity,
        transcriptSizeLimit: 100000,
        monthlyAIQueries: Infinity,
        speakerDiarization: true,
        weeklyDigest: true,
        teamCollaboration: true,
        auditLogs: true,
      })
    })

    it('should disable cloud features when offline', async () => {
      Object.defineProperty(global.navigator, 'onLine', { value: false, writable: true })
      ;(KeyStorageService.getPlanTier as Mock).mockResolvedValue('pro')

      const features = await manager.getFeatureAccess()

      expect(features.cloudAI).toBe(false)
      expect(features.contextSessions).toBe(false)
      expect(features.cloudSync).toBe(false)
      // But local features still available
      expect(features.deviceLimit).toBe(Infinity)
      expect(features.transcriptSizeLimit).toBe(25000)
    })
  })

  describe('getStatusMessage', () => {
    it('should return cloud enabled message for Pro tier', async () => {
      const message = await manager.getStatusMessage()

      expect(message).toBe('☁️ Cloud intelligence enabled (PRO tier)')
    })

    it('should return local mode message when not logged in', async () => {
      ;(KeyStorageService.getAllUsers as Mock).mockResolvedValue([])

      const message = await manager.getStatusMessage()

      expect(message).toBe('💻 Local mode (not logged in)')
    })

    it('should return local mode message for Free tier', async () => {
      ;(KeyStorageService.getPlanTier as Mock).mockResolvedValue('free')

      const message = await manager.getStatusMessage()

      expect(message).toBe('💻 Local mode (Free tier)')
    })

    it('should return local mode message when offline', async () => {
      Object.defineProperty(global.navigator, 'onLine', { value: false, writable: true })

      const message = await manager.getStatusMessage()

      expect(message).toBe('💻 Local mode (offline)')
    })

    it('should return session expired message when token invalid', async () => {
      ;(KeyStorageService.getAccessToken as Mock).mockResolvedValue(null)

      const message = await manager.getStatusMessage()

      expect(message).toBe('⚠️ Session expired - please log in again')
    })
  })

  describe('isFeatureAvailable', () => {
    it('should return true for available boolean features', async () => {
      ;(KeyStorageService.getPlanTier as Mock).mockResolvedValue('pro')

      const available = await manager.isFeatureAvailable('cloudAI')

      expect(available).toBe(true)
    })

    it('should return false for unavailable boolean features', async () => {
      ;(KeyStorageService.getPlanTier as Mock).mockResolvedValue('free')

      const available = await manager.isFeatureAvailable('cloudAI')

      expect(available).toBe(false)
    })

    it('should return true for numeric features > 0', async () => {
      ;(KeyStorageService.getPlanTier as Mock).mockResolvedValue('starter')

      const available = await manager.isFeatureAvailable('monthlyAIQueries')

      expect(available).toBe(true)
    })

    it('should return false for numeric features = 0', async () => {
      ;(KeyStorageService.getPlanTier as Mock).mockResolvedValue('free')

      const available = await manager.isFeatureAvailable('monthlyAIQueries')

      expect(available).toBe(false)
    })
  })

  describe('updateUserTier', () => {
    it('should update tier and clear cache', async () => {
      // Initial call
      await manager.getCloudAccessStatus()
      expect(KeyStorageService.getAllUsers).toHaveBeenCalledTimes(1)

      // Update tier
      await manager.updateUserTier('user-123', 'enterprise')

      expect(KeyStorageService.storePlanTier).toHaveBeenCalledWith('user-123', 'enterprise')

      // Next call should not use cache
      await manager.getCloudAccessStatus()
      expect(KeyStorageService.getAllUsers).toHaveBeenCalledTimes(2)
    })
  })

  describe('clearCache', () => {
    it('should clear cached status', async () => {
      // First call
      await manager.getCloudAccessStatus()
      expect(KeyStorageService.getAllUsers).toHaveBeenCalledTimes(1)

      // Clear cache
      manager.clearCache()

      // Second call should fetch again
      await manager.getCloudAccessStatus()
      expect(KeyStorageService.getAllUsers).toHaveBeenCalledTimes(2)
    })
  })

  describe('Error handling', () => {
    it('should handle KeyStorageService errors gracefully', async () => {
      ;(KeyStorageService.getAllUsers as Mock).mockRejectedValue(new Error('Keytar error'))

      const status = await manager.getCloudAccessStatus()

      expect(status.isLoggedIn).toBe(false)
      expect(status.reason).toBe('not_logged_in')
    })

    it('should default to free tier on error', async () => {
      ;(KeyStorageService.getPlanTier as Mock).mockRejectedValue(new Error('Keytar error'))

      const status = await manager.getCloudAccessStatus()

      expect(status.tier).toBe('free')
    })

    it('should handle access token check errors', async () => {
      ;(KeyStorageService.getAccessToken as Mock).mockRejectedValue(new Error('Keytar error'))

      const status = await manager.getCloudAccessStatus()

      expect(status.reason).toBe('token_expired')
    })
  })

  describe('Real-world scenarios', () => {
    it('should handle user login flow', async () => {
      // Start not logged in
      ;(KeyStorageService.getAllUsers as Mock).mockResolvedValue([])

      let status = await manager.getCloudAccessStatus()
      expect(status.hasAccess).toBe(false)
      expect(status.reason).toBe('not_logged_in')

      // User logs in
      ;(KeyStorageService.getAllUsers as Mock).mockResolvedValue(['user-123'])
      ;(KeyStorageService.getPlanTier as Mock).mockResolvedValue('pro')
      ;(KeyStorageService.getAccessToken as Mock).mockResolvedValue('valid-token')
      manager.clearCache()

      status = await manager.getCloudAccessStatus()
      expect(status.hasAccess).toBe(true)
      expect(status.reason).toBe('available')
    })

    it('should handle offline to online transition', async () => {
      // Start offline
      Object.defineProperty(global.navigator, 'onLine', { value: false, writable: true })

      let status = await manager.getCloudAccessStatus()
      expect(status.hasAccess).toBe(false)
      expect(status.reason).toBe('offline')

      // Go online
      Object.defineProperty(global.navigator, 'onLine', { value: true, writable: true })
      manager.clearCache()

      status = await manager.getCloudAccessStatus()
      expect(status.hasAccess).toBe(true)
      expect(status.reason).toBe('available')
    })

    it('should handle tier upgrade flow', async () => {
      // Start with Free tier
      ;(KeyStorageService.getPlanTier as Mock).mockResolvedValue('free')

      let features = await manager.getFeatureAccess()
      expect(features.deviceLimit).toBe(1)
      expect(features.transcriptSizeLimit).toBe(5000)

      // Upgrade to Pro
      await manager.updateUserTier('user-123', 'pro')
      ;(KeyStorageService.getPlanTier as Mock).mockResolvedValue('pro')

      features = await manager.getFeatureAccess()
      expect(features.deviceLimit).toBe(Infinity)
      expect(features.transcriptSizeLimit).toBe(25000)
    })
  })
})
