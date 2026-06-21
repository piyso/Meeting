import { contextBridge, ipcRenderer } from 'electron'

// ============================================================================
// SECURITY: Dedicated Widget Preload
// This file exposes ONLY the IPC channels required for the widget to function.
// It explicitly omits db, app, auth, and raw audio operations to prevent
// a compromised widget (e.g., via XSS in transcript) from taking over the app.
// ============================================================================

// Type definitions matching the main preload
type EventCallback<T = unknown> = (data: T) => void

function createEventListener<T = unknown>(channel: string) {
  return (callback: EventCallback<T>) => {
    const subscription = (_event: Electron.IpcRendererEvent, data: T) => callback(data)
    ipcRenderer.on(channel, subscription)
    return () => {
      ipcRenderer.removeListener(channel, subscription)
    }
  }
}

const widgetAPI = {
  // ============================================================================
  // Window Operations
  // ============================================================================
  window: {
    restoreMain: () => ipcRenderer.invoke('window:restoreMain'),
    setIgnoreMouseEvents: (ignore: boolean) => ipcRenderer.invoke('window:setIgnoreMouseEvents', ignore),
    resize: (width: number, height: number) => ipcRenderer.invoke('window:resize', { width, height }),
  },

  // ============================================================================
  // Widget Operations
  // ============================================================================
  widget: {
    updateState: (state: Record<string, unknown>) =>
      ipcRenderer.invoke('widget:updateState', state),
    triggerBookmark: () => ipcRenderer.invoke('widget:triggerBookmark'),
    triggerPauseToggle: () => ipcRenderer.invoke('widget:triggerPauseToggle'),
    submitQuickNote: (note: string) => ipcRenderer.invoke('widget:submitQuickNote', note),
    triggerStartCapture: () => ipcRenderer.invoke('widget:triggerStartCapture'),
  },

  // ============================================================================
  // Audio Controls (Widget only needs to stop)
  // ============================================================================
  audio: {
    stopCapture: (params: { meetingId: string }) => ipcRenderer.invoke('audio:stopCapture', params),
  },

  // ============================================================================
  // Event Listeners (Streaming)
  // ============================================================================
  on: {
    widgetStateUpdated: createEventListener('widget:stateUpdated'),
    spatialHandoff: createEventListener('widget:spatialHandoff'),
    audioEvent: createEventListener('event:audioEvent'),
  },

  // ============================================================================
  // Platform Identification
  // ============================================================================
  platform: {
    isMac: process.platform === 'darwin',
    isWindows: process.platform === 'win32',
  },

  // ============================================================================
  // Power Monitor
  // ============================================================================
  power: {
    getStatus: () => ipcRenderer.invoke('power:getStatus'),
  },
}

// W18 fix: Always expose the widget API. The mock mode check from the main
// preload was copied here erroneously — the widget has no mock layer, so
// skipping contextBridge would leave window.electronAPI === undefined,
// crashing the entire widget renderer.
try {
  contextBridge.exposeInMainWorld('electronAPI', widgetAPI)
} catch (error) {
  console.error('Failed to expose widget electronAPI:', error)
}
