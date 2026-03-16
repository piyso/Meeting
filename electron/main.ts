import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  screen,
  session,
  Tray,
  Menu,
  nativeImage,
} from 'electron'
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
import { getModelManager } from '../src/main/services/ModelManager'

const log = Logger.create('Main')

// ─── Tray icon (kept alive so GC doesn't collect it) ─────────────
let tray: Tray | null = null

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

// ─── Auto-updater (LAZY — loaded 10s after window shows) ───────────────
function initAutoUpdater() {
  try {
    const { autoUpdater: updater } = require('electron-updater')
    updater.logger = log
    updater.autoDownload = true
    updater.autoInstallOnAppQuit = true

    updater.on('error', (err: Error) => {
      log.warn('Auto-updater error (likely network/offline):', err.message)
    })

    // Re-check for updates every 4 hours
    const FOUR_HOURS_MS = 4 * 60 * 60 * 1000
    const interval = setInterval(() => {
      updater.checkForUpdatesAndNotify().catch(() => {})
    }, FOUR_HOURS_MS)
    interval.unref()

    // Initial check
    updater.checkForUpdatesAndNotify().catch(() => {})
    log.info('Auto-updater initialized (lazy)')
  } catch {
    // Not installed or in development, skip
  }
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
      // Security: validate deep-link route against allowlist
      // Note: new URL('bluearkive://meeting/123') parses 'meeting' as hostname,
      // so we must check host+pathname to reconstruct the full route.
      const ALLOWED_ROUTES = ['meeting', 'import', 'settings', 'note']
      try {
        const parsed = new URL(deepLink)
        const route = parsed.host // e.g. 'meeting', 'settings', 'import'
        if (ALLOWED_ROUTES.includes(route)) {
          mainWindow.webContents.send('deep-link', deepLink)
        } else {
          log.warn('Blocked deep-link with unknown route:', route)
        }
      } catch {
        log.warn('Blocked malformed deep-link URL:', deepLink)
      }
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

  // Safety net: if ready-to-show hasn't fired in 3s, force-show the window
  // Reduced from 15s — users should never wait more than 3s to see something
  setTimeout(() => {
    if (!readyToShowFired && mainWindow && !mainWindow.isDestroyed()) {
      log.warn('ready-to-show did not fire within 3s — force-showing window')
      mainWindow.show()
    }
  }, 3_000)

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
    ...(process.platform === 'darwin'
      ? { type: 'panel' as const, vibrancy: 'under-window' as const }
      : {}), // macOS: floating utility panel + vibrancy (~40% GPU reduction)
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

  // Make widget visible on all macOS Spaces and over fullscreen apps
  if (process.platform === 'darwin') {
    widgetWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }

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

    // ─── PHASE 1: Essential init (fast, ~300ms) ────────────────
    // These MUST complete before window creation because the renderer
    // sends IPC calls as soon as React mounts. If IPC handlers aren't
    // registered yet, those calls silently fail → broken UI.

    // Migrate data from old app name (piyapi-notes → bluearkive)
    // MUST run before DB init to copy old DB if it exists
    await migrateIfNeeded()
    CrashReporter.addBreadcrumb('lifecycle', 'Migration check complete')

    // ─── Native module health check ────────────────────────────
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

    // keytar: checked asynchronously via keytarSafe() on first use (5s timeout)
    log.info('Native module check: keytar (async, checked on first use via keytarSafe)')

    // onnxruntime-node: LAZY — checked on first recording, not at startup
    // This saves ~1s of cold-start time. The module is only needed for VAD/embeddings.
    log.info('Native module check: onnxruntime-node (deferred to first recording)')

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
      getDatabaseService()
      CrashReporter.addBreadcrumb('lifecycle', 'Database initialized')
    } catch (dbErr) {
      dbInitFailed = true
      log.error('CRITICAL: Database initialization failed — app will start without DB:', dbErr)
      CrashReporter.addBreadcrumb('lifecycle', `Database init FAILED: ${dbErr}`)
    }

    // Schedule database maintenance
    if (!dbInitFailed) {
      const dbPath = getDatabasePath()
      const walHealthInterval = setInterval(
        () => {
          walHealthCheck(dbPath).catch((err: Error) => log.warn('WAL health check error:', err))
        },
        10 * 60 * 1000
      )
      walHealthInterval.unref()

      const optimizeTimer = setTimeout(() => {
        try {
          optimizeDatabase()
          log.info('Startup database optimization complete')
        } catch (err) {
          log.warn('Database optimization error:', err)
        }
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
      }, 60_000)
      optimizeTimer.unref()
    }

    // IPC handlers — MUST be registered before createWindow()
    // because renderer sends IPC calls as soon as React mounts
    setupIPC()
    CrashReporter.addBreadcrumb('lifecycle', 'IPC handlers registered')
    log.info('IPC handlers registered')

    // ─── PHASE 2: Create windows ───────────────────────────────
    // IPC is now ready — renderer can safely send calls on mount
    createWindow()
    createWidgetWindow()
    log.info('Windows created — user sees splash screen')

    // Wire model download progress to the renderer window (async, non-blocking)
    if (mainWindow) {
      getModelDownloadService().setMainWindow(mainWindow)

      if (dbInitFailed) {
        dialog.showErrorBox(
          'Database Error',
          'BlueArkive could not initialize its database. Some features may not work.\n\n' +
            'Try restarting the app. If the problem persists, check the logs at:\n' +
            '~/Library/Logs/BlueArkive/bluearkive.log'
        )
      }
    }

    // ─── PHASE 3: Deferred work (non-blocking) ─────────────────
    // Tray icon — non-critical, if it fails app still works
    try {
      const iconPath = app.isPackaged
        ? path.join(process.resourcesPath, 'assets', 'tray-icon.png')
        : path.join(__dirname, '../resources/icons/tray-icon.png')

      let trayIcon: Electron.NativeImage
      try {
        trayIcon = nativeImage.createFromPath(iconPath)
        if (trayIcon.isEmpty()) throw new Error('empty')
      } catch {
        // Fallback: use build icon instead of empty (empty crashes Tray on macOS)
        // __dirname resolves to app.asar/dist-electron in prod, so '../build' works
        // leverage Electron's transparent asar interception.
        const fallbackPath = path.join(__dirname, '..', 'build', 'icon.png')
        trayIcon = nativeImage.createFromPath(fallbackPath)
        if (trayIcon.isEmpty()) {
          log.warn(`Tray: no icon available at ${fallbackPath} — skipping tray`)
          throw new Error('no icon')
        }
      }

      if (process.platform === 'darwin') {
        trayIcon = trayIcon.resize({ width: 16, height: 16 })
        trayIcon.setTemplateImage(true)
      }

      tray = new Tray(trayIcon)
      tray.setToolTip('BlueArkive')
      const contextMenu = Menu.buildFromTemplate([
        {
          label: 'Show BlueArkive',
          click: () => {
            if (mainWindow) {
              if (mainWindow.isMinimized()) mainWindow.restore()
              mainWindow.show()
              mainWindow.focus()
            } else {
              createWindow()
            }
          },
        },
        { type: 'separator' },
        { label: `v${app.getVersion()}`, enabled: false },
        { type: 'separator' },
        { label: 'Quit', click: () => app.quit() },
      ])
      tray.setContextMenu(contextMenu)
      tray.on('click', () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore()
          mainWindow.show()
          mainWindow.focus()
        }
      })
      log.info('Tray icon created')
    } catch (trayErr) {
      log.warn('Tray icon creation failed (non-critical):', trayErr)
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
          // Security: validate deep-link route against allowlist
          // Note: new URL('bluearkive://meeting/123') parses 'meeting' as hostname,
          // so we must check host+pathname to reconstruct the full route.
          const ALLOWED_ROUTES = ['meeting', 'import', 'settings', 'note']
          try {
            const parsed = new URL(url)
            const route = parsed.host // e.g. 'meeting', 'settings', 'import'
            if (ALLOWED_ROUTES.includes(route)) {
              mainWindow.webContents.send('deep-link', url)
            } else {
              log.warn('Blocked deep-link with unknown route:', route)
            }
          } catch {
            log.warn('Blocked malformed deep-link URL:', url)
          }
        }
      }
    })

    // LAZY: Initialize auto-updater 10s after window shows
    // Moved from module level to here — saves ~200ms at startup
    setTimeout(() => {
      initAutoUpdater()
    }, 10_000)

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
    // Disabled by default — users can enable via Settings.
    // Auto-enabling without consent violates Microsoft Store guidelines.
    // The setting is available in Settings > General > "Launch at startup"
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

