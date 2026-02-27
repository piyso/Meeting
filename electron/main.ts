import { app, BrowserWindow } from 'electron'
import path from 'path'
import { setupIPC, cleanupIPC } from '../src/main/ipc/setup'
import { getDatabaseService } from '../src/main/services/DatabaseService'
import { closeDatabase } from '../src/main/database/connection'
import { Logger } from '../src/main/services/Logger'
import { CrashReporter } from '../src/main/services/CrashReporter'

const log = Logger.create('Main')

// ─── Auto-updater (checks GitHub Releases) ───────────────
let autoUpdater: { checkForUpdatesAndNotify: () => void } | null = null
try {
  // electron-updater is optional — skip in dev or if not installed
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { autoUpdater: updater } = require('electron-updater')
  autoUpdater = updater
  updater.logger = log
  updater.autoDownload = true
  updater.autoInstallOnAppQuit = true
} catch {
  // Not installed or in development, skip
}

// Handle creating/removing shortcuts on Windows when installing/uninstalling
try {
  if (require('electron-squirrel-startup')) {
    app.quit()
  }
} catch (e) {
  // Ignore in development or if package is missing
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

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null
    log.info('Main window closed')
  })
}

const createWidgetWindow = () => {
  // Create the transparent, always-on-top widget window
  widgetWindow = new BrowserWindow({
    width: 300, // Slightly wider to accommodate drop shadow margins
    height: 100, // Slightly taller for drop shadow margins
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

  widgetWindow.on('closed', () => {
    widgetWindow = null
    log.info('Widget window closed')
  })
}

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
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
      autoUpdater?.checkForUpdatesAndNotify()
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

// Handle app quit
app.on('before-quit', () => {
  log.info('Application quitting — starting cleanup...')

  try {
    // Cleanup IPC handlers
    cleanupIPC()

    // Close database connection (single close — connection.ts manages the singleton)
    closeDatabase()
  } catch (error) {
    log.error('Error during cleanup:', error)
  }

  log.info('Cleanup complete — goodbye')
})
