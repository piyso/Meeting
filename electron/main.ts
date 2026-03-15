import { app, BrowserWindow, dialog, globalShortcut, screen, session } from 'electron'
import path from 'path'
import { setupIPC, cleanupIPC } from '../src/main/ipc/setup'
import { getDatabaseService } from '../src/main/services/DatabaseService'
import {
  closeDatabase,
  walHealthCheck,
  optimizeDatabase,
  getDatabasePath,
} from '../src/main/database/connection'
import { Logger } from '../src/main/services/Logger'
import { CrashReporter } from '../src/main/services/CrashReporter'
import { migrateIfNeeded } from '../src/main/services/MigrationService'
import { getModelDownloadService } from '../src/main/services/ModelDownloadService'
import { getAuditLogger } from '../src/main/services/AuditLogger'
import { getAuthService } from '../src/main/services/AuthService'
import { getAudioPipelineService } from '../src/main/services/AudioPipelineService'
import { getASRService } from '../src/main/services/ASRService'

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

  // O1: Re-check for updates every 4 hours instead of only once at startup.
  // If the initial check fails (offline, DNS error), users would never get updates.
  const FOUR_HOURS_MS = 4 * 60 * 60 * 1000
  const updateCheckInterval = setInterval(() => {
    updater.checkForUpdatesAndNotify().catch(() => {})
  }, FOUR_HOURS_MS)
  updateCheckInterval.unref() // Don't prevent app from quitting
} catch {
  // Not installed or in development, skip
}

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
// NOTE: This is dead code with the current NSIS installer config.
// NSIS handles shortcuts natively via createDesktopShortcut/createStartMenuShortcut.
// Kept for potential future Squirrel migration.
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
  // Show a user-visible notification instead of silently quitting
  app.whenReady().then(() => {
    dialog.showErrorBox(
      'BlueArkive is Already Running',
      'Another instance of BlueArkive is already open.\n\n' +
        'Look for it in your taskbar/dock, or quit the existing instance first.'
    )
    app.quit()
  })
}

