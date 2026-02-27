import { ipcMain } from 'electron'
import { getMainWindow, getWidgetWindow } from '../../../../electron/main'
import { Logger } from '../../services/Logger'

const log = Logger.create('WindowHandlers')

export function registerWindowHandlers(): void {
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

    return { success: true }
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
        // Hide when recording stops
        widgetWindow.hide()
      }
    }
    return { success: true }
  })
}
