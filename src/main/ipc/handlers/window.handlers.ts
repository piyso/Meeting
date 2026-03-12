import { ipcMain, BrowserWindow } from 'electron'
import { Logger } from '../../services/Logger'

const log = Logger.create('WindowHandlers')

// C6 fix: Avoid circular require('../../../../electron/main') by looking up
// windows via BrowserWindow.getAllWindows() — same pattern as note/transcript handlers
function getMainWindow(): BrowserWindow | undefined {
  return BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && (w.getSize()?.[0] ?? 0) > 400)
}

function getWidgetWindow(): BrowserWindow | undefined {
  return BrowserWindow.getAllWindows().find(
    w => !w.isDestroyed() && (w.getSize()?.[0] ?? 999) <= 400
  )
}

export function registerWindowHandlers(): void {
  // ── Windows Title Bar Controls ──────────────────────────────
  ipcMain.handle('window:minimize', () => {
    const win = getMainWindow()
    if (win) win.minimize()
    return { success: true, data: undefined }
  })

  ipcMain.handle('window:maximize', () => {
    const win = getMainWindow()
    if (win) {
      if (win.isMaximized()) {
        win.unmaximize()
      } else {
        win.maximize()
      }
    }
    return { success: true, data: undefined }
  })

  ipcMain.handle('window:close', () => {
    const win = getMainWindow()
    if (win) win.close()
    return { success: true, data: undefined }
  })

  ipcMain.handle('window:isMaximized', () => {
    const win = getMainWindow()
    return { success: true, data: win ? win.isMaximized() : false }
  })

  // Forward maximize/unmaximize events to renderer for title bar state
  const setupMaximizeEvents = () => {
    const win = getMainWindow()
    if (win) {
      win.on('maximize', () => {
        win.webContents.send('window:maximized')
      })
      win.on('unmaximize', () => {
        win.webContents.send('window:unmaximized')
      })
    }
  }
  // M10 fix: Use setImmediate + retry instead of fragile 1000ms setTimeout.
  // The main window may not exist yet, or may already exist — this handles both.
  const setupMaximizeEventsRetry = (retries = 5) => {
    setupMaximizeEvents()
    const win = getMainWindow()
    if (!win && retries > 0) {
      setTimeout(() => setupMaximizeEventsRetry(retries - 1), 500)
    }
  }
  setImmediate(() => setupMaximizeEventsRetry())

  // Widget -> Main: Restore the main window
  ipcMain.handle('window:restoreMain', () => {
    log.info('Widget requested main window restoration')
    const mainWindow = getMainWindow()
    const widgetWindow = getWidgetWindow()

    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }

    if (widgetWindow) {
      widgetWindow.hide()
    }

    return { success: true, data: undefined }
  })

  // App -> Main -> Widget: Broadcast state
  ipcMain.handle('widget:updateState', (_, state) => {
    const widgetWindow = getWidgetWindow()
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      widgetWindow.webContents.send('widget:stateUpdated', state)

      // Auto-show widget when recording starts if main window isn't focused
      if (state.isRecording && !widgetWindow.isVisible()) {
        const mainWindow = getMainWindow()
        if (!mainWindow || !mainWindow.isFocused()) {
          widgetWindow.showInactive() // Show without stealing focus
        }
      } else if (!state.isRecording && widgetWindow.isVisible()) {
        // I12 fix: Actually hide widget when recording stops
        widgetWindow.hide()
      }
    }
    return { success: true, data: undefined }
  })

  // Proxy widget bookmark requests to main window so it can show success toasts locally
  ipcMain.handle('widget:triggerBookmark', async () => {
    try {
      const mainWindow = getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('event:bookmarkRequested')
      }
      return { success: true, data: undefined }
    } catch (error) {
      log.error('Failed to proxy widget bookmark request', error)
      return { success: false, error: { message: 'Failed to proxy bookmark' } }
    }
  })

  // Proxy widget quick note requests
  ipcMain.handle('widget:submitQuickNote', async (_, note: string) => {
    try {
      const mainWindow = getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('event:quickNoteRequested', note)
      }
      return { success: true, data: undefined }
    } catch (error) {
      log.error('Failed to proxy quick note', error)
      return { success: false, error: { message: 'Failed to proxy note' } }
    }
  })

  // Proxy widget pause toggle requests to main window
  ipcMain.handle('widget:triggerPauseToggle', async () => {
    try {
      const mainWindow = getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('event:pauseRequested')
      }
      return { success: true, data: undefined }
    } catch (error) {
      log.error('Failed to proxy widget pause toggle request', error)
      return { success: false, error: { message: 'Failed to proxy pause toggle' } }
    }
  })
}