// Handle .pnotes file open (macOS Finder / double-click)
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  log.info(`open-file event: ${filePath}`)
  // Security: validate file extension and path
  if (filePath.endsWith('.pnotes')) {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('file:open', filePath)
      win.focus()
    }
  } else {
    log.warn('Blocked open-file with non-.pnotes extension:', filePath)
  }
})

// Handle app quit
app.on('before-quit', async () => {
  log.info('Application quitting — starting cleanup...')

  // Cleanup tray icon and dock badge (prevent leaked OS resources)
  if (tray) {
    tray.destroy()
    tray = null
  }
  if (process.platform === 'darwin') {
    try {
      app.dock?.setBadge('')
    } catch {
      /* ignore */
    }
  }

  try {
    // Stop audio capture and flush any buffered audio
    try {
      const pipeline = getAudioPipelineService()
      if (pipeline.getStatus().isCapturing) {
        log.info('Flushing audio pipeline before quit...')
        await pipeline.stopCapture()
      }
    } catch (e) {
      log.debug('AudioPipelineService cleanup skipped:', e instanceof Error ? e.message : String(e))
    }

    // Terminate ASR worker thread
    try {
      await getASRService().terminate()
    } catch (e) {
      log.debug('ASRService cleanup skipped:', e instanceof Error ? e.message : String(e))
    }

    // #37: Unload ONNX models + dispose GPU sessions to free VRAM
    try {
      await getModelManager().forceUnload()
    } catch (e) {
      log.debug('ModelManager cleanup skipped:', e instanceof Error ? e.message : String(e))
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
