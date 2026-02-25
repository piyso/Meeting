/**
 * Device Manager Service
 *
 * Manages device registration, limits, and deactivation.
 *
 * Device Limits by Plan:
 * - Free: 1 device
 * - Starter: 2 devices
 * - Pro: Unlimited
 * - Team: Unlimited
 * - Enterprise: Unlimited
 *
 * Features:
 * - Device registration with unique ID
 * - Device limit enforcement
 * - Remote device deactivation
 * - Device list management
 * - Audit logging for device operations
 */

import { getDatabaseService } from './DatabaseService'
import { KeyStorageService } from './KeyStorageService'
import { AuditLogger } from './AuditLogger'
import * as os from 'os'
import { app } from 'electron'

export interface Device {
  id: string
  userId: string
  deviceName: string
  platform: string // 'darwin', 'win32', 'linux'
  hostname: string
  appVersion: string
  isActive: boolean
  lastSyncAt: string
  createdAt: string
  updatedAt: string
}

export interface DeviceRegistrationResult {
  device: Device
  isNewDevice: boolean
  limitReached: boolean
  currentDeviceCount: number
  maxDevices: number
}

export class DeviceManager {
  private auditLogger: AuditLogger

  constructor() {
    this.auditLogger = new AuditLogger()
  }

  /**
   * Get device limits by plan tier
   *
   * @param planTier - Plan tier
   * @returns Maximum number of devices allowed
   */
  private getDeviceLimit(planTier: string): number {
    switch (planTier) {
      case 'free':
        return 1
      case 'starter':
        return 2
      case 'pro':
      case 'team':
      case 'enterprise':
        return Infinity
      default:
        return 1
    }
  }

  /**
   * Generate unique device ID
   * Uses machine ID + hostname for consistency across app restarts
   *
   * @returns Device ID
   */
  private generateDeviceId(): string {
    const hostname = os.hostname()
    const platform = os.platform()
    const arch = os.arch()

    // Create deterministic ID based on machine characteristics
    const machineId = `${hostname}-${platform}-${arch}`
    const hash = Buffer.from(machineId)
      .toString('base64')
      .replace(/[^a-zA-Z0-9]/g, '')

    return `device-${hash.substring(0, 16)}`
  }

  /**
   * Get device name
   * Uses hostname or custom name
   *
   * @returns Device name
   */
  private getDeviceName(): string {
    const hostname = os.hostname()
    const platform = os.platform()

    // Format: "MacBook Pro (macOS)" or "DESKTOP-ABC (Windows)"
    const platformName =
      platform === 'darwin' ? 'macOS' : platform === 'win32' ? 'Windows' : 'Linux'

    return `${hostname} (${platformName})`
  }

