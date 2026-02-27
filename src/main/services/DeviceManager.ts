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
import { Logger } from './Logger'
import * as os from 'os'
import * as crypto from 'crypto'
import { app } from 'electron'
import { v4 as uuidv4 } from 'uuid'

export interface Device {
  id: string
  user_id: string
  device_name: string
  platform: string // 'darwin', 'win32', 'linux'
  hostname: string
  app_version: string
  is_active: boolean
  last_sync_at: string
  created_at: string
  updated_at: string
}

export interface DeviceRegistrationResult {
  success: boolean
  device?: Device
  isNewDevice: boolean
  limitReached: boolean
  currentDeviceCount: number
  maxDevices: number
  message?: string
}

export interface DeviceReactivationResult {
  success: boolean
  limitReached: boolean
}

export class DeviceManager {
  private auditLogger: AuditLogger
  private log = Logger.create('DeviceManager')

  constructor() {
    this.auditLogger = new AuditLogger()
  }

  /**
   * Get device limits by plan tier
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
   * Get upgrade suggestion for plan tier
   */
  private getUpgradeSuggestion(planTier: string): string {
    switch (planTier) {
      case 'free':
        return 'Upgrade to Starter'
      case 'starter':
        return 'Upgrade to Pro'
      default:
        return 'Upgrade your plan'
    }
  }

  /**
   * Generate unique device ID for current machine
   */
  private generateDeviceId(): string {
    const hostname = os.hostname()
    const platform = os.platform()
    const arch = os.arch()
    const machineId = `${hostname}-${platform}-${arch}`
    const hash = crypto.createHash('sha256').update(machineId).digest('hex')
    return `device-${hash.substring(0, 16)}`
  }

  /**
   * Get device name
   */
  private getDeviceName(): string {
    const hostname = os.hostname()
    const platform = os.platform()
    const platformName =
      platform === 'darwin' ? 'macOS' : platform === 'win32' ? 'Windows' : 'Linux'
    return `${hostname} (${platformName})`
  }

