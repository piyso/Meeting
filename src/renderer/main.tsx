import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
// ── Mock Data Toggle ──────────────────────────────────────────────
// In production Electron: window.electronAPI is injected by preload.ts → real backend.
// In browser dev mode:    window.electronAPI is undefined → mock layer auto-installs.
// Dynamic import ensures mock code (~110KB) is NEVER bundled into production Electron.
const IS_ELECTRON = typeof window !== 'undefined' && !!window.electronAPI

if (!IS_ELECTRON) {
  // Dynamic import — Vite code-splits this into a separate chunk
  import('./mockElectronAPI').then(({ installMockElectronAPI }) => {
    console.info('[BlueArkive] Mock mode active — using simulated data')
    installMockElectronAPI()
  })
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30s default — individual hooks override as needed
      gcTime: 5 * 60_000, // Keep cache 5min after last subscriber unmounts
      refetchOnWindowFocus: false, // OPT: was true — every alt-tab fired 5-8 IPC queries
      retry: 1, // Reduced from 2 — local IPC rarely fails, retrying wastes time
      retryDelay: attemptIndex => Math.min(500 * 2 ** attemptIndex, 5000),
    },
    mutations: {
      retry: 1,
    },
  },
})

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element not found')
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
)

// Defer splash removal until after React has painted — prevents white flash
// requestIdleCallback runs when the browser is idle after the first paint
const removeSplash = () => {
  const splash = document.getElementById('splash')
  if (splash) {
    splash.style.transition = 'opacity 200ms ease-out'
    splash.style.opacity = '0'
    setTimeout(() => splash.remove(), 200)
  }
}
if ('requestIdleCallback' in window) {
  ;(window as unknown as { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(
    removeSplash
  )
} else {
  setTimeout(removeSplash, 100)
}

// Safety net: remove splash after 5s regardless — if React crashes during
// mount, requestIdleCallback never fires and the user sees the pulsing logo forever.
// Also listen for uncaught errors to remove splash immediately on crash.
setTimeout(removeSplash, 5_000)
window.addEventListener('error', removeSplash, { once: true })
