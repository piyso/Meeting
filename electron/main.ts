// ─── STARTUP CRASH GUARD ──────────────────────────────────────────
// This block MUST stay at the very top of the file, before any imports
// that touch native modules (better-sqlite3, onnxruntime-node, keytar).
// If a native module fails to load (wrong arch, missing DLL, etc.),
// this ensures we get diagnostic output instead of a silent crash.
// ───────────────────────────────────────────────────────────────────
process.stderr.write(
  `[BlueArkive] Starting (${process.platform}/${process.arch}, pid=${process.pid})...\n`
)

// A closed or detached stdout/stderr (terminal closed, launched from Finder)
// makes every console.* call fail. That is not an application error: swallow
// it at the stream so it never reaches the uncaughtException handler.
for (const stream of [process.stdout, process.stderr]) {
  try {
    stream?.on?.('error', () => {})
  } catch {
    /* stream unavailable */
  }
}

/** Set once startup has finished; after that an uncaught error is logged, not fatal. */
let startupComplete = false
let markStartupFinished: () => void = () => {}
/** Resolves with `startupComplete` — for work that needs the database and cannot run before it. */
const startupFinished = new Promise<void>(resolve => {
  markStartupFinished = resolve
})
const BROKEN_STDIO_CODES = new Set([
  'EPIPE',
  'EIO',
  'ERR_STREAM_DESTROYED',
  'ERR_STREAM_WRITE_AFTER_END',
])

process.on('uncaughtException', (err: NodeJS.ErrnoException) => {
  // Broken stdio (terminal closed) — crash.log recorded 254 exits from
  // "write EIO" alone, each one killing the app mid-session.
  if (err.code && BROKEN_STDIO_CODES.has(err.code)) return
  if (err.syscall === 'write' && (err.code === 'EIO' || err.code === 'EPIPE')) return

  // Attempt to write crash log BEFORE requiring electron (which may be the thing that failed)
  try {
    const fs = require('fs')
    const nodePath = require('path')
    const logDir = nodePath.join(
      process.env.APPDATA || process.env.HOME || require('os').tmpdir(),
      'BlueArkive'
    )
    fs.mkdirSync(logDir, { recursive: true })
    const crashLogPath = nodePath.join(logDir, 'crash.log')
    fs.appendFileSync(
      crashLogPath,
      `[${new Date().toISOString()}] ${startupComplete ? 'ERROR' : 'FATAL'}: ${err.message}\n${err.stack || ''}\n\n`
    )
    process.stderr.write(`[BlueArkive] Crash logged to: ${crashLogPath}\n`)
  } catch {
    // Last resort: stderr
    try {
      process.stderr.write(`[BlueArkive] FATAL (could not write crash log): ${err.message}\n`)
    } catch {
      /* stderr is gone too */
    }
  }

  // Once the app is up, one faulty handler must not take down a recording in
  // progress along with its unflushed audio and open database. Log and carry on.
  if (startupComplete) return

  // Try to show an OS-level error dialog (may fail if electron itself crashed)
  try {
    const { dialog: dlg } = require('electron')
    dlg.showErrorBox(
      'BlueArkive Crashed',
      `${err.message}\n\n` +
        `Platform: ${process.platform}/${process.arch}\n` +
        `Check crash log at:\n` +
        `  ${process.platform === 'win32' ? '%APPDATA%\\BlueArkive\\crash.log' : '~/BlueArkive/crash.log'}\n\n` +
        `Stack: ${err.stack?.substring(0, 500) || 'N/A'}`
    )
  } catch {
    // dialog unavailable — silent exit
  }

  process.exit(1)
})
// ─── END CRASH GUARD ──────────────────────────────────────────────

import {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  globalShortcut,
  ipcMain,
  powerMonitor,
  screen,
  session,
  shell,
  Tray,
  Menu,
  nativeImage,
  Notification,
} from 'electron'
import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
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
import { isCrashReportingAllowed } from '../src/main/services/privacySettings'
import { migrateIfNeeded } from '../src/main/services/MigrationService'
import { getModelDownloadService } from '../src/main/services/ModelDownloadService'
import { getAuditLogger } from '../src/main/services/AuditLogger'
import { getAuthService } from '../src/main/services/AuthService'
import { config } from '../src/main/config/environment'
import {
  parseUpdatePublicKey,
  updateManifestName,
  verifyDownloadedUpdate,
  type UpdateVerdict,
} from '../src/main/services/UpdateVerifier'
import {
  getAudioPipelineService,
  isSystemAudioCaptureSupported,
} from '../src/main/services/AudioPipelineService'
import { getASRService } from '../src/main/services/ASRService'
import { getModelManager } from '../src/main/services/ModelManager'
import { getDatabaseMigrationService } from '../src/main/services/DatabaseMigrationService'
import { getPowerMonitorService } from '../src/main/services/PowerMonitorService'
import { getAudioProvenanceService } from '../src/main/services/AudioProvenanceService'
// Static imports: a bare require('../src/...') survives bundling as a literal
// path that does not exist next to dist-electron/main.js, so the shutdown
// cleanup that used it silently never ran.
import { EncryptionService } from '../src/main/services/EncryptionService'
import { resetBackend } from '../src/main/services/backend/BackendSingleton'
import {
  importMeetingFromPath,
  recoverMeetingsOnStartup,
} from '../src/main/ipc/handlers/meeting.handlers'

const log = Logger.create('Main')

// ─── Tray icon (kept alive so GC doesn't collect it) ─────────────
let tray: Tray | null = null