  /**
   * Register device for user
   */
  public async registerDevice(
    userId: string,
    customDeviceName?: string,
    planTierOverride?: string
  ): Promise<DeviceRegistrationResult> {
    const db = getDatabaseService().getDb()
    const planTier = planTierOverride || (await KeyStorageService.getPlanTier(userId)) || 'free'
    const maxDevices = this.getDeviceLimit(planTier)

    // Generate unique device ID per registration
    const deviceId = uuidv4()

    // Get current device count (needed for both dedup return and limit check)
    const currentDeviceCount = await this.getDeviceCount(userId)

    // Check if this physical machine already has a registered device with the same name (deduplication).
    // Only dedup when device_name matches too — allows registering multiple distinct named devices.
    const resolvedDeviceName = customDeviceName || this.getDeviceName()
    const existingDevice = db
      .prepare(
        'SELECT * FROM devices WHERE user_id = ? AND hostname = ? AND platform = ? AND device_name = ?'
      )
      .get(userId, os.hostname(), os.platform(), resolvedDeviceName) as Device | undefined

    if (existingDevice) {
      // Reactivate existing device instead of creating a duplicate
      if (!existingDevice.is_active) {
        db.prepare(
          'UPDATE devices SET is_active = ?, updated_at = ?, app_version = ? WHERE id = ?'
        ).run(1, new Date().toISOString(), app.getVersion(), existingDevice.id)
      }
      return {
        success: true,
        device: { ...existingDevice, is_active: true, app_version: app.getVersion() },
        isNewDevice: false,
        limitReached: false,
        currentDeviceCount,
        maxDevices,
      }
    }

    // Check device limit
    if (currentDeviceCount >= maxDevices) {
      return {
        success: false,
        device: undefined,
        isNewDevice: true,
        limitReached: true,
        currentDeviceCount,
        maxDevices,
        message: `Device limit reached for ${planTier} tier (${maxDevices} device${maxDevices > 1 ? 's' : ''}). ${this.getUpgradeSuggestion(planTier)} for more devices.`,
      }
    }

    const now = new Date().toISOString()
    const device: Device = {
      id: deviceId,
      user_id: userId,
      device_name: customDeviceName || this.getDeviceName(),
      platform: os.platform(),
      hostname: os.hostname(),
      app_version: app.getVersion(),
      is_active: true,
      last_sync_at: now,
      created_at: now,
      updated_at: now,
    }

    // Insert device
    db.prepare(
      `INSERT INTO devices (id, user_id, device_name, platform, hostname, app_version, is_active, last_sync_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      device.id,
      device.user_id,
      device.device_name,
      device.platform,
      device.hostname,
      device.app_version,
      device.is_active ? 1 : 0,
      device.last_sync_at,
      device.created_at,
      device.updated_at
    )

    // Log device registration
    try {
      await this.auditLogger.log({
        userId,
        operation: 'device_register',
        table: 'devices',
        recordId: deviceId,
        metadata: {
          deviceName: device.device_name,
          platform: device.platform,
          planTier,
        },
      })
    } catch (err) {
      this.log.warn('Audit log failed for device registration', { deviceId, err })
    }

    return {
      success: true,
      device,
      isNewDevice: true,
      limitReached: false,
      currentDeviceCount: currentDeviceCount + 1,
      maxDevices,
    }
  }

  /**
   * Get all devices for user
   */
  public async getDevices(userId: string, activeOnly: boolean = true): Promise<Device[]> {
    const db = getDatabaseService().getDb()

    type DeviceRow = Record<string, unknown>
    let devices: DeviceRow[]
    if (activeOnly) {
      devices = db
        .prepare('SELECT * FROM devices WHERE user_id = ? AND is_active = ?')
        .all(userId, 1) as DeviceRow[]
    } else {
      devices = db.prepare('SELECT * FROM devices WHERE user_id = ?').all(userId) as DeviceRow[]
    }

    return devices.map(d => ({
      id: d.id as string,
      user_id: d.user_id as string,
      device_name: d.device_name as string,
      platform: d.platform as string,
      hostname: d.hostname as string,
      app_version: d.app_version as string,
      is_active: d.is_active === 1 || d.is_active === true,
      last_sync_at: d.last_sync_at as string,
      created_at: d.created_at as string,
      updated_at: d.updated_at as string,
    }))
  }

  /**
   * Get device count for user (active devices only)
   */
  public async getDeviceCount(userId: string): Promise<number> {
    const db = getDatabaseService().getDb()
    const result = db
      .prepare('SELECT COUNT(*) as count FROM devices WHERE user_id = ? AND is_active = ?')
      .get(userId, 1) as { count: number }
    return result.count
  }

  /**
   * Check if device limit reached
   */
  public async checkDeviceLimit(userId: string): Promise<boolean> {
    const planTier = (await KeyStorageService.getPlanTier(userId)) || 'free'
    const maxDevices = this.getDeviceLimit(planTier)
    const currentCount = await this.getDeviceCount(userId)
    return currentCount >= maxDevices
  }

  /**
   * Deactivate device
   */
  public async deactivateDevice(deviceId: string, userId: string): Promise<boolean> {
    const db = getDatabaseService().getDb()

    const device = db
      .prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?')
      .get(deviceId, userId) as Device | undefined

    if (!device) return false

    db.prepare('UPDATE devices SET is_active = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(
      0,
      new Date().toISOString(),
      deviceId,
      userId
    )

    try {
      await this.auditLogger.log({
        userId,
        operation: 'device_deactivate',
        table: 'devices',
        recordId: deviceId,
        metadata: {
          deviceName: device.device_name,
          platform: device.platform,
        },
      })
    } catch (err) {
      this.log.warn('Audit log failed for device deactivation', { deviceId, err })
    }

    return true
  }

  /**
   * Reactivate device
   */
  public async reactivateDevice(
    deviceId: string,
    userId: string
  ): Promise<DeviceReactivationResult> {
    const db = getDatabaseService().getDb()

    // Verify device exists and belongs to user
    const device = db
      .prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?')
      .get(deviceId, userId) as Device | undefined

    if (!device) {
      return { success: false, limitReached: false }
    }

    const limitReached = await this.checkDeviceLimit(userId)
    if (limitReached) {
      return { success: false, limitReached: true }
    }

    db.prepare('UPDATE devices SET is_active = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(
      1,
      new Date().toISOString(),
      deviceId,
      userId
    )

    try {
      await this.auditLogger.log({
        userId,
        operation: 'device_reactivate',
        table: 'devices',
        recordId: deviceId,
      })
    } catch (err) {
      this.log.warn('Audit log failed for device reactivation', { deviceId, err })
    }

    return { success: true, limitReached: false }
  }

  /**
   * Delete device permanently
   */
  public async deleteDevice(deviceId: string, userId: string): Promise<boolean> {
    const db = getDatabaseService().getDb()

    const device = db
      .prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?')
      .get(deviceId, userId) as Device | undefined

    if (!device) return false

    db.prepare('DELETE FROM devices WHERE id = ? AND user_id = ?').run(deviceId, userId)

    try {
      await this.auditLogger.log({
        userId,
        operation: 'device_delete',
        table: 'devices',
        recordId: deviceId,
        metadata: {
          deviceName: device.device_name,
          platform: device.platform,
        },
      })
    } catch (err) {
      this.log.warn('Audit log failed for device deletion', { deviceId, err })
    }

    return true
  }

  /**
   * Update device last sync time
   */
  public async updateLastSync(deviceId: string, userId?: string): Promise<boolean> {
    const db = getDatabaseService().getDb()
    const now = new Date().toISOString()
    if (userId) {
      db.prepare(
        'UPDATE devices SET last_sync_at = ?, updated_at = ? WHERE id = ? AND user_id = ?'
      ).run(now, now, deviceId, userId)
    } else {
      db.prepare('UPDATE devices SET last_sync_at = ?, updated_at = ? WHERE id = ?').run(
        now,
        now,
        deviceId
      )
    }
    return true
  }

  /**
   * Get a specific device by ID and user
   */
  public async getCurrentDevice(deviceId: string, userId: string): Promise<Device | undefined> {
    const db = getDatabaseService().getDb()
    const d = db
      .prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?')
      .get(deviceId, userId) as Record<string, unknown> | undefined
    if (!d) return undefined
    return {
      id: d.id as string,
      user_id: d.user_id as string,
      device_name: d.device_name as string,
      platform: d.platform as string,
      hostname: d.hostname as string,
      app_version: d.app_version as string,
      is_active: d.is_active === 1 || d.is_active === true,
      last_sync_at: d.last_sync_at as string,
      created_at: d.created_at as string,
      updated_at: d.updated_at as string,
    }
  }

  /**
   * Get current device ID
   */
  public getCurrentDeviceId(): string {
    return this.generateDeviceId()
  }

  /**
   * Get current device info
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
   */
  public async renameDevice(deviceId: string, userId: string, newName: string): Promise<boolean> {
    if (!newName || !newName.trim()) return false

    const db = getDatabaseService().getDb()

    // Verify device exists and belongs to user
    const device = db
      .prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?')
      .get(deviceId, userId) as Device | undefined

    if (!device) return false

    db.prepare(
      'UPDATE devices SET device_name = ?, updated_at = ? WHERE id = ? AND user_id = ?'
    ).run(newName, new Date().toISOString(), deviceId, userId)

    try {
      await this.auditLogger.log({
        userId,
        operation: 'device_rename',
        table: 'devices',
        recordId: deviceId,
        metadata: { oldName: device.device_name, newName },
      })
    } catch (err) {
      this.log.warn('Audit log failed for device rename', { deviceId, err })
    }

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

/** Reset singleton — for test isolation */
export function resetDeviceManager(): void {
  instance = null
}
