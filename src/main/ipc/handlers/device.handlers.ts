/**
 * Device Handlers — IPC handlers for device management
 *
 * Exposes DeviceManager functionality to the renderer process.
 * Supports device registration, listing, deactivation, reactivation, and renaming.
 */

import { ipcMain } from 'electron'
import { getDeviceManager } from '../../services/DeviceManager'
import { Logger } from '../../services/Logger'

const log = Logger.create('DeviceHandlers')

/**
 * The account devices belong to. Always the signed-in user: the renderer does
 * not know (and must not choose) a user id, so whatever it sends is ignored
 * unless nobody is signed in.
 */
async function resolveUserId(requested?: unknown): Promise<string> {
  try {
    const { getAuthService } = await import('../../services/AuthService')
    const user = await getAuthService().getCurrentUser()
    if (user?.id) return user.id
  } catch (err) {
    log.debug('Could not resolve current user:', err instanceof Error ? err.message : String(err))
  }
  return typeof requested === 'string' ? requested : ''
}

export function registerDeviceHandlers(): void {
  // device:list — Get all devices for the current user
  ipcMain.handle('device:list', async (_, params) => {
    try {
      const dm = getDeviceManager()
      const userId = await resolveUserId(params?.userId)
      if (!userId) return { success: true, data: [] } // not signed in — no registered devices
      const devices = await dm.getDevices(userId, params?.activeOnly !== false)
      return { success: true, data: devices }
    } catch (error) {
      log.error('Failed to list devices', error)
      return {
        success: false,
        error: {
          code: 'DEVICE_LIST_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // device:getCurrent — Get current device info
  ipcMain.handle('device:getCurrent', async () => {
    try {
      const dm = getDeviceManager()
      const info = dm.getCurrentDeviceInfo()
      return { success: true, data: info }
    } catch (error) {
      log.error('Failed to get current device', error)
      return {
        success: false,
        error: {
          code: 'DEVICE_GET_CURRENT_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // device:register — Register a device for a user
  ipcMain.handle('device:register', async (_, params) => {
    const dm = getDeviceManager()
    try {
      if (!params?.userId) {
        return {
          success: false,
          error: { code: 'INVALID_PARAMS', message: 'userId is required', timestamp: Date.now() },
        }
      }
      const result = await dm.registerDevice(params.userId, params.customName, params.planTier)
      return { success: true, data: result }
    } catch (error) {
      const errorMsg = (error as Error).message || ''
      log.error('Failed to register device', error)

      // Detect device limit exceeded and return structured response
      const isLimitError =
        errorMsg.toLowerCase().includes('limit') ||
        errorMsg.toLowerCase().includes('maximum') ||
        errorMsg.toLowerCase().includes('exceeded')

      if (isLimitError) {
        // Get current device info for the wall dialog
        let deviceCount = 0
        let deviceLimit = 1
        try {
          const { getCloudAccessManager } = await import('../../services/CloudAccessManager')
          const cam = getCloudAccessManager()
          const features = await cam.getFeatureAccess()
          deviceLimit = features.deviceLimit === Infinity ? -1 : features.deviceLimit

          const devices = await dm.getDevices(params.userId, true)
          deviceCount = devices.length
        } catch (e) {
          log.debug('Device limit lookup skipped:', e instanceof Error ? e.message : String(e))
        }

        return {
          success: false,
          error: {
            code: 'DEVICE_LIMIT_EXCEEDED',
            message: errorMsg,
            timestamp: Date.now(),
            deviceLimitExceeded: true,
            deviceCount,
            deviceLimit,
          },
        }
      }

      return {
        success: false,
        error: {
          code: 'DEVICE_REGISTER_FAILED',
          message: errorMsg,
          timestamp: Date.now(),
        },
      }
    }
  })

  // device:deactivate — Deactivate a device
  ipcMain.handle('device:deactivate', async (_, params) => {
    try {
      const userId = await resolveUserId(params?.userId)
      if (!params?.deviceId || !userId) {
        return {
          success: false,
          error: {
            code: 'INVALID_PARAMS',
            message: 'deviceId is required and you must be signed in',
            timestamp: Date.now(),
          },
        }
      }
      const dm = getDeviceManager()
      if (params.deviceId === dm.getCurrentDeviceInfo().deviceId) {
        return {
          success: false,
          error: {
            code: 'DEVICE_IS_CURRENT',
            message: 'Sign out to remove this device.',
            timestamp: Date.now(),
          },
        }
      }
      const result = await dm.deactivateDevice(params.deviceId, userId)
      if (!result) {
        return {
          success: false,
          error: { code: 'DEVICE_NOT_FOUND', message: 'Device not found', timestamp: Date.now() },
        }
      }
      return { success: true, data: { deactivated: result } }
    } catch (error) {
      log.error('Failed to deactivate device', error)
      return {
        success: false,
        error: {
          code: 'DEVICE_DEACTIVATE_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // device:rename — Rename a device
  ipcMain.handle('device:rename', async (_, params) => {
    try {
      const userId = await resolveUserId(params?.userId)
      const newName = typeof params?.newName === 'string' ? params.newName.trim().slice(0, 80) : ''
      if (!params?.deviceId || !userId || !newName) {
        return {
          success: false,
          error: {
            code: 'INVALID_PARAMS',
            message: 'deviceId and newName are required and you must be signed in',
            timestamp: Date.now(),
          },
        }
      }
      const dm = getDeviceManager()
      const result = await dm.renameDevice(params.deviceId, userId, newName)
      return { success: true, data: { renamed: result } }
    } catch (error) {
      log.error('Failed to rename device', error)
      return {
        success: false,
        error: {
          code: 'DEVICE_RENAME_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })
}
