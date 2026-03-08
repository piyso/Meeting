import { app, BrowserWindow, globalShortcut, screen } from 'electron'
import path from 'path'
import { setupIPC, cleanupIPC } from '../src/main/ipc/setup'
import { getDatabaseService } from '../src/main/services/DatabaseService'
import { closeDatabase } from '../src/main/database/connection'
import { Logger } from '../src/main/services/Logger'
import { CrashReporter } from '../src/main/services/CrashReporter'
import { migrateIfNeeded } from '../src/main/services/MigrationService'

const log = Logger.create('Main')

// ─── Global Error Handling ─────────────────────────────────
process.on('uncaughtException', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPIPE') return // Silently ignore — terminal closed

  log.error('FATAL UNCAUGHT EXCEPTION:', err)
  // In production, we log and try to keep running unless it's a critical native crash
  // In development, we throw to fail fast
  if (process.env.NODE_ENV === 'development') {
    throw err
  }
})

process.on('unhandledRejection', (reason, promise) => {
  log.error('UNHANDLED PROMISE REJECTION:', { reason, promise })
})

// ─── Auto-updater (checks dl.bluearkive.com via generic provider) ───────────────
let autoUpdater: { checkForUpdatesAndNotify: () => Promise<unknown> } | null = null
try {
  // electron-updater is optional — skip in dev or if not installed

  const { autoUpdater: updater } = require('electron-updater')
  autoUpdater = updater
  updater.logger = log
  updater.autoDownload = true
  updater.autoInstallOnAppQuit = true

  updater.on('error', (err: Error) => {
    log.warn('Auto-updater error (likely network/offline):', err.message)
  })
} catch {
  // Not installed or in development, skip
}

// Handle creating/removing shortcuts on Windows when installing/uninstalling
if (process.platform === 'win32') {
  try {
    if (require('electron-squirrel-startup')) {
      app.quit()
    }
  } catch {
    // Not installed, skip
  }
}

// ─── Single instance lock ────────────────────────────────
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

// Focus existing window when a second instance is launched (or deep link received)
app.on('second-instance', (_event, argv) => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
  // Handle deep link on Windows/Linux (argv contains the URL)
  const deepLink = argv.find(arg => arg.startsWith('bluearkive://'))
  if (deepLink && mainWindow) {
    mainWindow.webContents.send('deep-link', deepLink)
  }
})

let mainWindow: BrowserWindow | null = null
let widgetWindow: BrowserWindow | null = null

/**
 * Get the main window instance
 * Used by services to send events to renderer
 */
export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

/**
 * Get the widget window instance
 */
export function getWidgetWindow(): BrowserWindow | null {
  return widgetWindow
}

const createWindow = () => {
  // Create the main browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 12 },
    frame: process.platform === 'darwin' ? true : false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    title: 'BlueArkive',
    show: false,
  })

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    log.info('Main Window ready and visible')
  })

  // Load the app
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
    log.debug('Loaded dev server', { url: process.env.VITE_DEV_SERVER_URL })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
    log.info('Loaded production bundle')
  }

  // Open external links securely in the default OS browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      require('electron').shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null
    log.info('Main window closed')
  })
}

const createWidgetWindow = () => {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workArea
  const widgetWidth = 320
  const widgetHeight = 400
  const padding = 24 // Distance from the right/bottom edge of the screen

  // Create the transparent, always-on-top widget window
  widgetWindow = new BrowserWindow({
    width: widgetWidth,
    height: widgetHeight,
    x: screenWidth - widgetWidth - padding,
    y: screenHeight - widgetHeight - padding,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    hasShadow: false, // We render the drop shadow in CSS for better border-radius control
    type: 'panel', // macOS specific: treats it as a floating utility panel
    resizable: false,
    show: false, // Hidden until told to show
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    title: 'BlueArkive Widget',
  })

  // Load the separate WidgetApp HTML entry point
  if (process.env.VITE_DEV_SERVER_URL) {
    widgetWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}widget-index.html`)
  } else {
    widgetWindow.loadFile(path.join(__dirname, '../dist/widget-index.html'))
  }

  // Open external links securely in the default OS browser
  widgetWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      require('electron').shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  widgetWindow.on('closed', () => {
    widgetWindow = null
    log.info('Widget window closed')
  })
}

// This method will be called when Electron has finished initialization
app.whenReady().then(async () => {
  // Initialize crash reporting first (catches errors during init)
  CrashReporter.init()

  // Initialize file logging
  Logger.initFileLogging()

  log.info('Application starting', {
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    node: process.versions.node,
  })

  // Migrate data from old app name (piyapi-notes → bluearkive)
  // MUST run before database initialization to copy old DB if it exists
  await migrateIfNeeded()
  CrashReporter.addBreadcrumb('lifecycle', 'Migration check complete')

  // Initialize services
  log.info('Initializing services...')
  getDatabaseService() // Initialize database (delegates to connection.ts)
  CrashReporter.addBreadcrumb('lifecycle', 'Database initialized')

  // Setup IPC handlers
  setupIPC()
  CrashReporter.addBreadcrumb('lifecycle', 'IPC handlers registered')
  log.info('IPC handlers registered')

  // Create windows
  createWindow()
  createWidgetWindow()

  // Wire model download progress to the renderer window
  if (mainWindow) {
    const { getModelDownloadService } = require('../src/main/services/ModelDownloadService')
    getModelDownloadService().setMainWindow(mainWindow)
  }

  // Register Global OS Hotkey for instant recording
  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    log.info('Global shortcut triggered: Cmd+Shift+Space')
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
      mainWindow.webContents.send('global-shortcut:start-recording')
    }
  })

  // On macOS, re-create window when dock icon is clicked and no windows are open
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
      createWidgetWindow()
      log.info('Re-created windows from dock activation')
    }
  })

  // Register deep-link protocol (bluearkive://)
  if (!app.isDefaultProtocolClient('bluearkive')) {
    app.setAsDefaultProtocolClient('bluearkive')
  }

  // macOS: handle deep links via open-url event
  app.on('open-url', (_event, url) => {
    if (mainWindow) {
      mainWindow.webContents.send('deep-link', url)
    }
  })

  // Check for updates (10s after launch — non-blocking)
  if (autoUpdater) {
    setTimeout(() => {
      autoUpdater?.checkForUpdatesAndNotify()?.catch((err: Error) => {
        log.warn('Auto-update check failed (no releases published?):', err.message)
      })
      log.info('Auto-update check initiated')
    }, 10_000)
  }
})

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  // Unregister all shortcuts when app is quitting
  globalShortcut.unregisterAll()
})

// Handle app quit
app.on('before-quit', async () => {
  log.info('Application quitting — starting cleanup...')

  try {
    // Stop audio capture and flush any buffered audio
    try {
      const { getAudioPipelineService } = await import('../src/main/services/AudioPipelineService')
      const pipeline = getAudioPipelineService()
      if (pipeline.getStatus().isCapturing) {
        log.info('Flushing audio pipeline before quit...')
        await pipeline.stopCapture()
      }
    } catch {
      // AudioPipelineService may not be initialized
    }

    // Terminate ASR worker thread
    try {
      const { getASRService } = await import('../src/main/services/ASRService')
      await getASRService().terminate()
    } catch {
      // ASRService may not be initialized
    }

    // Cleanup IPC handlers
    cleanupIPC()

    // Close database connection (single close — connection.ts manages the singleton)
    closeDatabase()
  } catch (error) {
    log.error('Error during cleanup:', error)
  }

  log.info('Cleanup complete — goodbye')
})