// Focus existing window when a second instance is launched (or deep link received)
app.on('second-instance', async (_event, argv) => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
  // Handle deep link on Windows/Linux (argv contains the URL)
  const deepLink = argv.find(arg => arg.startsWith('bluearkive://'))
  if (deepLink && mainWindow) {
    // Route auth callbacks to AuthService (Issue 27 fix)
    if (deepLink.includes('/auth/callback')) {
      try {
        const result = await getAuthService().handleOAuthCallback(deepLink)
        mainWindow.webContents.send('auth:oauthSuccess', result)
      } catch (err) {
        mainWindow.webContents.send('auth:oauthError', { error: String(err) })
      }
    } else {
      mainWindow.webContents.send('deep-link', deepLink)
    }
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
  let readyToShowFired = false
  mainWindow.once('ready-to-show', () => {
    readyToShowFired = true
    mainWindow?.show()
    log.info('Main Window ready and visible')
  })

  // Safety net: if ready-to-show hasn't fired in 15s, force-show the window
  // This prevents the app from being permanently invisible if the renderer
  // has a non-fatal error during hydration
  setTimeout(() => {
    if (!readyToShowFired && mainWindow && !mainWindow.isDestroyed()) {
      log.warn('ready-to-show did not fire within 15s — force-showing window')
      mainWindow.show()
    }
  }, 15_000)

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
    backgroundColor: '#00000000', // Issue 16: DWM fallback — prevents solid black when compositing is disabled
    ...(process.platform === 'win32' ? { backgroundMaterial: 'acrylic' as const } : {}), // OPT-12: Win11 acrylic blur
    alwaysOnTop: true,
    hasShadow: false, // We render the drop shadow in CSS for better border-radius control
    ...(process.platform === 'darwin' ? { type: 'panel' as const } : {}), // macOS: floating utility panel
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
app
  .whenReady()
  .then(async () => {
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

    // ─── Native module health check ────────────────────────────
    // Verify critical .node binaries can be loaded BEFORE creating windows.
    // This catches wrong-architecture builds immediately with a clear error.
    const nativeModuleErrors: string[] = []

    // Check better-sqlite3 (CRITICAL — app won't start without it)
    try {
      require('better-sqlite3')
      log.info('Native module check: better-sqlite3 ✅')
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      nativeModuleErrors.push(`better-sqlite3: ${errMsg}`)
      log.error(`CRITICAL: better-sqlite3 failed to load: ${errMsg}`)
    }

    // keytar: checked asynchronously via keytarSafe() on first use (5s timeout).
    // Synchronous require('keytar') was removed because it triggers the macOS
    // Keychain access dialog BEFORE window creation — blocking the main thread
    // and making the app appear frozen (no window visible yet).
    log.info('Native module check: keytar (async, checked on first use via keytarSafe)')

    // Check onnxruntime-node (MODERATE — VAD/embeddings won't work)
    try {
      require('onnxruntime-node')
      log.info('Native module check: onnxruntime-node ✅')
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      nativeModuleErrors.push(`onnxruntime-node: ${errMsg}`)
      log.warn(
        `Native module onnxruntime-node failed to load (VAD/embeddings unavailable): ${errMsg}`
      )
    }

    // If the CRITICAL module (better-sqlite3) failed, show error and quit
    if (nativeModuleErrors.some(e => e.startsWith('better-sqlite3:'))) {
      log.error('STARTUP BLOCKED: Critical native modules failed to load')
      log.error(`Expected arch: ${process.arch}, platform: ${process.platform}`)
      log.error(`Failed modules:\n  - ${nativeModuleErrors.join('\n  - ')}`)

      dialog.showErrorBox(
        'BlueArkive Cannot Start',
        `Critical components failed to load:\n\n` +
          nativeModuleErrors.map(e => `• ${e}`).join('\n') +
          `\n\nYour system: ${process.platform} ${process.arch}\n\n` +
          'This usually means the app was built for the wrong CPU architecture. ' +
          'Please download the correct version for your Mac:\n' +
          '• Apple Silicon (M1/M2/M3/M4) → arm64 version\n' +
          '• Intel Mac → x64 version\n\n' +
          `Logs: ~/Library/Logs/BlueArkive/bluearkive.log`
      )
      app.quit()
      return
    }

    // Log non-critical failures but continue
    if (nativeModuleErrors.length > 0) {
      log.warn('Some non-critical native modules failed:', nativeModuleErrors)
    }

    // Initialize services
    log.info('Initializing services...')
    let dbInitFailed = false
    try {
      getDatabaseService() // Initialize database (delegates to connection.ts)
      CrashReporter.addBreadcrumb('lifecycle', 'Database initialized')
    } catch (dbErr) {
      dbInitFailed = true
      log.error('CRITICAL: Database initialization failed — app will start without DB:', dbErr)
      CrashReporter.addBreadcrumb('lifecycle', `Database init FAILED: ${dbErr}`)
    }

    // I2+I3: Schedule database maintenance (these functions existed but were never called)
    if (!dbInitFailed) {
      // walHealthCheck: check WAL file size every 10 minutes — emergency checkpoint if > 500MB
      const dbPath = getDatabasePath()
      const walHealthInterval = setInterval(
        () => {
          walHealthCheck(dbPath).catch((err: Error) => log.warn('WAL health check error:', err))
        },
        10 * 60 * 1000
      ) // 10 minutes
      walHealthInterval.unref() // Don't prevent app from quitting

      // optimizeDatabase: run ANALYZE + conditional VACUUM 60s after startup
      // Delayed so it doesn't block first paint or slow down DB initialization
      const optimizeTimer = setTimeout(() => {
        try {
          optimizeDatabase()
          log.info('Startup database optimization complete')
        } catch (err) {
          log.warn('Database optimization error:', err)
        }
        // J1: Purge audit logs older than 90 days (keeps min 10,000 rows)
        try {
          getAuditLogger()
            .purgeOldLogs(90, 10000)
            .then((purged: number) => {
              if (purged > 0) log.info(`Purged ${purged} audit logs older than 90 days`)
            })
            .catch((err: Error) => log.warn('Audit log purge error:', err))
        } catch {
          // AuditLogger not available
        }
      }, 60_000) // 60 seconds after startup
      optimizeTimer.unref()
    }

    // Setup IPC handlers (must be after DB init)
    setupIPC()
    CrashReporter.addBreadcrumb('lifecycle', 'IPC handlers registered')
    log.info('IPC handlers registered')

    // OPT-8: Parallelize window creation + model download service init
    // Database + IPC must be sequential, but windows can be created concurrently
    createWindow()
    createWidgetWindow()

    // Wire model download progress to the renderer window (async, non-blocking)
    if (mainWindow) {
      getModelDownloadService().setMainWindow(mainWindow)

      // Show error dialog if database failed to initialize
      if (dbInitFailed) {
        const { dialog } = require('electron')
        dialog.showErrorBox(
          'Database Error',
          'BlueArkive could not initialize its database. Some features may not work.\n\n' +
            'Try restarting the app. If the problem persists, check the logs at:\n' +
            '~/Library/Logs/BlueArkive/bluearkive.log'
        )
      }
    }

    // Register Global OS Hotkey for instant recording
    // Issue 17: Check registration success — Ctrl+Shift+Space conflicts with CJK IME on Windows
    const shortcutHandler = () => {
      log.info('Global shortcut triggered')
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.show()
        mainWindow.focus()
        mainWindow.webContents.send('global-shortcut:start-recording')
      }
    }
    const registered = globalShortcut.register('CommandOrControl+Shift+Space', shortcutHandler)
    if (!registered) {
      log.warn('Primary shortcut Ctrl+Shift+Space failed (IME conflict?), trying fallback...')
      const fallback = globalShortcut.register('CommandOrControl+Shift+F9', shortcutHandler)
      if (fallback) {
        log.info('Fallback shortcut Ctrl+Shift+F9 registered')
      } else {
        log.error('Both primary and fallback global shortcuts failed to register')
      }
    }

    // On macOS, re-create window when dock icon is clicked and no windows are open
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
        createWidgetWindow()
        log.info('Re-created windows from dock activation')
      }
    })

    // Register deep-link protocol (bluearkive://)
    // Issue 28: Fix dev mode on Windows — pass process.execPath + project path
    if (!app.isDefaultProtocolClient('bluearkive')) {
      if (app.isPackaged) {
        app.setAsDefaultProtocolClient('bluearkive')
      } else if (process.platform === 'win32') {
        app.setAsDefaultProtocolClient('bluearkive', process.execPath, [
          path.resolve(process.argv[1] || '.'),
        ])
      } else {
        app.setAsDefaultProtocolClient('bluearkive')
      }
    }

    // macOS: handle deep links via open-url event
    app.on('open-url', async (_event, url) => {
      if (mainWindow) {
        // Route auth callbacks to AuthService (Issue 27 fix)
        if (url.includes('/auth/callback')) {
          try {
            const result = await getAuthService().handleOAuthCallback(url)
            mainWindow.webContents.send('auth:oauthSuccess', result)
          } catch (err) {
            mainWindow.webContents.send('auth:oauthError', { error: String(err) })
          }
        } else {
          mainWindow.webContents.send('deep-link', url)
        }
      }
    })

    // Check for updates (10s after launch — non-blocking)
    // Wrapped in try/catch to prevent unhandled rejections from crashing the app
    if (autoUpdater) {
      setTimeout(async () => {
        try {
          log.info('Auto-update check initiated')
          await autoUpdater?.checkForUpdatesAndNotify()
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err)
          log.warn('Auto-update check failed (no releases published?):', errMsg)
        }
      }, 10_000)
    }

    // OPT-21: Content Security Policy — blocks inline scripts from AI-generated content
    // Critical security fix: sandbox:false + no CSP = RCE vector via innerHTML injection
    // Dev mode: Vite's @vitejs/plugin-react injects an inline preamble script for
    // Fast Refresh / HMR. Without 'unsafe-inline', CSP blocks it and the app crashes.
    // Production: built bundle has zero inline scripts, so strict 'self' is safe.
    const isDev = !app.isPackaged
    const scriptSrc = isDev ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'"

    session.defaultSession.webRequest.onHeadersReceived(
      (
        details: { responseHeaders?: Record<string, string[]> },
        callback: (response: { responseHeaders?: Record<string, string[]> }) => void
      ) => {
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            'Content-Security-Policy': [
              "default-src 'self'; " +
                `${scriptSrc}; ` +
                "connect-src 'self' https://*.supabase.co wss://*.deepgram.com https://api.deepgram.com https://api.piyapi.cloud https://dl.bluearkive.com; " +
                "style-src 'self' 'unsafe-inline'; " +
                "img-src 'self' data: blob:; " +
                "font-src 'self'; " +
                "media-src 'self' mediastream: blob:;",
            ],
          },
        })
      }
    )

    // OPT-13: GPU crash recovery — reload renderer instead of blank screen
    if (mainWindow) {
      mainWindow.webContents.on('render-process-gone', (_event, details) => {
        log.error(`Renderer process gone: ${details.reason} (exit code: ${details.exitCode})`)
        if (details.reason === 'crashed' || details.reason === 'oom') {
          log.info('Attempting renderer reload after crash...')
          setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.reload()
            }
          }, 1000)
        }
      })

      app.on('child-process-gone', (_event, details) => {
        log.error(`Child process gone: ${details.type} — ${details.reason}`)
        if (details.type === 'GPU' && mainWindow && !mainWindow.isDestroyed()) {
          log.warn('GPU process crashed — UI may need reload')
        }
      })
    }

    // Issue 26: Auto-launch at login on Windows (production only)
    // Only set on first launch — subsequent launches respect user's choice
    // Users can disable via Windows Settings → Startup Apps
    if (process.platform === 'win32' && app.isPackaged) {
      const loginSettings = app.getLoginItemSettings()
      if (!loginSettings.wasOpenedAtLogin && loginSettings.openAtLogin === false) {
        // First launch (or user hasn't been registered yet) — register once
        app.setLoginItemSettings({
          openAtLogin: true,
          openAsHidden: true,
        })
        log.info('Windows auto-launch registered (first time)')
      }
    }
  })
  .catch(err => {
    log.error('FATAL: Startup failed:', err)
    dialog.showErrorBox(
      'BlueArkive Failed to Start',
      `An unexpected error occurred during startup:\n\n${err instanceof Error ? err.message : String(err)}\n\n` +
        'Please check the logs at:\n~/Library/Logs/BlueArkive/bluearkive.log'
    )
    app.quit()
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