  /**
   * Register device for user
   * Checks device limits and creates device record
   *
   * @param userId - User ID
   * @param customDeviceName - Optional custom device name
   * @returns Device registration result
   */
  public async registerDevice(
    userId: string,
    customDeviceName?: string
  ): Promise<DeviceRegistrationResult> {
    const db = getDatabaseService().getDb()

    // Get plan tier
    const planTier = (await KeyStorageService.getPlanTier(userId)) || 'free'
    const maxDevices = this.getDeviceLimit(planTier)

    // Generate device ID
    const deviceId = this.generateDeviceId()

    // Check if device already exists
    const existingDevice = db
      .prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?')
      .get(deviceId, userId) as Device | undefined

    if (existingDevice) {
      // Device already registered - update last sync time
      db.prepare('UPDATE devices SET last_sync_at = ?, updated_at = ? WHERE id = ?').run(
        new Date().toISOString(),
        new Date().toISOString(),
        deviceId
      )

      // Log device login
      await this.auditLogger.log({
        userId,
        operation: 'device_login',
        table: 'devices',
        recordId: deviceId,
        metadata: {
          deviceName: existingDevice.deviceName,
          platform: existingDevice.platform,
        },
      })

      return {
        device: existingDevice,
        isNewDevice: false,
        limitReached: false,
        currentDeviceCount: await this.getDeviceCount(userId),
        maxDevices,
      }
    }

    // Check device limit
    const currentDeviceCount = await this.getDeviceCount(userId)
    if (currentDeviceCount >= maxDevices) {
      // Limit reached - return error
      return {
        device: {
          id: deviceId,
          userId,
          deviceName: customDeviceName || this.getDeviceName(),
          platform: os.platform(),
          hostname: os.hostname(),
          appVersion: app.getVersion(),
          isActive: false,
          lastSyncAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        isNewDevice: true,
        limitReached: true,
        currentDeviceCount,
        maxDevices,
      }
    }

    // Create new device
    const device: Device = {
      id: deviceId,
      userId,
      deviceName: customDeviceName || this.getDeviceName(),
      platform: os.platform(),
      hostname: os.hostname(),
      appVersion: app.getVersion(),
      isActive: true,
      lastSyncAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    // Insert device
    db.prepare(
      `INSERT INTO devices (id, user_id, device_name, platform, hostname, app_version, is_active, last_sync_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      device.id,
      device.userId,
      device.deviceName,
      device.platform,
      device.hostname,
      device.appVersion,
      device.isActive ? 1 : 0,
      device.lastSyncAt,
      device.createdAt,
      device.updatedAt
    )

    // Log device registration
    await this.auditLogger.log({
      userId,
      operation: 'device_register',
      table: 'devices',
      recordId: deviceId,
      metadata: {
        deviceName: device.deviceName,
        platform: device.platform,
        planTier,
      },
    })

    console.log(`[DeviceManager] Registered device ${deviceId} for user ${userId}`)

    return {
      device,
      isNewDevice: true,
      limitReached: false,
      currentDeviceCount: currentDeviceCount + 1,
      maxDevices,
    }
  }

  /**
   * Get all devices for user
   *
   * @param userId - User ID
   * @returns Array of devices
   */
  public async getDevices(userId: string): Promise<Device[]> {
    const db = getDatabaseService().getDb()

    const devices = db
      .prepare('SELECT * FROM devices WHERE user_id = ? ORDER BY last_sync_at DESC')
      .all(userId) as any[]

    return devices.map(d => ({
      ...d,
      isActive: d.is_active === 1,
    }))
  }

  /**
   * Get device count for user
   *
   * @param userId - User ID
   * @returns Number of active devices
   */
  public async getDeviceCount(userId: string): Promise<number> {
    const db = getDatabaseService().getDb()

    const result = db
      .prepare('SELECT COUNT(*) as count FROM devices WHERE user_id = ? AND is_active = 1')
      .get(userId) as { count: number }

    return result.count
  }

  /**
   * Check if device limit reached
   *
   * @param userId - User ID
   * @returns True if limit reached
   */
  public async checkDeviceLimit(userId: string): Promise<boolean> {
    const planTier = (await KeyStorageService.getPlanTier(userId)) || 'free'
    const maxDevices = this.getDeviceLimit(planTier)
    const currentCount = await this.getDeviceCount(userId)

    return currentCount >= maxDevices
  }

  /**
   * Deactivate device
   * Marks device as inactive and revokes sync credentials
   *
   * @param deviceId - Device ID
   * @param userId - User ID
   * @returns True if device was deactivated
   */
  public async deactivateDevice(deviceId: string, userId: string): Promise<boolean> {
    const db = getDatabaseService().getDb()

    // Check if device exists
    const device = db
      .prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?')
      .get(deviceId, userId) as Device | undefined

    if (!device) {
      return false
    }

    // Deactivate device
    db.prepare('UPDATE devices SET is_active = 0, updated_at = ? WHERE id = ?').run(
      new Date().toISOString(),
      deviceId
    )

    // Log device deactivation
    await this.auditLogger.log({
      userId,
      operation: 'device_deactivate',
      table: 'devices',
      recordId: deviceId,
      metadata: {
        deviceName: device.deviceName,
        platform: device.platform,
      },
    })

    console.log(`[DeviceManager] Deactivated device ${deviceId} for user ${userId}`)

    return true
  }

  /**
   * Reactivate device
   *
   * @param deviceId - Device ID
   * @param userId - User ID
   * @returns True if device was reactivated
   */
  public async reactivateDevice(deviceId: string, userId: string): Promise<boolean> {
    const db = getDatabaseService().getDb()

    // Check device limit
    const limitReached = await this.checkDeviceLimit(userId)
    if (limitReached) {
      return false
    }

    // Reactivate device
    db.prepare('UPDATE devices SET is_active = 1, updated_at = ? WHERE id = ? AND user_id = ?').run(
      new Date().toISOString(),
      deviceId,
      userId
    )

    // Log device reactivation
    await this.auditLogger.log({
      userId,
      operation: 'device_reactivate',
      table: 'devices',
      recordId: deviceId,
    })

    console.log(`[DeviceManager] Reactivated device ${deviceId} for user ${userId}`)

    return true
  }

  /**
   * Delete device permanently
   *
   * @param deviceId - Device ID
   * @param userId - User ID
   * @returns True if device was deleted
   */
  public async deleteDevice(deviceId: string, userId: string): Promise<boolean> {
    const db = getDatabaseService().getDb()

    // Check if device exists
    const device = db
      .prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?')
      .get(deviceId, userId) as Device | undefined

    if (!device) {
      return false
    }

    // Delete device
    db.prepare('DELETE FROM devices WHERE id = ?').run(deviceId)

    // Log device deletion
    await this.auditLogger.log({
      userId,
      operation: 'device_delete',
      table: 'devices',
      recordId: deviceId,
      metadata: {
        deviceName: device.deviceName,
        platform: device.platform,
      },
    })

    console.log(`[DeviceManager] Deleted device ${deviceId} for user ${userId}`)

    return true
  }

  /**
   * Update device last sync time
   *
   * @param deviceId - Device ID
   * @returns True if updated successfully
   */
  public async updateLastSync(deviceId: string): Promise<boolean> {
    const db = getDatabaseService().getDb()

    db.prepare('UPDATE devices SET last_sync_at = ?, updated_at = ? WHERE id = ?').run(
      new Date().toISOString(),
      new Date().toISOString(),
      deviceId
    )

    return true
  }

  /**
   * Get current device ID
   *
   * @returns Device ID
   */
  public getCurrentDeviceId(): string {
    return this.generateDeviceId()
  }

  /**
   * Get current device info
   *
   * @returns Device info
   */
  public getCurrentDeviceInfo(): {
    deviceId: string
    deviceName: string
    platform: string
    hostname: string
    appVersion: string
  } {
    return {
      deviceId: this.generateDeviceId(),
      deviceName: this.getDeviceName(),
      platform: os.platform(),
      hostname: os.hostname(),
      appVersion: app.getVersion(),
    }
  }

  /**
   * Rename device
   *
   * @param deviceId - Device ID
   * @param userId - User ID
   * @param newName - New device name
   * @returns True if renamed successfully
   */
  public async renameDevice(deviceId: string, userId: string, newName: string): Promise<boolean> {
    const db = getDatabaseService().getDb()

    db.prepare(
      'UPDATE devices SET device_name = ?, updated_at = ? WHERE id = ? AND user_id = ?'
    ).run(newName, new Date().toISOString(), deviceId, userId)

    // Log device rename
    await this.auditLogger.log({
      userId,
      operation: 'device_rename',
      table: 'devices',
      recordId: deviceId,
      metadata: {
        newName,
      },
    })

    return true
  }
}

// Singleton instance
let instance: DeviceManager | null = null

export function getDeviceManager(): DeviceManager {
  if (!instance) {
    instance = new DeviceManager()
  }
  return instance
}
