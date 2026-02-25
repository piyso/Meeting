import { DeviceManager } from '../DeviceManager'
import { getDatabase } from '../../database/connection'
import { v4 as uuidv4 } from 'uuid'
import os from 'os'

describe('DeviceManager', () => {
  let manager: DeviceManager
  let testUserId: string

  beforeEach(async () => {
    manager = new DeviceManager()
    testUserId = `test-user-${uuidv4()}`

    // Clean up any existing test devices
    const db = getDatabase()
    db.prepare('DELETE FROM devices WHERE user_id LIKE ?').run('test-user-%')
  })

  afterEach(() => {
    // Clean up test data
    const db = getDatabase()
    db.prepare('DELETE FROM devices WHERE user_id LIKE ?').run('test-user-%')
  })

  describe('registerDevice', () => {
    it('should register first device successfully', async () => {
      const result = await manager.registerDevice(testUserId, 'My MacBook Pro', 'free')

      expect(result.success).toBe(true)
      expect(result.device).toBeDefined()
      expect(result.device?.device_name).toBe('My MacBook Pro')
      expect(result.device?.user_id).toBe(testUserId)
      expect(result.device?.is_active).toBe(true)
      expect(result.limitReached).toBe(false)
      expect(result.currentDeviceCount).toBe(1)
      expect(result.maxDevices).toBe(1)
    })

    it('should enforce Free tier limit (1 device)', async () => {
      // Register first device
      await manager.registerDevice(testUserId, 'Device 1', 'free')

      // Try to register second device
      const result = await manager.registerDevice(testUserId, 'Device 2', 'free')

      expect(result.success).toBe(false)
      expect(result.limitReached).toBe(true)
      expect(result.currentDeviceCount).toBe(1)
      expect(result.maxDevices).toBe(1)
      expect(result.device).toBeUndefined()
    })

    it('should enforce Starter tier limit (2 devices)', async () => {
      // Register first device
      await manager.registerDevice(testUserId, 'Device 1', 'starter')

      // Register second device - should succeed
      const result2 = await manager.registerDevice(testUserId, 'Device 2', 'starter')
      expect(result2.success).toBe(true)
      expect(result2.limitReached).toBe(false)

      // Try to register third device - should fail
      const result3 = await manager.registerDevice(testUserId, 'Device 3', 'starter')
      expect(result3.success).toBe(false)
      expect(result3.limitReached).toBe(true)
      expect(result3.currentDeviceCount).toBe(2)
      expect(result3.maxDevices).toBe(2)
    })

    it('should allow unlimited devices for Pro tier', async () => {
      // Register 10 devices
      for (let i = 1; i <= 10; i++) {
        const result = await manager.registerDevice(testUserId, `Device ${i}`, 'pro')
        expect(result.success).toBe(true)
        expect(result.limitReached).toBe(false)
      }

      const devices = await manager.getDevices(testUserId)
      expect(devices.length).toBe(10)
    })

    it('should allow unlimited devices for Team tier', async () => {
      // Register 5 devices
      for (let i = 1; i <= 5; i++) {
        const result = await manager.registerDevice(testUserId, `Device ${i}`, 'team')
        expect(result.success).toBe(true)
        expect(result.limitReached).toBe(false)
      }

      const devices = await manager.getDevices(testUserId)
      expect(devices.length).toBe(5)
    })

    it('should allow unlimited devices for Enterprise tier', async () => {
      // Register 5 devices
      for (let i = 1; i <= 5; i++) {
        const result = await manager.registerDevice(testUserId, `Device ${i}`, 'enterprise')
        expect(result.success).toBe(true)
        expect(result.limitReached).toBe(false)
      }

      const devices = await manager.getDevices(testUserId)
      expect(devices.length).toBe(5)
    })

    it('should auto-generate device name if not provided', async () => {
      const result = await manager.registerDevice(testUserId, undefined, 'free')

      expect(result.success).toBe(true)
      expect(result.device?.device_name).toContain(os.hostname())
    })

    it('should store device metadata', async () => {
      const result = await manager.registerDevice(testUserId, 'Test Device', 'free')

      expect(result.device?.platform).toBe(os.platform())
      expect(result.device?.hostname).toBe(os.hostname())
      expect(result.device?.app_version).toBeDefined()
      expect(result.device?.created_at).toBeDefined()
      expect(result.device?.updated_at).toBeDefined()
    })
  })

  describe('getDevices', () => {
    it('should return all devices for user', async () => {
      await manager.registerDevice(testUserId, 'Device 1', 'pro')
      await manager.registerDevice(testUserId, 'Device 2', 'pro')
      await manager.registerDevice(testUserId, 'Device 3', 'pro')

      const devices = await manager.getDevices(testUserId)

      expect(devices.length).toBe(3)
      expect(devices[0].device_name).toBe('Device 1')
      expect(devices[1].device_name).toBe('Device 2')
      expect(devices[2].device_name).toBe('Device 3')
    })

    it('should return empty array for user with no devices', async () => {
      const devices = await manager.getDevices('nonexistent-user')

      expect(devices).toEqual([])
    })

    it('should only return active devices by default', async () => {
      const result1 = await manager.registerDevice(testUserId, 'Device 1', 'pro')
      await manager.registerDevice(testUserId, 'Device 2', 'pro')

      // Deactivate first device
      await manager.deactivateDevice(result1.device!.id, testUserId)

      const devices = await manager.getDevices(testUserId)

      expect(devices.length).toBe(1)
      expect(devices[0].device_name).toBe('Device 2')
    })

    it('should return all devices including inactive when specified', async () => {
      const result1 = await manager.registerDevice(testUserId, 'Device 1', 'pro')
      await manager.registerDevice(testUserId, 'Device 2', 'pro')

      // Deactivate first device
      await manager.deactivateDevice(result1.device!.id, testUserId)

      const devices = await manager.getDevices(testUserId, false)

      expect(devices.length).toBe(2)
    })
  })

  describe('getDeviceCount', () => {
    it('should return correct count of active devices', async () => {
      await manager.registerDevice(testUserId, 'Device 1', 'pro')
      await manager.registerDevice(testUserId, 'Device 2', 'pro')

      const count = await manager.getDeviceCount(testUserId)

      expect(count).toBe(2)
    })

    it('should return 0 for user with no devices', async () => {
      const count = await manager.getDeviceCount('nonexistent-user')

      expect(count).toBe(0)
    })

    it('should not count inactive devices', async () => {
      const result1 = await manager.registerDevice(testUserId, 'Device 1', 'pro')
      await manager.registerDevice(testUserId, 'Device 2', 'pro')

      // Deactivate first device
      await manager.deactivateDevice(result1.device!.id, testUserId)

      const count = await manager.getDeviceCount(testUserId)

      expect(count).toBe(1)
    })
  })

  describe('deactivateDevice', () => {
    it('should deactivate device', async () => {
      const result = await manager.registerDevice(testUserId, 'Test Device', 'free')
      const deviceId = result.device!.id

      await manager.deactivateDevice(deviceId, testUserId)

      const devices = await manager.getDevices(testUserId)
      expect(devices.length).toBe(0)

      const allDevices = await manager.getDevices(testUserId, false)
      expect(allDevices.length).toBe(1)
      expect(allDevices[0].is_active).toBe(false)
    })

    it('should allow registering new device after deactivation', async () => {
      // Register device on Free tier
      const result1 = await manager.registerDevice(testUserId, 'Device 1', 'free')

      // Try to register second device - should fail
      const result2 = await manager.registerDevice(testUserId, 'Device 2', 'free')
      expect(result2.success).toBe(false)

      // Deactivate first device
      await manager.deactivateDevice(result1.device!.id, testUserId)

      // Now should be able to register new device
      const result3 = await manager.registerDevice(testUserId, 'Device 3', 'free')
      expect(result3.success).toBe(true)
    })
  })

  describe('reactivateDevice', () => {
    it('should reactivate deactivated device', async () => {
      const result = await manager.registerDevice(testUserId, 'Test Device', 'pro')
      const deviceId = result.device!.id

      await manager.deactivateDevice(deviceId, testUserId)
      await manager.reactivateDevice(deviceId, testUserId)

      const devices = await manager.getDevices(testUserId)
      expect(devices.length).toBe(1)
      expect(devices[0].is_active).toBe(true)
    })

    it('should respect device limits when reactivating', async () => {
      // Register device on Free tier
      const result1 = await manager.registerDevice(testUserId, 'Device 1', 'free')

      // Deactivate it
      await manager.deactivateDevice(result1.device!.id, testUserId)

      // Register new device
      await manager.registerDevice(testUserId, 'Device 2', 'free')

      // Try to reactivate first device - should fail due to limit
      const reactivateResult = await manager.reactivateDevice(result1.device!.id, testUserId)
      expect(reactivateResult.success).toBe(false)
      expect(reactivateResult.limitReached).toBe(true)
    })
  })

  describe('deleteDevice', () => {
    it('should permanently delete device', async () => {
      const result = await manager.registerDevice(testUserId, 'Test Device', 'free')
      const deviceId = result.device!.id

      await manager.deleteDevice(deviceId, testUserId)

      const allDevices = await manager.getDevices(testUserId, false)
      expect(allDevices.length).toBe(0)
    })

    it('should allow registering new device after deletion', async () => {
      // Register device on Free tier
      const result1 = await manager.registerDevice(testUserId, 'Device 1', 'free')

      // Delete it
      await manager.deleteDevice(result1.device!.id, testUserId)

      // Should be able to register new device
      const result2 = await manager.registerDevice(testUserId, 'Device 2', 'free')
      expect(result2.success).toBe(true)
    })
  })

  describe('updateLastSync', () => {
    it('should update last sync timestamp', async () => {
      const result = await manager.registerDevice(testUserId, 'Test Device', 'free')
      const deviceId = result.device!.id

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100))

      await manager.updateLastSync(deviceId, testUserId)

      const devices = await manager.getDevices(testUserId)
      expect(devices[0].last_sync_at).not.toBe(result.device!.last_sync_at)
    })
  })

  describe('renameDevice', () => {
    it('should rename device', async () => {
      const result = await manager.registerDevice(testUserId, 'Old Name', 'free')
      const deviceId = result.device!.id

      await manager.renameDevice(deviceId, testUserId, 'New Name')

      const devices = await manager.getDevices(testUserId)
      expect(devices[0].device_name).toBe('New Name')
    })
  })

  describe('getCurrentDevice', () => {
    it('should return current device info', async () => {
      const result = await manager.registerDevice(testUserId, 'Test Device', 'free')
      const deviceId = result.device!.id

      const device = await manager.getCurrentDevice(deviceId, testUserId)

      expect(device).toBeDefined()
      expect(device?.id).toBe(deviceId)
      expect(device?.device_name).toBe('Test Device')
    })

    it('should return undefined for nonexistent device', async () => {
      const device = await manager.getCurrentDevice('nonexistent-id', testUserId)

      expect(device).toBeUndefined()
    })
  })

  describe('Device Wall scenarios', () => {
    it('should trigger Device Wall for Free tier at 2nd device', async () => {
      await manager.registerDevice(testUserId, 'Device 1', 'free')

      const result = await manager.registerDevice(testUserId, 'Device 2', 'free')

      expect(result.limitReached).toBe(true)
      expect(result.message).toContain('Device limit reached')
      expect(result.message).toContain('Upgrade to Starter')
    })

    it('should trigger Device Wall for Starter tier at 3rd device', async () => {
      await manager.registerDevice(testUserId, 'Device 1', 'starter')
      await manager.registerDevice(testUserId, 'Device 2', 'starter')

      const result = await manager.registerDevice(testUserId, 'Device 3', 'starter')

      expect(result.limitReached).toBe(true)
      expect(result.message).toContain('Device limit reached')
      expect(result.message).toContain('Upgrade to Pro')
    })

    it('should never trigger Device Wall for Pro tier', async () => {
      for (let i = 1; i <= 20; i++) {
        const result = await manager.registerDevice(testUserId, `Device ${i}`, 'pro')
        expect(result.limitReached).toBe(false)
      }
    })
  })
})
