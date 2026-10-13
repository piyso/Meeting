import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'path'
import { builtinModules } from 'module'
import { config as dotenvConfig } from 'dotenv'

// Load .env file so we can inject vars into the Electron main process build
const envResult = dotenvConfig({ path: path.resolve(__dirname, '.env') })
const envVars = envResult.parsed || {}

// Build a define map that replaces process.env.X with the actual values at bundle time
const envKeys = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'BLUEARKIVE_API_URL',
  'BLUEARKIVE_FUNCTIONS_URL',
  'DEEPGRAM_API_URL',
  'SENTRY_DSN',
  'LOG_LEVEL',
  'BLUEARKIVE_BILLING_URL',
  'UPDATE_FEED_URL',
  'UPDATE_PUBLIC_KEY',
]
const electronDefine: Record<string, string> = {}
for (const key of envKeys) {
  // A variable set in the real environment wins over the .env file (the usual
  // dotenv rule) — CI secrets and `KEY=value npm run build` both rely on it.
  const value = process.env[key] || envVars[key] || ''
  electronDefine[`process.env.${key}`] = JSON.stringify(value)
}

// Build-time validation: catch misconfigured GitHub Secrets that would produce broken builds.
// If SUPABASE_ANON_KEY is set to the literal string 'supabase_anon_key' (the variable name
// itself rather than the actual JWT), the Supabase JS client will concatenate it into the
// URL hostname, causing DNS failures like 'xxx.supabase.cosupabase_anon_key'.
const criticalKeys = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'] as const
for (const key of criticalKeys) {
  const val = JSON.parse(electronDefine[`process.env.${key}`])
  if (val && val === key.toLowerCase()) {
    throw new Error(
      `\n❌ BUILD ERROR: process.env.${key} is set to the literal string "${val}".\n` +
        `   This is the variable NAME, not its VALUE.\n` +
        `   Check your .env file or GitHub Secrets configuration.\n`
    )
  }
}

// Mock mode replaces the preload bridge with nothing (the renderer installs a
// mock API in dev). A production build made that way ships an app whose
// window.electronAPI is undefined — every screen is empty. Refuse to build it.
const useMockData = (process.env.USE_MOCK_DATA || envVars['USE_MOCK_DATA'] || 'false') === 'true'
const isBuildCommand = process.argv.includes('build')
if (isBuildCommand && useMockData && process.env.ALLOW_MOCK_BUILD !== 'true') {
  throw new Error(
    '\n❌ BUILD ERROR: USE_MOCK_DATA=true.\n' +
      '   A packaged build in mock mode has no backend bridge and cannot work.\n' +
      '   Set USE_MOCK_DATA=false in .env (or run with USE_MOCK_DATA=false) and rebuild.\n'
  )
}

/**
 * Production Content-Security-Policy.
 *
 * electron/main.ts sets the policy as a response header, but Electron cannot
 * attach headers to file:// loads — which is how the packaged app loads its
 * pages — so packaged builds ran with no CSP at all. The same policy is
 * injected here as a <meta> tag, at build time only (dev keeps the header,
 * which must allow Vite's inline HMR preamble).
 * Keep in sync with the header in electron/main.ts.
 */
function buildContentSecurityPolicy(): string {
  let supabaseOrigin = ''
  try {
    const url = JSON.parse(electronDefine['process.env.SUPABASE_URL'] || '""') as string
    if (url && !url.includes('placeholder')) supabaseOrigin = new URL(url).origin
  } catch {
    // not configured
  }
  return [
    "default-src 'self'",
    "script-src 'self'",
    `connect-src 'self' ${supabaseOrigin} wss://*.deepgram.com https://api.deepgram.com https://api.piyapi.cloud https://dl.bluearkive.com`
      .replace(/\s+/g, ' ')
      .trim(),
    // Tiptap/ProseMirror inject inline styles for cursors and selections.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "media-src 'self' mediastream: blob:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ')
}

function cspMetaPlugin(): Plugin {
  return {
    name: 'bluearkive-csp-meta',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: {
            'http-equiv': 'Content-Security-Policy',
            content: buildContentSecurityPolicy(),
          },
          injectTo: 'head-prepend',
        },
      ]
    },
  }
}

// All native Node.js built-in modules (with and without node: prefix)
const nodeBuiltins = [...builtinModules, ...builtinModules.map(m => `node:${m}`)]

// Native addons and packages that must not be bundled
const nativeModules = [
  'electron',
  'better-sqlite3',
  'onnxruntime-node',
  'node-llama-cpp',
  'keytar',
  'bufferutil',
  'utf-8-validate',
]

const allExternals = [...nativeModules, ...nodeBuiltins]

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    cspMetaPlugin(),
    electron([
      {
        // Main process entry point
        entry: 'electron/main.ts',
        onstart({ startup }) {
          // ELECTRON_RUN_AS_NODE=1 in the shell environment makes the Electron
          // binary run as plain Node.js, breaking require('electron'). Remove it
          // from the current process env so the spawned Electron process doesn't
          // inherit it. The env var is read at C++ binary startup level before
          // any JS runs, so a JS-level delete is too late.
          delete process.env.ELECTRON_RUN_AS_NODE
          startup()
        },
        vite: {
          define: electronDefine,
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: allExternals,
              output: {
                format: 'cjs',
                inlineDynamicImports: true,
                esModule: false,
                entryFileNames: '[name].js',
              },
            },
          },
        },
      },
      {
        // Preload scripts
        entry: {
          preload: 'electron/preload.ts',
          'preload-widget': 'electron/preload-widget.ts',
        },
        onstart(options) {
          // Notify the Renderer process to reload the page when the Preload scripts build is complete
          options.reload()
        },
        vite: {
          define: {
            // Toggle mock mode: 'true' ONLY for local UI dev (Vite dev server running)
            // so the renderer's mock layer can set window.electronAPI.
            // MUST be 'false' for production builds. Uses VITE_DEV_SERVER_URL presence to detect.
            'process.env.USE_MOCK_DATA': JSON.stringify(useMockData ? 'true' : 'false'),
          },
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron', ...nodeBuiltins],
              output: {
                entryFileNames: '[name].js',
              },
            },
          },
        },
      },
      {
        // Worker threads (ASR + VAD) — must be compiled separately
        entry: {
          'workers/asr.worker': 'src/main/workers/asr.worker.ts',
          'workers/vad.worker': 'src/main/workers/vad.worker.ts',
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: allExternals,
              output: {
                format: 'cjs',
                entryFileNames: '[name].js',
              },
            },
          },
        },
      },
    ]),
    renderer(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Force single React instance — prevent vite-plugin-electron-renderer
      // from resolving its own copy, which causes "Invalid hook call" in production
      react: path.resolve(__dirname, './node_modules/react'),
      'react-dom': path.resolve(__dirname, './node_modules/react-dom'),
    },
    // CRITICAL: Prevent duplicate React instances.
    // vite-plugin-electron-renderer + @tanstack/react-query can each pull
    // in their own copy of React, leading to "Invalid hook call" crashes.
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 5173,
  },
  build: {
    // The audio worklet must ship as a real file. Small assets are normally
    // inlined as `data:` URLs, and the production CSP (script-src 'self')
    // refuses to load a worklet module from a data: URL — recording would
    // fail to start in every packaged build.
    assetsInlineLimit: filePath =>
      filePath.endsWith('audio-worklet-processor.js') ? false : undefined,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        widget: path.resolve(__dirname, 'widget-index.html'),
      },
    },
  },
})
