/**
 * Window lookup shared by the IPC handlers.
 *
 * Handlers must not import electron/main.ts (circular), so they find windows
 * through BrowserWindow.getAllWindows(). The app has two of its own: the main
 * window and the always-on-top recording widget. The widget is identified by its title,
 * which electron/main.ts pins (it blocks 'page-title-updated').
 *
 * Do not tell them apart by size: the widget is 480px wide, so "the first
 * window wider than 400px" matched it too and events meant for the main
 * window (live transcript, action items, calendar reminders) could be
 * delivered to the widget instead.
 */

import { BrowserWindow } from 'electron'

export const WIDGET_WINDOW_TITLE = 'BlueArkive Widget'

function isWidget(win: BrowserWindow): boolean {
  return win.getTitle() === WIDGET_WINDOW_TITLE
}

/**
 * Windows that are neither the main window nor the widget: short-lived,
 * hidden helpers (rendering a PDF). They run none of the app's code, so they
 * must never be taken for the main window or be sent its events.
 */
const auxiliaryWindows = new WeakSet<BrowserWindow>()

export function markAuxiliaryWindow(win: BrowserWindow): void {
  auxiliaryWindows.add(win)
}

function isAppWindow(win: BrowserWindow): boolean {
  return !win.isDestroyed() && !auxiliaryWindows.has(win)
}

/** The main application window, or null while it does not exist. */
export function getMainAppWindow(): BrowserWindow | null {
  return BrowserWindow.getAllWindows().find(win => isAppWindow(win) && !isWidget(win)) ?? null
}

/** The recording widget window, or null while it does not exist. */
export function getWidgetAppWindow(): BrowserWindow | null {
  return BrowserWindow.getAllWindows().find(win => isAppWindow(win) && isWidget(win)) ?? null
}

/** Send to the main window's renderer. Returns false when there is no main window. */
export function sendToMainWindow(channel: string, payload?: unknown): boolean {
  const win = getMainAppWindow()
  if (!win) return false
  win.webContents.send(channel, payload)
  return true
}

/** Send to every open window (main and widget). */
export function broadcastToWindows(channel: string, payload?: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (isAppWindow(win)) win.webContents.send(channel, payload)
  }
}