// ─── Global Error Handling ─────────────────────────────────
// NOTE: The top-level uncaughtException handler (crash guard) handles
// fatal native module failures. This handler covers runtime errors
// AFTER the app has successfully initialized.
process.on('unhandledRejection', (reason, promise) => {
  log.error('UNHANDLED PROMISE REJECTION:', { reason, promise })
})

// H-7 AUDIT: Single source of truth for deep-link route validation (was duplicated in two places)
// Each has a handler in the renderer (useLaunchRequests); 'import' was listed
// for years with nothing behind it.
const DEEP_LINK_ROUTES = ['meeting', 'settings', 'note'] as const

// ─── Auto-updater (LAZY — loaded 10s after window shows) ───────────────
function initAutoUpdater() {
  try {
    const { autoUpdater: updater } = require('electron-updater')
    updater.logger = log
    updater.autoDownload = true

    // Built with a publisher key: on Windows and Linux a downloaded update is
    // installed only once UpdateVerifier has passed it (see that file for
    // why). macOS needs none of this — Squirrel.Mac itself refuses an update
    // that is not signed with the identity of the running app.
    const publisherKey = parseUpdatePublicKey(config.UPDATE_PUBLIC_KEY)
    const keyUnusable = !!config.UPDATE_PUBLIC_KEY && !publisherKey
    const verifyBeforeInstall = process.platform !== 'darwin' && (!!publisherKey || keyUnusable)
    if (keyUnusable) {
      log.error('UPDATE_PUBLIC_KEY is set but is not a usable key — updates will not be installed')
    }
    // Held back until verified; the updater only installs on quit while this is true.
    updater.autoInstallOnAppQuit = !verifyBeforeInstall

    const announce = (version: string) => {
      if (!Notification.isSupported()) return
      new Notification({
        title: `${config.APP_NAME} ${version} is ready`,
        body: 'The update will be installed when you quit the app.',
      }).show()
    }

    updater.on('update-downloaded', (info: { version: string; downloadedFile?: string }) => {
      if (!verifyBeforeInstall) {
        announce(info.version)
        return
      }
      void (async () => {
        const verdict: UpdateVerdict =
          publisherKey && info.downloadedFile
            ? await verifyDownloadedUpdate({
                feedUrl: config.UPDATE_FEED_URL,
                manifestName: updateManifestName(),
                publicKey: publisherKey,
                version: info.version,
                downloadedFile: info.downloadedFile,
              })
            : { ok: false, reason: 'this build has no usable publisher key' }

        if (verdict.ok) {
          log.info(`Update ${info.version} verified — it will be installed on quit`)
          updater.autoInstallOnAppQuit = true
          // The updater registers its install-on-quit hook when the download
          // finishes, and skipped it then because installing was held back.
          updater.addQuitHandler?.()
          announce(info.version)
          return
        }

        updater.autoInstallOnAppQuit = false
        log.error(`Update ${info.version} was NOT installed: ${verdict.reason}`)
        if (info.downloadedFile) {
          // Nothing must be able to run it later.
          await fs.promises.rm(info.downloadedFile, { force: true }).catch(() => undefined)
        }
      })()
    })

    updater.on('error', (err: Error) => {
      log.warn('Auto-updater error (likely network/offline):', err.message)
    })

    // Re-check for updates every 4 hours
    const FOUR_HOURS_MS = 4 * 60 * 60 * 1000
    const interval = setInterval(() => {
      updater.checkForUpdates().catch(() => {})
    }, FOUR_HOURS_MS)
    interval.unref()

    // Initial check
    updater.checkForUpdates().catch(() => {})
    log.info(
      `Auto-updater initialized (lazy)${verifyBeforeInstall ? ' — updates are verified against the publisher key' : ''}`
    )
  } catch {
    // Not installed or in development, skip
  }
}

// ─── Single instance lock ────────────────────────────────
// On Windows (especially post-install), the NSIS installer may launch the app
// while a previous zombie process or installer is still running. We quit
// immediately without waiting for app.whenReady() to avoid hanging.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  // The running instance receives 'second-instance' (with our argv, including
  // any deep link) and brings its window forward — which is all a second
  // launch should do. The startup sequence below is skipped via `gotLock`:
  // it used to run in full here, opening the database and running migrations
  // alongside the first instance.
  log.warn('Another instance is already running — handing off and quitting')
  app.quit()
}

export let isQuitting = false
/** Set when macOS/Linux announces a logout, restart or shutdown. */
let systemShuttingDown = false
let mainWindow: BrowserWindow | null = null
let widgetWindow: BrowserWindow | null = null

/** Bring the main window to the front, creating it if it was destroyed. */
function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    if (app.isReady() && startupComplete) createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  // The close button only hides the window, so focus() alone is not enough.
  if (!mainWindow.isVisible()) mainWindow.show()
  mainWindow.focus()
}

// ─── Deep links & file opens ─────────────────────────────────────
// These can arrive before the window exists (the app was launched *by* the
// link or the file). They are queued and delivered once the renderer loads.
let rendererReady = false
const pendingRendererMessages: Array<{ channel: string; payload: unknown }> = []

function sendToRenderer(channel: string, payload: unknown): void {
  if (rendererReady && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload)
  } else {
    pendingRendererMessages.push({ channel, payload })
  }
}

let rendererReadyFallback: ReturnType<typeof setTimeout> | null = null

ipcMain.on('app:rendererReady', event => {
  // The widget has a preload of its own; only the main window reports here.
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) return
  flushPendingRendererMessages()
})

