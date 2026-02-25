/**
 * Power IPC Handlers
 *
 * Provides battery/power status via Electron's powerMonitor API.
 * Used by the usePowerMode hook in the renderer to reduce resource usage on battery.
 */

import { ipcMain, powerMonitor } from 'electron'

export function registerPowerHandlers(): void {
  // power:getStatus — Get current battery/power status
  ipcMain.handle('power:getStatus', async () => {
    try {
      return {
        success: true,
        data: {
          isOnBattery: powerMonitor.isOnBatteryPower(),
        },
      }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'POWER_STATUS_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })
}
