/**
 * Turn a self-contained HTML page into a PDF, using the browser engine the
 * app already ships.
 *
 * The page is rendered in a window of its own that is never shown, runs no
 * script, and shares no session, preload or storage with the app.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import { markAuxiliaryWindow } from '../ipc/windows'

const RENDER_TIMEOUT_MS = 60_000

export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const { BrowserWindow } = await import('electron')

  // A file rather than a data: URL — those are capped at a couple of megabytes.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bluearkive-pdf-'))
  const file = path.join(dir, `${crypto.randomBytes(8).toString('hex')}.html`)
  fs.writeFileSync(file, html, { encoding: 'utf-8', mode: 0o600 })

  const win = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: {
      javascript: false,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      partition: 'pdf-export',
    },
  })
  markAuxiliaryWindow(win)
  // Nothing in the page may take it anywhere else.
  win.webContents.on('will-navigate', event => event.preventDefault())
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const rendered = (async () => {
      await win.loadFile(file)
      return win.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: false,
        margins: { top: 0.7, bottom: 0.7, left: 0.7, right: 0.7 },
      })
    })()
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('Creating the PDF took too long.')),
        RENDER_TIMEOUT_MS
      )
    })
    return await Promise.race([rendered, timedOut])
  } finally {
    if (timer) clearTimeout(timer)
    if (!win.isDestroyed()) win.destroy()
    fs.rmSync(dir, { recursive: true, force: true })
  }
}