function flushPendingRendererMessages(): void {
  rendererReady = true
  if (rendererReadyFallback) {
    clearTimeout(rendererReadyFallback)
    rendererReadyFallback = null
  }
  if (!mainWindow || mainWindow.isDestroyed()) return
  for (const { channel, payload } of pendingRendererMessages.splice(0)) {
    mainWindow.webContents.send(channel, payload)
  }
}

async function handleDeepLink(url: string): Promise<void> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    log.warn('Blocked malformed deep-link URL')
    return
  }
  if (parsed.protocol !== 'bluearkive:') return

  // new URL('bluearkive://meeting/123') parses 'meeting' as the host.
  const route = parsed.host

  // Route auth callbacks to AuthService (Issue 27 fix). Match the exact
  // route — a substring test also matched e.g. bluearkive://x/auth/callback.
  if (route === 'auth' && parsed.pathname.replace(/\/$/, '') === '/callback') {
    try {
      const result = await getAuthService().handleOAuthCallback(url)
      // The renderer needs to know who signed in — never the tokens.
      sendToRenderer('auth:oauthSuccess', { user: result.user })
    } catch (err) {
      sendToRenderer('auth:oauthError', { error: err instanceof Error ? err.message : String(err) })
    }
    showMainWindow()
    return
  }

  // "Forgot password" email link → recovery session → ask for a new password.
  if (route === 'auth' && parsed.pathname.replace(/\/$/, '') === '/reset-password') {
    try {
      const { email } = await getAuthService().beginPasswordRecovery(url)
      sendToRenderer('auth:passwordRecovery', { email })
    } catch (err) {
      sendToRenderer('auth:passwordRecovery', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
    showMainWindow()
    return
  }

  // Security: validate deep-link route against allowlist
  if ((DEEP_LINK_ROUTES as readonly string[]).includes(route)) {
    sendToRenderer('deep-link', url)
    showMainWindow()
  } else {
    log.warn('Blocked deep-link with unknown route:', route)
  }
}

function handleOpenFile(filePath: string): void {
  log.info(`open-file event: ${filePath}`)
  // Only the app's own meeting files; the import checks the rest (it is a
  // regular file, its size, every field in it).
  if (!filePath.toLowerCase().endsWith('.pnotes')) {
    log.warn('Blocked open-file with non-.pnotes extension:', filePath)
    return
  }
  showMainWindow()
  void (async () => {
    // The file may be what launched the app: the database opens during startup.
    await startupFinished
    try {
      sendToRenderer('meeting:imported', { result: await importMeetingFromPath(filePath) })
    } catch (err) {
      log.warn('Meeting file not imported:', err instanceof Error ? err.message : err)
      sendToRenderer('meeting:imported', {
        error: err instanceof Error ? err.message : 'The file could not be imported.',
      })
    }
  })()
}

/** Windows/Linux deliver deep links and associated files through argv. */
function handleLaunchArgs(argv: string[]): void {
  const deepLink = argv.find(arg => arg.startsWith('bluearkive://'))
  if (deepLink) {
    handleDeepLink(deepLink).catch(err => log.warn('Deep link handling failed:', err))
  }
  const file = argv.find(arg => !arg.startsWith('-') && arg.toLowerCase().endsWith('.pnotes'))
  if (file) handleOpenFile(file)
}

// Focus existing window when a second instance is launched (or deep link received)
app.on('second-instance', (_event, argv) => {
  showMainWindow()
  handleLaunchArgs(argv)
})

// macOS delivers deep links and file opens as events, and can fire them before
// 'ready' when the link/file is what launched the app — so register at load.
app.on('open-url', (event, url) => {
  event.preventDefault()
  handleDeepLink(url).catch(err => log.warn('Deep link handling failed:', err))
})

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

/** The dev server origin while developing, otherwise null. */
function getDevServerUrl(): string | null {
  return process.env.VITE_DEV_SERVER_URL || (!app.isPackaged ? 'http://localhost:5173' : null)
}

/**
 * True only for the app's own pages: the dev server, or files inside the
 * packaged dist/ folder. A blanket `file://` allowance would let any local
 * HTML file load in a window that has the preload API.
 */
function isAppUrl(url: string): boolean {
  const devServer = getDevServerUrl()
  if (devServer) {
    try {
      return new URL(url).origin === new URL(devServer).origin
    } catch {
      return false
    }
  }
  const distRoot = pathToFileURL(path.join(__dirname, '../dist')).href
  return url === distRoot || url.startsWith(distRoot + '/')
}

/** Hand a link to the OS browser — web links only, never file:, smb:, or custom schemes. */
function openExternalSafely(url: string): void {
  try {
    const { protocol } = new URL(url)
    if (protocol === 'https:' || protocol === 'http:' || protocol === 'mailto:') {
      shell.openExternal(url).catch(err => log.warn('openExternal failed:', err))
      return
    }
  } catch {
    /* fall through */
  }
  log.warn('Refused to open non-web URL externally')
}

/** Origin + path only — query strings can carry tokens. */
function safeUrlForLog(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return '(unparseable url)'
  }
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
    // On Windows, use frameless for custom title bar — unless --safe-mode is passed
    frame: process.platform === 'darwin' ? true : process.argv.includes('--safe-mode'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      // The preload only uses contextBridge + ipcRenderer (its bundle requires
      // nothing but 'electron'), so the renderer can run fully sandboxed.
      sandbox: true,
      webSecurity: true, // SECURITY: Enforce same-origin policy (Cluely CVE #1 defense)
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
  const devUrl =
    process.env.VITE_DEV_SERVER_URL || (!app.isPackaged ? 'http://localhost:5173' : null)
  if (devUrl) {
    mainWindow.loadURL(devUrl)
    mainWindow.webContents.openDevTools()
    log.debug('Loaded dev server', { url: devUrl })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
    log.info('Loaded production bundle')
  }

  // SECURITY: Block navigation to external URLs (CVE-class defense)
  // This prevents malicious links from navigating the entire Electron window
  // to an attacker-controlled page, which would give full renderer control.
  // Cluely lacks this handler — it's attack vector #2 in our forensic audit.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isAppUrl(url)) return

    // Block all other navigation — open in external browser instead
    log.warn('Blocked navigation attempt to:', safeUrlForLog(url))
    event.preventDefault()
    openExternalSafely(url)
  })

  // Open external links securely in the default OS browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafely(url)
    return { action: 'deny' }
  })

  // Deliver deep links / file opens that arrived before the renderer existed.
  // The renderer says when its listeners are registered ('app:rendererReady');
  // this used to be a guess of 500 ms after load, which a slow start missed —
  // the message went out before anything was listening and was lost. The
  // timer is only for a renderer that never reports in.
  mainWindow.webContents.on('did-finish-load', () => {
    if (rendererReadyFallback) clearTimeout(rendererReadyFallback)
    rendererReadyFallback = setTimeout(() => {
      if (!rendererReady) {
        log.warn('Renderer did not report ready within 10s — delivering queued messages anyway')
        flushPendingRendererMessages()
      }
    }, 10_000)
  })
  mainWindow.webContents.on('did-start-loading', () => {
    rendererReady = false
  })

  // Handle window close to background it instead of destroying it
  mainWindow.on('close', event => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    rendererReady = false
    log.info('Main window closed')
  })

  // OPT-13: GPU crash recovery — reload renderer instead of blank screen.
  // Attached here (not once at startup) so a re-created window gets it too.
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    log.error(`Renderer process gone: ${details.reason} (exit code: ${details.exitCode})`)
    rendererReady = false
    if (details.reason === 'crashed' || details.reason === 'oom') {
      log.info('Attempting renderer reload after crash...')
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.reload()
        }
      }, 1000)
    }
  })

  // Handle spatial handoff to widget
  const triggerHandoff = () => {
    // The windows are hidden on the way out; that must not summon the widget.
    if (isQuitting) return
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      widgetWindow.showInactive()
      widgetWindow.webContents.send('widget:spatialHandoff', { state: 'orb' })
    }
  }

  mainWindow.on('minimize', triggerHandoff)
  mainWindow.on('hide', triggerHandoff)

  // Ensure widget hides automatically if main window is shown
  // (e.g. from dock icon, system tray, or deep link)
  mainWindow.on('show', () => {
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      widgetWindow.webContents.send('widget:spatialHandoff', { state: 'hidden' })
      // Give the CSS fade out animation time before hiding the OS window
      setTimeout(() => {
        if (widgetWindow && !widgetWindow.isDestroyed()) {
          widgetWindow.hide()
        }
      }, 250)
    }
  })
}

