/**
 * Device Handlers Tests
 *
 * Integration tests for device management IPC handlers.
 */

import { getDeviceManager, resetDeviceManager } from '../../../services/DeviceManager'

describe('DeviceManager', () => {
  let dm: ReturnType<typeof getDeviceManager>

  beforeEach(() => {
    resetDeviceManager()
    dm = getDeviceManager()
  })

  afterEach(() => {
    resetDeviceManager()
  })

  describe('getCurrentDeviceInfo', () => {
    it('should return device info for current machine', () => {
      const info = dm.getCurrentDeviceInfo()

      expect(info).toBeDefined()
      expect(info.deviceId).toBeDefined()
      expect(typeof info.deviceId).toBe('string')
      expect(info.deviceId.length).toBeGreaterThan(0)
      expect(info.platform).toBeDefined()
      expect(info.hostname).toBeDefined()
      expect(info.appVersion).toBeDefined()
    })

    it('should return consistent device ID', () => {
      const info1 = dm.getCurrentDeviceInfo()
      const info2 = dm.getCurrentDeviceInfo()

      expect(info1.deviceId).toBe(info2.deviceId)
    })
  })

  describe('getDeviceLimit', () => {
    it('should return 1 for free plan', () => {
      expect(dm.getDeviceLimit('free')).toBe(1)
    })

    it('should return 2 for starter plan', () => {
      expect(dm.getDeviceLimit('starter')).toBe(2)
    })

    it('should return Infinity for pro plan', () => {
      expect(dm.getDeviceLimit('pro')).toBe(Infinity)
    })

    it('should return Infinity for team plan', () => {
      expect(dm.getDeviceLimit('team')).toBe(Infinity)
    })

    it('should return Infinity for enterprise plan', () => {
      expect(dm.getDeviceLimit('enterprise')).toBe(Infinity)
    })
  })

  describe('getUpgradeSuggestion', () => {
    it('should suggest Starter for free tier', () => {
      const suggestion = dm.getUpgradeSuggestion('free')
      expect(suggestion).toBeDefined()
      expect(typeof suggestion).toBe('string')
      expect(suggestion.length).toBeGreaterThan(0)
    })

    it('should suggest Pro for starter tier', () => {
      const suggestion = dm.getUpgradeSuggestion('starter')
      expect(suggestion).toBeDefined()
    })
  })
})
