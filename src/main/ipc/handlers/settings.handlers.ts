import { ipcMain } from 'electron'
import { getDatabase } from '../../database/connection'

export function registerSettingsHandlers(): void {
  // settings:getAll — Get all settings as key-value map
  ipcMain.handle('settings:getAll', async () => {
    try {
      const db = getDatabase()
      const settings = db.prepare('SELECT key, value FROM settings').all() as Array<{
        key: string
        value: string
      }>
      const result: Record<string, unknown> = {}
      for (const row of settings) {
        try {
          result[row.key] = JSON.parse(row.value)
        } catch {
          result[row.key] = row.value
        }
      }
      return { success: true, data: result }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'SETTINGS_GET_ALL_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // settings:get — Get a single setting by key
  ipcMain.handle('settings:get', async (_, params) => {
    try {
      if (!params?.key) {
        return {
          success: false,
          error: { code: 'INVALID_PARAMS', message: 'key is required', timestamp: Date.now() },
        }
      }
      const db = getDatabase()
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(params.key) as
        | { value: string }
        | undefined
      if (!row) return { success: true, data: null }
      try {
        return { success: true, data: JSON.parse(row.value) }
      } catch {
        return { success: true, data: row.value }
      }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'SETTINGS_GET_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // settings:update — Set a single key-value pair
  ipcMain.handle('settings:update', async (_, params) => {
    try {
      if (!params?.key || params?.value === undefined) {
        return {
          success: false,
          error: {
            code: 'INVALID_PARAMS',
            message: 'key and value are required',
            timestamp: Date.now(),
          },
        }
      }
      const db = getDatabase()
      const now = Math.floor(Date.now() / 1000)
      db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run(
        params.key,
        JSON.stringify(params.value),
        now
      )
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'SETTINGS_UPDATE_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // settings:reset — Clear all settings
  ipcMain.handle('settings:reset', async () => {
    try {
      const db = getDatabase()
      db.prepare('DELETE FROM settings').run()
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'SETTINGS_RESET_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })
}