const WIDGET_WIDTH = 480
const WIDGET_HEIGHT = 800
const WIDGET_PADDING = 24 // Distance from the right/bottom edge of the screen
let widgetCrashTimes: number[] = []

/** Bottom-right corner of a display's work area, kept fully on-screen. */
function widgetHomePosition(
  workArea: Electron.Rectangle,
  width: number,
  height: number
): { x: number; y: number } {
  return {
    x: Math.max(workArea.x, workArea.x + workArea.width - width - WIDGET_PADDING),
    y: Math.max(workArea.y, workArea.y + workArea.height - height - WIDGET_PADDING),
  }
}

const createWidgetWindow = () => {
  try {
    // workArea has its own origin (menu bar, left/top docked taskbars), and on
    // small screens (e.g. 1366×768) the widget is taller than the work area —
    // clamp so it can never be placed above or left of the visible region.
    const workArea = screen.getPrimaryDisplay().workArea
    const widgetWidth = Math.min(WIDGET_WIDTH, workArea.width)
    const widgetHeight = Math.min(WIDGET_HEIGHT, workArea.height)
    const { x: widgetX, y: widgetY } = widgetHomePosition(workArea, widgetWidth, widgetHeight)

    // Create the transparent, always-on-top widget window
    widgetWindow = new BrowserWindow({
      width: widgetWidth,
      height: widgetHeight,
      x: widgetX,
      y: widgetY,
      frame: false,
      transparent: true,
      ...(process.platform === 'win32' ? { backgroundMaterial: 'acrylic' as const } : {}), // OPT-12: Win11 acrylic blur
      alwaysOnTop: true,
      focusable: false,
      hasShadow: false, // We render the drop shadow in CSS for better border-radius control
      resizable: false,
      // Shown on demand: when the main window hides/minimizes, when a
      // recording starts, or via the tray / Cmd+Alt+Shift+W.
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload-widget.js'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
      title: 'BlueArkive Widget',
    })

    // Force remove shadow after creation to workaround macOS bug where transparent windows still render a faint ghost shadow
    widgetWindow.setHasShadow(false)

    // Make widget visible on all macOS Spaces and over fullscreen apps
    if (process.platform === 'darwin') {
      widgetWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    }
    widgetWindow.setAlwaysOnTop(true, 'screen-saver')

    // Load the separate WidgetApp HTML entry point
    const devWidgetUrl =
      process.env.VITE_DEV_SERVER_URL || (!app.isPackaged ? 'http://localhost:5173/' : null)
    if (devWidgetUrl) {
      widgetWindow.loadURL(`${devWidgetUrl.replace(/\/?$/, '/')}widget-index.html`)
    } else {
      widgetWindow.loadFile(path.join(__dirname, '../dist/widget-index.html'))
    }

    // W5 fix: Log when widget content is ready — confirms the HTML loaded and rendered
    widgetWindow.webContents.on('did-finish-load', () => {
      log.info('Widget window content loaded successfully')
    })

    // W5 fix: Catch widget load failures — previously silent, making diagnosis impossible
    widgetWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
      log.error(`Widget window failed to load: ${errorCode} — ${errorDescription}`)
    })

    // W10 fix: Prevent Chromium from overwriting the BrowserWindow title with the HTML <title>.
    // getWidgetWindow() relies on title === 'BlueArkive Widget' for identification.
    // Without this, any HTML <title> mismatch silently kills all widget IPC.
    widgetWindow.on('page-title-updated', event => {
      event.preventDefault()
    })

    // W11 fix: Auto-recover from widget renderer crashes (OOM, GPU crash, etc.)
    // Without this, a crashed widget becomes a zombie — invisible, unresponsive,
    // and the user has no way to interact with the recording overlay.
    widgetWindow.webContents.on('render-process-gone', (_event, details) => {
      log.error(`Widget renderer crashed: ${details.reason} (exit ${details.exitCode})`)
      if (widgetWindow && !widgetWindow.isDestroyed()) {
        widgetWindow.destroy()
        widgetWindow = null
      }
      if (isQuitting) return

      // Recreate — but not forever. A widget that cannot stay up (e.g. no
      // transparent-window support on this GPU) would otherwise respawn every
      // 1.5s for the life of the app.
      const now = Date.now()
      widgetCrashTimes = widgetCrashTimes.filter(t => now - t < 60_000)
      widgetCrashTimes.push(now)
      if (widgetCrashTimes.length > 3) {
        log.error('Widget crashed repeatedly — not recreating until next launch')
        return
      }
      // Recreate after a brief delay to let Chromium clean up
      setTimeout(() => {
        if (isQuitting) return
        log.info('Recreating widget window after crash recovery...')
        createWidgetWindow()
      }, 1500)
    })

    // The widget never navigates; anything else is hostile or a bug.
    widgetWindow.webContents.on('will-navigate', (event, url) => {
      if (isAppUrl(url)) return
      event.preventDefault()
    })

    // Open external links securely in the default OS browser
    widgetWindow.webContents.setWindowOpenHandler(({ url }) => {
      openExternalSafely(url)
      return { action: 'deny' }
    })

    // W14 fix: Multi-monitor orphan recovery
    // W17 fix: Use named handler + removeAllListeners to prevent listener stacking
    // on crash recovery (createWidgetWindow may be called multiple times).
    const handleDisplayRemoved = () => {
      if (!widgetWindow || widgetWindow.isDestroyed()) return
      const [wx, wy] = widgetWindow.getPosition()
      const displays = screen.getAllDisplays()
      const isOnScreen = displays.some(d => {
        const { x, y, width, height } = d.workArea
        return wx >= x && wx < x + width && wy >= y && wy < y + height
      })
      if (!isOnScreen) {
        const primary = screen.getPrimaryDisplay().workArea
        const [w, h] = widgetWindow.getSize()
        const home = widgetHomePosition(primary, w ?? WIDGET_WIDTH, h ?? WIDGET_HEIGHT)
        widgetWindow.setPosition(home.x, home.y)
        log.info('Widget repositioned after display removal')
      }
    }
    screen.removeAllListeners('display-removed')
    screen.on('display-removed', handleDisplayRemoved)

    widgetWindow.on('closed', () => {
      widgetWindow = null
      log.info('Widget window closed')
    })
  } catch (err) {
    log.error('Failed to create widget window:', err)
    widgetWindow = null
  }
}

// This method will be called when Electron has finished initialization
app
  .whenReady()
  .then(async () => {
    // A second instance has already handed off to the first and is quitting.
    if (!gotLock) return

    // Initialize crash reporting first (catches errors during init)
    CrashReporter.init()

    // G8: Clean up orphaned audio temp files from previous crashed sessions
    import('../src/main/services/AudioCacheCleanup')
      .then(({ runAudioCacheCleanup }) => runAudioCacheCleanup())
      .catch(err => log.debug('Audio cache cleanup skipped:', err))

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

      const archAdvice =
        process.platform === 'darwin'
          ? 'Please download the correct version for your Mac:\n• Apple Silicon (M1/M2/M3/M4) → arm64 version\n• Intel Mac → x64 version'
          : process.platform === 'win32'
            ? 'Please download the correct version for your PC:\n• Most PCs → x64 version'
            : 'Please download the correct version for your system.'

      dialog.showErrorBox(
        'BlueArkive Cannot Start',
        `Critical components failed to load:\n\n` +
          nativeModuleErrors.map(e => `• ${e}`).join('\n') +
          `\n\nYour system: ${process.platform} ${process.arch}\n\n` +
          'This usually means the app was built for the wrong CPU architecture. ' +
          archAdvice +
          `\n\nLogs: ${app.getPath('logs')}`
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
      // The user's choice lives in the database; nothing is sent before it is read.
      CrashReporter.setConsent(isCrashReportingAllowed())
    } catch (dbErr) {
      dbInitFailed = true
      log.error('CRITICAL: Database initialization failed — app will start without DB:', dbErr)
      CrashReporter.addBreadcrumb('lifecycle', `Database init FAILED: ${dbErr}`)
    }

    // Schedule database maintenance
    if (!dbInitFailed) {
      // Run versioned schema migrations (picks up where connection.ts left off)
      try {
        const applied = await getDatabaseMigrationService().runMigrations()
        if (applied > 0) log.info(`Applied ${applied} database migrations`)
      } catch (migErr) {
        log.warn('Database migrations failed (non-fatal):', migErr)
      }

      // Finish what a crash or an early quit interrupted: purge meetings whose
      // undo window had already passed, and close meetings left "in progress".
      try {
        recoverMeetingsOnStartup()
      } catch (recoverErr) {
        log.warn('Meeting recovery sweep failed (non-fatal):', recoverErr)
      }

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

    // Re-establish the signed-in session (backend token, tier gating, refresh
    // timer) from the keychain. Non-blocking: the UI must not wait on network.
    getAuthService()
      .restoreSession()
      .catch(err => log.debug('Session restore skipped:', err))

    // Initialize event-driven services (non-blocking)
    try {
      getPowerMonitorService().initialize()
      log.info('PowerMonitorService initialized')
    } catch (e) {
      log.debug('PowerMonitorService init skipped:', e)
    }
    try {
      await getAudioProvenanceService().initialize()
      log.info('AudioProvenanceService initialized')
    } catch (e) {
      log.debug('AudioProvenanceService init skipped:', e)
    }

    // ─── Application Menu (macOS keyboard shortcuts) ───────────
    // On macOS, standard shortcuts (Cmd+C/V/X/A/Z) are bound through
    // the application menu's Edit submenu accelerators. Without this,
    // ALL keyboard shortcuts break — including copy/paste in text fields.
    const appMenu = Menu.buildFromTemplate([
      {
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'pasteAndMatchStyle' },
          { role: 'delete' },
          { role: 'selectAll' },
        ],
      },
      {
        label: 'View',
        submenu: [
          // Reload and DevTools are development tools. In a packaged build
          // Cmd/Ctrl+R would throw away an in-progress recording's renderer
          // state, and DevTools exposes the full IPC surface.
          // forceReload removed — its Cmd+Shift+R accelerator conflicts with toggle-recording
          ...(app.isPackaged
            ? []
            : ([
                { role: 'reload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
              ] as Electron.MenuItemConstructorOptions[])),
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' },
        ],
      },
      {
        label: 'Window',
        submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }],
      },
    ])
    Menu.setApplicationMenu(appMenu)
    log.info('Application menu configured')

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
            path.join(app.getPath('logs'), 'bluearkive.log')
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
        {
          label: 'Show Widget / Sovereign Orb',
          click: () => {
            if (widgetWindow && !widgetWindow.isDestroyed()) {
              if (widgetWindow.isVisible()) {
                widgetWindow.webContents.send('widget:spatialHandoff', { state: 'hidden' })
                setTimeout(() => widgetWindow?.hide(), 250)
              } else {
                widgetWindow.showInactive()
                widgetWindow.webContents.send('widget:spatialHandoff', { state: 'expanded' })
              }
            } else {
              createWidgetWindow()
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

    // Register Widget toggle shortcut
    const widgetShortcutHandler = () => {
      log.info('Widget toggle shortcut triggered')
      if (widgetWindow && !widgetWindow.isDestroyed()) {
        const isMainOpen = mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()

        // If the main window is open, dismiss it and focus the widget
        if (isMainOpen && mainWindow) {
          mainWindow.hide()
          widgetWindow.showInactive()
          widgetWindow.webContents.send('widget:spatialHandoff', { state: 'expanded' })
        }
        // If the widget is visible AND main is closed, then hide the widget
        else if (widgetWindow.isVisible()) {
          widgetWindow.webContents.send('widget:spatialHandoff', { state: 'hidden' })
          setTimeout(() => widgetWindow?.hide(), 250)
        }
        // Otherwise (both closed), just show the widget
        else {
          widgetWindow.showInactive()
          widgetWindow.webContents.send('widget:spatialHandoff', { state: 'expanded' })
        }
      }
    }
    // Cmd/Ctrl+Shift+W is "close window" in browsers, editors and terminals.
    // A global shortcut takes it away from every other app for as long as
    // this one runs, so the widget toggle uses a combination nothing claims.
    const WIDGET_SHORTCUT = 'CommandOrControl+Alt+Shift+W'
    if (!globalShortcut.register(WIDGET_SHORTCUT, widgetShortcutHandler)) {
      log.warn(`Widget shortcut ${WIDGET_SHORTCUT} could not be registered (already in use)`)
    }

    // On macOS, re-create window when dock icon is clicked and no windows are open
    app.on('activate', () => {
      // The close button hides the main window and the widget window always
      // exists, so "no windows open" is never true — a dock click has to show
      // the hidden main window explicitly.
      if (!mainWindow || mainWindow.isDestroyed()) {
        createWindow()
        if (!widgetWindow || widgetWindow.isDestroyed()) createWidgetWindow()
        log.info('Re-created windows from dock activation')
      } else {
        showMainWindow()
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

    // macOS deep links arrive via the module-level 'open-url' listener.
    // Windows/Linux: a link or .pnotes file that *launched* the app is in our
    // own argv ('second-instance' only covers launches while already running).
    if (process.platform !== 'darwin') {
      handleLaunchArgs(process.argv.slice(1))
    }

    // System-audio capture: the renderer calls getDisplayMedia(); Electron
    // rejects that outright unless a handler is registered. Grant the primary
    // screen with loopback audio — the renderer discards the video track.
    session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
      const fromApp = isAppUrl(request.securityOrigin) || isAppUrl(request.frame?.url ?? '')
      if (!fromApp) {
        log.warn('Denied display-media request from non-app origin')
        callback({})
        return
      }
      desktopCapturer
        .getSources({ types: ['screen'] })
        .then(sources => {
          const source = sources[0]
          if (!source) {
            callback({})
            return
          }
          // macOS loops system audio back from version 13 (ScreenCaptureKit);
          // on older releases the request is answered without audio and the
          // renderer falls back to the microphone.
          callback(
            isSystemAudioCaptureSupported()
              ? { video: source, audio: 'loopback' }
              : { video: source }
          )
        })
        .catch(err => {
          log.warn('desktopCapturer.getSources failed:', err)
          callback({})
        })
    })

    // LAZY: Initialize auto-updater 10s after window shows
    // Moved from module level to here — saves ~200ms at startup
    setTimeout(() => {
      initAutoUpdater()
    }, 10_000)

    // OPT-21: Content Security Policy — blocks inline scripts from AI-generated content
    // Critical security fix: sandbox:false + no CSP = RCE vector via innerHTML injection
    // NOTE: this header only reaches http(s) loads, i.e. the dev server. Packaged
    // builds load file:// pages, which get the same policy from the <meta> tag
    // that vite.config.ts injects at build time — keep the two in sync.
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
        // Parse specific Supabase URL to avoid wildcard exfiltration
        let supabaseHost = ''
        try {
          if (process.env.SUPABASE_URL && !process.env.SUPABASE_URL.includes('placeholder')) {
            supabaseHost = new URL(process.env.SUPABASE_URL).origin
          }
        } catch {
          // ignore
        }

        callback({
          responseHeaders: {
            ...details.responseHeaders,
            'Content-Security-Policy': [
              "default-src 'self'; " +
                `${scriptSrc}; ` +
                `connect-src 'self' ${supabaseHost} wss://*.deepgram.com https://api.deepgram.com https://api.piyapi.cloud https://dl.bluearkive.com; ` +
                // NOTE: style-src requires 'unsafe-inline' because Tiptap/ProseMirror
                // injects inline styles dynamically for cursor positioning and selection highlights.
                // This is an acceptable tradeoff since script-src is fully locked down in production.
                "style-src 'self' 'unsafe-inline'; " +
                "img-src 'self' data: blob:; " +
                "font-src 'self'; " +
                "media-src 'self' mediastream: blob:; " +
                "worker-src 'self' blob:; " +
                "object-src 'none'; " +
                "base-uri 'self'; " +
                "form-action 'none';",
            ],
          },
        })
      }
    )

    // H1: Permission request handler — explicitly control which permissions the app grants.
    // Without this, Chromium uses defaults (auto-grant media in Electron).
    // This gives us logging and the ability to deny unexpected permission requests.
    session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
      const allowedPermissions = ['media', 'display-capture', 'mediaKeySystem']
      const granted = allowedPermissions.includes(permission)
      if (!granted) {
        log.warn(`Denied permission request: ${permission}`)
      }
      callback(granted)
    })

    // H1b: Permission CHECK handler — synchronous counterpart to the request handler.
    // Electron queries this when checking if a permission is already granted (e.g.,
    // navigator.permissions.query). Without this, some permission checks silently
    // return 'denied' even when the OS has granted access, causing confusing UI states.
    session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
      const allowedChecks = [
        'media',
        'display-capture',
        'mediaKeySystem',
        'audioCapture',
        'videoCaptureDevice',
      ]
      const granted = allowedChecks.includes(permission)
      if (!granted) {
        log.debug(`Permission check denied: ${permission}`)
      }
      return granted
    })

    // Renderer crash recovery is attached per-window in createWindow().
    app.on('child-process-gone', (_event, details) => {
      log.error(`Child process gone: ${details.type} — ${details.reason}`)
      if (details.type === 'GPU' && mainWindow && !mainWindow.isDestroyed()) {
        log.warn('GPU process crashed — UI may need reload')
      }
    })

    // A logout, restart or shutdown is announced here just before the quit
    // request arrives. before-quit must then let the app go at once: holding
    // the quit (as it does for a normal quit) makes macOS report that this app
    // interrupted the logout, and the user has to start it again.
    powerMonitor.on('shutdown', () => {
      systemShuttingDown = true
      log.info('System is shutting down or logging out')
    })

    startupComplete = true
    markStartupFinished()

    // Transcribe audio a previous session recorded but never turned into text
    // (crash, forced quit, model failure). Deferred so it never slows launch.
    if (!dbInitFailed) {
      const recoveryTimer = setTimeout(() => {
        getAudioPipelineService()
          .recoverInterruptedAudio()
          .catch(err => log.debug('Interrupted-audio recovery skipped:', err))
      }, 8_000)
      recoveryTimer.unref()
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
        `Please check the logs at:\n${path.join(app.getPath('logs'), 'bluearkive.log')}`
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
  // Guard: globalShortcut cannot be used before app is ready.
  // will-quit can fire before ready if startup fails or process is killed early.
  if (app.isReady()) {
    globalShortcut.unregisterAll()
  }
})

// Handle .pnotes file open (macOS Finder / double-click). Queued until the
// renderer is ready when the file is what launched the app.
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  handleOpenFile(filePath)
})

// Handle app quit
// CRITICAL: Electron does NOT await async before-quit handlers.
// We must use event.preventDefault() to hold the quit, then app.exit() after cleanup.
app.on('before-quit', event => {
  if (isQuitting) return // Prevent re-entrant calls
  isQuitting = true

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

  if (systemShuttingDown) {
    // The OS is waiting on us: do only what cannot be skipped, synchronously,
    // and do not hold the quit. An active recording is closed (its meeting
    // gets an end time; audio not yet transcribed is on disk and is recovered
    // at the next launch).
    log.info('Quitting for system shutdown — fast path')
    try {
      const pipeline = getAudioPipelineService()
      if (pipeline.getStatus().isCapturing) {
        pipeline.stopCapture({ drainTimeoutMs: 0 }).catch(() => undefined)
      }
    } catch {
      /* ignore */
    }
    finishQuitSynchronously()
    return
  }

  event.preventDefault() // Hold the quit until cleanup finishes

  log.info('Application quitting — starting cleanup...')

  // The windows have nothing left to show; leaving them up for the length of
  // the cleanup looks like the app ignored Quit.
  for (const win of [mainWindow, widgetWindow]) {
    try {
      if (win && !win.isDestroyed()) win.hide()
    } catch {
      /* ignore */
    }
  }

  // Run all async cleanup with a hard 15s deadline (prevents WAL truncation)
  const CLEANUP_TIMEOUT_MS = 15_000
  const cleanupTasks: Promise<void>[] = []

  // Stop audio capture, give the last chunk a moment to be transcribed, and
  // only then stop the speech worker. These used to run in parallel, which
  // killed the worker under the final chunk every time; whatever is still
  // untranscribed after the wait stays on disk for the next launch.
  cleanupTasks.push(
    (async () => {
      try {
        const pipeline = getAudioPipelineService()
        if (pipeline.getStatus().isCapturing) {
          log.info('Flushing audio pipeline before quit...')
          await pipeline.stopCapture({ drainTimeoutMs: 8_000 })
        }
      } catch (e) {
        log.debug(
          'AudioPipelineService cleanup skipped:',
          e instanceof Error ? e.message : String(e)
        )
      }
      try {
        await getASRService().terminate()
      } catch (e) {
        log.debug('ASRService cleanup skipped:', e instanceof Error ? e.message : String(e))
      }
    })()
  )

  // Unload ONNX models + dispose GPU sessions to free VRAM
  cleanupTasks.push(
    (async () => {
      try {
        await getModelManager().forceUnload()
      } catch (e) {
        log.debug('ModelManager cleanup skipped:', e instanceof Error ? e.message : String(e))
      }
    })()
  )

  // H-9 AUDIT: Release ONNX embedding session to free GPU/DirectML memory
  cleanupTasks.push(
    (async () => {
      try {
        const { getLocalEmbeddingService } =
          await import('../src/main/services/LocalEmbeddingService')
        await getLocalEmbeddingService().dispose()
        log.debug('LocalEmbeddingService disposed')
      } catch (e) {
        log.debug(
          'LocalEmbeddingService cleanup skipped:',
          e instanceof Error ? e.message : String(e)
        )
      }
    })()
  )

  // Cleanly destroy cached Y.Doc instances
  cleanupTasks.push(
    (async () => {
      try {
        const { getYjsConflictResolver } = await import('../src/main/services/YjsConflictResolver')
        getYjsConflictResolver().destroyAll()
        log.debug('YjsConflictResolver documents destroyed')
      } catch (e) {
        log.debug(
          'YjsConflictResolver cleanup skipped:',
          e instanceof Error ? e.message : String(e)
        )
      }
    })()
  )

  // Stop background embedding queue
  cleanupTasks.push(
    (async () => {
      try {
        const { getBackgroundEmbeddingQueue } =
          await import('../src/main/services/BackgroundEmbeddingQueue')
        getBackgroundEmbeddingQueue().stop()
        log.debug('BackgroundEmbeddingQueue stopped')
      } catch (e) {
        log.debug(
          'BackgroundEmbeddingQueue cleanup skipped:',
          e instanceof Error ? e.message : String(e)
        )
      }
    })()
  )

  // Race cleanup against hard timeout to prevent infinite hang
  Promise.race([
    Promise.allSettled(cleanupTasks),
    new Promise<void>(resolve => setTimeout(resolve, CLEANUP_TIMEOUT_MS)),
  ]).finally(() => {
    finishQuitSynchronously()
    log.info('Cleanup complete — goodbye')
    app.exit(0) // Force exit after cleanup
  })
})

/** The part of shutdown that must always run, and can run without waiting. */
function finishQuitSynchronously(): void {
  try {
    cleanupIPC()
  } catch {
    /* ignore */
  }

  // SECURITY: Zero encryption key material from V8 heap before exit.
  // Without this, PBKDF2-derived keys persist in memory until GC,
  // which may never happen before the process core-dumps.
  try {
    EncryptionService.clearKeyCache()
  } catch {
    /* ignore */
  }

  // Clear backend state (auth tokens, cached sessions)
  try {
    resetBackend()
  } catch {
    /* ignore */
  }

  try {
    closeDatabase()
  } catch {
    /* ignore */
  }
}
